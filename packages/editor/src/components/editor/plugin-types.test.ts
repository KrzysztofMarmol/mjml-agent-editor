// @vitest-environment jsdom
import { createRequire } from "node:module";
import grapesjs, { type Component, type Editor } from "grapesjs";
import grapesjsMJML from "grapesjs-mjml";
import { beforeEach, describe, expect, it } from "vitest";

import { headAttributesOf } from "./head-defaults.js";
import { createWriter } from "./inspector/write.js";
import { sourceForEditor, withClosedTags } from "./mjml-attributes.js";
import { fixPluginTypes, HEAD_CSS, socialLabel, socialLayout } from "./plugin-types.js";

const require = createRequire(import.meta.url);
const mjml = require("mjml") as (
  xml: string,
  options: { validationLevel: "strict" },
) => { errors: unknown[] };

let editor: Editor;

beforeEach(() => {
  // Headless: jsdom has no layout for the canvas frame to wait on.
  editor = grapesjs.init({
    headless: true,
    storageManager: false,
    telemetry: false,
    plugins: [grapesjsMJML],
  });
  fixPluginTypes(editor);
});

const load = (body: string) =>
  editor.setComponents(
    `<mjml><mj-body><mj-section><mj-column>${body}</mj-column></mj-section></mj-body></mjml>`,
  );

function first(tag: string): Component {
  let found: Component | undefined;
  editor.getWrapper()!.onAll((c) => {
    if (!found && c.get("type") === tag) found = c;
  });
  return found!;
}

const strictErrors = () => mjml(editor.getHtml(), { validationLevel: "strict" }).errors;

