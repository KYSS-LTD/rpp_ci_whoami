// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { SIM_STEP_SEC, type DishId, type LevelParams, type NavAgent, type Order, type SimEvent, type Vec2, type WaiterSystem } from "../../contracts";
import type { DeepPartial } from "../../config/levels/defaults";
import { createEventBus } from "../eventBus";
import { buildGeometry } from "../geometry";
import { createNavSystem } from "../nav";
import { createTestLevel } from "../testing/testLevel";
import { createFakeOrderBoard, createFakeServingWindow, type FakeOrderBoard, type FakeServingWindow } from "./testDoubles";
import { createWaiterSystem } from "./index";

// Положение каждого официанта в момент подачи заказа: заполняет onServe.
type ServeRecord = { orderId: string; positions: Record<string, Vec2> };

interface WaiterWorld {
	level: ReturnType<typeof createTestLevel>;
	nav: ReturnType<typeof createNavSystem>;
	waiters: WaiterSystem;
	orders: FakeOrderBoard;
	window: FakeServingWindow;
	events: SimEvent[];
	serves: ServeRecord[];
	clock: { nowSec: number };
	agentOf(waiterId: string): NavAgent;
	// Идёт симуляцию seconds секунд (или до условия until). Возвращает прошедшее время.
	run(seconds: number, until?: () => boolean): number;
	// Создаёт заказ и кладёт блюдо в окно.
	serveReady(tableIndex: number, seatIndex: number, dish: DishId): Order;
}

// Мир с реальной навигацией на тестовом уровне и подменными заказами и окном.
function createWaiterWorld(options: { params?: DeepPartial<LevelParams>; waitPoints?: Vec2[]; chef?: Vec2 } = {}): WaiterWorld {
	const level = createTestLevel(options.params ?? {}, options.waitPoints ? { waiters: { waitPoints: options.waitPoints } } : {});
	const geometry = buildGeometry(level);
	const nav = createNavSystem({ level, geometry });
	const clock = { nowSec: 0 };
	const bus = createEventBus(clock);
	const events: SimEvent[] = [];
	bus.subscribe((event) => events.push(event));
	const serves: ServeRecord[] = [];
	const orders = createFakeOrderBoard(level, clock, (order) => {
		const positions: Record<string, Vec2> = {};
		nav.agents.forEach((agent) => {
			positions[agent.id] = { x: agent.position.x, z: agent.position.z };
		});
		serves.push({ orderId: order.id, positions });
	});
	const window = createFakeServingWindow(level, orders, clock);
	const waiters = createWaiterSystem({ level, nav, window, orders, clock, bus });
	const chef = options.chef ?? level.chefStart.position;
	return {
		level,
		nav,
		waiters,
		orders,
		window,
		events,
		serves,
		clock,
		agentOf(waiterId: string): NavAgent {
			const agent = nav.agents.find((candidate) => candidate.id === waiterId);
			if (!agent) {
				throw new Error(`нет агента ${waiterId}`);
			}
			return agent;
		},
		run(seconds: number, until?: () => boolean): number {
			const steps = Math.round(seconds / SIM_STEP_SEC);
			for (let index = 0; index < steps; index += 1) {
				clock.nowSec += SIM_STEP_SEC;
				waiters.step(SIM_STEP_SEC);
				nav.step(SIM_STEP_SEC, chef);
				if (until?.()) {
					return (index + 1) * SIM_STEP_SEC;
				}
			}
			return seconds;
		},
		serveReady(tableIndex: number, seatIndex: number, dish: DishId): Order {
			const order = orders.createOrder(tableIndex, seatIndex, dish);
			window.addDish(dish, order.id);
			return order;
		},
	};
}

function distance(first: Vec2, second: Vec2): number {
	return Math.hypot(first.x - second.x, first.z - second.z);
}

// События waiterPickedUp в порядке возникновения.
function pickups(world: WaiterWorld): Array<{ waiterId: string; orderIds: string[] }> {
	return world.events.flatMap((event) => (event.type === "waiterPickedUp" ? [{ waiterId: event.waiterId, orderIds: event.orderIds }] : []));
}

