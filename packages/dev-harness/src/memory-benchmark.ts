import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildMemoryAtomRecallContext,
  buildProactiveMemoryCandidatesFromSceneContext,
  buildProactiveMemoryCandidates,
  buildRecallContext,
  createSummarySegmentDraft,
  extractDeterministicMemoryAtoms,
  formatMemoryAtomRecallContextForPrompt,
  formatRecallContextForPrompt,
  LLMBackedMemoryAtomExtractor,
  type EnvironmentTriggerState,
  type MemoryAtom,
  type MemoryAtomExtractionMode,
  type MemoryAtomType,
  type ProactiveMemoryPolicy,
  type ProactiveMemoryTriggerState,
  type RuntimeSceneContext,
  type SummarySegment
} from "@greyfield/core-runtime";
import type { ChatMessage, LLMProvider, SessionTurn } from "@greyfield/core-runtime";

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
    proactiveTriggerScore: number;
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

type AtomRecallSourceEvidenceClass = "no_recall" | "memory_hit_without_raw_evidence" | "memory_hit_with_raw_source_evidence";
type AtomRecallTriggerLane = keyof MemoryAtom["triggers"];

interface AtomRecallFalsePositiveCase {
  id: string;
  input: string;
  rejectedAtomExpectationIds: string[];
  promptExcludes?: string[];
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
    extractorMode?: MemoryAtomExtractionMode;
    scriptedLLMResponses?: Record<string, unknown>;
  };
  recall: {
    input: string;
    now?: string;
    expectedAtomExpectationIds: string[];
    rejectedAtomExpectationIds?: string[];
    maxItems?: number;
    maxCharacters?: number;
    sourcePassageMode?: "auto" | "always" | "never";
    sourcePassageMaxCharacters?: number;
    sourcePassageMaxCharactersPerTurn?: number;
    sourcePassageMaxTurnsPerAtom?: number;
    disabledTriggerLanes?: AtomRecallTriggerLane[];
    promptIncludes?: string[];
    promptExcludes?: string[];
    sourceEvidence?: {
      expectedClass: AtomRecallSourceEvidenceClass;
      requiredFragments?: string[];
    };
    falsePositiveCases?: AtomRecallFalsePositiveCase[];
    unsupportedGaps?: string[];
  };
  proactive?: ProactiveBenchmarkCase;
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
  subject?: string;
  object?: string;
  sentiment?: "positive" | "negative" | "neutral";
  metadata?: Record<string, string | string[] | number | boolean | null>;
}

interface ProactiveBenchmarkCase {
  minScore: number;
  environment?: EnvironmentTriggerState;
  sceneContext?: RuntimeSceneContext;
  policy?: ProactiveMemoryPolicy;
  triggerState?: ProactiveMemoryTriggerState;
  expectedAtomExpectationIds: string[];
  rejectedAtomExpectationIds?: string[];
  candidateIncludes?: string[];
  candidateExcludes?: string[];
  negativeCases: ProactiveNegativeCase[];
}

interface ProactiveNegativeCase {
  id: string;
  environment?: EnvironmentTriggerState;
  sceneContext?: RuntimeSceneContext;
  policy?: ProactiveMemoryPolicy;
  triggerState?: ProactiveMemoryTriggerState;
  expectedSkippedReasons?: string[];
}

interface CaseResult {
  id: string;
  passed: boolean;
  score: number;
  details: Record<string, unknown>;
}

