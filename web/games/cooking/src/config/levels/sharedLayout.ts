// Общая планировка ресторана: на всех уровнях одна карта, одна кухня, один вход и одна очередь. Уровни отличаются только
// числом столов в зале (столы берутся из фиксированных мест ниже по порядку добавления), меню, расписанием и терпением.
// Размер комнаты и кухня не меняются: на сложных уровнях в зале появляются дополнительные столы.
import type { DoorConfig, StationConfig, TableConfig, Vec2 } from "../../contracts";
import { createCrate, createFourTop, createQueue, createShell, createStation, createTwoTop, point, type ShellResult, type ShellSpec } from "./builders";

// Оболочка ресторана: ширина 14, внутри 10 в глубину (кухня 7.5, зал 5), улица 3.
export const sharedShellSpec: ShellSpec = {
	width: 14,
	interiorDepth: 10,
	streetDepth: 3,
	dividerX: 8,
	doorX: 10,
	// Сверху вниз по 2: стена, окно выдачи (станция), проход кухня-зал, две стены.
	dividerKinds: ["wall", "skip", "doorway", "wall", "wall"],
};

// Собирает оболочку общей карты.
export function createSharedShell(): ShellResult {
	return createShell(sharedShellSpec);
}

// Кухня целиком: полный набор станций на любом уровне (меню уровня решает, чем пользоваться).
export function createSharedKitchenStations(): StationConfig[] {
	return [
		// Сетка кухни: клетки 1 x 1 по x = 1..7 и z = 0.5, 1.5, ... (полоса 0.5 у западной стены свободна), всё стоит по рядам.
		// Северный ряд: ящики всех ингредиентов (рагу: морковь, картофель, лук) и прилавок.
		createCrate("steak", 1, 0.5),
		createCrate("bun", 2, 0.5),
		createCrate("ham", 3, 0.5),
		createCrate("potato", 4, 0.5),
		createCrate("carrot", 5, 0.5),
		createCrate("onion", 6, 0.5),
		createStation("counter-1", "counter", 6, 2.5, 270),
		// Тарелки рядом с окном выдачи, но не перед ним: клетки напротив окна остаются свободными.
		createStation("plates-1", "plateStack", 7, 1.5, 270),
		// Западный ряд: прилавки.
		createStation("counter-3", "counter", 1, 2.5, 90),
		createStation("counter-4", "counter", 2, 2.5, 90),
		createStation("counter-5", "counter", 1, 4.5, 90),
		// Остров с тремя разделочными досками.
		createStation("board-1", "cuttingBoard", 2, 3.5),
		createStation("board-2", "cuttingBoard", 3, 3.5),
		createStation("board-3", "cuttingBoard", 4, 3.5),
		// Ряд кастрюли: стол с кастрюлей и кран рядом друг с другом и с плитой рагу (проход по z = 5.5 между рядами).
		createStation("pot-table", "counter", 5, 4.5, 90, { startItem: "pot" }),
		createStation("tap-1", "tap", 6, 4.5, 90),
		// Ряд плит: урна рядом с плитами, три сковороды, кастрюля для рагу, духовка.
		createStation("trash-1", "trash", 2, 6.5, 90),
		createStation("pan-1", "pan", 3, 6.5),
		createStation("pan-2", "pan", 4, 6.5),
		createStation("pan-3", "pan", 5, 6.5),
		createStation("pot-1", "stove", 6, 6.5),
		createStation("oven-1", "oven", 7, 6.5),
		createStation("counter-2", "counter", 1, 6.5, 90),
	];
}

// Старт повара: на кухне, в проходе между рядами.
export const sharedChefStart = { position: point(4, 5.5), facing: 0 as const };

// Точки ожидания официантов; уровню достаётся нужное число первых точек.
export const sharedWaiterWaitPoints: readonly Vec2[] = [point(12.75, 1.25), point(12.75, 6.25)];

// Общая боковая линия подачи: все места подаются с свободного прохода справа от столов.
const SHARED_APPROACH_X = 12.75;

// Столы зала в порядке добавления: каждый следующий уровень оставляет предыдущие столы на местах и ставит новые в свободные.
// Сверху вниз по залу: 4-местный на z = 1, дополнительный 4-местный на z = 3.5, четыре 2-местных на z = 6, 7, 8, 9.
type HallTableSlot = { id: string; seats: 2 | 4; z: number };
const HALL_TABLE_SLOTS: readonly HallTableSlot[] = [
	{ id: "four-top-north", seats: 4, z: 1 },
	{ id: "four-top-middle", seats: 4, z: 3.5 },
	{ id: "two-top-1", seats: 2, z: 6 },
	{ id: "two-top-2", seats: 2, z: 7 },
	{ id: "two-top-3", seats: 2, z: 8 },
	{ id: "two-top-4", seats: 2, z: 9 },
];

// Какие места из HALL_TABLE_SLOTS занимает уровень (по индексам): каждый следующий уровень только добавляет столы.
export const EASY_TABLE_SLOTS: readonly number[] = [0, 2, 3];
export const MEDIUM_TABLE_SLOTS: readonly number[] = [0, 1, 2, 3];
export const HARD_TABLE_SLOTS: readonly number[] = [0, 1, 2, 3, 4, 5];

// Столы уровня: номера идут сверху вниз по залу.
export function createHallTables(slotIndices: readonly number[]): TableConfig[] {
	return slotIndices.map((slotIndex, order) => {
		const slot = HALL_TABLE_SLOTS[slotIndex];
		const id = `table-${order + 1}`;
		return slot.seats === 4 ? createFourTop(id, order + 1, 10, slot.z, SHARED_APPROACH_X) : createTwoTop(id, order + 1, 10, slot.z, SHARED_APPROACH_X);
	});
}

// Дверь и путь клиентов: одинаковые на всех уровнях.
export function createSharedDoor(shell: ShellResult): DoorConfig {
	return {
		rect: shell.doorRect,
		rotationDeg: 0,
		insidePoint: point(11, 10.25),
		outsidePoint: point(11, 11.5),
		spawnPoint: point(11, 11.8),
		exitPoint: point(12.5, 13.2),
	};
}

// Слоты очереди слева от двери: четыре в первом ряду и два во втором; уровню достаётся нужное число первых слотов.
const sharedQueuePoints: readonly Vec2[] = [point(9.5, 12), point(7, 12), point(4.5, 12), point(2, 12), point(9.5, 13.3), point(7, 13.3)];

export function createSharedQueue(slotCount: number) {
	return createQueue(sharedQueuePoints.slice(0, slotCount));
}
