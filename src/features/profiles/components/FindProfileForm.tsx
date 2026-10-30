"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import AuthField from "@/components/auth/AuthField";
import { Button } from "@/components/ui/button";
import { HANDLE_MAX } from "../handle";
import { SEARCH_INVALID } from "../messages";
import { searchTarget } from "../paths";

/**
 * Trouver un membre par son identifiant EXACT (jamais par adresse e-mail, ni par début de nom) :
 * ouvre /profil/<identifiant>, qui affiche le profil s'il existe et est visible.
 */
export default function FindProfileForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = searchTarget(value);
    if (!target) {
      setError(SEARCH_INVALID);
      return;
    }
    setError(undefined);
    router.push(target);
  }

  return (
    <form onSubmit={onSubmit} noValidate role="search" className="grid gap-3">
      <AuthField
        id="trouver-membre"
        label="Identifiant exact du membre"
        placeholder="@identifiant"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        maxLength={HANDLE_MAX + 1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={error}
      />
      <div>
        <Button type="submit" variant="panel" size="panel">
          Voir le profil
        </Button>
      </div>
    </form>
  );
}
