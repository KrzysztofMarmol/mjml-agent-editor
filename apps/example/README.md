# Example wiring

Reference implementation of the ports from `@mjml-agent-editor/core`, plus a dev server
that exposes the TypeScript agent on the endpoint the existing frontend already calls.

This is an intermediate shape. `web/` has not been folded into the monorepo yet, so the
agent runs as a standalone process and the frontend reaches it cross-origin. Once `web/`
becomes this app, `createChatHandler` moves into a Next.js route handler, and both the
standalone server and its CORS handling disappear — the handler is already a plain
`(Request) => Promise<Response>` for that reason.

## What is here

| File                       | Purpose                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `src/supabase-adapters.ts` | `DocumentStore`, `CommentStore` and a placeholder `ImageProvider` |
| `src/server.ts`            | Node HTTP server exposing `POST /api/chat` and `GET /api/health`  |

Image generation is a **placeholder** provider by default. The spike inferred placeholder
mode from the _absence_ of `OPENAI_API_KEY`, so a misconfigured deployment silently
started paying for the most expensive call in the system. Choosing a real provider is now
an explicit act.

## Running it

```bash
npx supabase start                 # from the repo root
cp apps/example/.env.example apps/example/.env
# fill in SUPABASE_SERVICE_ROLE_KEY (npx supabase status) and ANTHROPIC_API_KEY

pnpm --filter @mjml-agent-editor/core build
pnpm --filter @mjml-agent-editor/agent-node build
pnpm --filter @mjml-agent-editor/example start
```

Then point the frontend at it and start it:

```bash
# web/.env.local
NEXT_PUBLIC_AGENT_URL=http://localhost:8001
```

```bash
cd web && npm install && npm run dev
```

If the frontend does not land on port 3000, update `ALLOWED_ORIGIN` to match — the
browser's preflight is checked against it exactly.
