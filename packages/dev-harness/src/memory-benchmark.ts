import { readFile } from "node:fs/promises";
import {
  buildRecallContext,
  createSummarySegmentDraft,
  formatRecallContextForPrompt,
  type SummarySegment
} from "@greyfield/core-runtime";
import type { SessionTurn } from "@greyfield/core-runtime";

interface MemoryBenchmarkFixture {
  version: number;
  thresholds: {
    summaryScore: number;
    recallScore: number;
  };
  sessionId: string;
  threadId: string;
  summaryCases: SummaryBenchmarkCase[];
  recallSegments: RecallSegmentFixture[];
  recallCases: RecallBenchmarkCase[];
}

interface SummaryBenchmarkCase {
  id: string;
  description?: string;
  turns: Array<{
    id: string;
    role: SessionTurn["role"];
    content: string;
    createdAt?: string;
  }>;
  maxSummaryCharacters?: number;
  expectations: {
    facts: string[];
    sourceTurnIds: string[];
    forbiddenFragments: string[];
    recallCueFragments: string[];
  };
}

interface RecallSegmentFixture {
  id: string;
  summary: string;
  recallCues: string[];
  sourceTurnIds?: string[];
  createdAt?: string;
  disabled?: boolean;
}

interface ExpectedSkipped {
  id: string;
  reason: string;
}

interface RecallBenchmarkCase {
  id: string;
  description?: string;
  input: string;
  expectedIds: string[];
  rejectedIds: string[];
  expectedSkipped?: ExpectedSkipped[];
  maxItems?: number;
  maxCharacters?: number;
  promptIncludes?: string[];
  promptExcludes?: string[];
}

interface CaseResult {
  id: string;
  passed: boolean;
  score: number;
  details: Record<string, unknown>;
}

const defaultCreatedAt = "2026-06-26T01:00:00.000Z";
const fixture = await loadFixture();
const recallSegments = fixture.recallSegments.map((segment) => makeSegment(segment, fixture));
const summaryResults = fixture.summaryCases.map((testCase) => runSummaryCase(testCase, fixture));
const recallResults = fixture.recallCases.map((testCase) => runRecallCase(testCase));
const summaryScore = average(summaryResults.map((result) => result.score));
const recallScore = average(recallResults.map((result) => result.score));
const ok =
  fixture.version === 2 &&
  summaryScore >= fixture.thresholds.summaryScore &&
  recallScore >= fixture.thresholds.recallScore &&
  summaryResults.every((result) => result.passed) &&
  recallResults.every((result) => result.passed);

