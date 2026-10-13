import { describe, expect, it, vi } from "vitest";
import { OTHER_TAB_WARNING, OTHER_TAB_WARNING_ACCOUNT, otherTabWarning, watchOtherTabs } from "./otherTabs";
import type { PresenceChannel } from "./otherTabs";

/** Canaux reliés comme des BroadcastChannel du même nom : un message part vers tous les autres. */
function bus() {
  const channels: PresenceChannel[] = [];
  return () => {
    const channel: PresenceChannel = {
      onmessage: null,
      postMessage(message) {
        for (const other of channels) {
          if (other !== channel) other.onmessage?.(new MessageEvent("message", { data: structuredClone(message) }));
        }
      },
    };
    channels.push(channel);
    return channel;
  };
}

describe("onglets de l'éditeur sur la même base locale", () => {
  it("prévient l'onglet qui s'ouvre et celui qui l'était déjà", () => {
    const open = bus();
    const first = vi.fn();
    const second = vi.fn();
    watchOtherTabs(open(), "stratavault", first, "a");
    expect(first).not.toHaveBeenCalled();
    watchOtherTabs(open(), "stratavault", second, "b");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("ignore les onglets d'une autre base (autre compte) et ses propres messages", () => {
    const open = bus();
    const demo = vi.fn();
    const account = vi.fn();
    watchOtherTabs(open(), "stratavault", demo, "a");
    watchOtherTabs(open(), "stratavault-u-1", account, "b");
    expect(demo).not.toHaveBeenCalled();
    expect(account).not.toHaveBeenCalled();
  });

  it("ignore les messages d'une autre forme ; plus rien après l'arrêt", () => {
    const open = bus();
    const warn = vi.fn();
    const channel = open();
    const stop = watchOtherTabs(channel, "stratavault", warn, "a");
    channel.onmessage?.(new MessageEvent("message", { data: { type: "hello", key: "stratavault" } }));
    channel.onmessage?.(new MessageEvent("message", { data: "hello" }));
    expect(warn).not.toHaveBeenCalled();
    stop();
    watchOtherTabs(open(), "stratavault", vi.fn(), "b");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("texte de l'avertissement", () => {
  it("démo : le dernier enregistrement écrase l'autre ; compte : la banque protège sa copie", () => {
    expect(otherTabWarning(false)).toBe(OTHER_TAB_WARNING);
    expect(OTHER_TAB_WARNING).toContain("écrase l’autre");
    expect(otherTabWarning(true)).toBe(OTHER_TAB_WARNING_ACCOUNT);
    expect(OTHER_TAB_WARNING_ACCOUNT).not.toContain("écrase l’autre");
    expect(OTHER_TAB_WARNING_ACCOUNT).toContain("la banque n’écrase pas");
  });
});
