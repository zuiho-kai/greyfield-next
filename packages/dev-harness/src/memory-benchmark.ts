import {
  buildRecallContext,
  createSummarySegmentDraft,
  formatRecallContextForPrompt,
  type SummarySegment
} from "@greyfield/core-runtime";
import type { SessionTurn } from "@greyfield/core-runtime";

interface SummaryBenchmarkCase {
  id: string;
  turns: SessionTurn[];
  expectedFacts: string[];
  expectedSourceTurnIds: string[];
  forbiddenFragments: string[];
}

interface RecallBenchmarkCase {
  id: string;
  input: string;
  expectedIds: string[];
  rejectedIds: string[];
  maxItems?: number;
}

interface CaseResult {
  id: string;
  passed: boolean;
  score: number;
  details: Record<string, unknown>;
}

const minimumSummaryScore = 0.95;
const minimumRecallScore = 0.95;
const benchmarkSessionId = "memory-benchmark-session";
const benchmarkThreadId = "memory-benchmark-thread";

const summaryCases: SummaryBenchmarkCase[] = [
  {
    id: "model-preference-with-ui-noise",
    turns: [
      userTurn("model-1", "我喜欢 Hiyori，当默认 Live2D 模型比较舒服。"),
      assistantTurn("model-2", "记住：默认模型偏好是 Hiyori。"),
      eventTurn("model-3", "window blurred while user moved the settings panel"),
      userTurn("model-4", "Mao 先不要作为默认模型。")
    ],
    expectedFacts: ["Hiyori", "默认 Live2D 模型", "Mao"],
    expectedSourceTurnIds: ["model-1", "model-2", "model-4"],
    forbiddenFragments: ["window blurred", "settings panel"]
  },
  {
    id: "routine-preference-with-short-aside",
    turns: [
      userTurn("routine-1", "以后晚上 22:30 以后提醒我休息，不要继续催我加班。"),
      assistantTurn("routine-2", "明白，夜间提醒会偏向休息，而不是继续工作。"),
      userTurn("routine-3", "顺便这个按钮颜色以后再说。")
    ],
    expectedFacts: ["22:30", "提醒我休息", "不要继续催我加班"],
    expectedSourceTurnIds: ["routine-1", "routine-2", "routine-3"],
    forbiddenFragments: []
  }
];

const recallSegments: SummarySegment[] = [
  makeSegment("memory-hiyori", "User prefers Hiyori as the default Live2D model and does not want Mao as default.", [
    "hiyori",
    "live2d",
    "mao",
    "default"
  ]),
  makeSegment("memory-night-rest", "User wants reminders after 22:30 to encourage rest instead of more work.", [
    "22:30",
    "提醒",
    "休息",
    "加班"
  ]),
  makeSegment("memory-audio-fade", "First TTS playback used to pop and drag; audio fade-in and serialized queue are required.", [
    "tts",
    "语音",
    "爆音",
    "拖音",
    "队列"
  ]),
  makeSegment("memory-ci-noise", "The team discussed CI checkout cache cleanup and unrelated lint timing.", [
    "ci",
    "cache",
    "lint"
  ])
];

const recallCases: RecallBenchmarkCase[] = [
  {
    id: "proper-noun-model-recall",
    input: "默认模型还是 Hiyori 吗？",
    expectedIds: ["memory-hiyori"],
    rejectedIds: ["memory-ci-noise"]
  },
  {
    id: "chinese-routine-recall",
    input: "我们之前说过夜间提醒和休息吗？",
    expectedIds: ["memory-night-rest"],
    rejectedIds: ["memory-hiyori", "memory-ci-noise"]
  },
  {
    id: "audio-issue-recall",
    input: "语音第一句爆音和拖音这个问题还记得吗？",
    expectedIds: ["memory-audio-fade"],
    rejectedIds: ["memory-hiyori", "memory-ci-noise"]
  },
  {
    id: "no-false-positive-for-unrelated-input",
    input: "明天香港会不会下雨？",
    expectedIds: [],
    rejectedIds: ["memory-hiyori", "memory-night-rest", "memory-audio-fade", "memory-ci-noise"]
  },
  {
    id: "budget-keeps-best-match",
    input: "Hiyori Live2D 默认模型偏好还在吗？",
    expectedIds: ["memory-hiyori"],
    rejectedIds: ["memory-night-rest", "memory-ci-noise"],
    maxItems: 1
  }
];

const summaryResults = summaryCases.map(runSummaryCase);
const recallResults = recallCases.map(runRecallCase);
const summaryScore = average(summaryResults.map((result) => result.score));
const recallScore = average(recallResults.map((result) => result.score));
const ok =
  summaryScore >= minimumSummaryScore &&
  recallScore >= minimumRecallScore &&
  summaryResults.every((result) => result.passed) &&
  recallResults.every((result) => result.passed);

console.log(
  JSON.stringify(
    {
      ok,
      thresholds: {
        summaryScore: minimumSummaryScore,
        recallScore: minimumRecallScore
      },
      summary: {
        score: roundScore(summaryScore),
        cases: summaryResults
      },
      recall: {
        score: roundScore(recallScore),
        cases: recallResults
      }
    },
    null,
    2
  )
);

