import { afterEach, describe, expect, it, vi } from "vitest";
import { returnFocusTarget } from "./useCloseAutoFocus";

/** Élément minimal : branché ou non sur la page, avec un élément de repli éventuel. */
class FakeElement {
  constructor(
    public isConnected: boolean,
    private fallback: FakeElement | null = null,
  ) {}
  querySelector() {
    return this.fallback;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("retour du focus à la fermeture d'un dialogue", () => {
  it("rend le focus au déclencheur s'il est toujours dans la page", () => {
    vi.stubGlobal("HTMLElement", FakeElement);
    const trigger = new FakeElement(true);
    const scope = new FakeElement(true, new FakeElement(true));
    expect(returnFocusTarget({ trigger, scope } as never)).toBe(trigger);
  });

  it("déclencheur disparu (fiche supprimée) : l'élément de repli de sa zone, si elle est encore là", () => {
    vi.stubGlobal("HTMLElement", FakeElement);
    const heading = new FakeElement(true);
    const trigger = new FakeElement(false);
    expect(returnFocusTarget({ trigger, scope: new FakeElement(true, heading) } as never)).toBe(heading);
    expect(returnFocusTarget({ trigger, scope: new FakeElement(false, heading) } as never)).toBeNull();
    expect(returnFocusTarget({ trigger, scope: null } as never)).toBeNull();
  });
});
