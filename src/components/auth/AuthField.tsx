import { useId, type ComponentProps } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fieldError, fieldHint, input, label as labelClass } from "./styles";

type Props = ComponentProps<"input"> & { label: string; error?: string; hint?: string };

/** Libellé + champ + aide + erreur, reliés pour les lecteurs d'écran. */
export default function AuthField({ id, label, error, hint, ...inputProps }: Props) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const hintId = `${inputId}-aide`;
  const errorId = `${inputId}-erreur`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <Field data-invalid={error ? true : undefined} className="gap-[9px]">
      <FieldLabel htmlFor={inputId} className={labelClass}>
        {label}
      </FieldLabel>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={input}
        {...inputProps}
      />
      {hint && (
        <FieldDescription id={hintId} className={fieldHint}>
          {hint}
        </FieldDescription>
      )}
      <FieldError id={errorId} className={fieldError}>
        {error}
      </FieldError>
    </Field>
  );
}
