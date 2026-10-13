# Stratavault

Carte stratégique interactive pour l'analyse géopolitique : un planisphère (projection Winkel Tripel)
ou un globe, sur lequel on annote les pays, pose des balises, trace des liens, des zones, des flux et
de petits titres, chacun avec sa fiche (titre, date, notes, relations).

Projet étudiant indépendant (Sciences Po, campus de Menton), non commercial.

## Fonctionnalités

- **Toutes les entités cliquables** : les 193 États membres de l'ONU, le Vatican et la Palestine, les
  États à reconnaissance limitée (Taïwan, Kosovo, Somaliland…), les territoires dépendants et disputés,
  l'Antarctique — 245 entités, avec statut, souveraineté et capitales.
- **Outils** : sélection, lien, balises (6 types), point, lasso de zone, texte, pinceau flux (10 couleurs),
  gomme, raccourcis clavier.
- **Deux vues** : planisphère Winkel Tripel et globe orthographique (liens en arcs aériens 3D).
- **Banque de cartes** : plusieurs cartes, sauvegarde automatique, export / import JSON (compatible avec
  les exports de la bêta).
- **Comptes** (Supabase) ou **mode démo** sans compte (données gardées dans le navigateur).
- **Pages légales** et droits RGPD dans l'application (export des données, suppression du compte).

## Pile technique

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, zustand, D3
(d3-geo, d3-geo-projection, d3-zoom), Supabase (`@supabase/ssr`, côté serveur uniquement), zod,
react-hook-form, Vitest.

## Démarrer

Prérequis : Node.js 20.9 ou plus récent.

```bash
npm install
npm run dev
```

Puis ouvrir <http://localhost:3000>. Sans configuration, l'application fonctionne en **mode démo** :
les cartes restent dans le navigateur (IndexedDB) et les formulaires de compte sont désactivés.

### Activer les comptes

Copier `.env.example` en `.env.local`, renseigner l'URL du projet Supabase et sa clé **publishable**,
puis appliquer les migrations de `supabase/migrations/`. Tout est détaillé dans
[docs/supabase.md](docs/supabase.md).

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | compilation de production |
| `npm start` | serveur de production (après `build`) |
| `npm test` | tests Vitest (dont les migrations SQL sur PGlite) |
| `npm run lint` | ESLint |

## Organisation

```
src/app/                 pages (accueil, éditeur /carte, /espace, /compte, pages légales…)
src/features/editor/     éditeur : carte, calques, outils, fiches, sauvegarde
src/features/map-doc/    format des cartes : types, validation (zod), opérations
src/features/maps/       cartes des comptes (Server Actions)
src/features/auth/       connexion, inscription, mots de passe
src/lib/supabase/        accès à Supabase (serveur uniquement)
src/data/countries.ts    les 245 entités (noms, statuts, capitales)
supabase/migrations/     schéma de la base (RLS, fonctions d'écriture)
docs/                    documentation (Supabase, aspects légaux, registre des traitements)
```

## Données et crédits

Fond de carte : [Natural Earth](https://www.naturalearthdata.com/) (domaine public) via
[world-atlas](https://github.com/topojson/world-atlas). Les frontières, noms et statuts sont indicatifs
et ne préjugent d'aucune position. Crédits complets sur la page `/mentions-legales`.

## Licence

Aucune licence n'est accordée pour l'instant : tous droits réservés.