describe("официант: взять блюдо из окна", () => {
	it("создаётся по точке ожидания на каждого официанта и стоит там", () => {
		const world = createWaiterWorld({ waitPoints: [{ x: 8.25, z: 2 }, { x: 8.25, z: 6 }] });
		const snapshots = world.waiters.getWaiterSnapshots();
		expect(snapshots.map((snapshot) => snapshot.id)).toEqual(["waiter-1", "waiter-2"]);
		expect(snapshots[0].position).toEqual({ x: 8.25, z: 2 });
		expect(snapshots[1].position).toEqual({ x: 8.25, z: 6 });
		expect(snapshots.every((snapshot) => !snapshot.moving && snapshot.carrying.length === 0)).toBe(true);
		world.run(2);
		expect(world.waiters.getWaiterSnapshots()[0].position).toEqual({ x: 8.25, z: 2 });
	});

	it("Один свободный официант: блюдо появилось, официант идёт к окну и берёт его", () => {
		const world = createWaiterWorld();
		const order = world.serveReady(0, 0, "burger");
		expect(world.window.getDishes()).toHaveLength(1);
		const snapshotAtStart = world.waiters.getWaiterSnapshots()[0];
		world.run(0.2);
		expect(world.waiters.getWaiterSnapshots()[0].moving).toBe(true);
		expect(snapshotAtStart.carrying).toHaveLength(0);
		world.run(10, () => world.window.getDishes().length === 0);
		// Блюдо забрано из окна и лежит в руках официанта.
		expect(world.window.getDishes()).toHaveLength(0);
		expect(world.waiters.getWaiterSnapshots()[0].carrying).toEqual(["burger"]);
		expect(pickups(world)).toEqual([{ waiterId: "waiter-1", orderIds: [order.id] }]);
		// Забор происходит у окна.
		expect(distance(world.agentOf("waiter-1").position, world.level.window.pickupPoint)).toBeLessThan(0.3);
	});

	it("Два свободных официанта: блюдо берёт тот, кто ближе по длине пути, а не по прямой", () => {
		// Первый в кухне за стеной: по прямой до окна 1.5, но идти в обход через проход (длинный путь).
		// Второй в зале: по прямой 2.5, путь прямой.
		const world = createWaiterWorld({ waitPoints: [{ x: 6.5, z: 3.5 }, { x: 8.25, z: 6 }] });
		const pickup = world.level.window.pickupPoint;
		const lengthFirst = world.nav.pathfinder.pathLength({ x: 6.5, z: 3.5 }, pickup) ?? 0;
		const lengthSecond = world.nav.pathfinder.pathLength({ x: 8.25, z: 6 }, pickup) ?? 0;
		expect(distance({ x: 6.5, z: 3.5 }, pickup)).toBeLessThan(distance({ x: 8.25, z: 6 }, pickup));
		expect(lengthFirst).toBeGreaterThan(lengthSecond);
		const order = world.serveReady(0, 0, "ham");
		world.run(0.5);
		expect(world.agentOf("waiter-1").position).toEqual({ x: 6.5, z: 3.5 });
		expect(world.agentOf("waiter-2").isMoving).toBe(true);
		world.run(10, () => pickups(world).length === 1);
		expect(pickups(world)).toEqual([{ waiterId: "waiter-2", orderIds: [order.id] }]);
	});

	it("зарезервированное блюдо не берёт второй официант: на одно блюдо идёт один", () => {
		const world = createWaiterWorld({ waitPoints: [{ x: 8.25, z: 2 }, { x: 8.25, z: 6 }] });
		world.serveReady(0, 0, "burger");
		world.run(0.3);
		// Идёт только ближайший; второй остаётся в точке ожидания, пока блюдо числится за первым.
		expect(world.agentOf("waiter-1").isMoving).toBe(true);
		expect(world.agentOf("waiter-2").position).toEqual({ x: 8.25, z: 6 });
		world.run(10, () => pickups(world).length === 1);
		world.run(1);
		expect(world.agentOf("waiter-2").position).toEqual({ x: 8.25, z: 6 });
	});

	it("два блюда и два официанта: каждый берёт своё, блюда не дублируются", () => {
		const world = createWaiterWorld({ waitPoints: [{ x: 8.25, z: 2 }, { x: 8.25, z: 6 }] });
		const first = world.serveReady(0, 0, "burger");
		const second = world.serveReady(2, 0, "ham");
		world.run(20, () => world.orders.servedOrderIds.length === 2);
		expect(world.orders.servedOrderIds).toHaveLength(2);
		expect(new Set(pickups(world).map((pickup) => pickup.waiterId)).size).toBe(2);
		expect(pickups(world).flatMap((pickup) => pickup.orderIds).sort()).toEqual([first.id, second.id].sort());
	});

	it("блюда обслуживаются в порядке появления в окне (FIFO)", () => {
		const world = createWaiterWorld();
		const first = world.serveReady(2, 0, "burger");
		const second = world.serveReady(0, 0, "ham");
		world.run(40, () => world.orders.servedOrderIds.length === 2);
		expect(world.orders.servedOrderIds).toEqual([first.id, second.id]);
	});

	it("пути до окна нет ни у кого: блюдо остаётся в окне, ошибок нет, официанты стоят", () => {
		const world = createWaiterWorld();
		vi.spyOn(world.nav.pathfinder, "pathLength").mockReturnValue(null);
		world.serveReady(0, 0, "burger");
		world.run(3);
		expect(world.window.getDishes()).toHaveLength(1);
		expect(world.agentOf("waiter-1").position).toEqual({ x: 8.25, z: 2 });
	});
});

