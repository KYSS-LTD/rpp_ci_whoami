// Самодельный снимок состояния для харнесса и тестов рендера и HUD: движущиеся персонажи, смена состояний предметов,
// заказы с разным терпением. Не часть игры: main собирает настоящий снимок из Simulation. Время задаётся числом секунд,
// поэтому снимок детерминирован и подходит для тестов.
import {
	type ChefSnapshot,
	type CustomerSnapshot,
	type DishId,
	type FailureInfo,
	type GameSnapshot,
	type Item,
	type LevelConfig,
	type OrderSnapshot,
	type QueueGroupSnapshot,
	type ShiftPhase,
	type StationConfig,
	type StationSnapshot,
	type TableSnapshot,
	type Vec2,
	type WaiterSnapshot,
	type WindowDishSnapshot,
} from "../contracts";
import { facingToYaw, rectCenter, vectorToNearestFacing, vectorToYaw } from "../common/math";

// Параметры демо-снимка: что показывает смена (для проверки экранов HUD).
export interface DemoOptions {
	phase?: ShiftPhase;
	// Сколько секунд смены прошло (определяет таймер, баннер закрытия потока).
	elapsedSec?: number;
	failure?: FailureInfo | null;
	score?: number;
	servedCustomers?: number;
}

// Предметы для демонстрации в руке повара: от пустой руки до готового блюда.
const demoHandItems: Array<Item | null> = [
	null,
	{ type: "ingredient", kind: "steak", state: "raw" },
	{ type: "ingredient", kind: "steak", state: "chopped" },
	{ type: "plate", contents: [], dish: null },
	{ type: "plate", contents: [{ type: "ingredient", kind: "bun", state: "raw" }], dish: null },
	{ type: "plate", contents: [], dish: "burger" },
	{ type: "ingredient", kind: "patty", state: "burnt" },
	{ type: "plate", contents: [], dish: "veggieBurger" },
];

// Блюда клиентов по кругу.
const demoDishes: DishId[] = ["burger", "ham", "veggieBurger", "stew"];

// Позиция на замкнутом маршруте по точкам со скоростью speed (единиц/сек). Возвращает точку и направление.
function walkRoute(points: readonly Vec2[], speed: number, timeSec: number): { position: Vec2; direction: Vec2 } {
	let total = 0;
	const lengths = points.map((point, index) => {
		const next = points[(index + 1) % points.length];
		const length = Math.hypot(next.x - point.x, next.z - point.z);
		total += length;
		return length;
	});
	let distance = (timeSec * speed) % Math.max(total, 1e-6);
	for (let index = 0; index < points.length; index += 1) {
		if (distance <= lengths[index]) {
			const from = points[index];
			const to = points[(index + 1) % points.length];
			const ratio = lengths[index] === 0 ? 0 : distance / lengths[index];
			const direction = { x: (to.x - from.x) / (lengths[index] || 1), z: (to.z - from.z) / (lengths[index] || 1) };
			return { position: { x: from.x + (to.x - from.x) * ratio, z: from.z + (to.z - from.z) * ratio }, direction };
		}
		distance -= lengths[index];
	}
	return { position: points[0], direction: { x: 0, z: 1 } };
}

