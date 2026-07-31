/**
 * Scenarios every agent backend must satisfy.
 *
 * These assert **invariants, not transcripts**. A live model is not deterministic: asked to
 * append a section it may reach for `insert_section` or rewrite the document wholesale, and
 * both are legitimate. Pinning an exact tool sequence would produce a suite that fails on
 * model temperature rather than on backend divergence, which is worse than no suite.
 *
 * What is pinned is what the contract actually promises: ids survive, invalid markup is
 * never persisted, and the requested change lands.
 */

const STARTER = (sectionId: string, text: string) =>
  `<mjml><mj-body><mj-section css-class="sec-${sectionId}"><mj-column>` +
  `<mj-text>${text}</mj-text></mj-column></mj-section></mj-body></mjml>`;

export interface ScenarioExpectations {
  /** The contract tells the model to orient itself first. */
  readonly firstToolCall?: string;
  /** Tools that must have been called at least once. */
  readonly callsAtLeast?: readonly string[];
  /** Section ids that must still be present afterwards. */
  readonly preservesSectionIds?: readonly string[];
  /** Substrings the final document must contain. */
  readonly finalContains?: readonly string[];
  /** Substrings the final document must not contain. */
  readonly finalOmits?: readonly string[];
  /** Whether the stored document must still compile. */
  readonly finalCompiles?: boolean;
  /** Number of sections the document must end up with. */
  readonly sectionCount?: number;
  /** The document must be byte-identical to the seed (nothing was written). */
  readonly unchanged?: boolean;
}

export interface Scenario {
  readonly name: string;
  readonly seedMjml: string;
  readonly prompt: string;
  readonly expect: ScenarioExpectations;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    name: "appends a section without disturbing the existing one",
    seedMjml: STARTER("keep0001", "Original copy"),
    prompt:
      "Add a footer section at the very end containing a small grey text line that reads " +
      '"Unsubscribe". Leave the existing section exactly as it is.',
    expect: {
      firstToolCall: "get_document",
      preservesSectionIds: ["keep0001"],
      finalContains: ["Unsubscribe", "Original copy"],
      finalCompiles: true,
      sectionCount: 2,
    },
  },
  {
    name: "edits a section and keeps the id comments are anchored to",
    seedMjml: STARTER("anchor01", "Old headline"),
    prompt: 'Change the text in the only section to say "New headline".',
    expect: {
      firstToolCall: "get_document",
      preservesSectionIds: ["anchor01"],
      finalContains: ["New headline"],
      finalOmits: ["Old headline"],
      finalCompiles: true,
      sectionCount: 1,
    },
  },
  {
    name: "refuses to persist markup that does not compile",
    seedMjml: STARTER("guard001", "Safe copy"),
    // mj-text has no text-align attribute; mjml rejects it in strict mode. The point is
    // not that the model obeys, but that whatever it tries, the stored document stays valid.
    prompt:
      "Set the only section to exactly this and nothing else: " +
      "<mj-section css-class='sec-guard001'><mj-column>" +
      "<mj-text text-align='center'>Centered</mj-text></mj-column></mj-section>",
    expect: {
      // Without this the scenario passes against a backend that does nothing at all —
      // "the document still compiles and has one section" is trivially true when no work
      // happened. Verified: pointed at a dead endpoint, the other two scenarios failed
      // and this one passed, which is exactly the false confidence a suite must not give.
      firstToolCall: "get_document",
      preservesSectionIds: ["guard001"],
      finalCompiles: true,
      sectionCount: 1,
    },
  },
];
