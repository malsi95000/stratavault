import Link from "next/link";
import FlashToast from "@/components/FlashToast";
import Logo from "@/components/Logo";
import HomeTabs from "@/components/home/HomeTabs";
import MusicButton from "@/components/home/MusicButton";
import SiteFooter from "@/components/SiteFooter";
import { homeNotice } from "@/features/account/notices";

export default async function Home({ searchParams }: PageProps<"/">) {
  // Confirmation après la suppression du compte (?compte=supprime).
  const notice = homeNotice(await searchParams);

  return (
    <main className="relative">
      {notice && <FlashToast message={notice} />}
      <MusicButton />

      <section className="relative flex min-h-screen flex-col items-center justify-center gap-[clamp(24px,5vh,56px)] overflow-hidden p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[15%] z-0 bg-[radial-gradient(ellipse_at_50%_38%,var(--color-hero-glow)_0%,transparent_62%)]"
        />
        <Logo className="pointer-events-none absolute top-1/2 left-1/2 z-0 h-auto w-[min(1600px,220vw)] -translate-x-1/2 -translate-y-[46%] text-logo-bleed" />

        <h1 className="brut relative z-1 m-0 text-center text-[clamp(44px,13vw,200px)] leading-[.85] tracking-[-.01em] [text-shadow:.04em_.04em_0_var(--color-red)]">
          Stratavault
        </h1>

        <Link
          href="/connexion"
          className="brut relative z-1 border-4 border-ink px-[34px] py-[18px] text-[clamp(18px,2.4vw,28px)] tracking-[.04em] text-ink transition-colors duration-150 hover:border-acc hover:bg-acc hover:text-on-acc focus-visible:border-acc focus-visible:bg-acc focus-visible:text-on-acc"
        >
          Créer une carte stratégique
        </Link>

        <a
          href="#faq"
          className="absolute bottom-[22px] left-1/2 z-1 flex -translate-x-1/2 flex-col items-center gap-1 text-xs tracking-[.08em] text-mute uppercase transition-colors duration-150 hover:text-ink"
        >
          <span>En savoir plus</span>
          <svg
            viewBox="0 0 24 24"
            className="size-5 animate-bob fill-none stroke-mute stroke-[1.6] motion-reduce:animate-none"
            aria-hidden="true"
          >
            <path d="M12 4v16M5 13l7 7 7-7" />
          </svg>
        </a>
      </section>

      <HomeTabs />

      <SiteFooter />
    </main>
  );
}
