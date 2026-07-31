/**
 * The document a brand-new email starts from.
 *
 * Kept in a package so the editor has something valid to render when a document row exists
 * but its MJML is empty, and overridable because the copy is host-specific — it is the
 * first thing a user of the template will want to change.
 *
 * It lives here rather than in `editor` because the code that needs it most is the code
 * that creates a document, and that runs on a server. The editor package is bundled with a
 * `"use client"` banner, so importing this from a route handler yielded a client reference
 * instead of a string: the row was written with the text of a thrown error in it and the
 * canvas rendered that. A constant with no UI in it has no business behind that boundary.
 */
export const STARTER_MJML = `<mjml>
  <mj-body background-color="#f4f4f5">
    <mj-section background-color="#ffffff" padding="32px 24px">
      <mj-column>
        <mj-text font-size="22px" font-weight="bold">New email</mj-text>
        <mj-text color="#555555">
          Describe the email you need in the chat on the right — the agent
          will design the sections, content and images.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
