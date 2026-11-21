// Уровень hard: 6 столов (4, 4, 2, 2, 2 и 2 места), меню из четырёх блюд (добавляется рагу), два официанта по две тарелки,
// смена 300 секунд.
// Внутренняя ширина 14: кухня 7.5, зал 5, то есть ровно 3:2; столы стоят плотным рядом.
// Параметры баланса: значения по умолчанию из defaults.ts и ниже, откалиброваны эталонным ботом (задача 8.6, bot/verify.ts).
// Владелец: Opus-агент.
import type { LevelConfig } from "../../contracts";
import { createFloors, createCrate, createFourTop, createQueue, createServingWindow, createShell, createStation, createTwoTop, point, type ShellSpec } from "./builders";
import { calibratedDishes } from "./dishes";
import { createParams } from "./defaults";

// Описание оболочки уровня: ширина 14, внутри 10 в глубину, улица 3.
const shellSpec: ShellSpec = {
	width: 14,
	interiorDepth: 10,
	streetDepth: 3,
	dividerX: 8,
	doorX: 10,
	// Сверху вниз по 2: стена, окно выдачи (станция), проход кухня-зал, две стены.
	dividerKinds: ["wall", "skip", "doorway", "wall", "wall"],
};

// Создаёт новый объект уровня hard.
export function createHardLevel(): LevelConfig {
	const shell = createShell(shellSpec);
	const servingWindow = createServingWindow(shell, 3);
	return {
		id: "hard",
		bounds: shell.bounds,
		view: shell.bounds,
		floors: createFloors(shellSpec, shell),
		props: shell.props,
		colliders: [],
		stations: [
			// Сетка кухни: клетки 1 x 1 по x = 1..7 и z = 0.5, 1.5, ... (полоса 0.5 у западной стены свободна), всё стоит по рядам.
			// Северный ряд: ящики всех ингредиентов меню (рагу: морковь, картофель, лук) и прилавок.
			createCrate("steak", 1, 0.5),
			createCrate("bun", 2, 0.5),
			createCrate("ham", 3, 0.5),
			createCrate("potato", 4, 0.5),
			createCrate("carrot", 5, 0.5),
			createCrate("onion", 6, 0.5),
			createStation("counter-1", "counter", 6, 2.5, 270),
			// Тарелки рядом с окном выдачи, но не перед ним: клетки напротив окна остаются свободными.
			createStation("plates-1", "plateStack", 7, 1.5, 270),
			// Западный ряд: прилавки.
			createStation("counter-3", "counter", 1, 2.5, 90),
			createStation("counter-4", "counter", 2, 2.5, 90),
			createStation("counter-5", "counter", 1, 4.5, 90),
			// Остров с тремя разделочными досками.
			createStation("board-1", "cuttingBoard", 2, 3.5),
			createStation("board-2", "cuttingBoard", 3, 3.5),
			createStation("board-3", "cuttingBoard", 4, 3.5),
			// Ряд кастрюли: стол с кастрюлей и кран рядом друг с другом и с плитой рагу (проход по z = 5.5 между рядами).
			createStation("pot-table", "counter", 5, 4.5, 90, { startItem: "pot" }),
			createStation("tap-1", "tap", 6, 4.5, 90),
			// Ряд плит: урна рядом с плитами, три сковороды, кастрюля для рагу, духовка.
			createStation("trash-1", "trash", 2, 6.5, 90),
			createStation("pan-1", "pan", 3, 6.5),
			createStation("pan-2", "pan", 4, 6.5),
			createStation("pan-3", "pan", 5, 6.5),
			createStation("pot-1", "stove", 6, 6.5),
			createStation("oven-1", "oven", 7, 6.5),
			createStation("counter-2", "counter", 1, 6.5, 90),
			servingWindow.station,
		],
		window: servingWindow.window,
		tables: [
			createFourTop("table-1", 1, 10, 1, 12.75),
			createFourTop("table-2", 2, 10, 3.5, 12.75),
			createTwoTop("table-3", 3, 10, 6, 12.75),
			createTwoTop("table-4", 4, 10, 7, 12.75),
			createTwoTop("table-5", 5, 10, 8, 12.75),
			createTwoTop("table-6", 6, 10, 9, 12.75),
		],
		door: {
			rect: shell.doorRect,
			rotationDeg: 0,
			insidePoint: point(11, 10.25),
			outsidePoint: point(11, 11.5),
			spawnPoint: point(11, 11.8),
			exitPoint: point(12.5, 13.2),
		},
		// Очередь слева от двери: четыре слота в первом ряду и два во втором.
		queue: createQueue([point(9.5, 12), point(7, 12), point(4.5, 12), point(2, 12), point(9.5, 13.3), point(7, 13.3)]),
		chefStart: { position: point(4, 5.5), facing: 0 },
		waiters: { waitPoints: [point(12.75, 1.25), point(12.75, 6.25)] },
		params: createParams({
			dishes: calibratedDishes,
			durationSec: 300,
			menu: ["burger", "ham", "veggieBurger", "stew"],
			schedule: { meanGapSec: 6.5, minGapSec: 3, groupSizeWeights: [4, 3, 2, 1], workBudgetShare: 1 },
			patience: { queueSec: 55, tableBaseSec: 44, tableEffortCoef: 1.6, tableWaiterAllowanceSec: 16 },
			waiter: { capacity: 2 },
		}),
		// Проверенные эталонным ботом seed (bot/verify.ts, задача 8.6): смена пройдена, терпение не ниже запаса, очередь не переполнена.
		// Обновление списка после смены параметров: docs/cooking.md (запустить подбор seed и вставить результат).
		verifiedSeeds: [12, 49, 83, 86, 95],
	};
}
