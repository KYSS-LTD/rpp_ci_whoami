// Уровень easy: небольшой ресторан, 3 стола (4, 2 и 2 места), меню из бургера и окорока, один официант, смена 180 секунд.
// Схема (x вправо, z вниз, прилавок 1 x 1, клетка 0.5): кухня слева (x 0.5..7), разделяющая стена x 7..7.5 с окном выдачи
// (z 2.5..4.5) и проходом (z 4.5..6.5), зал справа (x 7.5..17.5), улица под передней стеной (z 9..12) с очередью слева от двери.
// Параметры баланса: значения по умолчанию из defaults.ts и ниже, откалиброваны эталонным ботом (задача 8.6, bot/verify.ts).
// Владелец: Opus-агент.
import type { LevelConfig } from "../../contracts";
import { createFloors, createCrate, createFourTop, createQueue, createServingWindow, createShell, createStation, createTwoTop, point, type ShellSpec } from "./builders";
import { calibratedDishes } from "./dishes";
import { createParams } from "./defaults";

// Описание оболочки уровня: ширина 18, внутри 8 в глубину, улица 3.
const shellSpec: ShellSpec = {
	width: 18,
	interiorDepth: 8,
	streetDepth: 3,
	dividerX: 7,
	doorX: 10,
	// Сверху вниз по 2: стена, окно выдачи (станция), проход кухня-зал, стена.
	dividerKinds: ["wall", "skip", "doorway", "wall"],
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
			// Северный ряд: тарелки и ящики с ингредиентами меню (бургер: стейк и булочка, окорок: ветчина).
			createStation("plates-1", "plateStack", 0.5, 0.5),
			createCrate("steak", 1.5, 0.5),
			createCrate("bun", 2.5, 0.5),
			createCrate("ham", 3.5, 0.5),
			// Прилавки: у окна выдачи и у западной стены.
			createStation("counter-1", "counter", 6, 1.5, 270),
			createStation("counter-2", "counter", 6, 5.5, 270),
			createStation("counter-3", "counter", 0.5, 3.5, 90, { model: "kitchencounter_sink" }),
			// Остров с двумя разделочными досками.
			createStation("board-1", "cuttingBoard", 3, 4),
			createStation("board-2", "cuttingBoard", 4, 4),
			// Южный ряд: урна, две плиты со сковородой, духовка.
			createStation("trash-1", "trash", 0.5, 7.5, 90),
			createStation("pan-1", "pan", 2, 7.5, 180),
			createStation("pan-2", "pan", 3, 7.5, 180),
			createStation("oven-1", "oven", 4, 7.5, 180),
			servingWindow.station,
		],
		window: servingWindow.window,
		tables: [createFourTop("table-1", 1, 11, 3), createTwoTop("table-2", 2, 14.5, 1.5), createTwoTop("table-3", 3, 14.5, 5.5)],
		door: {
			rect: shell.doorRect,
			rotationDeg: 0,
			insidePoint: point(11, 8),
			outsidePoint: point(11, 9.5),
			spawnPoint: point(15, 9.8),
			exitPoint: point(16.5, 11.2),
		},
		// Очередь слева от двери: четыре слота в один ряд.
		queue: createQueue([point(8.6, 9.8), point(6.1, 9.8), point(3.6, 9.8), point(1.1, 9.8)]),
		chefStart: { position: point(3.5, 2.75), facing: 4 },
		waiters: { waitPoints: [point(8.25, 2.25)] },
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