const defaultCreatedAt = "2026-06-26T01:00:00.000Z";
const validAtomRecallTriggerLanes = new Set<AtomRecallTriggerLane>([
  "exact",
  "aliases",
  "secondary",
  "calendar",
  "environment",
  "semantic",
  "relationship"
]);
const requiredV21aCapabilityIds = [
  "memory-atom-extraction",
  "source-linked-promise-memory",
  "calendar-recall",
  "semantic-relationship-recall",
  "source-evidence-drilldown",
  "scene-proactive-trigger",
  "privacy-noise"
] as const;
const requiredV21aScenarioIds = [
  "birthday-first-meeting-rose",
  "semantic-relationship-ritual-recall",
  "game-negative-review-source-drilldown",
  "user-greyfield-promise-recall",
  "rainy-home-hotpot-proactive-trigger"
] as const;
const fixture = await loadFixture();
const recallSegments = fixture.recallSegments.map((segment) => makeSegment(segment, fixture));
const summaryResults = fixture.summaryCases.map((testCase) => runSummaryCase(testCase, fixture));
const recallResults = fixture.recallCases.map((testCase) => runRecallCase(testCase));
const atomCaseAtomCache = new Map<string, MemoryAtom[]>();
const atomExtractionResults = await Promise.all(fixture.atomCases.map((testCase) => runAtomExtractionCase(testCase, fixture)));
const atomRecallResults = await Promise.all(fixture.atomCases.map((testCase) => runAtomRecallCase(testCase, fixture)));
const proactiveTriggerResults = await Promise.all(fixture.atomCases
  .filter(hasProactiveBenchmarkCase)
  .map((testCase) => runAtomProactiveCase(testCase, fixture)));
