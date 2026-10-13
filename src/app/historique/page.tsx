import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import SiteFooter from "@/components/SiteFooter";
import Timeline from "@/components/history/Timeline";
import { CHANGELOG } from "@/data/changelog";

export const metadata: Metadata = { title: "Historique des mises à jour" };

export default function HistoriquePage() {
  return (
    <>
      <main className="mx-auto max-w-[760px] px-6 pt-8 pb-[90px]">
        <BackLink href="/" label="Retour à l’accueil" />
        <h1 className="brut mt-[30px] mb-8 text-[clamp(28px,5vw,44px)]">Historique des mises à jour</h1>
        <Timeline releases={CHANGELOG} />
      </main>
      <SiteFooter />
    </>
  );
}
