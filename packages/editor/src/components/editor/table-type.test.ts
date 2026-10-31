// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { tablePreview } from "./table-type.js";

describe("tablePreview", () => {
  it("shows the rows as text, aligned as written", () => {
    const cell = tablePreview(
      document,
      { cellpadding: "4", color: "#333333" },
      '<tr><th align="left">Item</th><th align="right">Price</th></tr><tr><td>Mug &amp; lid</td><td align="right">£12</td></tr>',
    );
    expect(cell.tagName).toBe("TD");
    const table = cell.querySelector("table")!;
    expect(table.getAttribute("cellpadding")).toBe("4");
    expect(table.style.color).toBe("rgb(51, 51, 51)");
    expect(table.querySelector("tbody")!.innerHTML).toBe(
      '<tr><th align="left">Item</th><th align="right">Price</th></tr><tr><td>Mug &amp; lid</td><td align="right">£12</td></tr>',
    );
  });

  it("runs and loads nothing a cell holds", () => {
    const cell = tablePreview(
      document,
      { cellpadding: '1" onclick="x' },
      '<tr><td><img src="x" onerror="alert(1)"><script>alert(2)</script>Hi</td></tr>',
    );
    expect(cell.querySelector("img, script")).toBeNull();
    expect(cell.innerHTML).not.toMatch(/onerror|onclick/);
    expect(cell.querySelector("td")!.textContent).toBe("alert(2)Hi");
  });
});
