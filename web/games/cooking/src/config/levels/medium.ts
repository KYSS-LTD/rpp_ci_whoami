// Уровень medium: общая карта и кухня (sharedLayout.ts), в зале 4 стола (4, 4, 2 и 2 места), меню из бургера, окорока и овощного бургера, один официант, смена 240 секунд.
// Размер комнаты и планировка кухни одинаковы на всех уровнях: уровень добавляет только столы в зале.
// Параметры баланса: значения по умолчанию из defaults.ts и ниже, откалиброваны эталонным ботом (задача 8.6, bot/verify.ts).
// Владелец: Opus-агент.
import type { LevelConfig } from "../../contracts";
import { createFloors, createServingWindow, point } from "./builders";
import { calibratedDishes } from "./dishes";
import { createParams } from "./defaults";
import { MEDIUM_TABLE_SLOTS, createHallTables, createSharedDoor, createSharedKitchenStations, createSharedQueue, createSharedShell, sharedChefStart, sharedShellSpec, sharedWaiterWaitPoints } from "./sharedLayout";

// Создаёт новый объект уровня medium.
export function createMediumLevel(): LevelConfig {
	const shell = createSharedShell();
	const servingWindow = createServingWindow(shell, 3);
	return {
		id: "medium",
		bounds: shell.bounds,
		view: shell.bounds,
		floors: createFloors(sharedShellSpec, shell),
		props: shell.props,
		colliders: [],
		stations: [...createSharedKitchenStations(), servingWindow.station],
		window: servingWindow.window,
		tables: createHallTables(MEDIUM_TABLE_SLOTS),
		door: createSharedDoor(shell),
		queue: createSharedQueue(5),
		chefStart: { position: point(sharedChefStart.position.x, sharedChefStart.position.z), facing: sharedChefStart.facing },
		waiters: { waitPoints: sharedWaiterWaitPoints.slice(0, 1).map((waitPoint) => point(waitPoint.x, waitPoint.z)) },
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
		verifiedSeeds: [1, 2, 3, 6, 7, 8, 10, 11],
	};
}
