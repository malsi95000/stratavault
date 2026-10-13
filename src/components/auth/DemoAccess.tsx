import { Button } from "@/components/ui/button";
import { enterDemo } from "@/features/auth/actions";
import { secondaryButton } from "./styles";

/**
 * Formulaire caché de l'accès démo : le bouton peut être placé ailleurs dans la page (même dans
 * un autre formulaire) grâce à l'attribut `form`, puisque les formulaires ne s'imbriquent pas.
 */
export function DemoForm({ id }: { id: string }) {
  return <form id={id} action={enterDemo} hidden />;
}

export function DemoButton({ form }: { form: string }) {
  return (
    <Button type="submit" form={form} formNoValidate variant="panel" size="panel" className={secondaryButton}>
      Accès temporaire (démo) <span aria-hidden="true">→</span>
    </Button>
  );
}
