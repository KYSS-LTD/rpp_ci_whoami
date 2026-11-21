// Уровень medium: 4 стола (4, 4, 2 и 2 места), меню из бургера, окорока и овощного бургера, один официант, смена 240 секунд.
// Схема (x вправо, z вниз, прилавок 1 x 1, клетка 0.5): кухня слева (x 0.5..8), разделяющая стена x 8..8.5 с окном выдачи
// (z 2.5..4.5) и проходом (z 4.5..6.5), зал справа (x 8.5..19.5), улица под передней стеной (z 9..12.5) с очередью слева от двери.
// Параметры баланса: значения по умолчанию из defaults.ts и ниже, откалиброваны эталонным ботом (задача 8.6, bot/verify.ts).
// Владелец: Opus-агент.
import type { LevelConfig } from "../../contracts";
import { createFloors, createCrate, createFourTop, createQueue, createServingWindow, createShell, createStation, createTwoTop, point, type ShellSpec } from "./builders";
import { calibratedDishes } from "./dishes";
import { createParams } from "./defaults";

// Описание оболочки уровня: ширина 20, внутри 8 в глубину, улица 3.5.
const shellSpec: ShellSpec = {
	width: 20,
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
			// Северный ряд: тарелки и ящики (бургер: стейк и булочка, окорок: ветчина, овощной бургер: картофель и морковь).
			createStation("plates-1", "plateStack", 0.5, 0.5),
			createCrate("steak", 1.5, 0.5),
			createCrate("bun", 2.5, 0.5),
			createCrate("ham", 3.5, 0.5),
			createCrate("potato", 4.5, 0.5),
			createCrate("carrot", 5.5, 0.5),
			// Прилавки: у окна выдачи и у западной стены.
			createStation("counter-1", "counter", 7, 1.5, 270),
			createStation("counter-2", "counter", 7, 5.5, 270),
			createStation("counter-3", "counter", 0.5, 3.5, 90, { model: "kitchencounter_sink" }),
			createStation("counter-4", "counter", 0.5, 4.5, 90),
			// Остров с тремя разделочными досками.
			createStation("board-1", "cuttingBoard", 3, 4),
			createStation("board-2", "cuttingBoard", 4, 4),
			createStation("board-3", "cuttingBoard", 5, 4),
			// Южный ряд: урна, три плиты со сковородой, духовка.
			createStation("trash-1", "trash", 0.5, 7.5, 90),
			createStation("pan-1", "pan", 2, 7.5, 180),
			createStation("pan-2", "pan", 3, 7.5, 180),
			createStation("pan-3", "pan", 4, 7.5, 180),
			createStation("oven-1", "oven", 5, 7.5, 180),
			servingWindow.station,
		],
		window: servingWindow.window,
		tables: [
			createFourTop("table-1", 1, 10.5, 2),
			createFourTop("table-2", 2, 15, 2),
			createTwoTop("table-3", 3, 13.5, 6),
			createTwoTop("table-4", 4, 17, 6),
		],
		door: {
			rect: shell.doorRect,
			rotationDeg: 0,
			insidePoint: point(11, 8),
			outsidePoint: point(11, 9.5),
			spawnPoint: point(16, 9.8),
			exitPoint: point(17.5, 11.2),
		},
		// Очередь слева от двери: четыре слота в первом ряду и один во втором.
		queue: createQueue([point(8.6, 9.8), point(6.1, 9.8), point(3.6, 9.8), point(1.1, 9.8), point(8.6, 11.3)]),
		chefStart: { position: point(3.5, 2.75), facing: 4 },
		waiters: { waitPoints: [point(9.25, 1.25)] },
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