describe("fixPluginTypes", () => {
  it("draws a column in a group with the width MJML gives it there, not a section's 100%", () => {
    editor.setComponents(
      '<mjml><mj-body><mj-section><mj-group><mj-column width="25%"><mj-text>a</mj-text></mj-column><mj-column><mj-text>b</mj-text></mj-column></mj-group><mj-column><mj-text>c</mj-text></mj-column></mj-section></mj-body></mjml>',
    );
    const view = editor.Components.getType("mj-column")!.view.prototype as unknown as {
      getMjmlTemplate(this: { model: Component }): { start: string; end: string };
      getTemplateFromEl(this: { model: Component }, el: HTMLElement): HTMLElement | null;
    };
    const grouped = first("mj-group").components().at(0);
    const loose = first("mj-section").components().at(1);
    const template = view.getMjmlTemplate.call({ model: grouped });
    expect(template.start).toContain("<mj-group>");
    expect(view.getMjmlTemplate.call({ model: loose }).start).not.toContain("<mj-group>");

    // What the plugin does with the template: compile, then take the column's element.
    const html = (mjml as unknown as (x: string) => { html: string })(
      `${template.start}<mj-column width="25%"></mj-column>${template.end}`,
    ).html;
    const container = document.createElement("div");
    container.innerHTML = html
      .slice(html.indexOf("<body"))
      .replace(/^<body[^>]*>/, "")
      .replace(/<\/body>[\s\S]*$/, "")
      .trim();
    const column = view.getTemplateFromEl.call({ model: grouped }, container);
    expect(column?.getAttribute("style")).toContain("width:25%");
  });

  it("redraws a group's columns at their new width when a column moves in", () => {
    editor.setComponents(
      "<mjml><mj-body><mj-section><mj-group><mj-column><mj-text>a</mj-text></mj-column><mj-column><mj-text>b</mj-text></mj-column></mj-group><mj-column><mj-text>c</mj-text></mj-column></mj-section></mj-body></mjml>",
    );
    // Headless has no canvas, so the body's views are rendered by hand, as the canvas would.
    const ComponentsView = (
      editor.Components as unknown as {
        ComponentsView: new (o: object) => { render(): { el: HTMLElement } };
      }
    ).ComponentsView;
    document.body.appendChild(
      new ComponentsView({
        collection: first("mj-body").components(),
        config: { ...editor.Components.config, em: editor.getModel() },
        componentTypes: editor.Components.getTypes(),
      }).render().el,
    );
    const group = first("mj-group");
    const loose = first("mj-section").components().at(1);
    loose.collection.remove(loose, { temporary: true } as never);
    group.components().add(loose, { action: "move-component" } as never);

    const widths = group
      .components()
      .map(
        (c: Component) =>
          (c.getEl() as HTMLElement).getAttribute("style")?.match(/width:([^;]+)/)?.[1],
      );
    expect(widths).toEqual(["33%", "33%", "33%"]);
  });

  it("draws a px column in a group as its share of the group, not of 600px", () => {
    editor.setComponents(
      '<mjml><mj-body><mj-section><mj-group width="400px"><mj-column width="100px"><mj-text>a</mj-text></mj-column><mj-column width="300px"><mj-text>b</mj-text></mj-column></mj-group></mj-section></mj-body></mjml>',
    );
    const view = editor.Components.getType("mj-column")!.view.prototype as unknown as {
      getMjmlTemplate(this: { model: Component }): { start: string; end: string };
    };
    expect(view.getMjmlTemplate.call({ model: first("mj-column") }).start).toContain(
      '<mj-group width="400px">',
    );
  });

  it("moves a column into and within a column group, and never into a column", () => {
    const draggable = String(
      editor.Components.getType("mj-column")!.model.prototype.defaults.draggable,
    );
    const target = (type: string) => {
      const el = document.createElement("div");
      el.setAttribute("data-gjs-type", type);
      return el;
    };
    expect(target("mj-group").matches(draggable)).toBe(true);
    expect(target("mj-section").matches(draggable)).toBe(true);
    expect(target("mj-column").matches(draggable)).toBe(false);

    editor.setComponents(
      "<mjml><mj-body><mj-section><mj-group><mj-column><mj-text>a</mj-text></mj-column></mj-group><mj-column><mj-text>b</mj-text></mj-column></mj-section></mj-body></mjml>",
    );
    const loose = first("mj-section").components().at(1);
    first("mj-group").append(loose.clone());
    loose.remove();
    expect(first("mj-group").components()).toHaveLength(2);
    expect(strictErrors()).toEqual([]);
  });

  it("writes a quote inside an attribute value so the document still parses", async () => {
    load('<mj-button href="https://a.com">Go</mj-button>');
    await createWriter(editor, first("mj-button"))("title", 'Shop "summer"');
    expect(editor.getHtml()).toContain('title="Shop &quot;summer&quot;"');
    expect(strictErrors()).toEqual([]);
  });

  it("keeps quotes the document already had through a load and a save", () => {
    const button = `<mj-button href="https://a.com" font-family="&quot;Helvetica Neue&quot;, Arial">Go</mj-button>`;
    load(button);
    const saved = editor.getHtml();
    expect(saved).toContain(button);
    editor.setComponents(saved);
    expect(editor.getHtml()).toBe(saved);
  });

  it("never writes GrapesJS's marker, even in the middle of a drag", async () => {
    load("<mj-text>Hi</mj-text>");
    await createWriter(editor, first("mj-text"))("color", "#111111", { partial: true });
    expect(editor.getHtml()).toContain('<mj-text color="#111111">');
    expect(strictErrors()).toEqual([]);
  });

  it("keeps a value that equals the plugin's own default", () => {
    load('<mj-navbar><mj-navbar-link padding="25px">Home</mj-navbar-link></mj-navbar>');
    expect(editor.getHtml()).toContain('<mj-navbar-link padding="25px">');
  });

  it("keeps a column to what MJML allows in one", () => {
    load("<mj-text><p>Hi</p></mj-text><mj-button>Go</mj-button>");
    const column = first("mj-column");
    let paragraph: Component | undefined;
    first("mj-text").onAll((c) => {
      if (c.get("tagName") === "p") paragraph = c;
    });
    expect(editor.Components.canMove(column, paragraph!).result).toBe(false);
    const accepts = column.get("droppable") as (source: Component) => boolean;
    expect(accepts(first("mj-button"))).toBe(true);
  });
});

