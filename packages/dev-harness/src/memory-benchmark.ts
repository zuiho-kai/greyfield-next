import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  baselineScores: {
    summaryRegressionScore: number;
    recallRegressionScore: number;
    productReadinessScore: number;
    v21aScenarioScore: number;
  };
  productReadiness: ProductReadinessFixture;
  sessionId: string;
  threadId: string;
  summaryCases: SummaryBenchmarkCase[];
  recallSegments: RecallSegmentFixture[];
  recallCases: RecallBenchmarkCase[];
}

interface ProductReadinessFixture {
  targetScore: number;
  capabilityWeight: number;
  scenarioWeight: number;
  capabilities: ProductCapabilityFixture[];
  scenarios: ProductScenarioFixture[];
}

type ProductReadinessStatus = "implemented" | "partial" | "not_implemented";

interface ProductCapabilityFixture {
  id: string;
  description: string;
  status: ProductReadinessStatus;
  score: number;
  weight: number;
  evidence: string;
}

interface ProductScenarioFixture {
  id: string;
  title: string;
  description: string;
  status: ProductReadinessStatus;
  score: number;
  weight: number;
  dimensions: string[];
  probeInput: string;
  turns: Array<{
    id: string;
    role: SessionTurn["role"];
    content: string;
    createdAt?: string;
  }>;
  expectedBehavior: string[];
  currentGap: string;
  sourceExpectations: {
    sourceTurnIds: string[];
    exactFragments: string[];
  };
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
const requiredV21aCapabilityIds = [
  "memory-atom-extraction",
  "calendar-recall",
  "source-evidence-drilldown",
  "scene-proactive-trigger",
  "privacy-noise"
] as const;
const requiredV21aScenarioIds = [
  "birthday-first-meeting-rose",
  "game-negative-review-source-drilldown",
  "rainy-home-hotpot-proactive-trigger"
] as const;
const fixture = await loadFixture();
const recallSegments = fixture.recallSegments.map((segment) => makeSegment(segment, fixture));
const summaryResults = fixture.summaryCases.map((testCase) => runSummaryCase(testCase, fixture));
const recallResults = fixture.recallCases.map((testCase) => runRecallCase(testCase));
const summaryScore = average(summaryResults.map((result) => result.score));
const recallScore = average(recallResults.map((result) => result.score));
const productReadinessResult = scoreProductReadiness(fixture.productReadiness);
const ok =
  fixture.version === 3 &&
  summaryScore >= fixture.thresholds.summaryScore &&
  recallScore >= fixture.thresholds.recallScore &&
  summaryScore >= fixture.baselineScores.summaryRegressionScore &&
  recallScore >= fixture.baselineScores.recallRegressionScore &&
  productReadinessResult.score >= fixture.baselineScores.productReadinessScore &&
  productReadinessResult.scenarioScore >= fixture.baselineScores.v21aScenarioScore &&
  summaryResults.every((result) => result.passed) &&
  recallResults.every((result) => result.passed);

const report = {
  ok,
  fixtureVersion: fixture.version,
  generatedAt: new Date().toISOString(),
  thresholds: fixture.thresholds,
  baselineScores: fixture.baselineScores,
  scores: {
    summaryRegressionScore: roundScore(summaryScore),
    recallRegressionScore: roundScore(recallScore),
    productReadinessScore: productReadinessResult.score,
    productReadinessCapabilityScore: productReadinessResult.capabilityScore,
    v21aScenarioScore: productReadinessResult.scenarioScore
  },
  summary: {
    score: roundScore(summaryScore),
    cases: summaryResults
  },
  recall: {
    score: roundScore(recallScore),
    cases: recallResults
  },
  productReadiness: productReadinessResult
};

await writeBenchmarkReport(report);
console.log(JSON.stringify(report, null, 2));

if (!ok) {
  process.exitCode = 1;
}

async function writeBenchmarkReport(report: unknown): Promise<void> {
  const artifactDir = process.env.GREYFIELD_MEMORY_BENCHMARK_ARTIFACT_DIR?.trim() || ".cache/greyfield-memory-benchmark/latest";
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function loadFixture(): Promise<MemoryBenchmarkFixture> {
  const fixtureUrl = new URL("./fixtures/memory-benchmark.json", import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  const parsed = JSON.parse(raw) as MemoryBenchmarkFixture;
  validateFixture(parsed);
  return parsed;
}

function validateFixture(candidate: MemoryBenchmarkFixture): void {
  if (candidate.version !== 3) {
    throw new Error(`Unsupported memory benchmark fixture version: ${candidate.version}`);
  }
  validateScore("thresholds.summaryScore", candidate.thresholds.summaryScore);
  validateScore("thresholds.recallScore", candidate.thresholds.recallScore);
  validateScore("baselineScores.summaryRegressionScore", candidate.baselineScores.summaryRegressionScore);
  validateScore("baselineScores.recallRegressionScore", candidate.baselineScores.recallRegressionScore);
  validateScore("baselineScores.productReadinessScore", candidate.baselineScores.productReadinessScore);
  validateScore("baselineScores.v21aScenarioScore", candidate.baselineScores.v21aScenarioScore);
  validateProductReadiness(candidate.productReadiness);
  if (candidate.baselineScores.summaryRegressionScore < candidate.thresholds.summaryScore) {
    throw new Error("baselineScores.summaryRegressionScore must be greater than or equal to thresholds.summaryScore");
  }
  if (candidate.baselineScores.recallRegressionScore < candidate.thresholds.recallScore) {
    throw new Error("baselineScores.recallRegressionScore must be greater than or equal to thresholds.recallScore");
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

function validateProductReadiness(productReadiness: ProductReadinessFixture): void {
  validateScore("productReadiness.targetScore", productReadiness.targetScore);
  validateScore("productReadiness.capabilityWeight", productReadiness.capabilityWeight);
  validateScore("productReadiness.scenarioWeight", productReadiness.scenarioWeight);
  assertUnique("product capability", productReadiness.capabilities.map((capability) => capability.id));
  assertUnique("product scenario", productReadiness.scenarios.map((scenario) => scenario.id));
  const capabilityIds = new Set(productReadiness.capabilities.map((capability) => capability.id));
  for (const id of requiredV21aCapabilityIds) {
    if (!capabilityIds.has(id)) {
      throw new Error(`Missing V2.1a product capability: ${id}`);
    }
  }
  const scenarioIds = new Set(productReadiness.scenarios.map((scenario) => scenario.id));
  for (const id of requiredV21aScenarioIds) {
    if (!scenarioIds.has(id)) {
      throw new Error(`Missing V2.1a product scenario: ${id}`);
    }
  }
  const totalProductWeight = productReadiness.capabilityWeight + productReadiness.scenarioWeight;
  if (Math.abs(totalProductWeight - 1) > 0.000_001) {
    throw new Error(`productReadiness capability/scenario weights must add up to 1, got ${totalProductWeight}`);
  }
  const totalCapabilityWeight = productReadiness.capabilities.reduce((total, capability) => total + capability.weight, 0);
  const totalScenarioWeight = productReadiness.scenarios.reduce((total, scenario) => total + scenario.weight, 0);
  if (productReadiness.capabilities.length === 0) {
    throw new Error("productReadiness.capabilities must not be empty");
  }
  if (productReadiness.scenarios.length === 0) {
    throw new Error("productReadiness.scenarios must not be empty");
  }
  if (Math.abs(totalCapabilityWeight - 1) > 0.000_001) {
    throw new Error(`productReadiness capability weights must add up to 1, got ${totalCapabilityWeight}`);
  }
  if (Math.abs(totalScenarioWeight - 1) > 0.000_001) {
    throw new Error(`productReadiness scenario weights must add up to 1, got ${totalScenarioWeight}`);
  }
  for (const capability of productReadiness.capabilities) {
    validateScore(`productReadiness.${capability.id}.score`, capability.score);
    validateReadinessStatusScore(`productReadiness.${capability.id}`, capability.status, capability.score);
    if (!Number.isFinite(capability.weight) || capability.weight <= 0 || capability.weight > 1) {
      throw new Error(`productReadiness.${capability.id}.weight must be a finite positive weight`);
    }
    if (capability.evidence.trim().length === 0) {
      throw new Error(`productReadiness.${capability.id}.evidence must not be empty`);
    }
  }
  for (const scenario of productReadiness.scenarios) {
    validateScore(`productReadiness.${scenario.id}.score`, scenario.score);
    validateReadinessStatusScore(`productReadiness.${scenario.id}`, scenario.status, scenario.score);
    if (!Number.isFinite(scenario.weight) || scenario.weight <= 0 || scenario.weight > 1) {
      throw new Error(`productReadiness.${scenario.id}.weight must be a finite positive weight`);
    }
    if (scenario.dimensions.length === 0) {
      throw new Error(`productReadiness.${scenario.id}.dimensions must not be empty`);
    }
    for (const dimension of scenario.dimensions) {
      if (!capabilityIds.has(dimension)) {
        throw new Error(`productReadiness.${scenario.id} references missing dimension ${dimension}`);
      }
    }
    if (scenario.turns.length === 0) {
      throw new Error(`productReadiness.${scenario.id}.turns must not be empty`);
    }
    if (scenario.expectedBehavior.length === 0) {
      throw new Error(`productReadiness.${scenario.id}.expectedBehavior must not be empty`);
    }
    if (scenario.currentGap.trim().length === 0) {
      throw new Error(`productReadiness.${scenario.id}.currentGap must not be empty`);
    }
    if (scenario.sourceExpectations.sourceTurnIds.length === 0) {
      throw new Error(`productReadiness.${scenario.id}.sourceExpectations.sourceTurnIds must not be empty`);
    }
    if (scenario.sourceExpectations.exactFragments.length === 0) {
      throw new Error(`productReadiness.${scenario.id}.sourceExpectations.exactFragments must not be empty`);
    }
  }
}

function validateScore(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite score between 0 and 1`);
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

function validateReadinessStatusScore(label: string, status: ProductReadinessStatus, score: number): void {
  if (status === "not_implemented" && score !== 0) {
    throw new Error(`${label} is not implemented and must keep score 0`);
  }
  if (status === "partial" && (score <= 0 || score > 0.6)) {
    throw new Error(`${label} is partial and must keep a low score from 0 to 0.6`);
  }
  if (status === "implemented" && score < 0.75) {
    throw new Error(`${label} is implemented and must have score >= 0.75`);
  }
}

function scoreProductReadiness(productReadiness: ProductReadinessFixture): {
  score: number;
  targetScore: number;
  capabilityScore: number;
  scenarioScore: number;
  capabilityWeight: number;
  scenarioWeight: number;
  capabilities: ProductCapabilityFixture[];
  scenarios: ProductScenarioFixture[];
} {
  const capabilityScore = weightedAverage(
    productReadiness.capabilities.map((capability): [number, number] => [capability.score, capability.weight])
  );
  const scenarioScore = weightedAverage(
    productReadiness.scenarios.map((scenario): [number, number] => [scenario.score, scenario.weight])
  );
  return {
    score: roundScore(
      capabilityScore * productReadiness.capabilityWeight + scenarioScore * productReadiness.scenarioWeight
    ),
    targetScore: productReadiness.targetScore,
    capabilityScore: roundScore(capabilityScore),
    scenarioScore: roundScore(scenarioScore),
    capabilityWeight: productReadiness.capabilityWeight,
    scenarioWeight: productReadiness.scenarioWeight,
    capabilities: productReadiness.capabilities,
    scenarios: productReadiness.scenarios
  };
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