describe("официант: доставка, подача, возврат", () => {
	it("Подача: официант дошёл до места клиента, блюдо подано, заказ обслужен", () => {
		const world = createWaiterWorld();
		const order = world.serveReady(0, 0, "burger");
		const seat = world.level.tables[0].seats[0];
		world.run(30, () => world.orders.servedOrderIds.length === 1);
		expect(world.orders.getOrder(order.id)?.status).toBe("served");
		expect(world.serves).toHaveLength(1);
		// Подача происходит на месте подачи этого места.
		expect(distance(world.serves[0].positions["waiter-1"], seat.servePoint)).toBeLessThan(0.2);
		// Блюдо больше не в окне и не в руках.
		expect(world.window.getDishes()).toHaveLength(0);
		expect(world.waiters.getWaiterSnapshots()[0].carrying).toHaveLength(0);
		// Подан один раз.
		world.run(5);
		expect(world.orders.servedOrderIds).toEqual([order.id]);
	});

	it("по пути к столу официант несёт блюдо и не подаёт раньше времени", () => {
		const world = createWaiterWorld();
		const order = world.serveReady(2, 1, "ham");
		world.run(30, () => world.waiters.getWaiterSnapshots()[0].carrying.length === 1);
		expect(world.waiters.getWaiterSnapshots()[0].carrying).toEqual(["ham"]);
		expect(world.orders.getOrder(order.id)?.status).toBe("delivering");
		world.run(0.5);
		expect(world.orders.getOrder(order.id)?.status).toBe("delivering");
	});

	it("Нет работы: после подачи при пустом окне официант идёт в точку ожидания и становится там", () => {
		const world = createWaiterWorld();
		world.serveReady(0, 0, "burger");
		world.run(30, () => world.orders.servedOrderIds.length === 1);
		// Сразу после подачи: направление к точке ожидания.
		const agent = world.agentOf("waiter-1");
		expect(agent.status).toBe("moving");
		const lastWaypoint = agent.path[agent.path.length - 1];
		expect(lastWaypoint.x).toBeCloseTo(world.level.waiters.waitPoints[0].x, 6);
		expect(lastWaypoint.z).toBeCloseTo(world.level.waiters.waitPoints[0].z, 6);
		world.run(15, () => agent.status === "arrived");
		expect(distance(agent.position, world.level.waiters.waitPoints[0])).toBeLessThan(0.05);
		world.run(1);
		expect(world.waiters.getWaiterSnapshots()[0].moving).toBe(false);
	});

	it("Работа ждёт: после подачи в окне ещё лежит блюдо, официант идёт к окну, а не в точку ожидания", () => {
		const world = createWaiterWorld();
		const first = world.serveReady(0, 0, "burger");
		const second = world.serveReady(2, 0, "ham");
		world.run(30, () => world.orders.servedOrderIds.length === 1);
		expect(world.orders.servedOrderIds).toEqual([first.id]);
		const agent = world.agentOf("waiter-1");
		// Второе блюдо ещё в окне, официант уже направлен к окну.
		expect(world.window.getDishes().map((dish) => dish.orderId)).toEqual([second.id]);
		const lastWaypoint = agent.path[agent.path.length - 1];
		expect(lastWaypoint.x).toBeCloseTo(world.level.window.pickupPoint.x, 6);
		expect(lastWaypoint.z).toBeCloseTo(world.level.window.pickupPoint.z, 6);
		world.run(40, () => world.orders.servedOrderIds.length === 2);
		expect(world.orders.servedOrderIds).toEqual([first.id, second.id]);
		// Когда всё подано, возвращается в точку ожидания.
		world.run(20, () => agent.status === "arrived" && distance(agent.position, world.level.waiters.waitPoints[0]) < 0.05);
		expect(distance(agent.position, world.level.waiters.waitPoints[0])).toBeLessThan(0.05);
	});

	it("блюдо, появившееся, пока официант возвращается, перехватывает его по дороге", () => {
		const world = createWaiterWorld();
		world.serveReady(2, 0, "burger");
		world.run(40, () => world.orders.servedOrderIds.length === 1);
		world.run(1);
		const agent = world.agentOf("waiter-1");
		expect(agent.isMoving).toBe(true);
		const next = world.serveReady(0, 1, "ham");
		world.run(40, () => world.orders.servedOrderIds.length === 2);
		expect(world.orders.getOrder(next.id)?.status).toBe("served");
	});

	it("после подачи стоящий в точке ожидания официант не двигается, пока нет работы", () => {
		const world = createWaiterWorld();
		world.run(5);
		expect(world.agentOf("waiter-1").position).toEqual({ x: 8.25, z: 2 });
		expect(world.agentOf("waiter-1").status).toBe("idle");
	});
});