describe("withClosedTags", () => {
  it("keeps what follows a self-closed element beside it rather than inside it", () => {
    editor.setComponents(
      withClosedTags(
        '<mjml><mj-body><mj-section><mj-column><mj-image src="https://a.com/x.png" alt="a" /><mj-spacer height="8px"/><mj-text>after</mj-text></mj-column></mj-section></mj-body></mjml>',
      ),
    );
    expect(editor.getHtml()).toContain(
      '<mj-image src="https://a.com/x.png" alt="a"></mj-image><mj-spacer height="8px"></mj-spacer><mj-text>after</mj-text>',
    );
    expect(strictErrors()).toEqual([]);
  });
});

describe("mj-table", () => {
  const table =
    '<mj-table cellpadding="4"><tr style="color:#333333"><th>Item</th><td>Mug &amp; lid</td></tr></mj-table>';

  it("keeps a table's rows through a load and an edit beside it", async () => {
    editor.setComponents(
      sourceForEditor(
        `<mjml><mj-body><mj-section><mj-column>${table}<mj-text>Hi</mj-text></mj-column></mj-section></mj-body></mjml>`,
      ).mjml,
    );
    await createWriter(editor, first("mj-text"))("color", "#ff0000");
    expect(editor.getHtml()).toContain(table);
    expect(strictErrors()).toEqual([]);
  });

  const loadTable = (column: string) =>
    editor.setComponents(
      sourceForEditor(
        `<mjml><mj-body><mj-section><mj-column>${column}<mj-text>Hi</mj-text></mj-column></mj-section></mj-body></mjml>`,
      ).mjml,
    );

  it("writes a quote in a table's attribute once", async () => {
    loadTable(`<mj-table font-family='"Helvetica Neue", Arial'><tr><td>A</td></tr></mj-table>`);
    await createWriter(editor, first("mj-text"))("color", "#ff0000");
    expect(editor.getHtml()).toContain('font-family="&quot;Helvetica Neue&quot;, Arial"');
  });

  it("drops from the rows what GrapesJS drops anywhere else: scripts, handlers, script links", () => {
    loadTable(
      `<mj-table><tr><td><img src="x.png" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">A</a><a href="https://a.com">B</a></td></tr></mj-table>`,
    );
    expect(editor.getHtml()).toContain(
      '<mj-table><tr><td><img src="x.png"><a>A</a><a href="https://a.com">B</a></td></tr></mj-table>',
    );
  });

  it("drops from the rows animations, SVG and templates, which no query reaches inside", () => {
    loadTable(
      `<mj-table><tr><td>A<svg><animate attributeName="href" values="javascript:x"/></svg><template><img src=x onerror=y></template></td></tr></mj-table>`,
    );
    expect(editor.getHtml()).toContain("<mj-table><tr><td>A</td></tr></mj-table>");
  });

  it("is not confused by a table mentioned in a comment", () => {
    loadTable(
      `<mj-text><!-- <mj-table> --></mj-text><mj-table><tr><td>A</td></tr><!-- </mj-table> --><tr><td>B</td></tr></mj-table>`,
    );
    expect(editor.getHtml()).toContain(
      "<mj-table><tr><td>A</td></tr><!-- </mj-table> --><tr><td>B</td></tr></mj-table><mj-text>Hi</mj-text>",
    );
  });

  it("keeps an empty or self-closed table", () => {
    editor.setComponents(
      sourceForEditor(
        "<mjml><mj-body><mj-section><mj-column><mj-table/></mj-column></mj-section></mj-body></mjml>",
      ).mjml,
    );
    expect(editor.getHtml()).toContain("<mj-table></mj-table>");
  });
});

describe("mj-image", () => {
  it("writes an image without a picture as one, not with GrapesJS's sample", () => {
    load('<mj-image alt="Hero"></mj-image>');
    // The canvas writes the model's src into the element, so the model's is what is saved.
    expect(first("mj-image").get("src")).toBe("");
    expect(editor.getHtml()).toContain('<mj-image alt="Hero"></mj-image>');
  });
});

