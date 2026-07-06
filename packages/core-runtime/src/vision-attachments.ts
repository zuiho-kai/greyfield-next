export type RuntimeObservationMode = "single" | "low" | "normal" | "high";

export interface RuntimeImageAttachment {
  id: string;
  dataUrl: string;
  mimeType: string;
  createdAt: string;
  source: "screenshot" | "observation-frame";
  label?: string;
  width?: number;
  height?: number;
  hash?: string;
  changeScore?: number;
}

export interface RuntimeObservationInput {
  id: string;
  mode: RuntimeObservationMode;
  frameCount: number;
  dedupedFrameCount: number;
  durationMs?: number;
  source?: RuntimeObservationMetadata["source"];
}

export interface RuntimeObservationMetadata {
  kind: "visual-observation";
  mode: RuntimeObservationMode;
  frameCount: number;
  dedupedFrameCount: number;
  source: "desktop-screen-awareness" | "user-active-screenshot" | "user-active-observation";
}

export interface FrameFilterFrame {
  id: string;
  dataUrl: string;
  hash?: string;
  changeScore?: number;
  createdAt?: string;
}

export interface FrameChangeResult {
  changed: boolean;
  signature: string;
  score: number;
}

export interface FrameFilterResult<Frame extends FrameFilterFrame> {
  frames: Frame[];
  duplicateCount: number;
  truncated: boolean;
}

export function filterDistinctObservationFrames<Frame extends FrameFilterFrame>(
  frames: Frame[],
  options: { maxFrames: number }
): FrameFilterResult<Frame> {
  const maxFrames = Math.max(0, Math.floor(options.maxFrames));
  const seen = new Set<string>();
  const filtered: Frame[] = [];
  let duplicateCount = 0;
  for (const frame of frames) {
    const signature = frame.hash?.trim() || frame.dataUrl;
    if (seen.has(signature)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(signature);
    if (filtered.length < maxFrames) {
      filtered.push(frame);
    }
  }
  return {
    frames: filtered,
    duplicateCount,
    truncated: frames.length - duplicateCount > filtered.length
  };
}

export function detectObservationFrameChange(
  previousSignature: string | undefined,
  frame: FrameFilterFrame,
  options: { threshold?: number } = {}
): FrameChangeResult {
  const signature = getObservationFrameSignature(frame);
  const signatureChanged = previousSignature === undefined || signature !== previousSignature;
  const score = resolveFrameChangeScore(frame.changeScore, signatureChanged);
  const threshold = normalizeFrameChangeThreshold(options.threshold);
  return {
    changed: signatureChanged && score >= threshold,
    signature,
    score
  };
}

function getObservationFrameSignature(frame: FrameFilterFrame): string {
  return frame.hash?.trim() || frame.dataUrl;
}

function resolveFrameChangeScore(score: number | undefined, signatureChanged: boolean): number {
  if (typeof score === "number" && Number.isFinite(score)) {
    return Math.min(100, Math.max(0, score));
  }
  return signatureChanged ? 100 : 0;
}

function normalizeFrameChangeThreshold(threshold: number | undefined): number {
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
    return 0;
  }
  return Math.min(100, Math.max(0, threshold));
}

export function summarizeObservationForTranscript(metadata: RuntimeObservationMetadata): string {
  if (metadata.source === "desktop-screen-awareness") {
    return "Used recent desktop visual context for this reply.";
  }
  if (metadata.mode === "single") {
    return "Used 1 temporary screenshot for this reply.";
  }
  return `Used ${metadata.dedupedFrameCount} temporary observation frame${metadata.dedupedFrameCount === 1 ? "" : "s"} for this reply.`;
}
