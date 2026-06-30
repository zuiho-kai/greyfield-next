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
  createdAt?: string;
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

export function summarizeObservationForTranscript(metadata: RuntimeObservationMetadata): string {
  if (metadata.source === "desktop-screen-awareness") {
    return "Used recent desktop visual context for this reply.";
  }
  if (metadata.mode === "single") {
    return "Used 1 temporary screenshot for this reply.";
  }
  return `Used ${metadata.dedupedFrameCount} temporary observation frame${metadata.dedupedFrameCount === 1 ? "" : "s"} for this reply.`;
}
