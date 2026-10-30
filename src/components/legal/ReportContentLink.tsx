import { REPORT_LINK_LABEL, REPORT_LINK_TITLE, reportMailto, type ReportTarget } from "@/features/legal/reportContent";
import { cn } from "@/lib/utils";

const LINK = "text-[13px] text-mute underline underline-offset-3 hover:text-ink";

/**
 * Lien « Signaler ce profil » / « Signaler cette carte », à côté d'un contenu d'un autre membre :
 * ouvre un e-mail prérempli au point de contact du site (src/features/legal/reportContent.ts).
 */
export default function ReportContentLink({ target, className }: { target: ReportTarget; className?: string }) {
  return (
    <a href={reportMailto(target)} title={REPORT_LINK_TITLE} className={cn(LINK, className)}>
      {REPORT_LINK_LABEL[target.kind]}
    </a>
  );
}