console.log(
  JSON.stringify(
    {
      ok,
      fixtureVersion: fixture.version,
      thresholds: fixture.thresholds,
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

async function loadFixture(): Promise<MemoryBenchmarkFixture> {
  const fixtureUrl = new URL("./fixtures/memory-benchmark.json", import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  const parsed = JSON.parse(raw) as MemoryBenchmarkFixture;
  validateFixture(parsed);
  return parsed;
}

function validateFixture(candidate: MemoryBenchmarkFixture): void {
  if (candidate.version !== 2) {
    throw new Error(`Unsupported memory benchmark fixture version: ${candidate.version}`);
  }
  assertUnique("summary case", candidate.summaryCases.map((testCase) => testCase.id));
  assertUnique("recall segment", candidate.recallSegments.map((segment) => segment.id));
  assertUnique("recall case", candidate.recallCases.map((testCase) => testCase.id));
  const segmentIds = new Set(candidate.recallSegments.map((segment) => segment.id));
  for (const testCase of candidate.recallCases) {
    for (const id of [...testCase.expectedIds, ...testCase.rejectedIds, ...(testCase.expectedSkipped ?? []).map((item) => item.id)]) {
      if (!segmentIds.has(id)) {
        throw new Error(`Recall case ${testCase.id} references missing segment ${id}`);
      }
    }
  }
}

function assertUnique(label: string, values: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label} id: ${value}`);
    }
    seen.add(value);
  }
}

function runSummaryCase(testCase: SummaryBenchmarkCase, loadedFixture: MemoryBenchmarkFixture): CaseResult {
  const draft = createSummarySegmentDraft({
    sessionId: loadedFixture.sessionId,
    turns: testCase.turns.map((turn) => ({
      id: turn.id,
      role: turn.role,
      content: turn.content,
      createdAt: turn.createdAt ?? defaultCreatedAt
    })),
    maxSummaryCharacters: testCase.maxSummaryCharacters
  });
  const summaryLower = draft.summary.toLowerCase();
  const presentFacts = testCase.expectations.facts.filter((fact) => summaryLower.includes(fact.toLowerCase()));
  const missingFacts = testCase.expectations.facts.filter((fact) => !summaryLower.includes(fact.toLowerCase()));
  const sourceTurnIds = draft.sourceTurns.map((turn) => turn.turnId);
  const missingSources = testCase.expectations.sourceTurnIds.filter((turnId) => !sourceTurnIds.includes(turnId));
  const forbiddenHits = testCase.expectations.forbiddenFragments.filter((fragment) =>
    summaryLower.includes(fragment.toLowerCase())
  );
  const missingRecallCueFragments = testCase.expectations.recallCueFragments.filter(
    (fragment) => !draft.recallCues.some((cue) => cue.toLowerCase().includes(fragment.toLowerCase()))
  );
  const factScore = ratio(presentFacts.length, testCase.expectations.facts.length);
  const sourceScore = ratio(testCase.expectations.sourceTurnIds.length - missingSources.length, testCase.expectations.sourceTurnIds.length);
  const noiseScore = testCase.expectations.forbiddenFragments.length === 0 ? 1 : forbiddenHits.length === 0 ? 1 : 0;
  const cueScore = ratio(
    testCase.expectations.recallCueFragments.length - missingRecallCueFragments.length,
    testCase.expectations.recallCueFragments.length
  );
  const score = weightedAverage([
    [factScore, 0.4],
    [sourceScore, 0.3],
    [noiseScore, 0.15],
    [cueScore, 0.15]
  ]);

  return {
    id: testCase.id,
    passed:
      missingFacts.length === 0 &&
      missingSources.length === 0 &&
      forbiddenHits.length === 0 &&
      missingRecallCueFragments.length === 0,
    score: roundScore(score),
    details: {
      description: testCase.description,
      missingFacts,
      missingSources,
      forbiddenHits,
      missingRecallCueFragments,
      recallCues: draft.recallCues,
      sourceTurnIds
    }
  };
}

function runRecallCase(testCase: RecallBenchmarkCase): CaseResult {
  const context = buildRecallContext({
    input: testCase.input,
    summarySegments: recallSegments,
    maxItems: testCase.maxItems,
    maxCharacters: testCase.maxCharacters
  });
  const actualIds = context.items.map((item) => item.id);
  const missingExpected = testCase.expectedIds.filter((id) => !actualIds.includes(id));
  const rejectedHits = testCase.rejectedIds.filter((id) => actualIds.includes(id));
  const missingSkipped = (testCase.expectedSkipped ?? []).filter(
    (expected) => !context.skipped.some((skipped) => skipped.id === expected.id && skipped.reason === expected.reason)
  );
  const promptText = formatRecallContextForPrompt(context);
  const sourceVisible = context.items.every((item) => item.sourceTurnIds.every((turnId) => promptText.includes(turnId)));
  const reasonVisible = context.items.every((item) => item.reason.length > 0 && promptText.includes(item.reason));
  const missingPromptFragments = (testCase.promptIncludes ?? []).filter((fragment) => !promptText.includes(fragment));
  const unexpectedPromptFragments = (testCase.promptExcludes ?? []).filter((fragment) => promptText.includes(fragment));
  const hitScore =
    testCase.expectedIds.length === 0
      ? actualIds.length === 0
        ? 1
        : 0
      : ratio(testCase.expectedIds.length - missingExpected.length, testCase.expectedIds.length);
  const rejectionScore = ratio(testCase.rejectedIds.length - rejectedHits.length, Math.max(1, testCase.rejectedIds.length));
  const visibilityScore = sourceVisible && reasonVisible ? 1 : 0;
  const skippedScore =
    (testCase.expectedSkipped ?? []).length === 0
      ? 1
      : ratio((testCase.expectedSkipped ?? []).length - missingSkipped.length, (testCase.expectedSkipped ?? []).length);
  const promptScore =
    (testCase.promptIncludes ?? []).length + (testCase.promptExcludes ?? []).length === 0
      ? 1
      : missingPromptFragments.length === 0 && unexpectedPromptFragments.length === 0
        ? 1
        : 0;
  const score = weightedAverage([
    [hitScore, 0.4],
    [rejectionScore, 0.25],
    [visibilityScore, 0.15],
    [skippedScore, 0.1],
    [promptScore, 0.1]
  ]);

  return {
    id: testCase.id,
    passed:
      missingExpected.length === 0 &&
      rejectedHits.length === 0 &&
      sourceVisible &&
      reasonVisible &&
      missingSkipped.length === 0 &&
      missingPromptFragments.length === 0 &&
      unexpectedPromptFragments.length === 0,
    score: roundScore(score),
    details: {
      description: testCase.description,
      actualIds,
      skipped: context.skipped,
      missingExpected,
      rejectedHits,
      missingSkipped,
      missingPromptFragments,
      unexpectedPromptFragments,
      reasons: context.items.map((item) => ({ id: item.id, reason: item.reason, score: item.score })),
      sourceVisible,
      reasonVisible
    }
  };
}

function makeSegment(segment: RecallSegmentFixture, loadedFixture: MemoryBenchmarkFixture): SummarySegment {
  return {
    id: segment.id,
    threadId: loadedFixture.threadId,
    sessionId: loadedFixture.sessionId,
    summary: segment.summary,
    recallCues: segment.recallCues,
    sourceTurns: (segment.sourceTurnIds ?? [`turn-${segment.id.replace(/^memory-/, "")}-1`]).map((turnId) => ({
      sessionId: loadedFixture.sessionId,
      turnId,
      role: "user",
      createdAt: segment.createdAt ?? defaultCreatedAt
    })),
    createdAt: segment.createdAt ?? defaultCreatedAt,
    disabled: segment.disabled
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
