import type { ReactNode } from "react";
import BackLink from "@/components/BackLink";
import Logo from "@/components/Logo";
import SiteFooter from "@/components/SiteFooter";

type Props = {
  back: { href: string; label: string };
  title: string;
  lead: string;
  note: string;
  children: ReactNode;
};

export default function AuthCard({ back, title, lead, note, children }: Props) {
  return (
    <>
      <main className="mx-auto grid min-h-dvh max-w-[760px] place-items-center px-6 pt-[60px] pb-[90px]">
        <BackLink href={back.href} label={back.label} />

        <div className="w-[min(100%,520px)] border border-line bg-linear-145 from-card-from to-card-to p-[clamp(26px,5vw,52px)] shadow-[12px_12px_0_var(--color-card-shadow)]">
          <div aria-hidden="true" className="mb-[18px] grid size-11 rotate-45 place-items-center border-2 border-acc text-acc">
            <Logo className="size-7 -rotate-45" />
          </div>
          <p className="brut mb-[5px] text-[13px] tracking-[.16em] text-acc">Stratavault</p>
          <h1 className="brut mb-[18px] text-[clamp(30px,6vw,48px)] leading-[.95]">{title}</h1>
          <p className="mb-7 max-w-[60ch] text-mute">{lead}</p>
          {children}
          <p className="mt-6 text-xs text-mute">{note}</p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
