import { describe, expect, it } from "vitest";
import {
  buildV1AcceptanceEvidenceReport,
  renderV1AcceptanceEvidenceMarkdown
} from "../v1-acceptance-evidence";

describe("V1 acceptance evidence report", () => {
  it("covers every V1 manifest feature with an issue #31 user path", () => {
    const report = buildV1AcceptanceEvidenceReport();

    expect(report.generatedFor).toBe("issue-31");
    expect(report.summary.missingFeatureIds).toEqual([]);
    expect(report.summary.unknownFeatureIds).toEqual([]);
    expect(report.summary.totalUserPaths).toBeGreaterThan(0);
  });

  it("does not mark in-progress product paths as completed by documentation alone", () => {
    const report = buildV1AcceptanceEvidenceReport();
    const notClaimablePaths = report.userPaths.filter((path) => path.judgment === "not-claimable");

    expect(notClaimablePaths.map((path) => path.id)).toEqual(
      expect.arrayContaining(["text-chat-streaming", "settings-provider-test", "speech-bubble", "voice-output"])
    );
    expect(notClaimablePaths.every((path) => path.cannotClaimReason && path.cannotClaimReason.length > 0)).toBe(true);
  });

  it("renders a markdown report for PR and checkpoint handoff", () => {
    const markdown = renderV1AcceptanceEvidenceMarkdown(buildV1AcceptanceEvidenceReport());

    expect(markdown).toContain("# V1 acceptance evidence report");
    expect(markdown).toContain("Missing manifest feature coverage: none");
    expect(markdown).toContain("Unknown referenced features: none");
    expect(markdown).toContain("Cannot claim reason:");
  });
});
