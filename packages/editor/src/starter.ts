/**
 * The document a brand-new email starts from.
 *
 * Kept in the package so the editor has something valid to render when a document row
 * exists but its MJML is empty, and overridable because the copy is host-specific — it is
 * the first thing a user of the template will want to change.
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
