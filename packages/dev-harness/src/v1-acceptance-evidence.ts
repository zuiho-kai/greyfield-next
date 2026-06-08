import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

type V1FeatureStatus = "completed" | "in-progress";

type V1Feature = {
  id: string;
  title: string;
  status: V1FeatureStatus;
  package: string;
  acceptance: string[];
  qa: { script: string };
};

type V1Manifest = {
  version: string;
  project: string;
  northStar: string;
  nonGoals: string[];
  features: V1Feature[];
};

type EvidenceLevel = "current-run-required" | "historical-automated" | "manual-required" | "not-complete";

export type V1UserPathEvidence = {
  id: string;
  title: string;
  featureIds: string[];
  judgment: "automated-evidence-required" | "historically-covered" | "needs-manual-evidence" | "not-claimable";
  evidenceLevel: EvidenceLevel[];
  automatedEvidence: string[];
  manualEvidence: string[];
  cannotClaimReason?: string;
};

export type V1AcceptanceEvidenceReport = {
  generatedFor: "issue-31";
  manifestVersion: string;
  project: string;
  northStar: string;
  summary: {
    totalUserPaths: number;
    completedFeatureCount: number;
    inProgressFeatureCount: number;
    automatedEvidenceRequiredCount: number;
    notClaimableCount: number;
    missingFeatureIds: string[];
    unknownFeatureIds: string[];
  };
  userPaths: V1UserPathEvidence[];
};

const manifest = JSON.parse(
  readFileSync(new URL("../v1-features.json", import.meta.url), "utf8")
) as V1Manifest;

const userPathDefinitions: V1UserPathEvidence[] = [
  {
    id: "open-transparent-pet",
    title: "用户打开应用后看到透明、无标题栏、置顶的 Live2D 桌宠",
    featureIds: ["GFN-V1-001", "GFN-V1-002", "GFN-V1-003"],
    judgment: "needs-manual-evidence",
    evidenceLevel: ["historical-automated", "manual-required"],
    automatedEvidence: ["pnpm harness:electron", "pnpm harness:pet:quick", "pnpm harness:live2d"],
    manualEvidence: ["真实桌面截图：桌宠透明、无网页边框、无设置面板、背景可透出"]
  },
  {
    id: "desktop-pet-interaction",
    title: "用户能点击模型、拖动窗口、滚轮缩放，并保持透明区域穿透",
    featureIds: ["GFN-V1-010", "GFN-V1-011", "GFN-V1-012", "GFN-V1-013"],
    judgment: "automated-evidence-required",
    evidenceLevel: ["current-run-required", "historical-automated"],
    automatedEvidence: ["pnpm harness:pet:quick", "pnpm harness:electron", "vitest pet-interaction"],
    manualEvidence: ["发布前建议补一段拖动/缩放录屏，确认真实桌面手感"]
  },
  {
    id: "text-chat-streaming",
    title: "用户能输入文字，并在 Chat 中看到流式回复、最终回复和错误恢复",
    featureIds: ["GFN-V1-004", "GFN-V1-009"],
    judgment: "not-claimable",
    evidenceLevel: ["historical-automated", "not-complete"],
    automatedEvidence: [
      "pnpm harness:acceptance",
      "pnpm harness:electron",
      "pnpm harness:electron:provider-failure"
    ],
    manualEvidence: ["Chat streaming / error / retry 状态截图"],
    cannotClaimReason: "Streaming text runtime 仍是 in-progress，Chat 视觉和重试体验还未完成最终产品验收。"
  },
  {
    id: "interrupt-current-reply",
    title: "用户能点击 Stop 停止当前回复，且不会继续追加旧回复",
    featureIds: ["GFN-V1-006"],
    judgment: "not-claimable",
    evidenceLevel: ["historical-automated", "not-complete"],
    automatedEvidence: ["vitest runtime-loop desktop-runtime-bridge runtime-service interrupt", "pnpm harness:electron:provider-abort"],
    manualEvidence: ["Chat streaming 时 Stop 明显可见、点击后状态稳定的截图或录屏"],
    cannotClaimReason: "当前已覆盖文字 interrupt 和 provider abort，但 TTS 播放、嘴型和完整语音停止链路未完成。"
  },
  {
    id: "persistent-recent-context",
    title: "用户重启后，最近上下文仍进入下一轮 prompt",
    featureIds: ["GFN-V1-007", "GFN-V1-015"],
    judgment: "historically-covered",
    evidenceLevel: ["historical-automated"],
    automatedEvidence: ["vitest prompt-assembler session-store runtime-service", "pnpm harness:electron:restart-context"],
    manualEvidence: ["发布前可补一组人工记录：第一轮对话、重启、第二轮引用上下文"]
  },
  {
    id: "settings-provider-test",
    title: "用户能配置 provider，并通过 Settings 的 Test LLM 看懂成功、失败或被拒绝状态",
    featureIds: ["GFN-V1-008"],
    judgment: "not-claimable",
    evidenceLevel: ["historical-automated", "manual-required", "not-complete"],
    automatedEvidence: ["pnpm harness:electron:settings-active-chat-test", "pnpm harness:electron:provider-failure"],
    manualEvidence: ["Settings Preview / blocked / ready / testing / success / failure / rejected 状态截图"],
    cannotClaimReason: "Settings shell 仍是 in-progress，普通用户可理解的视觉 polish 还未完成。"
  },
  {
    id: "speech-bubble",
    title: "短回复出现在宠物气泡，长回复不撑爆气泡且完整历史保留在 Chat",
    featureIds: ["GFN-V1-014"],
    judgment: "not-claimable",
    evidenceLevel: ["historical-automated", "manual-required", "not-complete"],
    automatedEvidence: ["vitest speech-bubble-placement speech-bubble-text pet-window-shape", "pnpm harness:electron:bubble-long-reply"],
    manualEvidence: ["屏幕边缘气泡、气泡开关、点击穿透截图"],
    cannotClaimReason: "Speech bubble placement 仍是 in-progress，真实屏幕边缘和开关/点击穿透 QA 未收尾。"
  },
  {
    id: "voice-output",
    title: "真实 TTS 能句子级输出，并能被 Stop 停止",
    featureIds: ["GFN-V1-005"],
    judgment: "not-claimable",
    evidenceLevel: ["not-complete"],
    automatedEvidence: ["vitest sentence-splitter vad"],
    manualEvidence: ["真实 TTS 播放和停止录屏"],
    cannotClaimReason: "当前只有 package 层句子拆分和 VAD 边界，真实 TTS 产品链路未完成。"
  }
];

