import { describe, expect, it, vi } from "vitest";
import { z } from "./zod";

describe("zod sans eval (CSP)", () => {
  it("active le mode jitless", () => {
    expect(z.config().jitless).toBe(true);
  });

  it("n'essaie jamais Function() en définissant ou en validant un objet", () => {
    const spy = vi.spyOn(globalThis, "Function");
    const schema = z.object({ a: z.string(), b: z.object({ c: z.number() }) });
    expect(schema.parse({ a: "x", b: { c: 1 } })).toEqual({ a: "x", b: { c: 1 } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
