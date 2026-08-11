/**
 * A catalog guarded the way this project's own README tells hosts to guard one. The
 * specifier resolves only inside a bundler, so loading this at all is the thing under test.
 */
import "server-only";

import { NEWSLETTER } from "./catalog-bodies.js";

export const TEMPLATES = [{ id: "guarded", mjml: NEWSLETTER }];
