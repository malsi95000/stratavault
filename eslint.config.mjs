import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Pas de window.alert/confirm/prompt : utiliser `dialogs` (src/components/dialogs) ou un toast (sonner).
    rules: { "no-alert": "error" },
  },
  {
    // zod passe par src/lib/zod.ts, qui le règle sans eval (compatible avec la CSP de production).
    ignores: ["src/lib/zod.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "zod", message: "Importez `z` depuis \"@/lib/zod\" (mode sans eval, CSP)." }] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
