import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildMemoryAtomRecallContext,
  buildRecallContext,
  createSummarySegmentDraft,
  extractDeterministicMemoryAtoms,
  formatMemoryAtomRecallContextForPrompt,
  formatRecallContextForPrompt,
  type MemoryAtom,
  type MemoryAtomType,
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
    atomExtractionScore: number;
    atomRecallScore: number;
    productReadinessScore: number;
    v21aScenarioScore: number;
  };
  productReadiness: ProductReadinessFixture;
  sessionId: string;
  threadId: string;
  summaryCases: SummaryBenchmarkCase[];
  recallSegments: RecallSegmentFixture[];
  recallCases: RecallBenchmarkCase[];
  atomCases: AtomBenchmarkCase[];
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

interface AtomBenchmarkCase {
  id: string;
  description?: string;
  scenarioId: (typeof requiredV21aScenarioIds)[number];
  extractionMinScore: number;
  recallMinScore: number;
  extraction: {
    sourceTurnIds: string[];
    expectedAtoms: AtomExpectation[];
    rejectedSourceTurnIds?: string[];
  };
  recall: {
    input: string;
    expectedAtomExpectationIds: string[];
    rejectedAtomExpectationIds?: string[];
    maxItems?: number;
    maxCharacters?: number;
    promptIncludes?: string[];
    promptExcludes?: string[];
    unsupportedGaps?: string[];
  };
}