if (!ok) {
  process.exitCode = 1;
}

function runSummaryCase(testCase: SummaryBenchmarkCase): CaseResult {
  const draft = createSummarySegmentDraft({
    sessionId: benchmarkSessionId,
    turns: testCase.turns
  });
  const summaryLower = draft.summary.toLowerCase();
  const presentFacts = testCase.expectedFacts.filter((fact) => summaryLower.includes(fact.toLowerCase()));
  const missingFacts = testCase.expectedFacts.filter((fact) => !summaryLower.includes(fact.toLowerCase()));
  const sourceTurnIds = draft.sourceTurns.map((turn) => turn.turnId);
  const missingSources = testCase.expectedSourceTurnIds.filter((turnId) => !sourceTurnIds.includes(turnId));
  const forbiddenHits = testCase.forbiddenFragments.filter((fragment) =>
    summaryLower.includes(fragment.toLowerCase())
  );
  const recallCueHit = draft.recallCues.some((cue) => /hiyori|22:30|休息|提醒|语音|tts/i.test(cue));
  const factScore = ratio(presentFacts.length, testCase.expectedFacts.length);
  const sourceScore = ratio(testCase.expectedSourceTurnIds.length - missingSources.length, testCase.expectedSourceTurnIds.length);
  const noiseScore = testCase.forbiddenFragments.length === 0 ? 1 : forbiddenHits.length === 0 ? 1 : 0;
  const cueScore = recallCueHit ? 1 : 0;
  const score = weightedAverage([
    [factScore, 0.45],
    [sourceScore, 0.3],
    [noiseScore, 0.15],
    [cueScore, 0.1]
  ]);

  return {
    id: testCase.id,
    passed: missingFacts.length === 0 && missingSources.length === 0 && forbiddenHits.length === 0 && recallCueHit,
    score: roundScore(score),
    details: {
      missingFacts,
      missingSources,
      forbiddenHits,
      recallCues: draft.recallCues,
      sourceTurnIds
    }
  };
}

function runRecallCase(testCase: RecallBenchmarkCase): CaseResult {
  const context = buildRecallContext({
    input: testCase.input,
    summarySegments: recallSegments,
    maxItems: testCase.maxItems
  });
  const actualIds = context.items.map((item) => item.id);
  const missingExpected = testCase.expectedIds.filter((id) => !actualIds.includes(id));
  const rejectedHits = testCase.rejectedIds.filter((id) => actualIds.includes(id));
  const promptText = formatRecallContextForPrompt(context);
  const sourceVisible = context.items.every((item) => item.sourceTurnIds.every((turnId) => promptText.includes(turnId)));
  const reasonVisible = context.items.every((item) => item.reason.length > 0 && promptText.includes(item.reason));
  const hitScore =
    testCase.expectedIds.length === 0
      ? actualIds.length === 0
        ? 1
        : 0
      : ratio(testCase.expectedIds.length - missingExpected.length, testCase.expectedIds.length);
  const rejectionScore = ratio(testCase.rejectedIds.length - rejectedHits.length, Math.max(1, testCase.rejectedIds.length));
  const visibilityScore = sourceVisible && reasonVisible ? 1 : 0;
  const score = weightedAverage([
    [hitScore, 0.5],
    [rejectionScore, 0.35],
    [visibilityScore, 0.15]
  ]);

  return {
    id: testCase.id,
    passed: missingExpected.length === 0 && rejectedHits.length === 0 && sourceVisible && reasonVisible,
    score: roundScore(score),
    details: {
      actualIds,
      missingExpected,
      rejectedHits,
      reasons: context.items.map((item) => ({ id: item.id, reason: item.reason, score: item.score })),
      sourceVisible,
      reasonVisible
    }
  };
}

function makeSegment(id: string, summary: string, recallCues: string[]): SummarySegment {
  const suffix = id.replace(/^memory-/, "");
  return {
    id,
    threadId: benchmarkThreadId,
    sessionId: benchmarkSessionId,
    summary,
    recallCues,
    sourceTurns: [
      {
        sessionId: benchmarkSessionId,
        turnId: `turn-${suffix}-1`,
        role: "user",
        createdAt: "2026-06-26T01:00:00.000Z"
      }
    ],
    createdAt: "2026-06-26T01:00:00.000Z"
  };
}

function userTurn(id: string, content: string): SessionTurn {
  return makeTurn(id, "user", content);
}

function assistantTurn(id: string, content: string): SessionTurn {
  return makeTurn(id, "assistant", content);
}

function eventTurn(id: string, content: string): SessionTurn {
  return makeTurn(id, "event", content);
}

function makeTurn(id: string, role: SessionTurn["role"], content: string): SessionTurn {
  return {
    id,
    role,
    content,
    createdAt: "2026-06-26T01:00:00.000Z"
  };
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function weightedAverage(items: Array<[score: number, weight: number]>): number {
  const totalWeight = items.reduce((total, [, weight]) => total + weight, 0);
  return items.reduce((total, [score, weight]) => total + score * weight, 0) / totalWeight;
}

function roundScore(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
