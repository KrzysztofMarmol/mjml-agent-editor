# Editor package

The React MJML editor: GrapesJS canvas, agent chat panel, and comments pinned to elements
on the canvas.

## Entry points

| Import                                 | Contains                                                     | Notes                                                  |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `@mjml-agent-editor/editor`            | stores, `EditorHeader`, `ChatPanel`, `CanvasComments`, types | Safe to import anywhere                                |
| `@mjml-agent-editor/editor/ui`         | the shadcn primitives and `cn`                               | Light; no canvas                                       |
| `@mjml-agent-editor/editor/canvas`     | `EmailEditor`                                                | **Browser only** — GrapesJS touches `window` at import |
| `@mjml-agent-editor/editor/styles.css` | editor chrome stylesheet                                     | Import from your Tailwind entry                        |

The split is not cosmetic. With a single barrel, a layout file importing a tooltip provider
pulls `EmailEditor` — and therefore GrapesJS — into the server bundle, and the Next.js build
dies with `window is not defined` while prerendering an unrelated page. Load the canvas
through a client-only dynamic import:

```tsx
const EmailEditor = dynamic(
  () => import("@mjml-agent-editor/editor/canvas").then((m) => m.EmailEditor),
  { ssr: false },
);
```

## Theming

Every colour is a CSS custom property. Restyle the editor by redefining tokens; do not fork
the stylesheet:

```css
:root {
  --mjml-editor-panel: #14261f;
  --mjml-editor-accent: #f59e0b;
}
```

That covers the GrapesJS chrome _and_ the React components around it — the header, chat
panel and comment pins are classed against Tailwind names (`bg-panel`, `text-brand`) that
`styles.css` defines as aliases of the same tokens. Verified by overriding eleven tokens in
a running editor: the whole surface repainted, no component touched.

The full token list, with what each one is for, is the `:root` block at the top of
`src/components/editor/editor-theme.css`.

The canvas iframe is the one place this cannot reach — it has its own document, so the
agent's edit-pulse rules are injected by script. That injection reads
`--mjml-editor-accent` from the host document rather than carrying its own colour.

## Stylesheet wiring

The components are Tailwind-classed, and Tailwind only emits classes it can see. Point it at
the package from your CSS entry, or the editor renders unstyled with nothing in the build
warning about it:

```css
@import "grapesjs/dist/css/grapes.min.css";
@import "@mjml-agent-editor/editor/styles.css";
@source "../../node_modules/@mjml-agent-editor/editor/dist";
```

## Routing

The package has no router dependency. `EditorHeader` takes a `homeLink` node, so a Next.js
host passes `<Link href="/">` and anything else passes an anchor.

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

## Copy

Every word the editor renders comes from a dictionary with English defaults, so a host
building in another language overrides rather than forks:

```tsx
<EditorStoreProvider
  stores={stores}
  labels={{
    appName: "Edytor MJML",
    send: "Wyślij",
    agentWorking: "Agent pracuje…",
    toolLabels: { set_section: "Podmieniam sekcję" },
  }}
>
```

Overrides are shallow-merged, so anything omitted stays English. `toolLabels` is the one
exception and merges key by key — renaming one step would otherwise silently drop the other
eight. `DEFAULT_LABELS` and the `EditorLabels` type are exported if you want to see the full
list or build a complete translation.

Values that interpolate are functions rather than format strings — `copied(kind)`,
`completedSteps(count, failed)` — so word order belongs to the translator.

## Reaching the agent

`ChatPanel` posts to `/api/chat` on the same origin by default, which is what
`createChatHandler` from `@mjml-agent-editor/agent-node` mounts. Pass a `transport` to send
turns somewhere else — a different path, another service, or nowhere at all:

```tsx
import { DefaultChatTransport } from "ai";

const transport = useMemo(
  () => new DefaultChatTransport({ api: "https://agent.example.com/chat", body: { docId } }),
  [docId],
);

<ChatPanel docId={docId} transport={transport} {...handlers} />;
```

Any `ChatTransport<UIMessage>` works, so a transport that emits a recorded stream of
`UIMessageChunk`s drives the whole panel — streaming text, tool markers, section highlights
— without a single request. That is how the demo's scripted showcase runs with no agent
behind it.

Memoize it. A transport holding state restarts if it is rebuilt on every render.

## A note on field names

The ports are camelCase (`sectionId`, `objectId`, `projectData`); Postgres columns are
snake_case. The mapping belongs in the adapter — see
`packages/store-supabase/src/index.ts` — and never leaks into the components.
