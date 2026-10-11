import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

/** Shared syntax-aware rules; TypeScript uses its own scope analysis while tsc remains responsible for type checking. */
export const config = defineConfig([
  globalIgnores(["**/dist/**"]),
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [tseslint.configs.recommended],
  },
  eslintConfigPrettier,
  {
    plugins: { turbo: turboPlugin },
    rules: {
      curly: ["error", "all"],
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
]);
