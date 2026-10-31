// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_LABELS } from "../../../labels.js";
import { BoxInput, LengthInput, Row, Select, TextInput } from "./controls.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);
afterEach(() => act(() => root.render(null)));

/** What a screen reader announces as a control's name: the text its labelledby ids point to. */
const nameOf = (el: Element) =>
  (el.getAttribute("aria-labelledby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)
    .join(" ");

const row = (label: string, control: React.ReactNode) => (
  <Row label={label} own={false} labels={DEFAULT_LABELS} onReset={() => {}}>
    {control}
  </Row>
);
const noop = () => {};

describe("Row", () => {
  it("names the control inside it by its caption", () => {
    act(() =>
      root.render(
        <>
          {row("Link", <TextInput value="" onCommit={noop} />)}
          {row("Size", <LengthInput value="" units={["px"]} onCommit={noop} />)}
          {row(
            "Font",
            <Select
              value=""
              options={[{ value: "a", label: "A" }]}
              name={(o) => o.label}
              onCommit={noop}
            />,
          )}
        </>,
      ),
    );
    const [link, size] = container.querySelectorAll("input");
    expect(nameOf(link!)).toBe("Link");
    expect(nameOf(size!)).toBe("Size");
    expect(nameOf(container.querySelector("select")!)).toBe("Font");
  });

  it("names each side of a box by the row and the side", () => {
    act(() =>
      root.render(
        row(
          "Padding",
          <BoxInput
            attributes={{}}
            attr="padding"
            units={["px"]}
            labels={DEFAULT_LABELS}
            onCommit={noop}
          />,
        ),
      ),
    );
    expect([...container.querySelectorAll("input")].map(nameOf)).toEqual([
      "Padding Top and bottom",
      "Padding Left and right",
    ]);
  });
});