// Состояние станции по виду и времени: цикл "сырое, готовится, готово, подгорает, сгорело".
function createStationSnapshot(station: StationConfig, indexOfKind: number, timeSec: number): StationSnapshot {
	const base: StationSnapshot = { id: station.id, kind: station.kind, items: [], phase: "idle", progress: 0, burnProgress: 0, portions: 0 };
	const shifted = timeSec + indexOfKind * 5;
	switch (station.kind) {
		case "counter":
			if (indexOfKind === 0) {
				return { ...base, items: [{ type: "plate", contents: [], dish: "burger" }], phase: "holding" };
			}
			return { ...base, items: [{ type: "ingredient", kind: "bun", state: "raw" }], phase: "holding" };
		case "cuttingBoard": {
			const cycle = shifted % 6;
			if (cycle < 3) {
				return { ...base, items: [{ type: "ingredient", kind: "steak", state: "raw" }], phase: "processing", progress: cycle / 3 };
			}
			return { ...base, items: [{ type: "ingredient", kind: "steak", state: "chopped" }], phase: "ready" };
		}
		case "pan": {
			const cycle = shifted % 20;
			if (cycle < 6) {
				return { ...base, items: [{ type: "ingredient", kind: "patty", state: "raw" }], phase: "processing", progress: cycle / 6 };
			}
			if (cycle < 12) {
				return { ...base, items: [{ type: "ingredient", kind: "patty", state: "cooked" }], phase: "ready", burnProgress: (cycle - 6) / 6 };
			}
			if (cycle < 16) {
				return { ...base, items: [{ type: "ingredient", kind: "patty", state: "burnt" }], phase: "burnt" };
			}
			return base;
		}
		case "pot": {
			const cycle = shifted % 24;
			if (cycle < 4) {
				return { ...base, items: [{ type: "ingredient", kind: "carrot", state: "chopped" }, { type: "ingredient", kind: "potato", state: "chopped" }], phase: "holding" };
			}
			if (cycle < 12) {
				return { ...base, items: [{ type: "ingredient", kind: "carrot", state: "chopped" }, { type: "ingredient", kind: "potato", state: "chopped" }, { type: "ingredient", kind: "onion", state: "chopped" }], phase: "processing", progress: (cycle - 4) / 8 };
			}
			if (cycle < 18) {
				return { ...base, items: [{ type: "ingredient", kind: "stew", state: "cooked" }], phase: "ready", burnProgress: (cycle - 12) / 6, portions: 2 };
			}
			return { ...base, items: [{ type: "ingredient", kind: "stew", state: "burnt" }], phase: "burnt" };
		}
		case "oven": {
			const cycle = shifted % 20;
			if (cycle < 8) {
				return { ...base, items: [{ type: "ingredient", kind: "ham", state: "raw" }], phase: "processing", progress: cycle / 8 };
			}
			if (cycle < 15) {
				return { ...base, items: [{ type: "ingredient", kind: "ham", state: "cooked" }], phase: "ready", burnProgress: (cycle - 8) / 7 };
			}
			return { ...base, items: [{ type: "ingredient", kind: "ham", state: "burnt" }], phase: "burnt" };
		}
		default:
			return base;
	}
}

