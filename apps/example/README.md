# Example application

The reference wiring: the MJML editor, the agent as a route handler, and Supabase adapters
behind the `agent-core` ports.

## Running

```bash
npx supabase start                      # from the repo root, needs Docker
pnpm install && pnpm build              # builds the packages this app consumes

cp apps/example/.env.example apps/example/.env.local
# fill in SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY (npx supabase status)
# and ANTHROPIC_API_KEY

pnpm --filter @mjml-agent-editor/example dev
```

## Notable wiring

**The agent is same-origin.** `app/api/chat/route.ts` is four lines because
`createChatHandler` already returns `(Request) => Promise<Response>`. It previously ran as a
separate process on its own port, which meant CORS configuration, a second deployment
target, and — on Vercel — a 120 s ceiling on proxied requests that a long agent turn can
exceed. None of that applies now.

**`mjml` is in `serverExternalPackages`.** It resolves and reads its own files at import
time, and once a bundler rewrites those paths it throws `EBADF: bad file descriptor` while
Next collects page data — a build failure whose stack never mentions mjml. See
`next.config.ts`.

**The service-role key never reaches the browser.** Only the route handler reads it. The
browser gets the anon key through `NEXT_PUBLIC_*`, which is also why the current schema's
`grant all to anon` is a real hole rather than a theoretical one: closing it is Phase 4.

**Images are placeholders by default.** The spike inferred that mode from a missing
`OPENAI_API_KEY`, so a misconfigured deployment silently began paying for the most expensive
call in the system. Pass a different `ImageProvider` to generate real ones.
