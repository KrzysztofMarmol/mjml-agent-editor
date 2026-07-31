/**
 * Drives the scenarios against a running agent over HTTP and checks the invariants.
 *
 * The runner talks to a backend exactly the way the frontend does — `POST /api/chat` with
 * a `docId` and UI messages — so anything it proves holds for the real client too. It
 * knows nothing about either implementation's language or internals.
 */

import { scanSections, type MjmlCompiler } from "@mjml-agent-editor/core";

import { readStream, type StreamFacts } from "./stream.js";
import type { Scenario } from "./scenarios.js";

export interface DocumentFixture {
  create(name: string, mjml: string): Promise<string>;
  read(documentId: string): Promise<string>;
  destroy(documentId: string): Promise<void>;
}

export interface RunnerOptions {
  readonly url: string;
  readonly fixture: DocumentFixture;
  readonly compiler: MjmlCompiler;
  readonly timeoutMs?: number;
}

export interface ScenarioResult {
  readonly scenario: string;
  readonly passed: boolean;
  readonly failures: readonly string[];
  readonly toolCalls: readonly string[];
  readonly durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 180_000;

async function postChat(url: string, documentId: string, prompt: string, timeoutMs: number) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      docId: documentId,
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: prompt }] }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`agent returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.text();
}

function checkStream(scenario: Scenario, facts: StreamFacts): string[] {
  const failures: string[] = [];
  const { firstToolCall, callsAtLeast } = scenario.expect;

  if (facts.errors.length > 0) {
    failures.push(`stream carried errors: ${facts.errors.join("; ")}`);
  }

  if (firstToolCall && facts.toolCalls[0] !== firstToolCall) {
    failures.push(
      `first tool call was ${facts.toolCalls[0] ?? "(none)"}, expected ${firstToolCall}`,
    );
  }

  for (const tool of callsAtLeast ?? []) {
    if (!facts.toolCalls.includes(tool)) failures.push(`never called ${tool}`);
  }

  return failures;
}

async function checkDocument(
  scenario: Scenario,
  finalMjml: string,
  compiler: MjmlCompiler,
): Promise<string[]> {
  const failures: string[] = [];
  const expect = scenario.expect;

  if (expect.unchanged && finalMjml !== scenario.seedMjml) {
    failures.push("document was modified but should have been left untouched");
  }

  for (const id of expect.preservesSectionIds ?? []) {
    if (!scanSections(finalMjml).some((span) => span.id === id)) {
      failures.push(`section id ${id} disappeared — comments anchored to it would be orphaned`);
    }
  }

  for (const needle of expect.finalContains ?? []) {
    if (!finalMjml.includes(needle)) failures.push(`final document is missing "${needle}"`);
  }

  for (const needle of expect.finalOmits ?? []) {
    if (finalMjml.includes(needle)) failures.push(`final document still contains ${needle}`);
  }

  if (expect.sectionCount !== undefined) {
    const actual = scanSections(finalMjml).length;
    if (actual !== expect.sectionCount) {
      failures.push(`document has ${actual} sections, expected ${expect.sectionCount}`);
    }
  }

  if (expect.finalCompiles) {
    const result = await compiler.compile(finalMjml);
    if (!result.ok) {
      failures.push(`stored document does not compile: ${result.errors.split("\n")[0]}`);
    }
  }

  return failures;
}

export async function runScenario(
  scenario: Scenario,
  options: RunnerOptions,
): Promise<ScenarioResult> {
  const started = Date.now();
  const documentId = await options.fixture.create(
    `conformance: ${scenario.name}`,
    scenario.seedMjml,
  );

  try {
    const body = await postChat(
      options.url,
      documentId,
      scenario.prompt,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const facts = readStream(body);
    const finalMjml = await options.fixture.read(documentId);

    const failures = [
      ...checkStream(scenario, facts),
      ...(await checkDocument(scenario, finalMjml, options.compiler)),
    ];

    return {
      scenario: scenario.name,
      passed: failures.length === 0,
      failures,
      toolCalls: facts.toolCalls,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      scenario: scenario.name,
      passed: false,
      failures: [error instanceof Error ? error.message : String(error)],
      toolCalls: [],
      durationMs: Date.now() - started,
    };
  } finally {
    await options.fixture.destroy(documentId).catch(() => {
      /* leaving a stray fixture behind must not mask a real result */
    });
  }
}

export async function runScenarios(
  scenarios: readonly Scenario[],
  options: RunnerOptions,
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  // Sequential on purpose: these hit a live model, and parallel runs make rate limits look
  // like conformance failures.
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, options));
  }
  return results;
}
