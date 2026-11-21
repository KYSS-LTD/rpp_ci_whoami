// Параметры уровня по умолчанию (начальные значения баланса из design.md). Уровни easy, medium и hard берут их отсюда
// и переопределяют нужное; значения калибруются эталонным ботом (задача 8.6). Владелец: Opus-агент.
// Все числа баланса лежат здесь и в файлах уровней, а не в коде симуляции.
import type { LevelParams } from "../../contracts";

// Рекурсивно необязательный тип: для переопределения части параметров.
export type DeepPartial<T> = {
	[Key in keyof T]?: T[Key] extends readonly unknown[] ? T[Key] : T[Key] extends object ? DeepPartial<T[Key]> : T[Key];
};

// Возвращает новый объект параметров по умолчанию (копия, чтобы тесты не портили общие данные).
export function createDefaultParams(): LevelParams {
	return {
		durationSec: 180,
		menu: ["burger", "ham"],
		dishes: {
			// Значения для тестов областей. Откалиброванные значения настоящих уровней: dishes.ts.
			burger: { price: 10, maxTip: 5, effort: 16 },
			ham: { price: 14, maxTip: 6, effort: 10 },
			steak: { price: 11, maxTip: 5, effort: 12 },
			veggieBurger: { price: 12, maxTip: 6, effort: 20 },
			stew: { price: 18, maxTip: 8, effort: 22 },
		},
		schedule: {
			flowCloseBeforeEndSec: 60,
			firstArrivalSec: 5,
			meanGapSec: 18,
			minGapSec: 8,
			groupSizeWeights: [4, 3, 2, 1],
			workBudgetShare: 0.7,
			workWindowSec: 60,
			botCapacity: 1,
		},
		patience: {
			queueSec: 60,
			tableBaseSec: 40,
			tableEffortCoef: 1.5,
			tableWaiterAllowanceSec: 15,
		},
		customers: {
			eatSec: 12,
			seatingBypassSec: 20,
			speed: 2.4,
		},
		kitchen: {
			cutSec: 2,
			// Доска режет на 20% быстрее прилавка, готовка на плите, в духовке и в кастрюле на 20% быстрее (подгорание не меняется).
			boardCutDurationFactor: 0.8,
			cookDurationFactor: 0.8,
			cooking: {
				patty: { cookSec: 6, burnSec: 6 },
				veggiePatty: { cookSec: 6, burnSec: 6 },
				friedSteak: { cookSec: 6, burnSec: 6 },
				ham: { cookSec: 8, burnSec: 8 },
				// Рагу в кастрюле не пригорает: конфорка выключается сама.
				stew: { cookSec: 10, burnSec: null },
			},
			potCapacity: 3,
			stewPortionsPerBatch: 2,
		},
		player: {
			speed: 3.6,
			radius: 0.3,
			reach: 0.9,
			targetTolerance: 0.45,
			facingHysteresisDeg: 8,
			facingDeadzone: 0.2,
		},
		nav: {
			agentRadius: 0.25,
			arriveDistance: 0.15,
			separationRadius: 0.6,
			separationStrength: 1.5,
			stuckTimeoutSec: 1.5,
			stuckMinProgress: 0.2,
		},
		waiter: {
			capacity: 1,
			speed: 3,
			handoffSec: 0.4,
		},
	};
}

// Параметры по умолчанию с переопределением части значений (глубокое слияние объектов; массивы заменяются целиком).
export function createParams(overrides: DeepPartial<LevelParams> = {}): LevelParams {
	return mergeDeep(createDefaultParams(), overrides);
}

// Глубокое слияние: объекты сливаются по ключам, остальные значения (числа, массивы) заменяются.
function mergeDeep<T extends object>(target: T, source: DeepPartial<T>): T {
	const targetRecord = target as Record<string, unknown>;
	for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
		const current = targetRecord[key];
		if (value !== null && typeof value === "object" && !Array.isArray(value) && current !== null && typeof current === "object") {
			mergeDeep(current as object, value as DeepPartial<object>);
		} else if (value !== undefined) {
			targetRecord[key] = value;
		}
	}
	return target;
}
