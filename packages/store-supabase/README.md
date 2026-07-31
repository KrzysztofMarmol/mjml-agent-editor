# Supabase adapter

One implementation of the `@mjml-agent-editor/core` ports. Optional: the editor and the
agent talk to interfaces, so anything satisfying them works — including a plain object in a
test.

```ts
import {
  createSupabaseClient,
  createDocumentStore,
  createCommentStore,
  createPlaceholderImageProvider,
} from "@mjml-agent-editor/store-supabase";

const supabase = createSupabaseClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const documents = createDocumentStore(supabase);
const comments = createCommentStore(supabase);
const images = createPlaceholderImageProvider();
```

## Where the naming mismatch is handled

The ports are camelCase (`sectionId`, `objectId`, `projectData`); Postgres columns are
snake_case. That mapping lives in this package and nowhere else — swapping Supabase for
plain Postgres means replacing one file, not touching the editor or the agent.

## Images

`createPlaceholderImageProvider` never calls a paid API. It is the default on purpose:
image generation is the most expensive call in the system, and the spike inferred the mode
from a _missing_ `OPENAI_API_KEY`, so a correctly configured deployment silently started
paying for it.

## Schema

Two tables, `documents` and `comments`. The migrations in
[`supabase/migrations`](../../supabase/migrations) create them.

**They also grant the `anon` role full access**, which is right for a local example and
unacceptable on a public URL — see [`docs/known-issues.md`](../../docs/known-issues.md).
This package expects a service-role key and is meant to be called from a server, never from
a browser.