interface AtomExpectation {
  id: string;
  type: MemoryAtomType;
  sourceTurnIds: string[];
  textIncludes?: string[];
  triggerIncludes?: string[];
  eventDate?: {
    kind: "absolute" | "month_day";
    isoDate?: string;
    month?: number;
    day?: number;
  };
  recurrenceFrequency?: "annual";
  ritualAction?: string;
  object?: string;
  sentiment?: "positive" | "negative" | "neutral";
  metadata?: Record<string, string | string[] | number | boolean | null>;
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
const atomExtractionResults = fixture.atomCases.map((testCase) => runAtomExtractionCase(testCase, fixture));
const atomRecallResults = fixture.atomCases.map((testCase) => runAtomRecallCase(testCase, fixture));
const summaryScore = average(summaryResults.map((result) => result.score));
const recallScore = average(recallResults.map((result) => result.score));
const atomExtractionScore = average(atomExtractionResults.map((result) => result.score));
const atomRecallScore = average(atomRecallResults.map((result) => result.score));
const productReadinessResult = scoreProductReadiness(fixture.productReadiness);
const ok =
  fixture.version === 4 &&
  summaryScore >= fixture.thresholds.summaryScore &&
  recallScore >= fixture.thresholds.recallScore &&
  summaryScore >= fixture.baselineScores.summaryRegressionScore &&
  recallScore >= fixture.baselineScores.recallRegressionScore &&
  atomExtractionScore >= fixture.baselineScores.atomExtractionScore &&
  atomRecallScore >= fixture.baselineScores.atomRecallScore &&
  productReadinessResult.score >= fixture.baselineScores.productReadinessScore &&
  productReadinessResult.scenarioScore >= fixture.baselineScores.v21aScenarioScore &&
  summaryResults.every((result) => result.passed) &&
  recallResults.every((result) => result.passed) &&
  atomExtractionResults.every((result) => result.passed) &&
  atomRecallResults.every((result) => result.passed);

const report = {
  ok,
  fixtureVersion: fixture.version,
  generatedAt: new Date().toISOString(),
  thresholds: fixture.thresholds,
  baselineScores: fixture.baselineScores,
  scores: {
    summaryRegressionScore: roundScore(summaryScore),
    recallRegressionScore: roundScore(recallScore),
    atomExtractionScore: roundScore(atomExtractionScore),
    atomRecallScore: roundScore(atomRecallScore),
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
  atomExtraction: {
    score: roundScore(atomExtractionScore),
    cases: atomExtractionResults
  },
  atomRecall: {
    score: roundScore(atomRecallScore),
    cases: atomRecallResults
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
  if (candidate.version !== 4) {
    throw new Error(`Unsupported memory benchmark fixture version: ${candidate.version}`);
  }
  validateScore("thresholds.summaryScore", candidate.thresholds.summaryScore);
  validateScore("thresholds.recallScore", candidate.thresholds.recallScore);
  validateScore("baselineScores.summaryRegressionScore", candidate.baselineScores.summaryRegressionScore);
  validateScore("baselineScores.recallRegressionScore", candidate.baselineScores.recallRegressionScore);
  validateScore("baselineScores.atomExtractionScore", candidate.baselineScores.atomExtractionScore);
  validateScore("baselineScores.atomRecallScore", candidate.baselineScores.atomRecallScore);
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
  assertUnique("atom case", candidate.atomCases.map((testCase) => testCase.id));
  const segmentIds = new Set(candidate.recallSegments.map((segment) => segment.id));
  for (const testCase of candidate.recallCases) {
    for (const id of [...testCase.expectedIds, ...testCase.rejectedIds, ...(testCase.expectedSkipped ?? []).map((item) => item.id)]) {
      if (!segmentIds.has(id)) {
        throw new Error(`Recall case ${testCase.id} references missing segment ${id}`);
      }
    }
  }
  for (const testCase of candidate.atomCases) {
    validateAtomCase(testCase, candidate);
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

function validateAtomCase(testCase: AtomBenchmarkCase, loadedFixture: MemoryBenchmarkFixture): void {
  validateScore(`atomCases.${testCase.id}.extractionMinScore`, testCase.extractionMinScore);
  validateScore(`atomCases.${testCase.id}.recallMinScore`, testCase.recallMinScore);
  const scenario = findScenario(testCase.scenarioId, loadedFixture);
  if (!scenario) {
    throw new Error(`Atom case ${testCase.id} references missing scenario ${testCase.scenarioId}`);
  }
  const scenarioTurnIds = new Set(scenario.turns.map((turn) => turn.id));
  if (testCase.extraction.sourceTurnIds.length === 0) {
    throw new Error(`Atom case ${testCase.id} must define extraction.sourceTurnIds`);
  }
  if (testCase.extraction.expectedAtoms.length === 0) {
    throw new Error(`Atom case ${testCase.id} must define extraction.expectedAtoms`);
  }
  assertUnique(
    `atom expectation for ${testCase.id}`,
    testCase.extraction.expectedAtoms.map((expectation) => expectation.id)
  );
  for (const turnId of [
    ...testCase.extraction.sourceTurnIds,
    ...testCase.extraction.expectedAtoms.flatMap((expectation) => expectation.sourceTurnIds),
    ...(testCase.extraction.rejectedSourceTurnIds ?? [])
  ]) {
    if (!scenarioTurnIds.has(turnId)) {
      throw new Error(`Atom case ${testCase.id} references missing scenario turn ${turnId}`);
    }
  }
  const expectationIds = new Set(testCase.extraction.expectedAtoms.map((expectation) => expectation.id));
  for (const expectationId of [
    ...testCase.recall.expectedAtomExpectationIds,
    ...(testCase.recall.rejectedAtomExpectationIds ?? [])
  ]) {
    if (!expectationIds.has(expectationId)) {
      throw new Error(`Atom case ${testCase.id} recall references missing atom expectation ${expectationId}`);
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

function runAtomExtractionCase(testCase: AtomBenchmarkCase, loadedFixture: MemoryBenchmarkFixture): CaseResult {
  const atoms = collectAtomCaseAtoms(testCase, loadedFixture);
  const expectationResults = testCase.extraction.expectedAtoms.map((expectation) =>
    scoreAtomExpectation(expectation, atoms)
  );
  const rejectedSourceHits = atoms
    .filter((atom) => (testCase.extraction.rejectedSourceTurnIds ?? []).some((turnId) => atom.sourceTurnIds.includes(turnId)))
    .map(toAtomDetail);
  const expectationScore = average(expectationResults.map((result) => result.score));
  const rejectionScore = rejectedSourceHits.length === 0 ? 1 : 0;
  const score = weightedAverage([
    [expectationScore, 0.9],
    [rejectionScore, 0.1]
  ]);

  return {
    id: testCase.id,
    passed: score >= testCase.extractionMinScore,
    score: roundScore(score),
    details: {
      description: testCase.description,
      scenarioId: testCase.scenarioId,
      minScore: testCase.extractionMinScore,
      sourceTurnIds: testCase.extraction.sourceTurnIds,
      extractedAtoms: atoms.map(toAtomDetail),
      expectationResults,
      rejectedSourceHits
    }
  };
}

function runAtomRecallCase(testCase: AtomBenchmarkCase, loadedFixture: MemoryBenchmarkFixture): CaseResult {
  const atoms = collectAtomCaseAtoms(testCase, loadedFixture);
  const expectationMatches = new Map(
    testCase.extraction.expectedAtoms.map((expectation) => [expectation.id, findBestAtomForExpectation(expectation, atoms)])
  );
  const context = buildMemoryAtomRecallContext({
    input: testCase.recall.input,
    atoms,
    maxItems: testCase.recall.maxItems,
    maxCharacters: testCase.recall.maxCharacters
  });
  const promptText = formatMemoryAtomRecallContextForPrompt(context);
  const actualIds = context.items.map((item) => item.id);
  const actualIdSet = new Set(actualIds);
  const expectedMatches = testCase.recall.expectedAtomExpectationIds.map((expectationId) => ({
    expectationId,
    atom: expectationMatches.get(expectationId)?.atom
  }));
  const missingExtraction = expectedMatches
    .filter((match) => !match.atom)
    .map((match) => match.expectationId);
  const missingRecall = expectedMatches
    .filter((match) => match.atom && !actualIdSet.has(match.atom.id))
    .map((match) => ({ expectationId: match.expectationId, atomId: match.atom?.id }));
  const rejectedHits = (testCase.recall.rejectedAtomExpectationIds ?? [])
    .map((expectationId) => ({ expectationId, atom: expectationMatches.get(expectationId)?.atom }))
    .filter((match) => match.atom && actualIdSet.has(match.atom.id))
    .map((match) => ({ expectationId: match.expectationId, atomId: match.atom?.id }));
  const sourceVisible = context.items.every((item) => item.sourceTurnIds.every((turnId) => promptText.includes(turnId)));
  const reasonVisible = context.items.every((item) => item.reason.length > 0 && promptText.includes(item.reason));
  const missingPromptFragments = (testCase.recall.promptIncludes ?? []).filter((fragment) => !promptText.includes(fragment));
  const unexpectedPromptFragments = (testCase.recall.promptExcludes ?? []).filter((fragment) => promptText.includes(fragment));
  const expectedCount = testCase.recall.expectedAtomExpectationIds.length;
  const hitScore =
    expectedCount === 0
      ? actualIds.length === 0
        ? 1
        : 0
      : ratio(expectedCount - missingExtraction.length - missingRecall.length, expectedCount);
  const rejectedExpectationCount = (testCase.recall.rejectedAtomExpectationIds ?? []).length;
  const rejectionScore =
    rejectedExpectationCount === 0 ? 1 : ratio(rejectedExpectationCount - rejectedHits.length, rejectedExpectationCount);
  const visibilityScore = context.items.length > 0 && sourceVisible && reasonVisible ? 1 : 0;
  const promptScore =
    (testCase.recall.promptIncludes ?? []).length + (testCase.recall.promptExcludes ?? []).length === 0
      ? 1
      : missingPromptFragments.length === 0 && unexpectedPromptFragments.length === 0
        ? 1
        : 0;
  const score = weightedAverage([
    [hitScore, 0.7],
    [promptScore, 0.2],
    [rejectionScore, 0.05],
    [visibilityScore, 0.05]
  ]);

  return {
    id: testCase.id,
    passed: score >= testCase.recallMinScore,
    score: roundScore(score),
    details: {
      description: testCase.description,
      scenarioId: testCase.scenarioId,
      minScore: testCase.recallMinScore,
      input: testCase.recall.input,
      actualIds,
      skipped: context.skipped,
      missingExtraction,
      missingRecall,
      rejectedHits,
      missingPromptFragments,
      unexpectedPromptFragments,
      unsupportedGaps: testCase.recall.unsupportedGaps ?? [],
      reasons: context.items.map((item) => ({ id: item.id, reason: item.reason, score: item.score })),
      sourceVisible,
      reasonVisible
    }
  };
}

function collectAtomCaseAtoms(testCase: AtomBenchmarkCase, loadedFixture: MemoryBenchmarkFixture): MemoryAtom[] {
  const scenario = findScenario(testCase.scenarioId, loadedFixture);
  if (!scenario) {
    throw new Error(`Atom case ${testCase.id} references missing scenario ${testCase.scenarioId}`);
  }
  const turnsById = new Map(scenario.turns.map((turn) => [turn.id, turn]));
  return testCase.extraction.sourceTurnIds.flatMap((turnId) => {
    const turn = turnsById.get(turnId);
    if (!turn) {
      throw new Error(`Atom case ${testCase.id} references missing scenario turn ${turnId}`);
    }
    return extractDeterministicMemoryAtoms({
      text: turn.content,
      threadId: loadedFixture.threadId,
      sourceTurnIds: [turn.id],
      sourceSessionId: loadedFixture.sessionId,
      createdAt: turn.createdAt ?? defaultCreatedAt,
      now: turn.createdAt ?? defaultCreatedAt
    });
  });
}

function scoreAtomExpectation(expectation: AtomExpectation, atoms: MemoryAtom[]): {
  expectationId: string;
  score: number;
  actualAtom?: ReturnType<typeof toAtomDetail>;
  missingChecks: string[];
  matchedChecks: string[];
} {
  const match = findBestAtomForExpectation(expectation, atoms);
  return {
    expectationId: expectation.id,
    score: roundScore(match.score),
    actualAtom: match.atom ? toAtomDetail(match.atom) : undefined,
    missingChecks: match.checks.filter((check) => check.score < 1).map((check) => check.label),
    matchedChecks: match.checks.filter((check) => check.score === 1).map((check) => check.label)
  };
}

function findBestAtomForExpectation(
  expectation: AtomExpectation,
  atoms: MemoryAtom[]
): {
  atom?: MemoryAtom;
  score: number;
  checks: Array<{ label: string; score: number }>;
} {
  const candidates = atoms.filter(
    (atom) => atom.type === expectation.type && expectation.sourceTurnIds.every((turnId) => atom.sourceTurnIds.includes(turnId))
  );
  if (candidates.length === 0) {
    return { score: 0, checks: [{ label: "type/source", score: 0 }] };
  }
  return candidates
    .map((atom) => {
      const checks = scoreAtomExpectationChecks(expectation, atom);
      return { atom, checks, score: average(checks.map((check) => check.score)) };
    })
    .sort((a, b) => b.score - a.score)[0]!;
}

function scoreAtomExpectationChecks(expectation: AtomExpectation, atom: MemoryAtom): Array<{ label: string; score: number }> {
  const checks: Array<{ label: string; score: number }> = [
    { label: "type", score: atom.type === expectation.type ? 1 : 0 },
    {
      label: "sourceTurnIds",
      score: expectation.sourceTurnIds.every((turnId) => atom.sourceTurnIds.includes(turnId)) ? 1 : 0
    }
  ];
  if (expectation.textIncludes) {
    checks.push({
      label: "textIncludes",
      score: ratio(
        expectation.textIncludes.filter((fragment) => atom.text.toLowerCase().includes(fragment.toLowerCase())).length,
        expectation.textIncludes.length
      )
    });
  }
  if (expectation.triggerIncludes) {
    const triggerKeys = flattenAtomTriggerKeys(atom);
    checks.push({
      label: "triggerIncludes",
      score: ratio(
        expectation.triggerIncludes.filter((key) => triggerKeys.includes(key.toLowerCase())).length,
        expectation.triggerIncludes.length
      )
    });
  }
  if (expectation.eventDate) {
    checks.push({ label: "eventDate", score: atomEventDateMatches(atom, expectation) ? 1 : 0 });
  }
  if (expectation.recurrenceFrequency) {
    checks.push({
      label: "recurrence",
      score: atom.recurrence?.frequency === expectation.recurrenceFrequency ? 1 : 0
    });
  }
  if (expectation.ritualAction) {
    checks.push({
      label: "ritualAction",
      score: atom.ritualAction === expectation.ritualAction ? 1 : 0
    });
  }
  if (expectation.object) {
    checks.push({ label: "object", score: atom.object === expectation.object ? 1 : 0 });
  }
  if (expectation.sentiment) {
    checks.push({ label: "sentiment", score: atom.sentiment === expectation.sentiment ? 1 : 0 });
  }
  if (expectation.metadata) {
    const metadataEntries = Object.entries(expectation.metadata);
    checks.push({
      label: "metadata",
      score: ratio(
        metadataEntries.filter(([key, value]) => metadataValueMatches(atom.metadata?.[key], value)).length,
        metadataEntries.length
      )
    });
  }
  return checks;
}

function atomEventDateMatches(atom: MemoryAtom, expectation: AtomExpectation): boolean {
  if (!atom.eventDate || !expectation.eventDate) {
    return false;
  }
  return (
    atom.eventDate.kind === expectation.eventDate.kind &&
    (expectation.eventDate.isoDate === undefined || atom.eventDate.isoDate === expectation.eventDate.isoDate) &&
    (expectation.eventDate.month === undefined || atom.eventDate.month === expectation.eventDate.month) &&
    (expectation.eventDate.day === undefined || atom.eventDate.day === expectation.eventDate.day)
  );
}

function metadataValueMatches(
  actual: string | string[] | number | boolean | null | undefined,
  expected: string | string[] | number | boolean | null
): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item) => actual.includes(item));
  }
  return actual === expected;
}

function flattenAtomTriggerKeys(atom: MemoryAtom): string[] {
  return [
    ...new Set(
      [
        ...atom.triggerKeys,
        ...atom.triggers.exact,
        ...atom.triggers.aliases,
        ...atom.triggers.secondary,
        ...(atom.triggers.calendar ?? []),
        ...(atom.triggers.environment ?? []),
        ...(atom.triggers.semantic ?? []),
        ...(atom.triggers.relationship ?? [])
      ].map((key) => key.toLowerCase())
    )
  ];
}

function toAtomDetail(atom: MemoryAtom): Record<string, unknown> {
  return {
    id: atom.id,
    type: atom.type,
    text: atom.text,
    sourceTurnIds: atom.sourceTurnIds,
    triggerKeys: atom.triggerKeys,
    triggers: atom.triggers,
    eventDate: atom.eventDate,
    recurrence: atom.recurrence,
    ritualAction: atom.ritualAction,
    object: atom.object,
    sentiment: atom.sentiment,
    metadata: atom.metadata
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

function findScenario(id: string, loadedFixture: MemoryBenchmarkFixture): ProductScenarioFixture | undefined {
  return loadedFixture.productReadiness.scenarios.find((scenario) => scenario.id === id);
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
