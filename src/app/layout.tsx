import type { Metadata } from "next";
import { connection } from "next/server";
import DialogHost from "@/components/dialogs/DialogHost";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Stratavault", template: "%s — Stratavault" },
  description: "Cartes stratégiques interactives pour l'analyse géopolitique",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Rendu à chaque requête : Next.js ajoute alors à ses scripts le nonce de la CSP posée par le proxy.
  await connection();

  return (
    <html
      lang="fr"
      className="dark scroll-smooth bg-bg motion-reduce:scroll-auto"
      data-scroll-behavior="smooth"
    >
      <body className="bg-bg font-sans text-[15px] leading-[1.45] text-ink">
        {children}
        <DialogHost />
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
