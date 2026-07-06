import { createHash } from "node:crypto";
import { desktopCapturer } from "electron";
import type { CapturedObservationFrame, ObservationCaptureSource } from "./observation-controller";

export class ElectronScreenCaptureSource implements ObservationCaptureSource {
  private fakeCaptureIndex = 0;
  private previousBitmap: Buffer | undefined;

  async capture(): Promise<CapturedObservationFrame> {
    const fakeDataUrl = process.env.GREYFIELD_FAKE_SCREENSHOT_DATA_URL;
    if (fakeDataUrl) {
      const fakeFrame = this.resolveFakeFrame(fakeDataUrl);
      const changeScore = fakeFrame === fakeDataUrl && this.fakeCaptureIndex <= 1 ? 0 : 100;
      return {
        dataUrl: fakeFrame,
        mimeType: readDataUrlMimeType(fakeFrame),
        hash: hashText(fakeFrame),
        changeScore
      };
    }
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 960, height: 540 }
    });
    const source = sources[0];
    if (!source) {
      throw new Error("No screen source is available.");
    }
    const size = source.thumbnail.getSize();
    const dataUrl = source.thumbnail.toDataURL();
    const bitmap = source.thumbnail.toBitmap();
    const changeScore = estimateBitmapChangeScore(this.previousBitmap, bitmap);
    this.previousBitmap = bitmap;
    return {
      dataUrl,
      mimeType: readDataUrlMimeType(dataUrl),
      width: size.width,
      height: size.height,
      hash: hashText(dataUrl),
      changeScore
    };
  }

  private resolveFakeFrame(baseDataUrl: string): string {
    if (process.env.GREYFIELD_FAKE_SCREENSHOT_CHANGE_EACH_CAPTURE !== "1") {
      return baseDataUrl;
    }
    const mimeType = readDataUrlMimeType(baseDataUrl);
    const marker = `greyfield-fake-screen-frame-${this.fakeCaptureIndex}`;
    this.fakeCaptureIndex += 1;
    return `data:${mimeType};base64,${Buffer.from(marker).toString("base64")}`;
  }
}

function readDataUrlMimeType(dataUrl: string): string {
  const match = /^data:([^;,]+);base64,/u.exec(dataUrl);
  return match?.[1] ?? "image/png";
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function estimateBitmapChangeScore(previous: Buffer | undefined, current: Buffer): number {
  if (!previous || previous.length !== current.length || current.length === 0) {
    return 100;
  }
  const pixelStride = 4;
  const sampleStride = pixelStride * 96;
  let changed = 0;
  let sampled = 0;
  for (let index = 0; index < current.length; index += sampleStride) {
    sampled += 1;
    if (
      Math.abs(current[index] - previous[index]) > 8 ||
      Math.abs(current[index + 1] - previous[index + 1]) > 8 ||
      Math.abs(current[index + 2] - previous[index + 2]) > 8
    ) {
      changed += 1;
    }
  }
  return sampled > 0 ? Math.round((changed / sampled) * 100) : 0;
}
