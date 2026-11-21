// Проверка исходников на запрещённые тире (CodeStyle.md, п.2): разрешён только дефис "-".
// Ищет длинное тире U+2014 и короткое тире U+2013. При находке печатает файл и строку и завершается с кодом 1.
// Запуск: npm run check:dashes [папка или файл ...]. Без аргументов проверяются папки исходников проекта.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

// Папка web, относительно которой ищутся исходники.
const projectRoot = resolve(import.meta.dirname, "..");

// Папки и файлы по умолчанию. AGENTS.md не входит: его генерирует next dev.
// sdk и public/game-builds - код моста и сборки iframe-игр; сторонние библиотеки в папках vendor пропускаются.
// game-src - исходники iframe-игр, из которых собираются сборки (например, game-src/cooking).
const defaultTargets = ["app", "core", "games", "texts", "scripts", "docs", "sdk", "game-src", "public/game-builds", ".env.example", "README.md"];

const checkedExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".css", ".md", ".html", ".example", ".cs", ".jslib"]);
const skippedDirectories = new Set(["node_modules", ".next", "out", "build", "coverage", "vendor"]);
const forbiddenDashes = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

// Собирает пути файлов для проверки, обходя папки рекурсивно.
function collectFiles(targetPath, files) {
	let stats;
	try {
		stats = statSync(targetPath);
	} catch {
		return;
	}
	if (stats.isDirectory()) {
		for (const entry of readdirSync(targetPath)) {
			if (!skippedDirectories.has(entry)) {
				collectFiles(join(targetPath, entry), files);
			}
		}
		return;
	}
	if (checkedExtensions.has(extname(targetPath))) {
		files.push(targetPath);
	}
}

const cliTargets = process.argv.slice(2);
const targets = (cliTargets.length > 0 ? cliTargets : defaultTargets).map((target) => resolve(projectRoot, target));

const files = [];
targets.forEach((target) => collectFiles(target, files));

const violations = [];
for (const filePath of files) {
	const lines = readFileSync(filePath, "utf8").split("\n");
	lines.forEach((lineText, lineIndex) => {
		if (forbiddenDashes.test(lineText)) {
			violations.push(`${relative(projectRoot, filePath)}:${lineIndex + 1}: ${lineText.trim()}`);
		}
	});
}

if (violations.length > 0) {
	console.error("Найдено тире вместо дефиса:");
	violations.forEach((violation) => console.error(`  ${violation}`));
	process.exit(1);
}

console.log(`Тире не найдено, проверено файлов: ${files.length}`);
