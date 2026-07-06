import { createHash } from "node:crypto";
import { desktopCapturer } from "electron";
import type { CapturedObservationFrame, ObservationCaptureSource } from "./observation-controller";

export class ElectronScreenCaptureSource implements ObservationCaptureSource {
  private fakeCaptureIndex = 0;

  async capture(): Promise<CapturedObservationFrame> {
    const fakeDataUrl = process.env.GREYFIELD_FAKE_SCREENSHOT_DATA_URL;
    if (fakeDataUrl) {
      const fakeFrame = this.resolveFakeFrame(fakeDataUrl);
      return {
        dataUrl: fakeFrame,
        mimeType: readDataUrlMimeType(fakeFrame),
        hash: hashText(fakeFrame)
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
    return {
      dataUrl,
      mimeType: readDataUrlMimeType(dataUrl),
      width: size.width,
      height: size.height,
      hash: hashText(dataUrl)
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
