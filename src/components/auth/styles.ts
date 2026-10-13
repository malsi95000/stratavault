// Classes partagées par les formulaires de compte (carte de connexion de la bêta).
// Elles complètent les composants shadcn (Field, Input, Button) via cn().

export const form = "grid gap-[9px]";

export const label = "mt-[7px] text-xs leading-[inherit] font-normal tracking-[.08em] text-mute uppercase";

export const input =
  "h-auto rounded-[3px] border-line bg-field-alt px-3.5 py-[13px] text-[length:inherit] shadow-none placeholder:text-mute/70 md:text-[length:inherit] dark:bg-field-alt " +
  "focus:border-acc focus-visible:border-acc focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc focus-visible:outline-solid " +
  "aria-invalid:border-danger aria-invalid:ring-0 dark:aria-invalid:border-danger dark:aria-invalid:ring-0";

export const fieldError = "text-[13px] text-danger";

export const fieldHint = "text-xs text-mute nth-last-2:mt-0";

const button = "w-full justify-between transition-colors duration-150";

export const primaryButton = `${button} mt-4 border-acc bg-acc text-on-acc hover:border-ink hover:bg-ink`;

export const secondaryButton = `${button} mt-[2px] border-line bg-transparent text-mute hover:border-mute hover:bg-panel hover:text-ink`;

export const textLink =
  "mt-3 block w-full rounded px-3 py-1.5 text-center text-mute underline underline-offset-3 transition-colors duration-150 hover:text-ink";

export const notice = "mb-5 border border-line bg-panel px-3.5 py-3 text-[14px]";
