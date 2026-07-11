import { describe, expect, it } from "vitest";
import { applyUpdater, defaultGetRowId } from "./utils";

describe("applyUpdater", () => {
  it("returns a plain value unchanged", () => {
    expect(applyUpdater(5, 1)).toBe(5);
  });

  it("invokes a functional updater with the previous value", () => {
    expect(applyUpdater((prev: number) => prev + 1, 41)).toBe(42);
  });

  it("works with array state", () => {
    expect(applyUpdater((prev: number[]) => [...prev, 3], [1, 2])).toEqual([
      1, 2, 3,
    ]);
  });
});

describe("defaultGetRowId", () => {
  it("uses a stable `id` field when present", () => {
    expect(defaultGetRowId({ id: "abc", name: "x" }, 7)).toBe("abc");
  });

  it("coerces a numeric id to a string", () => {
    expect(defaultGetRowId({ id: 99 }, 7)).toBe("99");
  });

  it("falls back to the index when there is no id field", () => {
    expect(defaultGetRowId({ name: "x" }, 7)).toBe("7");
  });

  it("falls back to the index for primitive rows", () => {
    expect(defaultGetRowId("just-a-string", 3)).toBe("3");
  });
});
