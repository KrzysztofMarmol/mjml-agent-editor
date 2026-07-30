# MJML Agent Editor

An MJML email editor with an AI agent that generates an email from a description and data,
generates images, edits individual sections, and applies fixes from comments left on the
canvas.

## Layout

| Path                      | What it is                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/agent-core`     | The contract: tool schemas, the system prompt, MJML document addressing, storage ports. No framework, no I/O. |
| `packages/agent-node`     | Default agent implementation (TypeScript, Vercel AI SDK).                                                     |
| `packages/editor`         | The React editor: GrapesJS-MJML canvas, chat panel on `useChat`, canvas comments.                             |
| `packages/store-supabase` | Supabase adapter for the `DocumentStore` / `CommentStore` ports.                                              |
| `packages/conformance`    | The suite any agent backend must pass, runnable against a URL.                                                |
| `agent-python`            | Second implementation (FastAPI), proving the contract is a contract.                                          |
| `apps/example`            | The complete application, and the thing to clone if you want a working editor.                                |
| `supabase/`               | Local Postgres (documents, comments) and Storage, via `npx supabase start`.                                   |

Both agent implementations read tool names, descriptions, argument schemas and the system
prompt from `packages/agent-core/contract/tools.json`, which the core package's build
emits. Tests on both sides fail if either drifts from it.

## Running (dev)

```bash
# 1. Supabase (requires Docker)
npx supabase start

# 2. Build the packages the app consumes
pnpm install
pnpm build

# 3. Configure and run
cp apps/example/.env.example apps/example/.env.local   # Supabase keys + ANTHROPIC_API_KEY
pnpm --filter @mjml-agent-editor/example dev
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

## Using it in your own project

Clone `apps/example` if you want a working application. Install `@mjml-agent-editor/editor`
and `@mjml-agent-editor/agent-node` if you want the editor inside something you already have;
neither package talks to a database — the host injects a `DocumentStore` and a `CommentStore`,
and every colour is a CSS custom property. See
[`packages/editor/README.md`](packages/editor/README.md).

## Documentation

- [`docs/agent-contract.md`](docs/agent-contract.md) — what a backend must implement.
- [`packages/conformance/README.md`](packages/conformance/README.md) — the suite both backends pass.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to run the checks CI runs, and why the generated
  contract artifact needs a `git diff` rather than a test.
- [`docs/known-issues.md`](docs/known-issues.md) — the soft spots, including why
  `apps/example` must not be deployed as-is.

## License

MIT — see [`LICENSE`](LICENSE).
