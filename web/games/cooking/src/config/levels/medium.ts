// Уровень medium: 4 стола (4, 4, 2 и 2 места), меню из бургера, окорока и овощного бургера, один официант, смена 240 секунд.
// Внутренняя ширина 14: кухня 7.5, зал 5, то есть ровно 3:2; столы стоят плотным рядом.
// Параметры баланса: значения по умолчанию из defaults.ts и ниже, откалиброваны эталонным ботом (задача 8.6, bot/verify.ts).
// Владелец: Opus-агент.
import type { LevelConfig } from "../../contracts";
import { createFloors, createCrate, createFourTop, createQueue, createServingWindow, createShell, createStation, createTwoTop, point, type ShellSpec } from "./builders";
import { calibratedDishes } from "./dishes";
import { createParams } from "./defaults";

// Описание оболочки уровня: ширина 14, внутри 8 в глубину, улица 3.5.
const shellSpec: ShellSpec = {
	width: 14,
	interiorDepth: 8,
	streetDepth: 3.5,
	dividerX: 8,
	doorX: 10,
	// Сверху вниз по 2: стена, окно выдачи (станция), проход кухня-зал, стена.
	dividerKinds: ["wall", "skip", "doorway", "wall"],
};

// Создаёт новый объект уровня medium.
export function createMediumLevel(): LevelConfig {
	const shell = createShell(shellSpec);
	const servingWindow = createServingWindow(shell, 3);
	return {
		id: "medium",
		bounds: shell.bounds,
		view: shell.bounds,
		floors: createFloors(shellSpec, shell),
		props: shell.props,
		colliders: [],
		stations: [
			// Сетка кухни: клетки 1 x 1 по x = 1..7 и z = 0.5, 1.5, ... (полоса 0.5 у западной стены свободна), всё стоит по рядам.
			// Северный ряд: ящики с ингредиентами и прилавок.
			createCrate("steak", 1, 0.5),
			createCrate("bun", 2, 0.5),
			createCrate("ham", 3, 0.5),
			createCrate("potato", 4, 0.5),
			createCrate("carrot", 5, 0.5),
			createCrate("onion", 6, 0.5),
			createStation("counter-1", "counter", 6, 2.5, 270),
			// Тарелки рядом с окном выдачи, но не перед ним: клетки напротив окна остаются свободными.
			createStation("plates-1", "plateStack", 7, 1.5, 270),
			// Западный ряд: прилавки и стол с кастрюлей.
			createStation("counter-3", "counter", 1, 2.5, 90),
			createStation("counter-4", "counter", 1, 3.5, 90),
			createStation("pot-table", "counter", 1, 4.5, 90, { startItem: "pot" }),
			// Остров с тремя разделочными досками.
			createStation("board-1", "cuttingBoard", 3, 3.5),
			createStation("board-2", "cuttingBoard", 4, 3.5),
			createStation("board-3", "cuttingBoard", 5, 3.5),
			// Южный ряд: урна рядом с плитами, три плиты со сковородой, духовка, плита для кастрюли, кран.
			createStation("trash-1", "trash", 1, 7.5, 90),
			createStation("pan-1", "pan", 2, 7.5, 180),
			createStation("pan-2", "pan", 3, 7.5, 180),
			createStation("pan-3", "pan", 4, 7.5, 180),
			createStation("oven-1", "oven", 5, 7.5, 180),
			createStation("stove-1", "stove", 6, 7.5, 180),
			createStation("tap-1", "tap", 7, 7.5, 180),
			createStation("counter-2", "counter", 1, 5.5, 90),
			servingWindow.station,
		],
		window: servingWindow.window,
		tables: [
			createFourTop("table-1", 1, 10, 1, 12.75),
			createFourTop("table-2", 2, 10, 3.5, 12.75),
			createTwoTop("table-3", 3, 10, 6, 12.75),
			createTwoTop("table-4", 4, 10, 7, 12.75),
		],
		door: {
			rect: shell.doorRect,
			rotationDeg: 0,
			insidePoint: point(11, 8.25),
			outsidePoint: point(11, 9.5),
			spawnPoint: point(11, 9.8),
			exitPoint: point(12.5, 11.2),
		},
		// Очередь слева от двери: четыре слота в первом ряду и один во втором.
		queue: createQueue([point(9.5, 10), point(7, 10), point(4.5, 10), point(2, 10), point(9.5, 11.3)]),
		chefStart: { position: point(4, 2.5), facing: 4 },
		waiters: { waitPoints: [point(12.75, 1.25)] },
		params: createParams({
			dishes: calibratedDishes,
			durationSec: 240,
			menu: ["burger", "ham", "veggieBurger"],
			schedule: { meanGapSec: 10, minGapSec: 5, groupSizeWeights: [4, 3, 2, 1], workBudgetShare: 0.82 },
			patience: { queueSec: 65, tableBaseSec: 48, tableEffortCoef: 1.7, tableWaiterAllowanceSec: 17 },
			waiter: { capacity: 1 },
		}),
		// Проверенные эталонным ботом seed (bot/verify.ts, задача 8.6): смена пройдена, терпение не ниже запаса, очередь не переполнена.
		// Обновление списка после смены параметров: docs/cooking.md (запустить подбор seed и вставить результат).
		verifiedSeeds: [1, 2, 3, 4, 6, 7, 8, 10],
	};
}
