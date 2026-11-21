// Уровень hard: 6 столов (4, 4, 2, 2, 2 и 2 места), меню из четырёх блюд (добавляется рагу), два официанта по две тарелки,
// смена 300 секунд.
// Схема (x вправо, z вниз, прилавок 1 x 1, клетка 0.5): кухня слева (x 0.5..9), разделяющая стена x 9..9.5 с окном выдачи
// (z 2.5..4.5) и проходом (z 4.5..6.5), зал справа (x 9.5..21.5, z 0.5..10.5), улица под передней стеной (z 11..14)
// с очередью слева от двери в два ряда.
// Параметры баланса: значения по умолчанию из defaults.ts и ниже, откалиброваны эталонным ботом (задача 8.6, bot/verify.ts).
// Владелец: Opus-агент.
import type { LevelConfig } from "../../contracts";
import { createFloors, createCrate, createFourTop, createQueue, createServingWindow, createShell, createStation, createTwoTop, point, type ShellSpec } from "./builders";
import { calibratedDishes } from "./dishes";
import { createParams } from "./defaults";

// Описание оболочки уровня: ширина 22, внутри 10 в глубину, улица 3.
const shellSpec: ShellSpec = {
	width: 22,
	interiorDepth: 10,
	streetDepth: 3,
	dividerX: 9,
	doorX: 12,
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
			// Северный ряд: тарелки и ящики всех ингредиентов меню (рагу: морковь, картофель, лук).
			createStation("plates-1", "plateStack", 0.5, 0.5),
			createCrate("steak", 1.5, 0.5),
			createCrate("bun", 2.5, 0.5),
			createCrate("ham", 3.5, 0.5),
			createCrate("potato", 4.5, 0.5),
			createCrate("carrot", 5.5, 0.5),
			createCrate("onion", 6.5, 0.5),
			// Прилавки: у окна выдачи и у западной стены.
			createStation("counter-1", "counter", 8, 1.5, 270),
			createStation("counter-2", "counter", 8, 7, 270),
			createStation("counter-3", "counter", 0.5, 3.5, 90, { model: "kitchencounter_sink" }),
			createStation("counter-4", "counter", 0.5, 4.5, 90),
			createStation("counter-5", "counter", 0.5, 5.5, 90),
			// Остров с тремя разделочными досками.
			createStation("board-1", "cuttingBoard", 3, 3),
			createStation("board-2", "cuttingBoard", 4, 3),
			createStation("board-3", "cuttingBoard", 5, 3),
			// Остров с плитами: три сковороды, кастрюля для рагу, духовка.
			createStation("pan-1", "pan", 3, 6),
			createStation("pan-2", "pan", 4, 6),
			createStation("pan-3", "pan", 5, 6),
			createStation("pot-1", "pot", 6, 6),
			createStation("oven-1", "oven", 7, 6),
			// Южный ряд: урна.
			createStation("trash-1", "trash", 0.5, 9.5, 90),
			servingWindow.station,
		],
		window: servingWindow.window,
		tables: [
			createFourTop("table-1", 1, 12, 2),
			createFourTop("table-2", 2, 17, 2),
			createTwoTop("table-3", 3, 12, 6.5),
			createTwoTop("table-4", 4, 15.5, 6.5),
			createTwoTop("table-5", 5, 19, 6.5),
			createTwoTop("table-6", 6, 17, 9),
		],
		door: {
			rect: shell.doorRect,
			rotationDeg: 0,
			insidePoint: point(13, 10),
			outsidePoint: point(13, 11.5),
			spawnPoint: point(18, 11.8),
			exitPoint: point(19.5, 13.2),
		},
		// Очередь слева от двери: четыре слота в первом ряду и два во втором.
		queue: createQueue([point(10.6, 11.8), point(8.1, 11.8), point(5.6, 11.8), point(3.1, 11.8), point(10.6, 13.3), point(8.1, 13.3)]),
		chefStart: { position: point(4, 5), facing: 0 },
		waiters: { waitPoints: [point(10.25, 1.25), point(10.25, 5.75)] },
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
		verifiedSeeds: [1, 7, 8, 12, 43, 45, 65, 69],
	};
}
