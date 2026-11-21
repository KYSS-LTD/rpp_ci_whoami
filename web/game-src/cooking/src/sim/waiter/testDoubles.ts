// Подменные таблица заказов (OrderBoard) и окно выдачи (ServingWindow) для тестов официантов: настоящие кухню и клиентов
// пишет SONNET-1 параллельно. Реализуют только то, что нужно официанту и тестам. Владелец: SONNET-2 (geometry-control-nav).
import type { DishId, LevelConfig, Order, OrderBoard, OrderId, PlateItem, ServingWindow, SimClock, WindowAcceptResult, WindowDish } from "../../contracts";

// Таблица заказов для тестов.
export interface FakeOrderBoard extends OrderBoard {
	// Создаёт заказ на место seatIndex стола с номером позиции tableIndex в level.tables (статус waiting).
	createOrder(tableIndex: number, seatIndex: number, dish: DishId): Order;
	// Идентификаторы поданных заказов в порядке подачи.
	readonly servedOrderIds: OrderId[];
}

// Окно выдачи для тестов.
export interface FakeServingWindow extends ServingWindow {
	// Кладёт готовое блюдо в окно для заказа (как делает окно кухни: заказ waiting -> delivering).
	addDish(dish: DishId, orderId: OrderId): WindowDish;
}

// Создаёт таблицу заказов. onServe вызывается в момент подачи (заказ уже помечен поданным).
export function createFakeOrderBoard(level: LevelConfig, clock: SimClock, onServe?: (order: Order) => void): FakeOrderBoard {
	const orders: Order[] = [];
	const servedOrderIds: OrderId[] = [];
	return {
		servedOrderIds,
		createOrder(tableIndex: number, seatIndex: number, dish: DishId): Order {
			const table = level.tables[tableIndex];
			const seat = table.seats[seatIndex];
			const number = orders.length + 1;
			const order: Order = {
				id: `o-c-${number}-1`,
				customerId: `c-${number}-1`,
				groupId: `g-${number}`,
				tableId: table.id,
				tableNumber: table.number,
				seatIndex,
				dish,
				status: "waiting",
				createdAtSec: clock.nowSec,
				servePoint: { ...seat.servePoint },
				dishPoint: { ...seat.dishPoint },
				patienceTotalSec: 60,
				patienceLeftSec: 60,
			};
			orders.push(order);
			return order;
		},
		getOrders(): readonly Order[] {
			return orders;
		},
		getOrder(orderId: OrderId): Order | undefined {
			return orders.find((order) => order.id === orderId);
		},
		findEarliestWaitingOrder(dish: DishId): Order | null {
			return orders.find((order) => order.status === "waiting" && order.dish === dish) ?? null;
		},
		markDelivering(orderId: OrderId): boolean {
			const order = orders.find((candidate) => candidate.id === orderId);
			if (!order || order.status !== "waiting") {
				return false;
			}
			order.status = "delivering";
			return true;
		},
		serveOrder(orderId: OrderId): boolean {
			const order = orders.find((candidate) => candidate.id === orderId);
			if (!order || order.status !== "delivering") {
				return false;
			}
			order.status = "served";
			servedOrderIds.push(orderId);
			onServe?.(order);
			return true;
		},
	};
}

// Создаёт окно выдачи. Слоты берутся по порядку из level.window.dishPoints.
export function createFakeServingWindow(level: LevelConfig, orders: OrderBoard, clock: SimClock): FakeServingWindow {
	const dishes: WindowDish[] = [];
	let counter = 0;

	// Первый свободный слот или -1, если окно заполнено.
	function firstFreeSlot(): number {
		for (let slot = 0; slot < level.window.dishPoints.length; slot += 1) {
			if (!dishes.some((dish) => dish.slotIndex === slot)) {
				return slot;
			}
		}
		return -1;
	}

	function addDish(dish: DishId, orderId: OrderId): WindowDish {
		orders.markDelivering(orderId);
		counter += 1;
		const windowDish: WindowDish = { id: `wd-${counter}`, dish, orderId, slotIndex: Math.max(0, firstFreeSlot()), acceptedAtSec: clock.nowSec };
		dishes.push(windowDish);
		return windowDish;
	}

	return {
		addDish,
		tryAccept(plate: PlateItem): WindowAcceptResult {
			if (plate.dish === null) {
				return { ok: false, reason: "dishNotReady" };
			}
			const order = orders.findEarliestWaitingOrder(plate.dish);
			if (!order) {
				return { ok: false, reason: "noOpenOrder" };
			}
			if (firstFreeSlot() < 0) {
				return { ok: false, reason: "windowFull" };
			}
			return { ok: true, windowDish: addDish(plate.dish, order.id) };
		},
		getDishes(): readonly WindowDish[] {
			return dishes;
		},
		takeDish(windowDishId: string): WindowDish | null {
			const position = dishes.findIndex((dish) => dish.id === windowDishId);
			if (position < 0) {
				return null;
			}
			return dishes.splice(position, 1)[0];
		},
	};
}
