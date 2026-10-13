import { describe, expect, it } from "vitest";
import { fmtLL } from "./geo";

describe("fmtLL", () => {
  it("formate [lon, lat] comme la bêta", () => {
    expect(fmtLL([2.3522, 48.8566])).toBe("48.86° N, 2.35° E");
    expect(fmtLL([-58.3816, -34.6037])).toBe("34.60° S, 58.38° O");
    expect(fmtLL([0, 0])).toBe("0.00° N, 0.00° E");
  });
});
