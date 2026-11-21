// @vitest-environment node
// Инструмент подбора проверенных seed и измерения трудоёмкости блюд ботом (задача 8.6). В обычном прогоне пропускается.
// Запуск: COOKING_SEED_SEARCH=1 npx vitest run game-src/cooking/src/bot/seedSearch.test.ts (из папки web).
// Результат печатается в консоль и пишется в файл cooking-seed-search.json во временной папке системы: списки seed переносятся
// в config/levels/<уровень>.ts (поле verifiedSeeds), трудоёмкость блюд (busyPerDish) в config/levels/dishes.ts.
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DISH_IDS, LEVEL_IDS, type DishId } from "../contracts";
import { getLevelConfig } from "../config/levels";
import { selectRepresentativeSeeds, verifySeed } from "./verify";

// Сколько кандидатов перебирается на уровень и сколько seed нужно в списке.
const CANDIDATE_COUNT = 120;
const WANTED_SEEDS = 8;

describe.skipIf(!process.env.COOKING_SEED_SEARCH)("подбор seed и измерение трудоёмкости", () => {
	it("печатает списки seed и среднюю трудоёмкость блюд по прогонам бота", { timeout: 1800000 }, () => {
		const candidates = Array.from({ length: CANDIDATE_COUNT }, (_, index) => index + 1);
		const report: Record<string, unknown> = {};
		// COOKING_SEED_LEVELS=medium,hard ограничивает поиск перечисленными уровнями (по умолчанию все).
		const wantedLevels = process.env.COOKING_SEED_LEVELS?.split(",").map((name) => name.trim()) ?? [...LEVEL_IDS];
		for (const levelId of LEVEL_IDS.filter((id) => wantedLevels.includes(id))) {
			const selected = selectRepresentativeSeeds(() => getLevelConfig(levelId), candidates, WANTED_SEEDS);
			const busy: Partial<Record<DishId, { busySec: number; count: number }>> = {};
			for (const seed of candidates.slice(0, 20)) {
				const run = verifySeed(() => getLevelConfig(levelId), seed);
				for (const dish of DISH_IDS) {
					const count = run.stats.deliveriesByDish[dish] ?? 0;
					if (count > 0) {
						const entry = (busy[dish] ??= { busySec: 0, count: 0 });
						entry.busySec += run.stats.busySecByDish[dish] ?? 0;
						entry.count += count;
					}
				}
			}
			const busyPerDish = Object.fromEntries(Object.entries(busy).map(([dish, entry]) => [dish, Number((entry.busySec / entry.count).toFixed(1))]));
			report[levelId] = { verifiedSeeds: selected, busyPerDish };
		}
		const text = JSON.stringify(report, null, 2);
		const outputPath = join(tmpdir(), "cooking-seed-search.json");
		writeFileSync(outputPath, text);
		console.log(`Результат подбора записан в ${outputPath}\n${text}`);
		for (const levelId of LEVEL_IDS.filter((id) => wantedLevels.includes(id))) {
			expect((report[levelId] as { verifiedSeeds: number[] }).verifiedSeeds.length).toBeGreaterThan(0);
		}
	});
});
