// Fusion de classes Tailwind (clsx + tailwind-merge) fournie par shadcn/ui.
// Point d'entrée unique : les composants (dont src/components/ui) importent `cn` depuis "@/lib/utils"
// (alias « utils » de components.json), jamais directement depuis le paquet « cn ».
export { cn } from "cn";
