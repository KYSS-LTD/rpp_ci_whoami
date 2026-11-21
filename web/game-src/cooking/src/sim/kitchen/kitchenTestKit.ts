// Набор помощников для тестов кухни: тестовая таблица заказов, кухня на тестовом уровне и короткие действия повара.
// Используется только тестами (sim/kitchen/*.test.ts). Владелец: SONNET-1.
import {
	SIM_STEP_SEC,
	type DishId,
	type InteractResult,
	type Item,
	type Kitchen,
	type Order,
	type OrderBoard,
	type SimClock,
	type SimEvent,
	type StationId,
	type StationSnapshot,
} from "../../contracts";
import type { DeepPartial } from "../../config/levels/defaults";
import type { LevelParams } from "../../contracts";
import { createEventBus } from "../eventBus";
import { createTestLevel } from "../testing/testLevel";
import { createKitchen } from "./index";

// Тестовая таблица заказов: хранит заказы и реализует то, что нужно кухне.
export interface FakeOrderBoard extends OrderBoard {
	// Добавляет открытый заказ (статус waiting) на блюдо и возвращает его.
	addOrder(dish: DishId): Order;
}

// Создаёт тестовую таблицу заказов. Время создания берётся из часов.
export function createFakeOrderBoard(clock: SimClock): FakeOrderBoard {
	const orders: Order[] = [];
	return {
		addOrder(dish: DishId): Order {
			const number = orders.length + 1;
			const order: Order = {
				id: `o-c-${number}-1`,
				customerId: `c-${number}-1`,
				groupId: `g-${number}`,
				tableId: "table-1",
				tableNumber: 1,
				seatIndex: 0,
				dish,
				status: "waiting",
				createdAtSec: clock.nowSec,
				servePoint: { x: 9, z: 2 },
				dishPoint: { x: 10.2, z: 2 },
				patienceTotalSec: 60,
				patienceLeftSec: 60,
			};
			orders.push(order);
			return order;
		},
		getOrders(): readonly Order[] {
			return orders;
		},
		getOrder(orderId: string): Order | undefined {
			return orders.find((order) => order.id === orderId);
		},
		findEarliestWaitingOrder(dish: DishId): Order | null {
			return orders.find((order) => order.status === "waiting" && order.dish === dish) ?? null;
		},
		markDelivering(orderId: string): boolean {
			const order = orders.find((candidate) => candidate.id === orderId);
			if (!order || order.status !== "waiting") {
				return false;
			}
			order.status = "delivering";
			return true;
		},
		serveOrder(orderId: string): boolean {
			const order = orders.find((candidate) => candidate.id === orderId);
			if (!order || order.status !== "delivering") {
				return false;
			}
			order.status = "served";
			return true;
		},
	};
}

// Кухня на тестовом уровне со всем, что нужно тесту.
export interface KitchenKit {
	kitchen: Kitchen;
	orders: FakeOrderBoard;
	clock: SimClock;
	// Все события с момента создания (накапливаются).
	events: SimEvent[];
	// Нажать "взять/положить" на станции.
	tap(stationId: StationId): InteractResult;
	// Выдержать время: шаги по SIM_STEP_SEC, часы идут вместе с кухней. work: станция с удерживаемой работой.
	advance(seconds: number, workStationId?: StationId | null): void;
	// Снимок одной станции.
	station(stationId: StationId): StationSnapshot;
	// Рука как данные.
	hand(): Item | null;
	// События заданного типа.
	eventsOf<T extends SimEvent["type"]>(type: T): Array<Extract<SimEvent, { type: T }>>;
}

// Создаёт кухню на createTestLevel. paramsOverrides меняет параметры уровня (время готовки и так далее).
export function createKitchenKit(paramsOverrides: DeepPartial<LevelParams> = {}): KitchenKit {
	const clock: SimClock = { nowSec: 0 };
	const bus = createEventBus(clock);
	const orders = createFakeOrderBoard(clock);
	const level = createTestLevel(paramsOverrides);
	const kitchen = createKitchen({ level, orders, clock, bus });
	const events: SimEvent[] = [];
	bus.subscribe((event) => events.push(event));

	return {
		kitchen,
		orders,
		clock,
		events,
		tap(stationId: StationId): InteractResult {
			return kitchen.interact(stationId);
		},
		advance(seconds: number, workStationId: StationId | null = null): void {
			const stepCount = Math.round(seconds / SIM_STEP_SEC);
			for (let step = 0; step < stepCount; step += 1) {
				kitchen.setWork(workStationId);
				clock.nowSec += SIM_STEP_SEC;
				kitchen.step(SIM_STEP_SEC);
			}
		},
		station(stationId: StationId): StationSnapshot {
			const found = kitchen.getStationSnapshots().find((snapshot) => snapshot.id === stationId);
			if (!found) {
				throw new Error(`нет станции ${stationId}`);
			}
			return found;
		},
		hand(): Item | null {
			return kitchen.getHand();
		},
		eventsOf<T extends SimEvent["type"]>(type: T): Array<Extract<SimEvent, { type: T }>> {
			return events.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type);
		},
	};
}

// ----------------------------------------------------------------------------
// Короткие цепочки действий повара для тестов
// ----------------------------------------------------------------------------

// Нарезает сырой ингредиент из ящика на доске и оставляет нарезанное в руке (рука должна быть пуста).
export function chopFromCrate(kit: KitchenKit, crateId: StationId, boardId: StationId): void {
	kit.tap(crateId);
	kit.tap(boardId);
	kit.advance(2.1, boardId);
	kit.tap(boardId);
}

// Готовит котлету на сковороде: стейк из ящика, резка, сковорода, ожидание готовности (без забора).
export function startPatty(kit: KitchenKit, panId: StationId): void {
	chopFromCrate(kit, "crate-steak", "board-1");
	kit.tap(panId);
	kit.advance(6.1);
}

// Собирает на тарелке в руке готовый бургер (рука пуста). Занимает прилавок counter-1 и сковороду pan-1.
export function assembleBurger(kit: KitchenKit): void {
	kit.tap("crate-bun");
	kit.tap("counter-1");
	startPatty(kit, "pan-1");
	kit.tap("plates-1");
	kit.tap("counter-1");
	kit.tap("pan-1");
}
