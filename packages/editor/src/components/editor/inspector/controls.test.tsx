// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LABELS } from "../../../labels.js";
import { TooltipProvider } from "../../ui/tooltip.js";
import { BoxInput, LengthInput, Row, Select, TextInput } from "./controls.js";
import type { Unit } from "./types.js";

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
          {row(
            "Size",
            <LengthInput value="" units={["px"]} labels={DEFAULT_LABELS} onCommit={noop} />,
          )}
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

  it("keeps the help out of the panel, behind a button, and describes the control with it", () => {
    act(() =>
      root.render(
        <TooltipProvider>
          <Row
            label="Space around"
            help="Empty space outside the button."
            own={false}
            labels={DEFAULT_LABELS}
            onReset={() => {}}
          >
            <TextInput value="" onCommit={noop} />
          </Row>
        </TooltipProvider>,
      ),
    );
    const input = container.querySelector("input")!;
    const description = document.getElementById(input.getAttribute("aria-describedby")!)!;
    expect(description.textContent).toBe("Empty space outside the button.");
    expect(description.hidden).toBe(true);
    expect(
      container.querySelector('button[aria-label="Empty space outside the button."]'),
    ).not.toBeNull();
  });
});

describe("LengthInput", () => {
  type Call = [string, boolean | undefined];
  function mount(props: { value: string; placeholder?: string; units?: Unit[] }) {
    const calls: Call[] = [];
    const render = (value: string) =>
      act(() =>
        root.render(
          <LengthInput
            value={value}
            placeholder={props.placeholder}
            units={props.units ?? ["px"]}
            labels={DEFAULT_LABELS}
            onCommit={(next, partial) => {
              calls.push([next, partial]);
            }}
          />,
        ),
      );
    render(props.value);
    const input = container.querySelector("input")!;
    return { calls, input, render };
  }
  const type = (input: HTMLInputElement, text: string) =>
    act(() => {
      // Enter commits by blurring, and only a focused field blurs.
      input.focus();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const key = (input: HTMLInputElement, k: string, shiftKey = false) =>
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true }));
    });
  const pointer = (el: Element, kind: string, shiftKey = false) =>
    act(() => {
      el.dispatchEvent(new MouseEvent(kind, { bubbles: true, button: 0, shiftKey }));
    });
  const button = (name: string) => container.querySelector(`button[aria-label^="${name}"]`)!;

  it("shows the number with its unit beside it, and the default the same way", () => {
    const { input } = mount({ value: "20px" });
    expect(input.value).toBe("20");
    expect(container.textContent).toContain("px");
    const empty = mount({ value: "", placeholder: "10px" });
    expect(empty.input.placeholder).toBe("10");
  });

  it("writes a typed number in the field's unit", () => {
    const { input, calls } = mount({ value: "20px", units: ["", "px", "%"] });
    type(input, "15");
    key(input, "Enter");
    expect(calls).toEqual([["15px", undefined]]);
  });

  it("shows a value it cannot read whole, without a unit", () => {
    const { input } = mount({ value: "1.5em" });
    expect(input.value).toBe("1.5em");
    expect(container.querySelector("span[aria-hidden]")).toBeNull();
  });

  it("changes the unit and keeps the number", () => {
    const { calls } = mount({ value: "50%", units: ["px", "%"] });
    act(() => (button("Unit: %") as HTMLButtonElement).click());
    expect(calls).toEqual([["50px", undefined]]);
  });

  it("steps by one with the arrow keys, by ten with Shift, from the default when empty", () => {
    const { input, calls } = mount({ value: "", placeholder: "10px" });
    key(input, "ArrowUp");
    key(input, "ArrowDown", true);
    expect(calls).toEqual([
      ["11px", undefined],
      ["1px", undefined],
    ]);
  });

  it("does not step below zero", () => {
    const { input, calls } = mount({ value: "3px" });
    key(input, "ArrowDown", true);
    expect(calls).toEqual([["0px", undefined]]);
  });

  it("keeps stepping while an arrow is held, and records the hold as one change", () => {
    vi.useFakeTimers();
    try {
      const { calls } = mount({ value: "20px" });
      const up = button("Increase");
      pointer(up, "pointerdown");
      act(() => void vi.advanceTimersByTime(400 + 60));
      pointer(up, "pointerup");
      act(() => void vi.advanceTimersByTime(1000));
      expect(calls).toEqual([
        ["21px", true],
        ["22px", true],
        ["23px", true],
        ["23px", undefined],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is a single step for a click", () => {
    const { calls } = mount({ value: "20px" });
    const down = button("Decrease");
    pointer(down, "pointerdown");
    pointer(down, "pointerup");
    expect(calls).toEqual([
      ["19px", true],
      ["19px", undefined],
    ]);
  });
});
