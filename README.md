# MJML Agent Editor

An MJML email editor with an AI agent that generates an email from a description and data,
generates images, edits individual sections, and applies fixes from comments left on the
canvas.

> Migrating out of its spike shape into a monorepo. `web/` is still the original app on its
> own npm toolchain; it becomes `apps/example` in a later step.

## Layout

| Path                  | What it is                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/agent-core` | The contract: tool schemas, the system prompt, MJML document addressing, storage ports. No framework, no I/O. |
| `packages/agent-node` | Default agent implementation (TypeScript, Vercel AI SDK).                                                     |
| `agent-python`        | Second implementation (FastAPI), proving the contract is a contract.                                          |
| `apps/example`        | Supabase adapters plus a dev server exposing the agent.                                                       |
| `web/`                | The Next.js editor: GrapesJS-MJML canvas, chat panel on `useChat`, canvas comments.                           |
| `supabase/`           | Local Postgres (documents, comments) and Storage, via `npx supabase start`.                                   |

Both agent implementations read tool names, descriptions, argument schemas and the system
prompt from `packages/agent-core/contract/tools.json`, which the core package's build
emits. Tests on both sides fail if either drifts from it.

## Running (dev)

```bash
# 1. Supabase (requires Docker)
npx supabase start

# 2. Build the contract, then the agent
pnpm install
pnpm build

cp apps/example/.env.example apps/example/.env   # SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
pnpm --filter @mjml-agent-editor/example start

# 3. Frontend
cd web && cp .env.example .env.local             # point NEXT_PUBLIC_AGENT_URL at the agent
npm install && npm run dev
```

Open http://localhost:3000. To run the Python backend instead, see `agent-python/README.md`.

## Key concepts

- The source of truth is the **MJML** in `documents.mjml`; the editor and the agent work on
  the same document.
- Every `mj-section` carries a stable id in `css-class` (`sec-<id>`). Comments and the
  agent's tools address sections by it, and no operation is allowed to change one.
- A write is compiled before it is persisted. Markup that does not compile is rejected and
  the compiler's message goes back to the model, which corrects itself.
- Section comments live in the `comments` table; "Apply changes from comments" runs the
  agent, which reads the open comments, fixes the sections and resolves them.

## Documentation

- [`docs/agent-contract.md`](docs/agent-contract.md) — what a backend must implement.
