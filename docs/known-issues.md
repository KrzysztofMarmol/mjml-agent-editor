# Known issues

Things that work but are not defensible on their own merits. They are listed here rather
than quietly left in the code, because someone adopting this should know where the soft spots
are before they hit one.

None of these are scheduled. If one bites you, the entry says what a real fix looks like.

## Comment pins are repositioned on a timer

`packages/editor/src/components/comments/CanvasComments.tsx:130`

Pins are absolutely positioned over the canvas iframe, and their coordinates are recomputed
every 500 ms by `setInterval`. The canvas has no event that reliably fires for every reason a
pin might move — component resize, image load, font swap, iframe reflow after a style change —
so polling covers all of them at once.

The cost is a repaint-adjacent computation running forever, and up to 500 ms of visible drift
after a layout change.

A real fix is a `ResizeObserver` on the iframe body plus a `MutationObserver` on the subtree,
with the interval kept only as a slow fallback (a few seconds) rather than the primary
mechanism.

## Two magic timeouts guard the autosave loop

`packages/editor/src/components/editor/EmailEditor.tsx:400` (1200 ms debounce) and `:417`
(400 ms `loadingRef` window)

Loading a document into GrapesJS emits the same change events as a user edit. Without a guard,
opening a document immediately saves it back — which would be harmless if the round trip were
lossless, and it is not: GrapesJS re-serialises the MJML. The guard is a boolean held for
400 ms after load, on the assumption that GrapesJS has stopped emitting by then.

That assumption is a timing bet, not an invariant. A slow machine, or a document large enough
that parsing crosses the window, can let a load-triggered save through.

A real fix is to key saves on a content hash — compare against the last known-persisted MJML
and skip the write when they match — which removes the need to guess how long the editor
settles for.

## The rich-text editor is monkey-patched

`packages/editor/src/components/editor/EmailEditor.tsx:186`

Custom RTE actions are installed by mutating GrapesJS's RTE instance, with a
`__customActions` flag on it to keep the installation idempotent across re-renders and
document switches. It reaches into an object the library does not document as extensible.

It works, and the idempotency flag is the reason it survives a re-render. But a GrapesJS
upgrade can change the RTE internals without it being a breaking change on paper.

A real fix is a custom RTE implementation registered through the documented
`richTextEditor` config, which is a larger piece of work than the feature it currently backs.

## The demo application has no authorization

`supabase/migrations/`

`apps/example` is a template. Its migration grants the `anon` role full access to `documents`
and `comments`, and the browser holds the anon key — any visitor can read and delete anything.
That is fine for a local example and unacceptable on a public URL.

If you deploy this, the data layer is yours to write: move database access behind server
routes, scope rows to a session or a user, and do not ship the anon-role grant.
