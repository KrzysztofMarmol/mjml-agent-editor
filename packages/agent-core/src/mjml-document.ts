/**
 * Operations on an MJML document addressed by stable section ids.
 *
 * Ported from the spike's `agent/mjml_doc.py`, which parsed with plain regexes and
 * documented itself as "sufficient for the purposes of this spike". Two of those
 * shortcuts bite on real model output, so the scanner below replaces them:
 *
 *  - Tag boundaries were found with `[^>]*>`, which ends the tag at the first `>`
 *    even when that `>` sits inside an attribute value (`alt="a > b"`).
 *  - The closing tag was found with a plain `find("</mj-section>")`, i.e. the first
 *    close wins regardless of nesting. Valid MJML never nests `mj-section`, but
 *    malformed model output does, and the naive scan then silently produces
 *    overlapping spans and corrupts the document on write.
 */

import {
  SECTION_PREFIX,
  ensureIdInClassList,
  newSectionId,
  readIdFromClassList,
  setIdInClassList,
} from "./ids.js";

const SECTION_TAG = "mj-section";
const OPEN_PREFIX = `<${SECTION_TAG}`;
const CLOSE_PREFIX = `</${SECTION_TAG}`;
const BODY_CLOSE = "</mj-body>";

/** Raised for malformed input the caller is expected to surface to the model. */
export class MjmlDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MjmlDocumentError";
  }
}

/** One `mj-section` element located in the source. */
export interface SectionSpan {
  /** Value of the `sec-<id>` class, or null when the section carries none. */
  readonly id: string | null;
  /** Index of the `<` opening the element. */
  readonly start: number;
  /** Index just past the `>` closing the element. */
  readonly end: number;
  /** Index just past the `>` of the opening tag. */
  readonly openTagEnd: number;
}

export interface SectionSummary {
  readonly sectionId: string | null;
  readonly preview: string;
}

export interface InsertSectionResult {
  readonly mjml: string;
  readonly sectionId: string;
}

const PREVIEW_LENGTH = 120;

/**
 * Index just past the `>` that closes the tag starting at `from`, honouring
 * quoted attribute values. Returns -1 when the tag is never closed.
 */
function tagEnd(source: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < source.length; i++) {
    const char = source[i]!;
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return i + 1;
  }
  return -1;
}

/** True when `<mj-section` at `index` is a real tag rather than a longer name. */
function isTagBoundary(lower: string, index: number, prefixLength: number): boolean {
  const next = lower[index + prefixLength];
  return next === undefined || next === ">" || next === "/" || /\s/.test(next);
}

function indexOfTag(lower: string, prefix: string, from: number): number {
  let cursor = from;
  for (;;) {
    const index = lower.indexOf(prefix, cursor);
    if (index === -1) return -1;
    if (isTagBoundary(lower, index, prefix.length)) return index;
    cursor = index + 1;
  }
}

function isSelfClosing(source: string, openStart: number, openEnd: number): boolean {
  return source.slice(openStart, openEnd).trimEnd().endsWith("/>");
}

/**
 * Locates every top-level `mj-section`. Nested sections are folded into their
 * parent's span rather than reported separately, so callers can never produce
 * overlapping edits.
 */
export function scanSections(mjml: string): SectionSpan[] {
  const lower = mjml.toLowerCase();
  const spans: SectionSpan[] = [];
  let cursor = 0;

  while (cursor < mjml.length) {
    const start = indexOfTag(lower, OPEN_PREFIX, cursor);
    if (start === -1) break;

    const openTagEnd = tagEnd(mjml, start);
    if (openTagEnd === -1) break;

    if (isSelfClosing(mjml, start, openTagEnd)) {
      spans.push({
        id: readIdFromClassList(cssClassOf(mjml.slice(start, openTagEnd)), SECTION_PREFIX),
        start,
        end: openTagEnd,
        openTagEnd,
      });
      cursor = openTagEnd;
      continue;
    }

    const end = findMatchingClose(mjml, lower, openTagEnd);
    if (end === -1) break;

    spans.push({
      id: readIdFromClassList(cssClassOf(mjml.slice(start, openTagEnd)), SECTION_PREFIX),
      start,
      end,
      openTagEnd,
    });
    cursor = end;
  }

  return spans;
}

/** Index just past the `</mj-section>` matching an open tag that ended at `from`. */
function findMatchingClose(mjml: string, lower: string, from: number): number {
  let depth = 1;
  let cursor = from;

  while (depth > 0) {
    const nextOpen = indexOfTag(lower, OPEN_PREFIX, cursor);
    const nextClose = indexOfTag(lower, CLOSE_PREFIX, cursor);
    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      const openEnd = tagEnd(mjml, nextOpen);
      if (openEnd === -1) return -1;
      if (!isSelfClosing(mjml, nextOpen, openEnd)) depth++;
      cursor = openEnd;
      continue;
    }

    const closeEnd = tagEnd(mjml, nextClose);
    if (closeEnd === -1) return -1;
    depth--;
    cursor = closeEnd;
    if (depth === 0) return closeEnd;
  }

  return -1;
}

