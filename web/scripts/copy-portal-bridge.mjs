// Копирует веб-SDK моста (sdk/web/portal-bridge.js) в папку public исходников игры перед сборкой.
// Так копия в сборке игры не отстаёт от оригинала (design D16); тест sdk/sdk-consistency.test.ts сверяет её с оригиналом.
// Запуск: node scripts/copy-portal-bridge.mjs [папка игры в game-src, по умолчанию cooking]. Вызывается из npm-скриптов
// predev:cooking и prebuild:cooking.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Папка web, относительно которой лежат sdk и game-src.
const projectRoot = resolve(import.meta.dirname, "..");
const gameName = process.argv[2] ?? "cooking";

const sourcePath = join(projectRoot, "sdk", "web", "portal-bridge.js");
const targetPath = join(projectRoot, "game-src", gameName, "public", "portal-bridge.js");

mkdirSync(dirname(targetPath), { recursive: true });
copyFileSync(sourcePath, targetPath);
console.log(`Мост скопирован: ${sourcePath} -> ${targetPath}`);
