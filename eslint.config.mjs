import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Pages are server components that render once per request, so Date.now() there is fine.
      "react-hooks/purity": "off",
      // The plain <a> links to app routes are file downloads (CSV, backups), which need a full request.
      "@next/next/no-html-link-for-pages": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts", "prisma/migrations/**", "public/**"]),
]);