// Создаёт демо-снимок на момент timeSec секунд харнесса.
export function createDemoSnapshot(level: LevelConfig, timeSec: number, options: DemoOptions = {}): GameSnapshot {
	const phase = options.phase ?? "running";
	const durationSec = level.params.durationSec;
	const elapsedSec = Math.min(options.elapsedSec ?? timeSec, durationSec);
	const timeLeftSec = Math.max(0, durationSec - elapsedSec);

	// Станции: порядковый номер среди станций того же вида даёт разный сдвиг цикла.
	const kindCounters = new Map<string, number>();
	const stations: StationSnapshot[] = level.stations.map((station) => {
		const indexOfKind = kindCounters.get(station.kind) ?? 0;
		kindCounters.set(station.kind, indexOfKind + 1);
		return createStationSnapshot(station, indexOfKind, timeSec);
	});

	// Повар: ходит по эллипсу вокруг стартовой точки, цель по очереди переходит по станциям.
	const centerPoint = level.chefStart.position;
	const route = [
		{ x: centerPoint.x - 1, z: centerPoint.z },
		{ x: centerPoint.x + 1, z: centerPoint.z },
		{ x: centerPoint.x + 1, z: centerPoint.z + 1.2 },
		{ x: centerPoint.x - 1, z: centerPoint.z + 1.2 },
	];
	const chefWalk = walkRoute(route, 1.8, timeSec);
	const chefFacing = vectorToNearestFacing(chefWalk.direction);
	const targetStation = level.stations[Math.floor(timeSec / 2.5) % level.stations.length];
	const hand = demoHandItems[Math.floor(timeSec / 3) % demoHandItems.length];
	const chef: ChefSnapshot = {
		position: chefWalk.position,
		facing: chefFacing,
		yaw: facingToYaw(chefFacing),
		moving: true,
		hand,
		target: { stationId: targetStation.id, kind: targetStation.kind },
		working: targetStation.kind === "cuttingBoard" && Math.floor(timeSec) % 2 === 0,
	};

	// Официант: ходит от окна к первому столу и обратно, неся блюдо в одну сторону.
	const waiterRoute = [level.window.pickupPoint, level.tables[0].seats[0].servePoint];
	const waiterWalk = walkRoute(waiterRoute, 2.2, timeSec);
	const waiters: WaiterSnapshot[] = level.waiters.waitPoints.map((_, index) => ({
		id: `waiter-${index + 1}`,
		position: waiterWalk.position,
		yaw: vectorToYaw(waiterWalk.direction),
		moving: true,
		carrying: waiterWalk.direction.x > 0 ? (["burger"] as DishId[]) : [],
	}));

	// Клиенты за столами: все места первого стола, остальные через одно.
	const customers: CustomerSnapshot[] = [];
	const tables: TableSnapshot[] = [];
	let customerNumber = 0;
	level.tables.forEach((table, tableIndex) => {
		const orders: OrderSnapshot[] = [];
		table.seats.forEach((seat, seatIndex) => {
			if (tableIndex > 0 && (seatIndex + tableIndex) % 2 === 1) {
				return;
			}
			customerNumber += 1;
			const dish = demoDishes[customerNumber % demoDishes.length];
			const isServed = tableIndex === level.tables.length - 1;
			const id = `c-${tableIndex + 1}-${seatIndex + 1}`;
			customers.push({
				id,
				groupId: `g-${tableIndex + 1}`,
				position: seat.sitPoint,
				yaw: (seat.rotationDeg * Math.PI) / 180,
				moving: false,
				phase: isServed ? "eating" : "seated",
				isSeated: true,
				variant: customerNumber,
				tableId: table.id,
				seatIndex,
				dish,
				dishOnTable: isServed,
			});
			const ratio = Math.max(0.02, 1 - ((timeSec * 0.04 + customerNumber * 0.27) % 1));
			orders.push({
				id: `o-${id}`,
				customerId: id,
				tableId: table.id,
				seatIndex,
				dish,
				status: isServed ? "served" : seatIndex === 1 ? "delivering" : "waiting",
				patienceLeftSec: ratio * 60,
				patienceTotalSec: 60,
				patienceRatio: ratio,
			});
		});
		tables.push({
			tableId: table.id,
			number: table.number,
			capacity: table.seats.length,
			state: orders.length === 0 ? "free" : tableIndex === level.tables.length - 1 ? "served" : "waiting",
			groupId: orders.length === 0 ? null : `g-${tableIndex + 1}`,
			orders,
		});
	});

	// Очередь: две группы стоят, один клиент идёт по улице от места появления к двери.
	const queue: QueueGroupSnapshot[] = [];
	level.queue.slots.slice(0, 2).forEach((slot, slotIndex) => {
		const size = slotIndex === 0 ? 2 : 3;
		const ratio = Math.max(0.05, 1 - ((timeSec * 0.03 + slotIndex * 0.4) % 1));
		queue.push({ groupId: `g-q${slotIndex}`, slotIndex, size, patienceLeftSec: ratio * 75, patienceTotalSec: 75, patienceRatio: ratio });
		for (let member = 0; member < size; member += 1) {
			customerNumber += 1;
			const offset = level.queue.memberOffsets[member];
			customers.push({
				id: `c-q${slotIndex}-${member + 1}`,
				groupId: `g-q${slotIndex}`,
				position: { x: slot.position.x + offset.x, z: slot.position.z + offset.z },
				yaw: 0,
				moving: false,
				phase: "queued",
				isSeated: false,
				variant: customerNumber,
				tableId: null,
				seatIndex: null,
				dish: demoDishes[customerNumber % demoDishes.length],
				dishOnTable: false,
			});
		}
	});
	const arrivingWalk = walkRoute([level.door.spawnPoint, level.door.outsidePoint], 1.5, timeSec);
	customers.push({
		id: "c-arriving",
		groupId: "g-arriving",
		position: arrivingWalk.position,
		yaw: vectorToYaw(arrivingWalk.direction),
		moving: true,
		phase: "arriving",
		isSeated: false,
		variant: 7,
		tableId: null,
		seatIndex: null,
		dish: "burger",
		dishOnTable: false,
	});

	// Блюда в окне выдачи.
	const windowDishes: WindowDishSnapshot[] = level.window.dishPoints.slice(0, 2).map((_, slotIndex) => ({
		id: `wd-${slotIndex + 1}`,
		dish: demoDishes[slotIndex],
		orderId: `o-demo-${slotIndex}`,
		slotIndex,
	}));

	const maxScore = 120;
	return {
		phase,
		durationSec,
		elapsedSec,
		timeLeftSec,
		flowClosed: timeLeftSec <= level.params.schedule.flowCloseBeforeEndSec,
		score: options.score ?? 34,
		maxScore,
		servedCustomers: options.servedCustomers ?? 3,
		totalCustomers: 12,
		failure: options.failure ?? null,
		result: phase === "failed" || phase === "finished" ? { completed: phase === "finished", score: options.score ?? 34, maxScore, reason: phase === "failed" ? "failed" : "timeUp" } : null,
		tick: Math.floor(timeSec * 60),
		chef,
		waiters,
		customers,
		stations,
		windowDishes,
		tables,
		queue,
		queuedGroups: queue.length,
	};
}

// Центр прямоугольника станции: удобный помощник харнесса.
export function getStationCenter(station: StationConfig): Vec2 {
	return rectCenter(station.rect);
}
