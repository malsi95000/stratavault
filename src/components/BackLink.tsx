import Link from "next/link";

/** Bouton « ← … » de retour (style .btn de la bêta). */
export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-block rounded border border-line bg-panel px-3 py-1.5 text-ink transition-colors duration-150 hover:border-mute"
    >
      ← {label}
    </Link>
  );
}
