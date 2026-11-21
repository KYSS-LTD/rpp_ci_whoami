// Уровень easy: общая карта и кухня (sharedLayout.ts), в зале 3 стола (4, 2 и 2 места), меню из бургера и окорока, один официант, смена 180 секунд.
// Размер комнаты и планировка кухни одинаковы на всех уровнях: уровень добавляет только столы в зале.
// Параметры баланса: значения по умолчанию из defaults.ts и ниже, откалиброваны эталонным ботом (задача 8.6, bot/verify.ts).
// Владелец: Opus-агент.
import type { LevelConfig } from "../../contracts";
import { createFloors, createServingWindow, point } from "./builders";
import { calibratedDishes } from "./dishes";
import { createParams } from "./defaults";
import { EASY_TABLE_SLOTS, createHallTables, createSharedDoor, createSharedKitchenStations, createSharedQueue, createSharedShell, sharedChefStart, sharedShellSpec, sharedWaiterWaitPoints } from "./sharedLayout";

// Создаёт новый объект уровня easy.
export function createEasyLevel(): LevelConfig {
	const shell = createSharedShell();
	const servingWindow = createServingWindow(shell, 3);
	return {
		id: "easy",
		bounds: shell.bounds,
		view: shell.bounds,
		floors: createFloors(sharedShellSpec, shell),
		props: shell.props,
		colliders: [],
		stations: [...createSharedKitchenStations(), servingWindow.station],
		window: servingWindow.window,
		tables: createHallTables(EASY_TABLE_SLOTS),
		door: createSharedDoor(shell),
		queue: createSharedQueue(4),
		chefStart: { position: point(sharedChefStart.position.x, sharedChefStart.position.z), facing: sharedChefStart.facing },
		waiters: { waitPoints: sharedWaiterWaitPoints.slice(0, 1).map((waitPoint) => point(waitPoint.x, waitPoint.z)) },
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
