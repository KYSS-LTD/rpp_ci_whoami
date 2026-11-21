// @vitest-environment node
// Общий инвариант "NPC не проходят сквозь препятствия": смену на каждом уровне проходит эталонный бот, а на каждом шаге все
// официанты и клиенты проверяются монитором (круг NPC вне препятствий и отрезок между соседними шагами вне препятствий).
// Тест универсален: уровни берутся из getLevelConfig, никакие координаты не зашиты, поэтому он защищает и новые раскладки.
//
// Препятствия для проверки собираются НЕЗАВИСИМО от геометрии симуляции: из данных уровня (collectObstacles: стены, мебель,
// станции, стулья, колонны) и стоек проёмов дверей (collectDoorwayJambs: видимые части модели wall_doorway). Геометрия обязана
// их все содержать. Так тест поймает и баг навигации, и потерю препятствия в геометрии (исходный дефект: кусок проёма был
// проходим целиком, а у модели проход только в середине, и NPC шли сквозь видимые стойки двери).
import { describe, expect, it } from "vitest";
import { LEVEL_IDS, SIM_STEP_SEC, type LevelConfig, type LevelId, type Rect } from "../../contracts";
import { createBot } from "../../bot/bot";
import { collectObstacles } from "../../config/levels/validate";
import { getLevelConfig } from "../../config/levels";
import { collectDoorwayJambs, DOORWAY_OPENING_WIDTH, isDoorwayModel } from "../geometry";
import { createSimulation } from "../simulation";
import { describeViolation, createNpcCollisionMonitor } from "./npcCollisionMonitor";

// Сколько первых проверенных seed прогоняется на каждом уровне.
const SEEDS_PER_LEVEL = 3;

// Все непроходимые тела уровня по данным: препятствия уровня и стойки проёмов.
function collectSolids(level: LevelConfig): Rect[] {
	return [...collectObstacles(level).map((labeled) => labeled.rect), ...collectDoorwayJambs(level)];
}

describe.each(LEVEL_IDS)("NPC не проходят сквозь препятствия: уровень %s", (levelId: LevelId) => {
	const seeds = getLevelConfig(levelId).verifiedSeeds.slice(0, SEEDS_PER_LEVEL);

	it("геометрия симуляции содержит все препятствия уровня и стойки проёмов", () => {
		const level = getLevelConfig(levelId);
		const geometry = createSimulation({ level, seed: seeds[0] }).geometry;
		for (const solid of collectSolids(level)) {
			expect(geometry.obstacles, `нет препятствия x ${solid.x}, z ${solid.z}, ${solid.width} x ${solid.depth}`).toContainEqual(solid);
		}
	});

	it("у каждого проёма двери середина свободна, а стойки заблокированы в сетках коллизий и навигации", () => {
		const level = getLevelConfig(levelId);
		const geometry = createSimulation({ level, seed: seeds[0] }).geometry;
		const doorways = level.props.filter((prop) => !prop.blocking && isDoorwayModel(prop.model));
		expect(doorways.length).toBeGreaterThan(0);
		for (const doorway of doorways) {
			const alongX = doorway.rect.width >= doorway.rect.depth;
			const length = alongX ? doorway.rect.width : doorway.rect.depth;
			const openingStart = (length - DOORWAY_OPENING_WIDTH) / 2;
			for (const grid of [geometry.collisionGrid, geometry.navGrid]) {
				// Клетки по оси куска: стойки заблокированы, середина свободна. Поперёк куска берём клетку по его центру.
				const crossCenter = alongX ? doorway.rect.z + doorway.rect.depth / 2 : doorway.rect.x + doorway.rect.width / 2;
				for (let offset = grid.cellSize / 2; offset < length; offset += grid.cellSize) {
					const along = (alongX ? doorway.rect.x : doorway.rect.z) + offset;
					const cell = grid.worldToCell(alongX ? { x: along, z: crossCenter } : { x: crossCenter, z: along });
					const inOpening = offset > openingStart && offset < openingStart + DOORWAY_OPENING_WIDTH;
					expect(grid.isBlocked(cell.col, cell.row), `${doorway.id}: клетка ${cell.col},${cell.row}`).toBe(!inOpening);
				}
			}
		}
	});

	it.each(seeds)("seed %i: на каждом шаге круг NPC вне препятствий и отрезки между шагами их не пересекают", { timeout: 300000 }, (seed) => {
		const level = getLevelConfig(levelId);
		const simulation = createSimulation({ level, seed });
		const monitor = createNpcCollisionMonitor({ obstacles: collectSolids(level), bounds: level.bounds, radius: level.params.nav.agentRadius });
		const bot = createBot(simulation, { onSnapshot: (snapshot) => monitor.observe(snapshot) });
		simulation.start();
		const maxSteps = Math.ceil((level.params.durationSec + 10) / SIM_STEP_SEC);
		let steps = 0;
		for (; steps < maxSteps && simulation.getResult() === null; steps += 1) {
			simulation.step(bot.nextInput());
			if (steps % 600 === 0) {
				simulation.drainEvents();
			}
		}
		monitor.observe(simulation.getSnapshot());
		// Монитор действительно наблюдал за NPC (иначе тест ничего не защищает).
		expect(steps).toBeGreaterThan(600);
		expect(monitor.checkedPositions).toBeGreaterThan(1000);
		expect(monitor.violations.map(describeViolation), `нарушений всего ${monitor.violationCount}`).toEqual([]);
	});
});
