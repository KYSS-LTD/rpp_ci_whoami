import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Сторонние библиотеки внутри сборок iframe-игр (например, three.js) не проверяются.
    "public/game-builds/**/vendor/**",
    // Результат сборки игры cooking (Vite) создаётся сборщиком и не проверяется: исходники лежат в games/cooking.
    "public/game-builds/cooking/**",
    "public/game-builds/uav-operator/**",
  ]),
]);

export default eslintConfig;
