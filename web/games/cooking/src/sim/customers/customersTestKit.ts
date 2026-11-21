// Набор помощников для тестов клиентов и смены: расписание из списка групп, система клиентов на тестовом уровне с двойником
// навигации, ход времени и подача заказов. Используется только тестами. Владелец: SONNET-1.
import {
	SIM_STEP_SEC,
	type CustomerSystem,
	type DaySchedule,
	type DishId,
	type EventBus,
	type LevelConfig,
	type LevelParams,
	type NavSystem,
	type OrderId,
	type SimClock,
	type SimEvent,
} from "../../contracts";
import type { DeepPartial } from "../../config/levels/defaults";
import { createEventBus } from "../eventBus";
import { createFakeNavSystem } from "../testing/fakeNav";
import { createTestLevel } from "../testing/testLevel";
import { createCustomerSystem } from "./index";

// Описание группы для тестового расписания.
export interface TestGroupSpec {
	arrivalSec: number;
	dishes: DishId[];
}

// Собирает расписание из списка групп: идентификаторы по контракту (g-1, c-1-1), цены и максимум по параметрам уровня.
export function makeSchedule(level: LevelConfig, groups: readonly TestGroupSpec[]): DaySchedule {
	let totalCustomers = 0;
	let maxScore = 0;
	const scheduled = groups.map((group, groupIndex) => ({
		groupId: `g-${groupIndex + 1}`,
		arrivalSec: group.arrivalSec,
		members: group.dishes.map((dish, memberIndex) => {
			totalCustomers += 1;
			maxScore += level.params.dishes[dish].price + level.params.dishes[dish].maxTip;
			return { customerId: `c-${groupIndex + 1}-${memberIndex + 1}`, dish, variant: memberIndex };
		}),
	}));
	return { seed: 1, levelId: level.id, groups: scheduled, totalCustomers, maxScore };
}

// Параметры сборки теста клиентов.
export interface CustomerKitOptions {
	groups: readonly TestGroupSpec[];
	paramsOverrides?: DeepPartial<LevelParams>;
	// Замена полей уровня (например, меньше столов).
	levelOverrides?: Partial<LevelConfig>;
	// Навигация: по умолчанию двойник с мгновенным приходом.
	nav?: NavSystem;
}

// Система клиентов с окружением теста.
export interface CustomerKit {
	level: LevelConfig;
	schedule: DaySchedule;
	system: CustomerSystem;
	nav: NavSystem;
	bus: EventBus;
	clock: SimClock;
	// Все события с момента создания.
	events: SimEvent[];
	// Выдержать время: шаги по SIM_STEP_SEC (часы, клиенты, навигация, как в Simulation).
	advance(seconds: number): void;
	// Идти шагами, пока условие не выполнится, но не дольше maxSeconds. Возвращает, выполнилось ли условие.
	advanceUntil(condition: () => boolean, maxSeconds: number): boolean;
	// Привязать заказ к блюду и подать (как кухня и официант вместе). true, если подача прошла.
	serve(orderId: OrderId): boolean;
	eventsOf<T extends SimEvent["type"]>(type: T): Array<Extract<SimEvent, { type: T }>>;
}

// Создаёт систему клиентов на тестовом уровне.
export function createCustomerKit(options: CustomerKitOptions): CustomerKit {
	const level = createTestLevel(options.paramsOverrides ?? {}, options.levelOverrides ?? {});
	const clock: SimClock = { nowSec: 0 };
	const bus = createEventBus(clock);
	const nav = options.nav ?? createFakeNavSystem({ instant: true });
	const schedule = makeSchedule(level, options.groups);
	const system = createCustomerSystem({ level, schedule, nav, clock, bus });
	const events: SimEvent[] = [];
	bus.subscribe((event) => events.push(event));

	function stepOnce(): void {
		clock.nowSec += SIM_STEP_SEC;
		system.step(SIM_STEP_SEC);
		nav.step(SIM_STEP_SEC, level.chefStart.position);
	}

	return {
		level,
		schedule,
		system,
		nav,
		bus,
		clock,
		events,
		advance(seconds: number): void {
			const stepCount = Math.round(seconds / SIM_STEP_SEC);
			for (let step = 0; step < stepCount; step += 1) {
				stepOnce();
			}
		},
		advanceUntil(condition: () => boolean, maxSeconds: number): boolean {
			const maxSteps = Math.round(maxSeconds / SIM_STEP_SEC);
			for (let step = 0; step < maxSteps; step += 1) {
				if (condition()) {
					return true;
				}
				stepOnce();
			}
			return condition();
		},
		serve(orderId: OrderId): boolean {
			return system.markDelivering(orderId) && system.serveOrder(orderId);
		},
		eventsOf<T extends SimEvent["type"]>(type: T): Array<Extract<SimEvent, { type: T }>> {
			return events.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type);
		},
	};
}