const summaryScore = average(summaryResults.map((result) => result.score));
const recallScore = average(recallResults.map((result) => result.score));
const atomExtractionScore = average(atomExtractionResults.map((result) => result.score));
const atomRecallScore = average(atomRecallResults.map((result) => result.score));
const proactiveTriggerScore = average(proactiveTriggerResults.map((result) => result.score));
const productReadinessResult = scoreProductReadiness(fixture.productReadiness);
const ok =
  fixture.version === 7 &&
  summaryScore >= fixture.thresholds.summaryScore &&
  recallScore >= fixture.thresholds.recallScore &&
  summaryScore >= fixture.baselineScores.summaryRegressionScore &&
  recallScore >= fixture.baselineScores.recallRegressionScore &&
  atomExtractionScore >= fixture.baselineScores.atomExtractionScore &&
  atomRecallScore >= fixture.baselineScores.atomRecallScore &&
  proactiveTriggerScore >= fixture.baselineScores.proactiveTriggerScore &&
  productReadinessResult.score >= fixture.baselineScores.productReadinessScore &&
  productReadinessResult.scenarioScore >= fixture.baselineScores.v21aScenarioScore &&
  summaryResults.every((result) => result.passed) &&
  recallResults.every((result) => result.passed) &&
  atomExtractionResults.every((result) => result.passed) &&
  atomRecallResults.every((result) => result.passed) &&
  proactiveTriggerResults.every((result) => result.passed);

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
    proactiveTriggerScore: roundScore(proactiveTriggerScore),
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
  proactiveTrigger: {
    score: roundScore(proactiveTriggerScore),
    cases: proactiveTriggerResults
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
  if (candidate.version !== 7) {
    throw new Error(`Unsupported memory benchmark fixture version: ${candidate.version}`);
  }
  validateScore("thresholds.summaryScore", candidate.thresholds.summaryScore);
  validateScore("thresholds.recallScore", candidate.thresholds.recallScore);
  validateScore("baselineScores.summaryRegressionScore", candidate.baselineScores.summaryRegressionScore);
  validateScore("baselineScores.recallRegressionScore", candidate.baselineScores.recallRegressionScore);
  validateScore("baselineScores.atomExtractionScore", candidate.baselineScores.atomExtractionScore);
  validateScore("baselineScores.atomRecallScore", candidate.baselineScores.atomRecallScore);
  validateScore("baselineScores.proactiveTriggerScore", candidate.baselineScores.proactiveTriggerScore);
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
    ...(testCase.recall.rejectedAtomExpectationIds ?? []),
    ...(testCase.recall.falsePositiveCases ?? []).flatMap((negativeCase) => negativeCase.rejectedAtomExpectationIds),
    ...(testCase.proactive?.expectedAtomExpectationIds ?? []),
    ...(testCase.proactive?.rejectedAtomExpectationIds ?? [])
  ]) {
    if (!expectationIds.has(expectationId)) {
      throw new Error(`Atom case ${testCase.id} recall references missing atom expectation ${expectationId}`);
    }
  }
  if (testCase.proactive) {
    validateScore(`atomCases.${testCase.id}.proactive.minScore`, testCase.proactive.minScore);
    if (!testCase.proactive.environment && !testCase.proactive.sceneContext) {
      throw new Error(`Atom case ${testCase.id} proactive must define environment or sceneContext`);
    }
    assertUnique(
      `proactive negative case for ${testCase.id}`,
      testCase.proactive.negativeCases.map((negativeCase) => negativeCase.id)
    );
  }
  if (testCase.recall.sourceEvidence) {
    const requiredFragments = testCase.recall.sourceEvidence.requiredFragments ?? [];
    if (
      testCase.recall.sourceEvidence.expectedClass === "memory_hit_with_raw_source_evidence" &&
      requiredFragments.length === 0
    ) {
      throw new Error(`Atom case ${testCase.id} sourceEvidence.requiredFragments must prove raw evidence`);
    }
  }
  for (const lane of testCase.recall.disabledTriggerLanes ?? []) {
    if (!validAtomRecallTriggerLanes.has(lane)) {
      throw new Error(`Atom case ${testCase.id} uses unsupported recall.disabledTriggerLanes value ${lane}`);
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
      budget: context.budget,
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

async function runAtomExtractionCase(testCase: AtomBenchmarkCase, loadedFixture: MemoryBenchmarkFixture): Promise<CaseResult> {
  const atoms = await collectAtomCaseAtoms(testCase, loadedFixture);
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

async function runAtomRecallCase(testCase: AtomBenchmarkCase, loadedFixture: MemoryBenchmarkFixture): Promise<CaseResult> {
  const atoms = await collectAtomCaseAtoms(testCase, loadedFixture);
  const recallAtoms = applyDisabledRecallTriggerLanes(atoms, testCase.recall.disabledTriggerLanes);
  const expectationMatches = new Map(
    testCase.extraction.expectedAtoms.map((expectation) => [expectation.id, findBestAtomForExpectation(expectation, atoms)])
  );
  const context = buildMemoryAtomRecallContext({
    input: testCase.recall.input,
    atoms: recallAtoms,
    maxItems: testCase.recall.maxItems,
    maxCharacters: testCase.recall.maxCharacters,
    now: testCase.recall.now,
    sourceTurns: collectAtomCaseSourceTurns(testCase, loadedFixture),
    sourcePassageMode: testCase.recall.sourcePassageMode,
    sourcePassageMaxCharacters: testCase.recall.sourcePassageMaxCharacters,
    sourcePassageMaxCharactersPerTurn: testCase.recall.sourcePassageMaxCharactersPerTurn,
    sourcePassageMaxTurnsPerAtom: testCase.recall.sourcePassageMaxTurnsPerAtom
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
  const internalPromptLeaks = promptTextInternalLeaks(promptText);
  const sourceEvidence = classifyAtomRecallSourceEvidence(testCase, context.items, promptText, missingRecall.length > 0);
  const falsePositiveResults = (testCase.recall.falsePositiveCases ?? []).map((negativeCase) =>
    runAtomRecallFalsePositiveCase(negativeCase, recallAtoms, expectationMatches, testCase, loadedFixture)
  );
  const expectedCount = testCase.recall.expectedAtomExpectationIds.length;
  const hitScore =
    expectedCount === 0
      ? actualIds.length === 0
        ? 1
        : 0
      : ratio(expectedCount - missingExtraction.length - missingRecall.length, expectedCount);
  const rejectedExpectationCount = (testCase.recall.rejectedAtomExpectationIds ?? []).length;
  const primaryRejectionScore =
    rejectedExpectationCount === 0 ? 1 : ratio(rejectedExpectationCount - rejectedHits.length, rejectedExpectationCount);
  const falsePositiveScore =
    falsePositiveResults.length === 0
      ? 1
      : ratio(falsePositiveResults.filter((negativeResult) => negativeResult.passed).length, falsePositiveResults.length);
  const rejectionScore = average([primaryRejectionScore, falsePositiveScore]);
  const visibilityScore = context.items.length > 0 && sourceVisible && reasonVisible ? 1 : 0;
  const promptScore =
    (testCase.recall.promptIncludes ?? []).length + (testCase.recall.promptExcludes ?? []).length === 0
      ? internalPromptLeaks.length === 0
        ? 1
        : 0
      : missingPromptFragments.length === 0 && unexpectedPromptFragments.length === 0 && internalPromptLeaks.length === 0
        ? 1
        : 0;
  const sourceEvidenceScore = scoreAtomRecallSourceEvidence(testCase, sourceEvidence.classification);
  const score = weightedAverage([
    [hitScore, 0.5],
    [sourceEvidenceScore, 0.25],
    [promptScore, 0.1],
    [rejectionScore, 0.1],
    [visibilityScore, 0.05]
  ]);

  return {
    id: testCase.id,
    passed:
      score >= testCase.recallMinScore &&
      internalPromptLeaks.length === 0 &&
      sourceEvidence.expectedClassSatisfied &&
      falsePositiveResults.every((negativeResult) => negativeResult.passed),
    score: roundScore(score),
    details: {
      description: testCase.description,
      scenarioId: testCase.scenarioId,
      minScore: testCase.recallMinScore,
      input: testCase.recall.input,
      disabledTriggerLanes: testCase.recall.disabledTriggerLanes ?? [],
      actualIds,
      skipped: context.skipped,
      budget: context.budget,
      missingExtraction,
      missingRecall,
      rejectedHits,
      missingPromptFragments,
      unexpectedPromptFragments,
      internalPromptLeaks,
      sourceEvidenceClass: sourceEvidence.classification,
      expectedSourceEvidenceClass: testCase.recall.sourceEvidence?.expectedClass,
      missingSourceEvidenceFragments: sourceEvidence.missingFragments,
      falsePositiveResults,
      unsupportedGaps: testCase.recall.unsupportedGaps ?? [],
      reasons: context.items.map((item) => ({ id: item.id, reason: item.reason, score: item.score })),
      sourceVisible,
      reasonVisible
    }
  };
}

function runAtomRecallFalsePositiveCase(
  negativeCase: AtomRecallFalsePositiveCase,
  atoms: MemoryAtom[],
  expectationMatches: Map<string, ReturnType<typeof findBestAtomForExpectation>>,
  testCase: AtomBenchmarkCase,
  loadedFixture: MemoryBenchmarkFixture
): {
  id: string;
  passed: boolean;
  actualIds: string[];
  rejectedHits: Array<{ expectationId: string; atomId?: string }>;
  unexpectedPromptFragments: string[];
} {
  const context = buildMemoryAtomRecallContext({
    input: negativeCase.input,
    atoms,
    maxItems: testCase.recall.maxItems,
    maxCharacters: testCase.recall.maxCharacters,
    now: testCase.recall.now,
    sourceTurns: collectAtomCaseSourceTurns(testCase, loadedFixture),
    sourcePassageMode: testCase.recall.sourcePassageMode,
    sourcePassageMaxCharacters: testCase.recall.sourcePassageMaxCharacters,
    sourcePassageMaxCharactersPerTurn: testCase.recall.sourcePassageMaxCharactersPerTurn,
    sourcePassageMaxTurnsPerAtom: testCase.recall.sourcePassageMaxTurnsPerAtom
  });
  const actualIds = context.items.map((item) => item.id);
  const actualIdSet = new Set(actualIds);
  const rejectedHits = negativeCase.rejectedAtomExpectationIds
    .map((expectationId) => ({ expectationId, atom: expectationMatches.get(expectationId)?.atom }))
    .filter((match) => match.atom && actualIdSet.has(match.atom.id))
    .map((match) => ({ expectationId: match.expectationId, atomId: match.atom?.id }));
  const promptText = formatMemoryAtomRecallContextForPrompt(context);
  const unexpectedPromptFragments = (negativeCase.promptExcludes ?? []).filter((fragment) => promptText.includes(fragment));
  return {
    id: negativeCase.id,
    passed: actualIds.length === 0 && rejectedHits.length === 0 && unexpectedPromptFragments.length === 0,
    actualIds,
    rejectedHits,
    unexpectedPromptFragments
  };
}

function applyDisabledRecallTriggerLanes(atoms: MemoryAtom[], disabledTriggerLanes: AtomRecallTriggerLane[] | undefined): MemoryAtom[] {
  if (!disabledTriggerLanes || disabledTriggerLanes.length === 0) {
    return atoms;
  }
  const disabled = new Set(disabledTriggerLanes);
  return atoms.map((atom) => {
    const triggers = {
      exact: disabled.has("exact") ? [] : atom.triggers.exact,
      aliases: disabled.has("aliases") ? [] : atom.triggers.aliases,
      secondary: disabled.has("secondary") ? [] : atom.triggers.secondary,
      ...(atom.triggers.calendar || disabled.has("calendar")
        ? { calendar: disabled.has("calendar") ? [] : atom.triggers.calendar }
        : {}),
      ...(atom.triggers.environment || disabled.has("environment")
        ? { environment: disabled.has("environment") ? [] : atom.triggers.environment }
        : {}),
      ...(atom.triggers.semantic || disabled.has("semantic")
        ? { semantic: disabled.has("semantic") ? [] : atom.triggers.semantic }
        : {}),
      ...(atom.triggers.relationship || disabled.has("relationship")
        ? { relationship: disabled.has("relationship") ? [] : atom.triggers.relationship }
        : {})
    };
    return {
      ...atom,
      triggers,
      triggerKeys: [...new Set([triggers.exact, triggers.aliases, triggers.secondary].flat().map((key) => key.toLowerCase()))]
    };
  });
}

function classifyAtomRecallSourceEvidence(
  testCase: AtomBenchmarkCase,
  items: ReturnType<typeof buildMemoryAtomRecallContext>["items"],
  promptText: string,
  hasMissingExpectedRecall: boolean
): {
  classification: AtomRecallSourceEvidenceClass;
  missingFragments: string[];
  expectedClassSatisfied: boolean;
} {
  const requiredFragments = testCase.recall.sourceEvidence?.requiredFragments ?? [];
  const missingFragments = requiredFragments.filter((fragment) => !promptText.includes(fragment));
  const classification =
    items.length === 0 || hasMissingExpectedRecall
      ? "no_recall"
      : items.some((item) => (item.sourcePassages ?? []).length > 0) && missingFragments.length === 0
        ? "memory_hit_with_raw_source_evidence"
        : "memory_hit_without_raw_evidence";
  const expected = testCase.recall.sourceEvidence?.expectedClass;
  return {
    classification,
    missingFragments,
    expectedClassSatisfied: expected === undefined || classification === expected
  };
}

function scoreAtomRecallSourceEvidence(
  testCase: AtomBenchmarkCase,
  classification: AtomRecallSourceEvidenceClass
): number {
  if (!testCase.recall.sourceEvidence) {
    return 1;
  }
  if (classification === "memory_hit_with_raw_source_evidence") {
    return 1;
  }
  if (classification === "memory_hit_without_raw_evidence") {
    return 0.5;
  }
  return 0;
}

function hasProactiveBenchmarkCase(testCase: AtomBenchmarkCase): testCase is AtomBenchmarkCase & { proactive: ProactiveBenchmarkCase } {
  return testCase.proactive !== undefined;
}

async function runAtomProactiveCase(
  testCase: AtomBenchmarkCase & { proactive: ProactiveBenchmarkCase },
  loadedFixture: MemoryBenchmarkFixture
): Promise<CaseResult> {
  const atoms = await collectAtomCaseAtoms(testCase, loadedFixture);
  const expectationMatches = new Map(
    testCase.extraction.expectedAtoms.map((expectation) => [expectation.id, findBestAtomForExpectation(expectation, atoms)])
  );
  const result = buildProactiveBenchmarkCandidates(atoms, testCase.proactive);
  const actualIds = result.candidates.map((candidate) => candidate.atomId);
  const actualIdSet = new Set(actualIds);
  const candidatesByAtomId = new Map(result.candidates.map((candidate) => [candidate.atomId, candidate]));
  const expectedMatches = testCase.proactive.expectedAtomExpectationIds.map((expectationId) => ({
    expectationId,
    atom: expectationMatches.get(expectationId)?.atom
  }));
  const missingExtraction = expectedMatches
    .filter((match) => !match.atom)
    .map((match) => match.expectationId);
  const missingCandidates = expectedMatches
    .filter((match) => match.atom && !actualIdSet.has(match.atom.id))
    .map((match) => ({ expectationId: match.expectationId, atomId: match.atom?.id }));
  const missingCandidateSourceTurnIds = expectedMatches
    .flatMap((match) => {
      const atom = match.atom;
      const candidate = atom ? candidatesByAtomId.get(atom.id) : undefined;
      if (!atom || !candidate) {
        return [];
      }
      return atom.sourceTurnIds
        .filter((turnId) => !candidate.sourceTurnIds.includes(turnId))
        .map((turnId) => ({ expectationId: match.expectationId, atomId: atom.id, turnId }));
    });
  const rejectedHits = (testCase.proactive.rejectedAtomExpectationIds ?? [])
    .map((expectationId) => ({ expectationId, atom: expectationMatches.get(expectationId)?.atom }))
    .filter((match) => match.atom && actualIdSet.has(match.atom.id))
    .map((match) => ({ expectationId: match.expectationId, atomId: match.atom?.id }));
  const candidateText = result.candidates.map((candidate) => candidate.text).join("\n");
  const missingCandidateFragments = (testCase.proactive.candidateIncludes ?? []).filter(
    (fragment) => !candidateText.includes(fragment)
  );
  const unexpectedCandidateFragments = (testCase.proactive.candidateExcludes ?? []).filter((fragment) =>
    candidateText.includes(fragment)
  );
  const internalTextLeaks = result.candidates
    .filter((candidate) => candidateTextExposesInternals(candidate.text, candidate.atomId))
    .map((candidate) => candidate.atomId);
  const missingCandidateMetadata = result.candidates
    .filter(
      (candidate) =>
        candidate.sourceTurnIds.length === 0 ||
        !Number.isFinite(candidate.importance) ||
        candidate.cooldown.triggeredAt.length === 0 ||
        !Number.isFinite(candidate.cooldown.globalCooldownMs) ||
        !Number.isFinite(candidate.cooldown.perAtomCooldownMs)
    )
    .map((candidate) => candidate.atomId);
  const negativeResults = testCase.proactive.negativeCases.map((negativeCase) =>
    runProactiveNegativeCase(negativeCase, atoms, testCase.proactive)
  );
  const negativePasses = negativeResults.filter((negativeResult) => negativeResult.passed).length;
  const expectedCount = testCase.proactive.expectedAtomExpectationIds.length;
  const hitScore =
    expectedCount === 0
      ? actualIds.length === 0
        ? 1
        : 0
      : ratio(expectedCount - missingExtraction.length - missingCandidates.length, expectedCount);
  const textScore =
    missingCandidateFragments.length === 0 &&
    unexpectedCandidateFragments.length === 0 &&
    internalTextLeaks.length === 0 &&
    missingCandidateSourceTurnIds.length === 0 &&
    missingCandidateMetadata.length === 0
      ? 1
      : 0;
  const rejectedExpectationCount = (testCase.proactive.rejectedAtomExpectationIds ?? []).length;
  const rejectionScore =
    rejectedExpectationCount === 0 ? 1 : ratio(rejectedExpectationCount - rejectedHits.length, rejectedExpectationCount);
  const negativeScore = ratio(negativePasses, testCase.proactive.negativeCases.length);
  const score = weightedAverage([
    [hitScore, 0.35],
    [textScore, 0.25],
    [negativeScore, 0.3],
    [rejectionScore, 0.1]
  ]);

  return {
    id: testCase.id,
    passed:
      score >= testCase.proactive.minScore &&
      missingExtraction.length === 0 &&
      missingCandidates.length === 0 &&
      missingCandidateSourceTurnIds.length === 0 &&
      missingCandidateMetadata.length === 0 &&
      missingCandidateFragments.length === 0 &&
      unexpectedCandidateFragments.length === 0 &&
      internalTextLeaks.length === 0 &&
      negativeResults.every((negativeResult) => negativeResult.passed),
    score: roundScore(score),
    details: {
      description: testCase.description,
      scenarioId: testCase.scenarioId,
      minScore: testCase.proactive.minScore,
      actualIds,
      skipped: result.skipped,
      candidates: result.candidates.map((candidate) => ({
        atomId: candidate.atomId,
        sourceTurnIds: candidate.sourceTurnIds,
        text: candidate.text,
        importance: candidate.importance,
        cooldown: candidate.cooldown,
        matchedEnvironmentKeys: candidate.matchedEnvironmentKeys,
        reason: candidate.reason,
        score: candidate.score
      })),
      missingExtraction,
      missingCandidates,
      missingCandidateSourceTurnIds,
      missingCandidateMetadata,
      rejectedHits,
      missingCandidateFragments,
      unexpectedCandidateFragments,
      internalTextLeaks,
      negativeResults
    }
  };
}

function runProactiveNegativeCase(
  negativeCase: ProactiveNegativeCase,
  atoms: MemoryAtom[],
  positiveCase: ProactiveBenchmarkCase
): {
  id: string;
  passed: boolean;
  actualIds: string[];
  skipped: ReturnType<typeof buildProactiveMemoryCandidates>["skipped"];
  missingSkippedReasons: string[];
} {
  const result = buildProactiveBenchmarkCandidates(atoms, {
    environment: negativeCase.environment ?? (negativeCase.sceneContext ? undefined : positiveCase.environment),
    sceneContext: negativeCase.sceneContext ?? (negativeCase.environment ? undefined : positiveCase.sceneContext),
    policy: { ...(positiveCase.policy ?? {}), ...(negativeCase.policy ?? {}) },
    triggerState: negativeCase.triggerState ?? positiveCase.triggerState
  });
  const expectedReasons = negativeCase.expectedSkippedReasons ?? [];
  const missingSkippedReasons = expectedReasons.filter(
    (reason) => !result.skipped.some((skipped) => skipped.reason === reason)
  );
  return {
    id: negativeCase.id,
    passed: result.candidates.length === 0 && missingSkippedReasons.length === 0,
    actualIds: result.candidates.map((candidate) => candidate.atomId),
    skipped: result.skipped,
    missingSkippedReasons
  };
}

function buildProactiveBenchmarkCandidates(
  atoms: MemoryAtom[],
  input: Pick<ProactiveBenchmarkCase, "environment" | "sceneContext" | "policy" | "triggerState">
): ReturnType<typeof buildProactiveMemoryCandidates> {
  if (input.sceneContext) {
    return buildProactiveMemoryCandidatesFromSceneContext({
      atoms,
      sceneContext: input.sceneContext,
      policy: input.policy,
      triggerState: input.triggerState
    });
  }
  if (input.environment) {
    return buildProactiveMemoryCandidates({
      atoms,
      environment: input.environment,
      policy: input.policy,
      triggerState: input.triggerState
    });
  }
  throw new Error("Proactive benchmark case must define environment or sceneContext");
}

function candidateTextExposesInternals(text: string, atomId: string): boolean {
  return text.includes(atomId) || /memory-atom|source-turn|database|storage|turn-[\w-]+/iu.test(text);
}

function promptTextInternalLeaks(text: string): string[] {
  const checks: Array<[RegExp, string]> = [
    [/memory-atom/iu, "memory-atom"],
    [/\batom-(?:fact|preference|opinion|relationship_event|episodic_scene|promise)-[\w-]+/iu, "atom-id"],
    [/\bdatabase\b/iu, "database"],
    [/\bstorage\b/iu, "storage"]
  ];
  return checks.flatMap(([pattern, label]) => (pattern.test(text) ? [label] : []));
}

function createScriptedAtomLLMProvider(responses: Record<string, unknown>, turnId: string): LLMProvider {
  return {
    stream: async function* (messages: ChatMessage[]): AsyncIterable<string> {
      if (!messages[0]?.content.includes("You extract Greyfield long-term memory atoms")) {
        throw new Error("Scripted atom LLM provider only supports memory atom extraction prompts.");
      }
      const response = responses[turnId] ?? { atoms: [] };
      yield typeof response === "string" ? response : JSON.stringify(response);
    }
  };
}

async function collectAtomCaseAtoms(testCase: AtomBenchmarkCase, loadedFixture: MemoryBenchmarkFixture): Promise<MemoryAtom[]> {
  const cached = atomCaseAtomCache.get(testCase.id);
  if (cached) {
    return cached;
  }
  const scenario = findScenario(testCase.scenarioId, loadedFixture);
  if (!scenario) {
    throw new Error(`Atom case ${testCase.id} references missing scenario ${testCase.scenarioId}`);
  }
  const turnsById = new Map(scenario.turns.map((turn) => [turn.id, turn]));
  const atoms = (
    await Promise.all(
      testCase.extraction.sourceTurnIds.map(async (turnId) => {
        const turn = turnsById.get(turnId);
        if (!turn) {
          throw new Error(`Atom case ${testCase.id} references missing scenario turn ${turnId}`);
        }
        const input = {
          text: turn.content,
          threadId: loadedFixture.threadId,
          sourceTurnIds: [turn.id],
          sourceSessionId: loadedFixture.sessionId,
          createdAt: turn.createdAt ?? defaultCreatedAt,
          now: turn.createdAt ?? defaultCreatedAt
        };
        if (testCase.extraction.extractorMode === "llm" || testCase.extraction.extractorMode === "hybrid") {
          const extractor = new LLMBackedMemoryAtomExtractor({
            llm: createScriptedAtomLLMProvider(testCase.extraction.scriptedLLMResponses ?? {}, turn.id),
            mode: testCase.extraction.extractorMode
          });
          return extractor.extract(input);
        }
        return extractDeterministicMemoryAtoms(input);
      })
    )
  ).flat();
  atomCaseAtomCache.set(testCase.id, atoms);
  return atoms;
}

function collectAtomCaseSourceTurns(testCase: AtomBenchmarkCase, loadedFixture: MemoryBenchmarkFixture): SessionTurn[] {
  const scenario = findScenario(testCase.scenarioId, loadedFixture);
  if (!scenario) {
    throw new Error(`Atom case ${testCase.id} references missing scenario ${testCase.scenarioId}`);
  }
  return scenario.turns.map((turn) => ({
    id: turn.id,
    role: turn.role,
    content: turn.content,
    createdAt: turn.createdAt ?? defaultCreatedAt
  }));
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
  if (expectation.subject) {
    checks.push({ label: "subject", score: atom.subject === expectation.subject ? 1 : 0 });
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
    subject: atom.subject,
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
