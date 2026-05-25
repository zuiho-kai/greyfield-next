import { describe, expect, it } from "vitest";
import { splitCompleteSentences } from "../sentence-splitter";

describe("splitCompleteSentences", () => {
  it("extracts complete English and Chinese sentences while preserving the remainder", () => {
    expect(splitCompleteSentences("你好。今天怎么样? OK")).toEqual({
      sentences: ["你好。", "今天怎么样?"],
      remainder: "OK"
    });
  });

  it("does not emit a partial sentence until punctuation arrives", () => {
    expect(splitCompleteSentences("First sentence. still speaking")).toEqual({
      sentences: ["First sentence."],
      remainder: "still speaking"
    });
  });
});