describe("официанты: вместимость и рейсы", () => {
	it("Одна тарелка на easy: две тарелки и один официант дают два рейса", () => {
		const world = createWaiterWorld();
		expect(world.level.params.waiter.capacity).toBe(1);
		const first = world.serveReady(1, 0, "burger");
		const second = world.serveReady(1, 1, "burger");
		let maxCarried = 0;
		world.run(60, () => {
			maxCarried = Math.max(maxCarried, world.waiters.getWaiterSnapshots()[0].carrying.length);
			return world.orders.servedOrderIds.length === 2;
		});
		expect(world.orders.servedOrderIds).toHaveLength(2);
		expect(maxCarried).toBe(1);
		expect(pickups(world)).toEqual([
			{ waiterId: "waiter-1", orderIds: [first.id] },
			{ waiterId: "waiter-1", orderIds: [second.id] },
		]);
	});

	it("Две тарелки одного стола: на hard официант забирает обе и несёт одним рейсом", () => {
		const world = createWaiterWorld({ params: { waiter: { capacity: 2 } } });
		const first = world.serveReady(2, 0, "burger");
		const second = world.serveReady(2, 1, "ham");
		let maxCarried = 0;
		world.run(60, () => {
			maxCarried = Math.max(maxCarried, world.waiters.getWaiterSnapshots()[0].carrying.length);
			return world.orders.servedOrderIds.length === 2;
		});
		expect(pickups(world)).toEqual([{ waiterId: "waiter-1", orderIds: [first.id, second.id] }]);
		expect(maxCarried).toBe(2);
		expect(world.orders.servedOrderIds).toHaveLength(2);
		// Каждая тарелка подана на своём месте подачи, ближнее место первым.
		expect(world.orders.servedOrderIds).toEqual([first.id, second.id]);
		world.serves.forEach((record, index) => {
			const seat = world.level.tables[2].seats[index];
			expect(distance(record.positions["waiter-1"], seat.servePoint)).toBeLessThan(0.2);
		});
	});

	it("на hard вторая тарелка того же стола, появившаяся, пока официант идёт к окну, едет тем же рейсом", () => {
		const world = createWaiterWorld({ params: { waiter: { capacity: 2 } } });
		const first = world.serveReady(2, 0, "burger");
		world.run(0.3);
		const second = world.serveReady(2, 1, "burger");
		world.run(60, () => world.orders.servedOrderIds.length === 2);
		expect(pickups(world)).toEqual([{ waiterId: "waiter-1", orderIds: [first.id, second.id] }]);
	});

	it("на hard тарелки разных столов одним рейсом не идут", () => {
		const world = createWaiterWorld({ params: { waiter: { capacity: 2 } } });
		const first = world.serveReady(0, 0, "burger");
		const second = world.serveReady(2, 0, "burger");
		world.run(80, () => world.orders.servedOrderIds.length === 2);
		expect(pickups(world)).toEqual([
			{ waiterId: "waiter-1", orderIds: [first.id] },
			{ waiterId: "waiter-1", orderIds: [second.id] },
		]);
	});

	it("на hard два официанта: тарелки одного стола не делятся между ними", () => {
		const world = createWaiterWorld({ params: { waiter: { capacity: 2 } }, waitPoints: [{ x: 8.25, z: 2 }, { x: 8.25, z: 6 }] });
		const first = world.serveReady(2, 0, "burger");
		const second = world.serveReady(2, 1, "burger");
		world.run(60, () => world.orders.servedOrderIds.length === 2);
		expect(pickups(world)).toHaveLength(1);
		expect(pickups(world)[0].orderIds).toEqual([first.id, second.id]);
	});
});
