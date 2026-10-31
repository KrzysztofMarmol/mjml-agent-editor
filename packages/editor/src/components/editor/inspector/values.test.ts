import { describe, expect, it } from "vitest";

import { boxShorthand, networkName, parseLength, parseNetwork, readBox } from "./values.js";

describe("readBox", () => {
  it("expands the shorthand an agent writes", () => {
    expect(readBox({ padding: "40px 0" }, "padding")).toEqual(["40px", "0", "40px", "0"]);
  });

  it("lets a longhand override its side of the shorthand", () => {
    expect(readBox({ padding: "10px 25px", "padding-top": "0px" }, "padding")).toEqual([
      "0px",
      "25px",
      "10px",
      "25px",
    ]);
  });

  it("leaves unset sides empty, so the default shows", () => {
    expect(readBox({}, "padding")).toEqual(["", "", "", ""]);
  });
});

describe("boxShorthand", () => {
  it("writes the shortest form", () => {
    expect(boxShorthand(["10px", "10px", "10px", "10px"])).toBe("10px");
    expect(boxShorthand(["20px", "0", "20px", "0"])).toBe("20px 0");
    expect(boxShorthand(["1px", "2px", "3px", "2px"])).toBe("1px 2px 3px");
    expect(boxShorthand(["1px", "2px", "3px", "4px"])).toBe("1px 2px 3px 4px");
  });

  it("fills an emptied side with 0 rather than writing a gap MJML would reject", () => {
    expect(boxShorthand(["10px", "", "10px", ""])).toBe("10px 0");
  });
});

describe("parseLength", () => {
  it("splits a number from its unit", () => {
    expect(parseLength("24px", ["px"])).toEqual({ amount: "24", unit: "px" });
    expect(parseLength("1.5", ["", "px"])).toEqual({ amount: "1.5", unit: "" });
  });

  it("refuses units and keywords the attribute does not take", () => {
    expect(parseLength("50%", ["px"])).toBeNull();
    expect(parseLength("auto", ["px"])).toBeNull();
  });
});

describe("social network names", () => {
  it("reads a profile link and a share link", () => {
    expect(parseNetwork("facebook-noshare")).toEqual({ network: "facebook", share: false });
    expect(parseNetwork("facebook")).toEqual({ network: "facebook", share: true });
    expect(parseNetwork("custom")).toEqual({ network: "custom", share: false });
  });

  it("writes the profile variant unless sharing is asked for", () => {
    expect(networkName("x", false)).toBe("x-noshare");
    expect(networkName("x", true)).toBe("x");
    expect(networkName("custom", false)).toBe("custom");
  });
});
