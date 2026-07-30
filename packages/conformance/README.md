# Conformance suite

Drives a fixed set of scenarios against a **running** agent over HTTP and checks that the
contract's invariants hold. It talks to a backend exactly the way the frontend does, and
knows nothing about either implementation's language or internals.

```bash
pnpm test:conformance -- --url=http://localhost:8001/api/chat --label="agent-node"
pnpm test:conformance -- --url=http://localhost:8002/api/chat --label="agent-python"
```

Needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (a `.env` in this directory works) to
seed and read the documents it operates on, and the target backend needs a model key.
Exits non-zero on failure.

`pnpm test` runs the unit tests for the stream reader; those need nothing running.

## Why it asserts invariants, not transcripts

A live model is not deterministic. Asked to append a section it may reach for
`insert_section` or rewrite the document with `set_document`, and both satisfy the request.
Observed across the two backends on the same prompt:

| Scenario              | agent-node                                   | agent-python                               |
| --------------------- | -------------------------------------------- | ------------------------------------------ |
| append a section      | `get_document → insert_section`              | `get_document → insert_section`            |
| edit a section        | `get_document → set_section`                 | `get_document → set_section`               |
| reject invalid markup | `get_document → set_document → set_document` | `get_document → set_section → set_section` |

The third row is the argument: different tool, same outcome. Pinning the sequence would
have failed a correct backend. What is pinned instead is what the contract actually
promises — section ids survive, the stored document compiles, the requested change lands.

## Why parsing is structural

The two backends emit the same protocol but not the same bytes. The Python one's
`json.dumps` puts a space after every separator, adds `messageId` to the start event, and
chunks `tool-input-delta` far more finely (38 events where the TypeScript one sends 5). A
reader that pattern-matches `"type":"` returns nothing for it — which is what a first
hand-check of these streams actually did. Every line is parsed as JSON, and tool calls are
ordered by first appearance of each `toolCallId`, so the sequence is independent of which
event types a backend emits.

## Adding a scenario

Add it to `src/scenarios.ts`. One rule worth internalising: **a scenario must fail against a
backend that does nothing.** The "reject invalid markup" case originally asserted only that
the document still compiled and still had one section — trivially true when no work
happened, so it passed against a dead endpoint while the others failed. It now also asserts
that the agent called `get_document`. Point the runner at a wrong URL when adding a
scenario; every scenario should go red.
