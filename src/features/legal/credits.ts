// Données et bibliothèques utilisées par Stratavault, avec leur licence (page /mentions-legales).
// La licence de chaque paquet est vérifiée contre son package.json par credits.test.ts.

export type Credit = {
  name: string;
  /** Paquet npm dont la licence est vérifiée. */
  pkg: string;
  license: string;
  holder: string;
  url: string;
  /** Mention de licence supplémentaire exigée par une partie du paquet. */
  notice?: string;
};

/** Géométries des pays : Natural Earth (domaine public), redistribuées par world-atlas. */
export const NATURAL_EARTH = {
  name: "Natural Earth",
  version: "4.1.0",
  license: "domaine public",
  url: "https://www.naturalearthdata.com",
} as const;

export const CREDITS: readonly Credit[] = [
  { name: "world-atlas", pkg: "world-atlas", license: "ISC", holder: "Michael Bostock", url: "https://github.com/topojson/world-atlas" },
  { name: "D3", pkg: "d3", license: "ISC", holder: "Mike Bostock", url: "https://d3js.org" },
  { name: "d3-geo-projection", pkg: "d3-geo-projection", license: "ISC", holder: "Mike Bostock", url: "https://github.com/d3/d3-geo-projection" },
  { name: "TopoJSON Client", pkg: "topojson-client", license: "ISC", holder: "Mike Bostock", url: "https://github.com/topojson/topojson-client" },
  { name: "Next.js", pkg: "next", license: "MIT", holder: "Vercel, Inc.", url: "https://nextjs.org" },
  { name: "React", pkg: "react", license: "MIT", holder: "Meta Platforms, Inc. et ses sociétés affiliées", url: "https://react.dev" },
  { name: "Tailwind CSS", pkg: "tailwindcss", license: "MIT", holder: "Tailwind Labs, Inc.", url: "https://tailwindcss.com" },
  { name: "shadcn/ui", pkg: "shadcn", license: "MIT", holder: "shadcn", url: "https://ui.shadcn.com" },
  { name: "Radix UI", pkg: "radix-ui", license: "MIT", holder: "WorkOS", url: "https://www.radix-ui.com" },
  { name: "Lucide", pkg: "lucide-react", license: "ISC", holder: "Lucide Icons et contributeurs", url: "https://lucide.dev", notice: "icônes issues de Feather sous licence MIT, © 2013-present Cole Bemis" },
  { name: "class-variance-authority", pkg: "class-variance-authority", license: "Apache-2.0", holder: "Joe Bell", url: "https://github.com/joe-bell/cva" },
  { name: "cn", pkg: "cn", license: "MIT", holder: "shadcn", url: "https://github.com/shadcn-ui/cn" },
  { name: "tw-animate-css", pkg: "tw-animate-css", license: "MIT", holder: "Luca Bosin", url: "https://github.com/Wombosvideo/tw-animate-css" },
  { name: "Sonner", pkg: "sonner", license: "MIT", holder: "Emil Kowalski", url: "https://sonner.emilkowal.ski" },
  { name: "Zustand", pkg: "zustand", license: "MIT", holder: "Paul Henschel", url: "https://github.com/pmndrs/zustand" },
  { name: "Zod", pkg: "zod", license: "MIT", holder: "Colin McDonnell", url: "https://zod.dev" },
  { name: "React Hook Form", pkg: "react-hook-form", license: "MIT", holder: "Beier (Bill) Luo", url: "https://react-hook-form.com" },
  { name: "@hookform/resolvers", pkg: "@hookform/resolvers", license: "MIT", holder: "Beier (Bill) Luo", url: "https://github.com/react-hook-form/resolvers" },
  { name: "idb", pkg: "idb", license: "ISC", holder: "Jake Archibald", url: "https://github.com/jakearchibald/idb" },
  { name: "Supabase JS et @supabase/ssr", pkg: "@supabase/ssr", license: "MIT", holder: "Supabase, Inc.", url: "https://github.com/supabase/ssr" },
];
