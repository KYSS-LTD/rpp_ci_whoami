// Уровень easy: небольшой ресторан, 3 стола (4, 2 и 2 места), меню из бургера и окорока, один официант, смена 180 секунд.
// Внутренняя ширина 14: кухня 7.5, зал 5, то есть ровно 3:2; пол easy укорочен до 6 единиц глубины.
// Параметры баланса: значения по умолчанию из defaults.ts и ниже, откалиброваны эталонным ботом (задача 8.6, bot/verify.ts).
// Владелец: Opus-агент.
import type { LevelConfig } from "../../contracts";
import { createFloors, createCrate, createFourTop, createQueue, createServingWindow, createShell, createStation, createTwoTop, point, type ShellSpec } from "./builders";
import { calibratedDishes } from "./dishes";
import { createParams } from "./defaults";

// Описание оболочки уровня: ширина 14, внутри 6 в глубину, улица 3.
const shellSpec: ShellSpec = {
	width: 14,
	interiorDepth: 6,
	streetDepth: 3,
	dividerX: 8,
	doorX: 10,
	// Сверху вниз по 2: стена, окно выдачи (станция), проход кухня-зал.
	dividerKinds: ["wall", "skip", "doorway"],
};

// Создаёт новый объект уровня easy.
export function createEasyLevel(): LevelConfig {
	const shell = createShell(shellSpec);
	const servingWindow = createServingWindow(shell, 3);
	return {
		id: "easy",
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
			// Западный ряд: прилавок и стол с кастрюлей.
			createStation("counter-3", "counter", 1, 2.5, 90),
			createStation("pot-table", "counter", 1, 3.5, 90, { startItem: "pot" }),
			// Остров с двумя разделочными досками.
			createStation("board-1", "cuttingBoard", 3, 3.5),
			createStation("board-2", "cuttingBoard", 4, 3.5),
			// Южный ряд: урна рядом с плитами, две плиты со сковородой, духовка, плита для кастрюли, кран и прилавок.
			createStation("trash-1", "trash", 1, 5.5, 90),
			createStation("pan-1", "pan", 2, 5.5, 180),
			createStation("pan-2", "pan", 3, 5.5, 180),
			createStation("oven-1", "oven", 4, 5.5, 180),
			createStation("stove-1", "stove", 5, 5.5, 180),
			createStation("tap-1", "tap", 6, 5.5, 180),
			createStation("counter-2", "counter", 7, 5.5, 270),
			servingWindow.station,
		],
		window: servingWindow.window,
		// Все столы левым краем на x = 10, ряды вплотную: стулья стоят в одних колонках.
		tables: [createFourTop("table-1", 1, 10, 1, 12.75), createTwoTop("table-2", 2, 10, 3, 12.75), createTwoTop("table-3", 3, 10, 4, 12.75)],
		door: {
			rect: shell.doorRect,
			rotationDeg: 0,
			insidePoint: point(11, 6.25),
			outsidePoint: point(11, 7.5),
			spawnPoint: point(11, 7.8),
			exitPoint: point(12.5, 9.5),
		},
		// Очередь слева от двери: четыре слота в один ряд.
		queue: createQueue([point(10, 8.5), point(7.5, 8.5), point(5, 8.5), point(2.5, 8.5)]),
		chefStart: { position: point(4, 2.5), facing: 4 },
		waiters: { waitPoints: [point(12.75, 1.25)] },
		params: createParams({
			dishes: calibratedDishes,
			durationSec: 180,
			menu: ["burger", "ham"],
			schedule: { meanGapSec: 17, minGapSec: 9, groupSizeWeights: [4, 3, 2, 1], workBudgetShare: 0.62 },
			patience: { queueSec: 80, tableBaseSec: 55, tableEffortCoef: 2, tableWaiterAllowanceSec: 20 },
			waiter: { capacity: 1 },
		}),
		// Проверенные эталонным ботом seed (bot/verify.ts, задача 8.6): смена пройдена, терпение не ниже запаса, очередь не переполнена.
		// Обновление списка после смены параметров: docs/cooking.md (запустить подбор seed и вставить результат).
		verifiedSeeds: [2, 3, 4, 6, 7, 9, 10, 11],
	};
}
