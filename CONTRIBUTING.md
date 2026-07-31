# Contributing

## Getting set up

```bash
pnpm install
pnpm build          # packages/agent-core emits contract/tools.json here — other packages need it
npx supabase start  # Docker; only needed to run apps/example
```

For the Python backend, `cd agent-python && uv sync`.

## Before opening a pull request

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
git diff --exit-code           # `pnpm build` must not leave the tree dirty — see below

cd agent-python && uv run ruff check . && uv run pytest
```

CI runs exactly these. There is no separate list to remember.

## The contract is generated, and that has a consequence

`packages/agent-core/contract/tools.json` is written by `packages/agent-core/scripts/emit-tools-json.mjs`
during that package's build, **and it is committed**. Both backends read it: the TypeScript
side imports it in tests, and `agent-python/contract.py` loads it at import time and raises if
a signature drifts.

Because the build regenerates the file, running the tests after a build can never catch drift
on its own — the test would be comparing the artifact against itself. The check that actually
works is `git diff --exit-code` after `pnpm build`. If you changed a tool schema, commit the
regenerated `tools.json` in the same commit as the change.

## Conformance

`packages/conformance` is the suite any agent backend must pass. It runs against a URL, not
against an import, so it works equally on the TypeScript handler and the Python container:

```bash
pnpm test:conformance --url=http://localhost:3000/api/chat
pnpm test:conformance --url=http://localhost:8000/api/chat
```

It needs a real model and therefore an `ANTHROPIC_API_KEY`, which is why it is not part of
`pnpm test` and does not run on pull requests from forks. Run it locally when you touch tool
definitions, the system prompt, or either backend's request handling.

Scenarios assert invariants rather than exact output — a model will not produce the same MJML
twice. If you add one, make sure it fails against a backend that does nothing: a scenario
whose only assertion is "the document still compiles" passes against a dead endpoint, which is
worse than no scenario at all.

## Adding to the editor package

`packages/editor` has three entry points and the split is load-bearing: `./canvas` is browser
only, because GrapesJS touches `window` at import time. Putting `EmailEditor` behind the main
barrel breaks any host that imports a component from a server file. See
`packages/editor/README.md`.

Nothing in the package may import a database client. Data access goes through the
`DocumentStore` / `CommentStore` ports from `@mjml-agent-editor/core`, which the host injects.

Colours go in `src/components/editor/editor-theme.css` as CSS custom properties on `:root`.
A literal hex outside that block is a bug — it is not overridable, and "bring your own theme"
stops being true.

## Style

Prettier and ESLint are configured; `pnpm format` fixes formatting. Everything in the
repository — code, comments, documentation, commit messages — is written in English.

Comments should explain why something is the way it is, particularly where the code looks
odd for a reason (a workaround for an upstream bug, an ordering constraint, a deliberate
non-obvious choice). Restating what the next line does is noise.