const CSS_CLASS_ATTR = /css-class\s*=\s*(["'])([\s\S]*?)\1/i;

function cssClassOf(openTag: string): string | null {
  return CSS_CLASS_ATTR.exec(openTag)?.[2] ?? null;
}

/** Rewrites an opening tag so its `css-class` carries exactly `sec-<id>`. */
function openTagWithSectionId(openTag: string, id: string): string {
  const match = CSS_CLASS_ATTR.exec(openTag);
  if (match) {
    const updated = setIdInClassList(match[2]!, SECTION_PREFIX, id);
    return (
      openTag.slice(0, match.index) +
      `css-class="${updated}"` +
      openTag.slice(match.index + match[0].length)
    );
  }
  return (
    openTag.slice(0, OPEN_PREFIX.length) +
    ` css-class="${SECTION_PREFIX}-${id}"` +
    openTag.slice(OPEN_PREFIX.length)
  );
}

/** Strips tags, honouring quoted attribute values, and collapses whitespace. */
function toPlainText(fragment: string): string {
  let out = "";
  let cursor = 0;
  for (;;) {
    const open = fragment.indexOf("<", cursor);
    if (open === -1) {
      out += fragment.slice(cursor);
      break;
    }
    out += fragment.slice(cursor, open);
    const close = tagEnd(fragment, open);
    if (close === -1) break;
    out += " ";
    cursor = close;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Appends `sec-<id>` to every section that lacks one. */
export function ensureSectionIds(mjml: string, generate: () => string = newSectionId): string {
  const spans = scanSections(mjml);
  let out = "";
  let cursor = 0;

  for (const span of spans) {
    if (span.id !== null) continue;
    const openTag = mjml.slice(span.start, span.openTagEnd);
    const { id } = ensureIdInClassList(cssClassOf(openTag), SECTION_PREFIX, generate);
    out += mjml.slice(cursor, span.start) + openTagWithSectionId(openTag, id);
    cursor = span.openTagEnd;
  }

  return out + mjml.slice(cursor);
}

/** Section ids plus a short text excerpt, for orienting the model. */
export function listSections(mjml: string): SectionSummary[] {
  return scanSections(mjml).map((span) => ({
    sectionId: span.id,
    preview: toPlainText(mjml.slice(span.start, span.end)).slice(0, PREVIEW_LENGTH),
  }));
}

export function getSection(mjml: string, sectionId: string): string | null {
  const span = scanSections(mjml).find((candidate) => candidate.id === sectionId);
  return span ? mjml.slice(span.start, span.end) : null;
}

/**
 * Verifies the fragment is exactly one section and nothing else. The spike only
 * checked `startswith("<mj-section")`, which let two concatenated sections through
 * `set_section` — those then shared one id and the next edit hit the wrong one.
 */
function assertSingleSection(fragment: string): string {
  const trimmed = fragment.trim();
  const spans = scanSections(trimmed);
  const only = spans[0];
  if (spans.length !== 1 || !only || only.start !== 0 || only.end !== trimmed.length) {
    throw new MjmlDocumentError(
      `expected exactly one <${SECTION_TAG}>...</${SECTION_TAG}> element`,
    );
  }
  return trimmed;
}

/**
 * Replaces a section, forcing the replacement to keep the target id even when the
 * model supplied a different one (or none). Returns null when the id is unknown.
 */
export function replaceSection(mjml: string, sectionId: string, newSection: string): string | null {
  const replacement = assertSingleSection(newSection);
  const span = scanSections(mjml).find((candidate) => candidate.id === sectionId);
  if (!span) return null;

  const openEnd = tagEnd(replacement, 0);
  if (openEnd === -1) throw new MjmlDocumentError("replacement section has no closing `>`");

  const withId =
    openTagWithSectionId(replacement.slice(0, openEnd), sectionId) + replacement.slice(openEnd);

  return mjml.slice(0, span.start) + withId + mjml.slice(span.end);
}

/**
 * Inserts a section after `afterSectionId`, or at the end of `mj-body` when that id
 * is absent or unknown. Keeps an id the model already supplied, otherwise assigns one.
 */
export function insertSection(
  mjml: string,
  newSection: string,
  afterSectionId?: string | null,
  generate: () => string = newSectionId,
): InsertSectionResult {
  const section = assertSingleSection(newSection);
  const openEnd = tagEnd(section, 0);
  if (openEnd === -1) throw new MjmlDocumentError("new section has no closing `>`");

  const existingId = readIdFromClassList(cssClassOf(section.slice(0, openEnd)), SECTION_PREFIX);
  const sectionId = existingId ?? generate();
  const withId =
    existingId !== null
      ? section
      : openTagWithSectionId(section.slice(0, openEnd), sectionId) + section.slice(openEnd);

  if (afterSectionId) {
    const anchor = scanSections(mjml).find((candidate) => candidate.id === afterSectionId);
    if (anchor) {
      return {
        mjml: mjml.slice(0, anchor.end) + "\n" + withId + mjml.slice(anchor.end),
        sectionId,
      };
    }
  }

  const bodyClose = mjml.toLowerCase().lastIndexOf(BODY_CLOSE);
  if (bodyClose === -1) throw new MjmlDocumentError(`document contains no ${BODY_CLOSE}`);

  return {
    mjml: mjml.slice(0, bodyClose) + withId + "\n" + mjml.slice(bodyClose),
    sectionId,
  };
}

export function removeSection(mjml: string, sectionId: string): string | null {
  const span = scanSections(mjml).find((candidate) => candidate.id === sectionId);
  return span ? mjml.slice(0, span.start) + mjml.slice(span.end) : null;
}
