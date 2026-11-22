// @vitest-environment node
// Отчёт о маршрутах повара по дням кампании (bot/routeAnalysis.ts). В обычном прогоне пропускается.
// Запуск из папки web: COOKING_ROUTE_REPORT=1 npx vitest run games/cooking/src/bot/routeReport.test.ts --silent=false
// Печатает для каждого дня средний путь повара на блюдо меню, цепочку станций каждого блюда и частые переходы. Нужен при правке
// расстановки кухни (config/levels/sharedLayout.ts): числа для сравнения записаны в docs/cooking.md, раздел "Планировка кухни".
import { describe, expect, it } from "vitest";
import { getLevelConfig } from "../config/levels";
import { applyCampaignDay, LAST_CAMPAIGN_DAY } from "../config/levels/campaign";
import { analyzeKitchenRoutes } from "./routeAnalysis";

describe.skipIf(!process.env.COOKING_ROUTE_REPORT)("маршруты повара по дням", () => {
	it("печатает путь на блюдо и частые переходы", { timeout: 300000 }, () => {
		for (let day = 1; day <= LAST_CAMPAIGN_DAY; day += 1) {
			const report = analyzeKitchenRoutes(applyCampaignDay(getLevelConfig("hard"), day));
			const lines = [`День ${day}: в среднем ${report.averageDistance.toFixed(1)} ед. пути (${report.averageWalkSec.toFixed(1)} с ходьбы) на блюдо`];
			report.routes.forEach((route) => lines.push(`  ${route.dish}: ${route.distance.toFixed(1)} ед. :: ${route.chain.join(" > ")}`));
			lines.push(`  переходы: ${report.transitions.slice(0, 8).map((entry) => `${entry.from} > ${entry.to} ${entry.count.toFixed(2)}`).join("; ")}`);
			console.log(lines.join("\n"));
			expect(report.routes.length).toBe(day);
		}
	});
});
