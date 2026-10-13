// Suppression du compte vue du navigateur : le nettoyage local et le départ vers l'accueil se font
// dans la suite de l'appel (le dialogue peut être démonté par le nouveau rendu de /compte).
import { describe, expect, it, vi } from "vitest";
import { errorState, successState } from "@/features/auth/formState";
import { UNAVAILABLE } from "@/features/auth/messages";
import { submitAccountDeletion } from "./deleteFlow";
import { ACCOUNT_DELETED, WRONG_PASSWORD } from "./messages";
import { ACCOUNT_DELETED_PATH } from "./notices";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function steps(submit: () => Promise<ReturnType<typeof successState>>) {
  const order: string[] = [];
  return {
    order,
    submit: vi.fn(async () => (order.push("submit"), submit())),
    forget: vi.fn(async (userId: string) => void order.push(`forget ${userId}`)),
    leave: vi.fn((path: string) => void order.push(`leave ${path}`)),
  };
}

describe("submitAccountDeletion", () => {
  it("compte supprimé : copie locale effacée, puis retour à l'accueil avec le message", async () => {
    const s = steps(async () => successState(ACCOUNT_DELETED));
    const data = new FormData();
    expect(await submitAccountDeletion(ALICE, data, s)).toEqual(successState(ACCOUNT_DELETED));
    expect(s.submit).toHaveBeenCalledWith(data);
    expect(s.order).toEqual(["submit", `forget ${ALICE}`, `leave ${ACCOUNT_DELETED_PATH}`]);
  });

  it("échec : état renvoyé pour l'affichage, rien n'est effacé et la page reste", async () => {
    const s = steps(async () => errorState(WRONG_PASSWORD, { password: WRONG_PASSWORD }));
    expect(await submitAccountDeletion(ALICE, new FormData(), s)).toMatchObject({ message: WRONG_PASSWORD });
    expect(s.forget).not.toHaveBeenCalled();
    expect(s.leave).not.toHaveBeenCalled();
  });

  it("serveur injoignable : message générique, rien n'est effacé", async () => {
    const s = steps(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await submitAccountDeletion(ALICE, new FormData(), s)).toEqual(errorState(UNAVAILABLE));
    expect(s.forget).not.toHaveBeenCalled();
    expect(s.leave).not.toHaveBeenCalled();
  });

  it("l'accueil est atteint même si l'effacement local échoue", async () => {
    const s = steps(async () => successState(ACCOUNT_DELETED));
    s.forget.mockRejectedValue(new Error("IndexedDB"));
    expect((await submitAccountDeletion(ALICE, new FormData(), s)).status).toBe("success");
    expect(s.leave).toHaveBeenCalledWith(ACCOUNT_DELETED_PATH);
  });
});