describe("mj-table in the canvas", () => {
  it("stays a row when its attributes change", () => {
    editor.setComponents(
      sourceForEditor(
        "<mjml><mj-body><mj-section><mj-column><mj-table><tr><td>A</td></tr></mj-table></mj-column></mj-section></mj-body></mjml>",
      ).mjml,
    );
    const table = first("mj-table");
    const View = editor.Components.getType("mj-table")!.view as unknown as new (o: object) => {
      el: HTMLElement;
      render: () => void;
    };
    const view = new View({
      model: table,
      config: {},
      em: (editor as unknown as { em: unknown }).em,
    });
    view.render();
    expect(view.el.style.display).toBe("table");
    table.addAttributes({ cellpadding: "2" });
    expect(view.el.style.display).toBe("table");
    expect(view.el.textContent).toBe("A");
  });
});

describe("social icons in the canvas", () => {
  it("lie in a row, or stacked in shared columns aligned as the group is", () => {
    expect(socialLayout(undefined, undefined).icon.display).toBe("inline-table");
    expect(socialLayout("horizontal", "left").column.display).toBe("");
    const stacked = socialLayout("vertical", undefined);
    expect(stacked.icon).toMatchObject({ display: "grid", gridTemplateColumns: "subgrid" });
    expect(stacked.column).toMatchObject({ display: "grid", justifyContent: "center" });
    expect(socialLayout("vertical", "left").column.justifyContent).toBe("start");
    expect(socialLayout("vertical", "right").column.justifyContent).toBe("end");
  });

  // What the plugin draws an icon from: the icon compiled alone, then its first table.
  const drawn = (social: string) => {
    const html = (mjml as unknown as (x: string) => { html: string })(
      `<mjml><mj-body><mj-section><mj-column>${social}</mj-column></mj-section></mj-body></mjml>`,
    ).html;
    const container = document.createElement("div");
    container.innerHTML = html.slice(html.indexOf("<body"));
    return container.querySelector<HTMLElement>("tr > td > table")!;
  };

  it("are compiled with their label", () => {
    load(
      '<mj-social><mj-social-element name="facebook">Face <b>book</b></mj-social-element></mj-social>',
    );
    const view = editor.Components.getType("mj-social-element")!.view.prototype as unknown as {
      getInnerMjmlTemplate(this: { model: Component }): { start: string; end: string };
    };
    const { start, end } = view.getInnerMjmlTemplate.call({ model: first("mj-social-element") });
    expect(`${start}${end}`).toMatch(/>Face <b>book<\/b><\/mj-social-element>$/);
  });

  it("put the label's components in its cell, in a row or stacked, linked or not", () => {
    for (const mode of ["horizontal", "vertical"]) {
      const linked = drawn(
        `<mj-social mode="${mode}"><mj-social-element name="facebook" href="https://x.test">Facebook</mj-social-element></mj-social>`,
      );
      expect(socialLabel(linked)?.textContent?.trim()).toBe("Facebook");
      const plain = drawn(
        `<mj-social mode="${mode}"><mj-social-element name="facebook" icon-position="right">Facebook</mj-social-element></mj-social>`,
      );
      expect(socialLabel(plain)?.textContent?.trim()).toBe("Facebook");
    }
    expect(
      socialLabel(drawn('<mj-social><mj-social-element name="facebook" /></mj-social>')),
    ).toBeNull();
    // A label with a picture of its own is still told apart from the icon.
    const pictured = drawn(
      '<mj-social><mj-social-element name="facebook" href="https://x.test">Go <img src="https://x.test/a.png" /></mj-social-element></mj-social>',
    );
    expect(socialLabel(pictured)?.textContent?.trim()).toBe("Go");
  });
});

