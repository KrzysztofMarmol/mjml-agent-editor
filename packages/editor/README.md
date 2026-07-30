# Editor package

The React MJML editor: GrapesJS canvas, agent chat panel, and comments pinned to elements
on the canvas.

> Being extracted. This currently holds the data-access boundary and shared constants; the
> components still live in `apps/example` and move here next. Splitting it that way keeps
> each step verifiable — the inversion is a behaviour change, the move is mechanical.

## Data access

Nothing here talks to a database. The host passes a `DocumentStore` and a `CommentStore`
(the same shapes the agent uses, from `@mjml-agent-editor/core`) and the components read
them through context:

```tsx
import { EditorStoreProvider } from "@mjml-agent-editor/editor";

<EditorStoreProvider stores={{ documents, comments }}>
  <EditorWorkspace docId={id} />
</EditorStoreProvider>;
```

In the spike every component imported `@/lib/documents`, which imported a Supabase client.
Adopting the editor meant adopting Supabase, and no component could be rendered without a
database behind it. `apps/example/lib/stores.ts` shows the Supabase wiring; anything
satisfying the two interfaces works, including an in-memory object.

Forgetting the provider throws with an explanation rather than failing on a null read.

## A note on field names

The ports are camelCase (`sectionId`, `objectId`, `projectData`); Postgres columns are
snake_case. The mapping belongs in the adapter — see
`packages/store-supabase/src/index.ts` — and never leaks into the components.
