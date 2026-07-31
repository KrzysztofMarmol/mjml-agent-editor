# Core

The shared contract. No framework, no I/O, no AI SDK — everything both agent backends have
to agree on, and nothing else.

## Why this package exists

The spike had the same logic in two inconsistent copies: a Python module that addressed MJML
sections with regexes, and a second implementation embedded in the React editor. They
disagreed about how ids were generated (`secrets.token_hex(4)` against
`Math.random().toString(36).slice(2, 10)`, which sometimes produced fewer than eight
characters), and the regex parser fell over on nested markup.

Now there is one implementation, and `contract/tools.json` — emitted by this package's
build — is what the TypeScript and Python backends both read. Tests on both sides fail if
either drifts from it.

## Document addressing

Every `mj-section` carries a stable id in its `css-class` (`sec-<id>`, eight lowercase hex
characters). Comments and the agent's tools address sections by it, and no operation is
allowed to change one.

```ts
import {
  listSections,
  getSection,
  replaceSection,
  ensureSectionIds,
} from "@mjml-agent-editor/core";

const withIds = ensureSectionIds(mjml); // adds sec-… to sections that lack one
const sections = listSections(withIds.mjml);
const updated = replaceSection(withIds.mjml, sections[0].id, "<mj-section …>…</mj-section>");
```

The scanner is quote-aware and depth-aware: an attribute containing `>` does not end a tag,
and a nested `mj-section` does not close its parent. Both were bugs in the regex version.

## Ports

Storage and I/O are interfaces the host implements — `DocumentStore`, `CommentStore`,
`ImageProvider`, `MjmlCompiler`. Nothing here opens a connection or reads a file, which is
what lets the same code run in a Next.js route handler, a test with an in-memory object, or
someone else's application entirely.

Field names are camelCase throughout. Mapping to snake_case database columns belongs in the
adapter — see `@mjml-agent-editor/store-supabase`.

## Tools and prompt

The nine tool definitions (`get_document`, `set_section`, `insert_section`, `generate_image`,
`resolve_comment`, …) and the system prompt live here as typed constants.
`contract/tools.json` is the generated artifact both backends load; it is committed, and
because the build rewrites it, the check that catches drift is `git diff` after a build
rather than a unit test.

## The starter document

`STARTER_MJML` is the MJML a brand-new email begins as. It lives here rather than in the
editor package because the code that needs it is the code that *creates* a document, and
that runs on a server — `@mjml-agent-editor/editor` ships with a `"use client"` banner, so
importing the constant from there in a route handler gives you a client reference instead
of a string. The editor still re-exports it for browser callers.

## Documentation

- [`docs/agent-contract.md`](../../docs/agent-contract.md) — what a backend must implement
- [`packages/conformance`](../conformance) — the suite that proves one does
