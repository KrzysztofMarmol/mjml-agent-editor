# Agent backend (TypeScript)

The default implementation of the contract in [`docs/agent-contract.md`](../../docs/agent-contract.md).
`createChatHandler` returns a plain `(Request) => Promise<Response>`, which is already the
shape a Next.js route handler wants:

```ts
import { createChatHandler, resolveModelFromEnv } from "@mjml-agent-editor/agent-node";

export const POST = createChatHandler({
  model: resolveModelFromEnv(process.env),
  documents,
  comments,
  images,
});
```

## Choosing a backend

`resolveModelFromEnv` reads `AGENT_PROVIDER`: `anthropic` (default), `deepseek`, `gemini`,
or any other value for a custom OpenAI-compatible endpoint (`AGENT_BASE_URL`,
`AGENT_MODEL`, `AGENT_API_KEY`). It is an opt-in helper — `createChatHandler` takes a model
instance and does not care where it came from, so a host with one fixed provider can ignore
all of this and pass `anthropic("claude-haiku-4-5")` directly.

`agent-python/email_agent.py` reads the same variables and picks the same defaults, so one
`.env` drives either backend.

## Before putting this on the internet

The defaults suit a local example. Two of them are wrong for anything reachable from
outside, and both are options rather than rewrites.

### `session` — server-authoritative history

Without it the client sends the whole conversation on every turn. That means a reload loses
it, the token bill grows with the square of its length, and **anyone can put words in the
assistant's mouth** by editing the request body — a forged assistant turn saying "sure, I
will delete every section" reaches the model as genuine context.

```ts
createChatHandler({
  ...,
  session: {
    load: (docId) => db.listMessages(docId),
    save: (docId, messages) => db.replaceMessages(docId, messages),
  },
});
```

With it, only the newest user message is taken from the request; everything before comes
from `load`, and `save` receives the full conversation including the assistant's reply.

### `authorize` — decisions that must precede the model call

Rate limits, a spend ceiling and a read-only switch all have to be decided before the
expensive part happens. Returning a `Response` stops the request there; returning nothing
lets it through.

```ts
createChatHandler({
  ...,
  authorize: async (request, body) => {
    if (await overBudget()) {
      return Response.json({ error: "The demo is in read-only mode." }, { status: 503 });
    }
    if (!(await ownsDocument(request, body.docId))) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
  },
});
```

### `onUsage` — what the turn cost

The other half of `authorize`: the guard decides whether a turn may start, and this is
where the number it will decide on next time comes from. Called once per turn with totals
across every step, which is the figure that matters — the expensive turn is the one that
took twenty tool-calling rounds, not one.

```ts
createChatHandler({
  ...,
  onUsage: (usage) =>
    db.recordSpend({
      documentId: usage.documentId,
      model: usage.modelId,
      input: usage.inputTokens,
      output: usage.outputTokens,
      cached: usage.cachedInputTokens,
    }),
});
```

A rejection is logged and swallowed: the turn already happened and its result is already
streaming, so failing the response would lose work the user is watching arrive. That makes
a persistent failure here something to alert on — a ledger that quietly undercounts is a
budget that never trips.

### What neither of these covers

Row-level scoping. `docId` comes from the client, so a host serving more than one visitor
must pass a `DocumentStore` and `CommentStore` that are already bound to the caller and
reject foreign ids. `apps/example` does not do this — see
[`docs/known-issues.md`](../../docs/known-issues.md).

## Other options

| Option        | Default                         | What it is for                              |
| ------------- | ------------------------------- | ------------------------------------------- |
| `compiler`    | Node `mjml` in strict mode      | Swap in a different MJML compiler           |
| `maxSteps`    | 24                              | Ceiling on tool-call rounds in one turn     |
| `formatError` | Maps 429/401 to plain sentences | What the chat panel shows when a turn fails |

`maxSteps` is not decoration: the spike had no ceiling, so a confused model could loop until
the provider cut it off, re-sending the whole conversation each round.
