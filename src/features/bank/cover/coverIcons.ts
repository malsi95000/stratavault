// Icônes proposées pour le logo d'une carte (COVER_ICONS, maps/cover.ts) : composant lucide et nom
// français (infobulle, lecteurs d'écran).
import {
  AnchorIcon,
  CompassIcon,
  CrownIcon,
  FactoryIcon,
  FlagIcon,
  FuelIcon,
  GlobeIcon,
  LandmarkIcon,
  MapIcon,
  MountainIcon,
  PlaneIcon,
  RadarIcon,
  ScaleIcon,
  ShieldIcon,
  ShipIcon,
  SwordsIcon,
  TargetIcon,
  UsersIcon,
  WheatIcon,
  ZapIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CoverIcon } from "@/features/maps/cover";

export const COVER_ICON_DEFS: Record<CoverIcon, { Icon: LucideIcon; label: string }> = {
  globe: { Icon: GlobeIcon, label: "Globe" },
  map: { Icon: MapIcon, label: "Carte" },
  flag: { Icon: FlagIcon, label: "Drapeau" },
  shield: { Icon: ShieldIcon, label: "Bouclier" },
  swords: { Icon: SwordsIcon, label: "Épées" },
  anchor: { Icon: AnchorIcon, label: "Ancre" },
  ship: { Icon: ShipIcon, label: "Navire" },
  plane: { Icon: PlaneIcon, label: "Avion" },
  factory: { Icon: FactoryIcon, label: "Usine" },
  landmark: { Icon: LandmarkIcon, label: "Institution" },
  zap: { Icon: ZapIcon, label: "Énergie" },
  fuel: { Icon: FuelIcon, label: "Carburant" },
  wheat: { Icon: WheatIcon, label: "Blé" },
  mountain: { Icon: MountainIcon, label: "Montagne" },
  compass: { Icon: CompassIcon, label: "Boussole" },
  target: { Icon: TargetIcon, label: "Cible" },
  users: { Icon: UsersIcon, label: "Population" },
  scale: { Icon: ScaleIcon, label: "Balance" },
  radar: { Icon: RadarIcon, label: "Radar" },
  crown: { Icon: CrownIcon, label: "Couronne" },
};
