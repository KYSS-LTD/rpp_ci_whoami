// Окно выдачи (задача 2.9): принимает только готовое блюдо с открытым заказом, привязывает его к самому раннему
// заказу того же блюда (статус "в доставке") и хранит до забора официантом. Реализует ServingWindow из contracts.ts.
// Резервирование блюд за официантами ведёт система официантов, окно о нём не знает. Владелец: SONNET-1.
import type { AssemblyItem, EventSink, LevelConfig, OrderBoard, ServingWindow, SimClock, WindowAcceptResult, WindowDish, WindowDishId } from "../../contracts";

// Зависимости окна.
export interface ServingWindowDeps {
	level: LevelConfig;
	orders: OrderBoard;
	clock: SimClock;
	bus: EventSink;
}

// Создаёт окно выдачи. Вместимость равна числу точек LevelConfig.window.dishPoints, слоты заполняются по порядку.
export function createServingWindow(deps: ServingWindowDeps): ServingWindow {
	const capacity = deps.level.window.dishPoints.length;
	// Блюда в порядке приёма (FIFO).
	const dishes: WindowDish[] = [];
	// Счётчик для идентификаторов "wd-<номер>".
	let nextDishNumber = 1;

	// Первый свободный слот или -1, если окно заполнено.
	function findFreeSlot(): number {
		for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
			if (!dishes.some((dish) => dish.slotIndex === slotIndex)) {
				return slotIndex;
			}
		}
		return -1;
	}

	return {
		tryAccept(plate: AssemblyItem): WindowAcceptResult {
			// Принимается только готовое блюдо: тарелка, содержимое которой совпало с рецептом.
			if (plate.dish === null) {
				return { ok: false, reason: "dishNotReady" };
			}
			const order = deps.orders.findEarliestWaitingOrder(plate.dish);
			if (!order) {
				return { ok: false, reason: "noOpenOrder" };
			}
			const slotIndex = findFreeSlot();
			if (slotIndex < 0) {
				return { ok: false, reason: "windowFull" };
			}
			// Привязка к самому раннему заказу: заказ переходит в статус "в доставке".
			if (!deps.orders.markDelivering(order.id)) {
				return { ok: false, reason: "noOpenOrder" };
			}
			const windowDish: WindowDish = {
				id: `wd-${nextDishNumber}`,
				dish: plate.dish,
				orderId: order.id,
				slotIndex,
				acceptedAtSec: deps.clock.nowSec,
			};
			nextDishNumber += 1;
			dishes.push(windowDish);
			deps.bus.emit({ type: "dishAccepted", windowDishId: windowDish.id, orderId: windowDish.orderId, dish: windowDish.dish });
			return { ok: true, windowDish: { ...windowDish } };
		},

		getDishes(): readonly WindowDish[] {
			return dishes.map((dish) => ({ ...dish }));
		},

		takeDish(windowDishId: WindowDishId): WindowDish | null {
			const position = dishes.findIndex((dish) => dish.id === windowDishId);
			if (position < 0) {
				return null;
			}
			const [taken] = dishes.splice(position, 1);
			return taken;
		},
	};
}
