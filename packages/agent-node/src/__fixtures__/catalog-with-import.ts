/**
 * What a real catalog looks like: labels in one place, bodies in another, and a type-only
 * import of the package's own shape. A catalog with no imports is the only kind the first
 * version of the CLI could load, and no host writes one.
 *
 * The `.js` specifier is deliberate — it is how TypeScript's NodeNext resolution wants
 * relative imports written, and therefore what the loader has to map back to `.ts`.
 */
import type { EmailTemplate } from "@mjml-agent-editor/core";

import { NEWSLETTER } from "./catalog-bodies.js";

// `EmailTemplate` rather than `TemplateEntry` because this one carries a label, and a
// label is exactly what `TemplateEntry` refuses.
export const TEMPLATES = [
  { id: "newsletter", name: "Newsletter", mjml: NEWSLETTER },
] as const satisfies readonly EmailTemplate[];
