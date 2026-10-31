/**
 * Whether the canvas holds a change the store does not have.
 *
 * Opening an email is not one. GrapesJS writes a document back in its own form — tags closed,
 * an mj-table's rows flattened into text — and reports changes of its own after a load, as an
 * image settles. Compared with the store alone, that rewrote emails nobody had touched.
 */
export function createSaveBaseline() {
  let stored = "";
  let loaded: string | null = null;
  return {
    /** The MJML the store holds, as far as this editor knows. */
    get stored() {
      return stored;
    },
    /** `canvas` is what the load serialises to, or null when it repaired something to write. */
    load(mjml: string, canvas: string | null) {
      stored = mjml;
      loaded = canvas;
    },
    saved(mjml: string) {
      stored = mjml;
      loaded = null;
    },
    changed(mjml: string) {
      return mjml !== stored && mjml !== loaded;
    },
  };
}