export function buildV1AcceptanceEvidenceReport(inputManifest: V1Manifest = manifest): V1AcceptanceEvidenceReport {
  const manifestFeatureIds = new Set(inputManifest.features.map((feature) => feature.id));
  const referencedFeatureIds = new Set(userPathDefinitions.flatMap((path) => path.featureIds));
  const missingFeatureIds = [...manifestFeatureIds].filter((featureId) => !referencedFeatureIds.has(featureId)).sort();
  const unknownFeatureIds = [...referencedFeatureIds].filter((featureId) => !manifestFeatureIds.has(featureId)).sort();
  const completedFeatureCount = inputManifest.features.filter((feature) => feature.status === "completed").length;
  const inProgressFeatureCount = inputManifest.features.filter((feature) => feature.status === "in-progress").length;

  return {
    generatedFor: "issue-31",
    manifestVersion: inputManifest.version,
    project: inputManifest.project,
    northStar: inputManifest.northStar,
    summary: {
      totalUserPaths: userPathDefinitions.length,
      completedFeatureCount,
      inProgressFeatureCount,
      automatedEvidenceRequiredCount: userPathDefinitions.filter((path) => path.judgment === "automated-evidence-required")
        .length,
      notClaimableCount: userPathDefinitions.filter((path) => path.judgment === "not-claimable").length,
      missingFeatureIds,
      unknownFeatureIds
    },
    userPaths: userPathDefinitions
  };
}

export function renderV1AcceptanceEvidenceMarkdown(report: V1AcceptanceEvidenceReport): string {
  const lines = [
    "# V1 acceptance evidence report",
    "",
    `Generated for: ${report.generatedFor}`,
    `Manifest: ${report.manifestVersion}`,
    `Project: ${report.project}`,
    "",
    "## Summary",
    "",
    `- User paths: ${report.summary.totalUserPaths}`,
    `- Completed features: ${report.summary.completedFeatureCount}`,
    `- In-progress features: ${report.summary.inProgressFeatureCount}`,
    `- Automated-evidence-required paths: ${report.summary.automatedEvidenceRequiredCount}`,
    `- Not-claimable paths: ${report.summary.notClaimableCount}`,
    `- Missing manifest feature coverage: ${report.summary.missingFeatureIds.join(", ") || "none"}`,
    `- Unknown referenced features: ${report.summary.unknownFeatureIds.join(", ") || "none"}`,
    "",
    "## User paths",
    ""
  ];

  for (const path of report.userPaths) {
    lines.push(
      `### ${path.id}`,
      "",
      `- Title: ${path.title}`,
      `- Judgment: ${path.judgment}`,
      `- Evidence levels: ${path.evidenceLevel.join(", ")}`,
      `- Features: ${path.featureIds.join(", ")}`,
      `- Automated evidence: ${path.automatedEvidence.join("; ") || "none"}`,
      `- Manual evidence: ${path.manualEvidence.join("; ") || "none"}`
    );
    if (path.cannotClaimReason) {
      lines.push(`- Cannot claim reason: ${path.cannotClaimReason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function printReport(): void {
  const report = buildV1AcceptanceEvidenceReport();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(renderV1AcceptanceEvidenceMarkdown(report));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  printReport();
}