describe("mj-head in the canvas", () => {
  const HEAD =
    '<mj-head><mj-attributes><mj-button border-radius="6px"></mj-button></mj-attributes><mj-preview>Fresh this week</mj-preview></mj-head>';

  it("is hidden, so a default it holds is not drawn above the email as an element", () => {
    editor.setComponents(
      `<mjml>${HEAD}<mj-body><mj-section><mj-column><mj-text>a</mj-text></mj-column></mj-section></mj-body></mjml>`,
    );
    // What the canvas draws: every component carries its type, the default inside as a button.
    const head = first("mj-head");
    const inside: string[] = [];
    head.onAll((c) => inside.push(String(c.get("type"))));
    expect(inside).toContain("mj-button");

    const style = document.createElement("style");
    style.textContent = HEAD_CSS;
    document.head.append(style);
    const el = document.createElement("mj-head");
    el.dataset.gjsType = String(head.get("type"));
    document.body.append(el);
    expect(getComputedStyle(el).display).toBe("none");
  });

  it("is still saved as it was loaded", () => {
    editor.setComponents(`<mjml>${HEAD}<mj-body></mj-body></mjml>`);
    expect(editor.getHtml()).toContain(HEAD);
  });
});

describe("mj-attributes in the canvas", () => {
  const ATTRIBUTES =
    '<mj-attributes><mj-all font-family="Georgia, serif"></mj-all><mj-button border-radius="17px"></mj-button><mj-class name="big" font-size="31px"></mj-class></mj-attributes>';

  // Headless has no canvas, so the document's views are rendered by hand, as the canvas would.
  const drawBody = (body: string, head: string) => {
    editor.setComponents(
      sourceForEditor(`<mjml><mj-head>${head}</mj-head><mj-body>${body}</mj-body></mjml>`).mjml,
    );
    const ComponentsView = (
      editor.Components as unknown as {
        ComponentsView: new (o: object) => { render(): { el: HTMLElement } };
      }
    ).ComponentsView;
    document.body.replaceChildren(
      new ComponentsView({
        collection: first("mjml").components(),
        config: { ...editor.Components.config, em: editor.getModel() },
        componentTypes: editor.Components.getTypes(),
      }).render().el,
    );
  };
  const draw = (column: string, head = ATTRIBUTES, open = "<mj-section><mj-column>") =>
    drawBody(`${open}${column}</mj-column></mj-section>`, head);
  // The element as the body draws it; the head holds defaults of the same tags.
  const element = (tag: string) => {
    let found: Component | undefined;
    first("mj-body").onAll((c) => {
      if (!found && c.get("type") === tag) found = c;
    });
    return found!.getEl() as HTMLElement;
  };
  const drawn = (tag: string, selector: string) =>
    element(tag).querySelector<HTMLElement>(selector)!;
  const style = (tag: string, selector: string) => drawn(tag, selector).getAttribute("style");
  // The drawn markup without its values: what the plugin finds an element and its children by.
  const shape = (el: Element): string => `${el.tagName}(${[...el.children].map(shape).join(",")})`;

  it("draws an element with mj-all, its tag's defaults and its mj-class", () => {
    draw('<mj-button href="https://a.com">Go</mj-button><mj-text mj-class="big">Hi</mj-text>');
    expect(style("mj-button", "td[bgcolor]")).toContain("border-radius:17px");
    expect(style("mj-button", "a")).toContain("font-family:Georgia, serif");
    expect(style("mj-text", "div")).toContain("font-size:31px");
    expect(style("mj-text", "div")).toContain("font-family:Georgia, serif");
  });

  it("lets an element's own attributes win over the defaults", () => {
    draw('<mj-button href="https://a.com" border-radius="2px" font-family="Arial">Go</mj-button>');
    expect(style("mj-button", "td[bgcolor]")).toContain("border-radius:2px");
    expect(style("mj-button", "a")).toContain("font-family:Arial");
  });

  it("never writes the defaults into the document", () => {
    const source = sourceForEditor(
      `<mjml><mj-head>${ATTRIBUTES}</mj-head><mj-body><mj-section><mj-column><mj-button href="https://a.com">Go</mj-button><mj-text mj-class="big">Hi</mj-text></mj-column></mj-section></mj-body></mjml>`,
    ).mjml;
    draw('<mj-button href="https://a.com">Go</mj-button><mj-text mj-class="big">Hi</mj-text>');
    expect(editor.getHtml()).toBe(source);
  });

  it("draws a document loaded after another with its own head", () => {
    draw('<mj-button href="https://a.com">Go</mj-button>');
    draw(
      '<mj-button href="https://a.com">Go</mj-button>',
      '<mj-attributes><mj-button border-radius="9px"></mj-button></mj-attributes>',
    );
    expect(style("mj-button", "td[bgcolor]")).toContain("border-radius:9px");
  });

  it("joins the css-classes of several mj-classes, as MJML does", () => {
    draw(
      '<mj-text mj-class="a b">Hi</mj-text>',
      '<mj-attributes><mj-class name="a" css-class="one"></mj-class><mj-class name="b" css-class="two"></mj-class></mj-attributes>',
    );
    expect(drawn("mj-text", "td").className).toBe("one two");
  });

  it("draws a column's padding, border and background from the head as from its own", () => {
    const column = 'padding="20px" border="1px solid #000000" background-color="#eeeeee"';
    draw("<mj-text>Hi</mj-text>", "<mj-title>x</mj-title>", `<mj-section><mj-column ${column}>`);
    const expected = element("mj-column").getAttribute("style");
    draw(
      "<mj-text>Hi</mj-text>",
      `<mj-attributes><mj-column ${column}></mj-column></mj-attributes>`,
    );
    expect(element("mj-column").getAttribute("style")).toBe(expected);
  });

  it("draws a column's side over its shorthand, as MJML does, whichever comes first", () => {
    draw(
      "<mj-text>Hi</mj-text>",
      "<mj-title>x</mj-title>",
      '<mj-section><mj-column padding-top="5px" padding="20px">',
    );
    // The order itself: jsdom does not let a later shorthand override a side.
    const drawn = String(element("mj-column").getAttribute("style"));
    expect(drawn.indexOf("padding:20px")).toBeLessThan(drawn.indexOf("padding-top:5px"));
  });

  it("puts a section's and a wrapper's children where full-width from the head puts them", () => {
    const column = "<mj-column><mj-text>Hi</mj-text></mj-column>";
    const cases: [string, string, string][] = [
      ["mj-section", "", ""],
      ["mj-wrapper", "<mj-section>", "</mj-section>"],
    ];
    for (const [tag, open, close] of cases) {
      drawBody(
        `<${tag} full-width="full-width">${open}${column}${close}</${tag}>`,
        "<mj-title>x</mj-title>",
      );
      const expected = shape(element(tag));
      drawBody(
        `<${tag}>${open}${column}${close}</${tag}>`,
        `<mj-attributes><${tag} full-width="full-width"></${tag}></mj-attributes>`,
      );
      expect(shape(element(tag)), tag).toBe(expected);
    }
  });

  it("compiles a grouped column in the group's and the body's width from the head", () => {
    drawBody(
      "<mj-section><mj-group><mj-column><mj-text>a</mj-text></mj-column></mj-group></mj-section>",
      '<mj-attributes><mj-group width="400px"></mj-group><mj-body width="500px"></mj-body></mj-attributes>',
    );
    const view = editor.Components.getType("mj-column")!.view.prototype as unknown as {
      getMjmlTemplate(this: { model: Component }): { start: string; end: string };
    };
    expect(view.getMjmlTemplate.call({ model: first("mj-column") }).start).toBe(
      '<mjml><mj-body width="500px"><mj-section><mj-group width="400px">',
    );
  });

  it("lets the head's default stand for an attribute left empty, as the saved document does", () => {
    draw('<mj-button href="https://a.com" border-radius="">Go</mj-button>');
    expect(style("mj-button", "td[bgcolor]")).toContain("border-radius:17px");
  });

  it("gives nothing to the root or the head, which MJML gives no attributes to", () => {
    draw(
      "<mj-text>Hi</mj-text>",
      `${ATTRIBUTES}<mj-font name="Lato" href="https://a.com/lato.css"></mj-font>`,
    );
    expect(headAttributesOf(first("mj-font"))).toEqual({});
    expect(headAttributesOf(first("mj-button"))).toEqual({});
    expect(headAttributesOf(first("mjml"))).toEqual({});
    expect(headAttributesOf(first("mj-body"))).toEqual({ "font-family": "Georgia, serif" });
  });

  it("gives a child what its ancestor's mj-class sets for its tag", () => {
    draw(
      "<mj-text>Hi</mj-text>",
      '<mj-attributes><mj-class name="dark"><mj-text color="#ffffff"></mj-text></mj-class></mj-attributes>',
      '<mj-section mj-class="dark"><mj-column>',
    );
    expect(style("mj-text", "div")).toContain("color:#ffffff");
  });

  it("draws the scaffold an element is compiled in without the defaults", () => {
    const cases: [string, string, string, string][] = [
      // Head, the column's content, the element whose markup is compared, what opens the column.
      [
        '<mj-attributes><mj-all padding="0px"></mj-all></mj-attributes>',
        '<mj-social mode="vertical"><mj-social-element name="facebook" href="https://a.com">Fb</mj-social-element></mj-social><mj-spacer height="30px"></mj-spacer>',
        "mj-social",
        "<mj-section><mj-column>",
      ],
      [
        '<mj-attributes><mj-column padding="20px" background-color="#eeeeee"></mj-column></mj-attributes>',
        "<mj-text>Hi</mj-text>",
        "mj-text",
        "<mj-section><mj-column>",
      ],
      [
        '<mj-attributes><mj-section full-width="full-width" background-color="#ff0000"></mj-section></mj-attributes>',
        "<mj-text>Hi</mj-text>",
        "mj-column",
        '<mj-section background-color="#00ff00"><mj-column>',
      ],
    ];
    for (const [head, column, tag, open] of cases) {
      draw(column, "<mj-title>x</mj-title>", open);
      const expected = shape(element(tag));
      draw(column, head, open);
      expect.soft(shape(element(tag)), head).toBe(expected);
    }
    expect(element("mj-column").className).toContain("mj-column-per-100");
  });

  it("gives social icons what their group hands down over mj-all: its mode, font and padding", () => {
    draw(
      '<mj-social font-family="Arial"><mj-social-element name="facebook" href="https://a.com">Fb</mj-social-element></mj-social>',
      '<mj-attributes><mj-all font-family="Georgia, serif"></mj-all><mj-social mode="vertical"></mj-social></mj-attributes>',
    );
    expect(element("mj-social-element").style.display).toBe("grid");
    expect(style("mj-social-element", "a[style*=font-family]")).toContain("font-family:Arial");

    draw(
      '<mj-social inner-padding="8px"><mj-social-element name="facebook">Fb</mj-social-element></mj-social>',
      '<mj-attributes><mj-all padding="0px"></mj-all></mj-attributes>',
    );
    expect(style("mj-social-element", "td")).toContain("padding:8px");
  });

  it("draws a table, which is not compiled, with the head's attributes under its own", () => {
    draw(
      '<mj-table mj-class="small" font-size="12px"><tr><td>A</td></tr></mj-table>',
      '<mj-attributes><mj-all font-family="Georgia, serif" color="#111111" line-height="10px"></mj-all><mj-table color="#222222" line-height="30px"></mj-table><mj-class name="small" font-size="11px" color="#333333"></mj-class></mj-attributes>',
    );
    const table = drawn("mj-table", "table");
    expect(table.style.fontFamily).toBe("Georgia, serif");
    expect(table.style.lineHeight).toBe("30px");
    expect(table.style.color).toBe("rgb(51, 51, 51)");
    expect(table.style.fontSize).toBe("12px");
  });
});
