// Уровень hard: общая карта и кухня (sharedLayout.ts), в зале 6 столов (4, 4, 2, 2, 2 и 2 места), меню из четырёх блюд (добавляется рагу), два официанта по две тарелки, смена 300 секунд.
// Размер комнаты и планировка кухни одинаковы на всех уровнях: уровень добавляет только столы в зале.
// Параметры баланса: значения по умолчанию из defaults.ts и ниже, откалиброваны эталонным ботом (задача 8.6, bot/verify.ts).
// Владелец: Opus-агент.
import type { LevelConfig } from "../../contracts";
import { createServingWindow, point } from "./builders";
import { calibratedDishes } from "./dishes";
import { createParams } from "./defaults";
import { HARD_TABLE_SLOTS, createHallTables, createSharedDoor, createSharedFloors, createSharedKitchenStations, createSharedQueue, createSharedShell, sharedChefStart, sharedWaiterWaitPoints } from "./sharedLayout";

// Создаёт новый объект уровня hard.
export function createHardLevel(): LevelConfig {
	const shell = createSharedShell();
	const servingWindow = createServingWindow(shell, 3);
	return {
		id: "hard",
		bounds: shell.bounds,
		view: shell.bounds,
		floors: createSharedFloors(shell),
		props: shell.props,
		colliders: [],
		stations: [...createSharedKitchenStations(), servingWindow.station],
		window: servingWindow.window,
		tables: createHallTables(HARD_TABLE_SLOTS),
		door: createSharedDoor(shell),
		queue: createSharedQueue(6),
		chefStart: { position: point(sharedChefStart.position.x, sharedChefStart.position.z), facing: sharedChefStart.facing },
		waiters: { waitPoints: sharedWaiterWaitPoints.slice(0, 2).map((waitPoint) => point(waitPoint.x, waitPoint.z)) },
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
