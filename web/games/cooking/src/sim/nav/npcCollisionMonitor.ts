// Монитор "NPC не проходят сквозь препятствия": по снимкам игры каждый шаг проверяет всех официантов и клиентов.
// Универсален для любого LevelConfig (препятствия и граница берутся из геометрии уровня), поэтому защищает и будущие раскладки.
// Правила (владелец: SONNET-2, geometry-control-nav):
//   (а) круг радиуса NavParams.agentRadius в положении NPC не заходит в блокирующие препятствия (стены, мебель, станции,
//       стулья, колонны) и не выходит за границу мира; касание допустимо;
//   (б) отрезок между положениями соседних шагов не заходит в препятствия (ловит прыжки сквозь стену: перенос, срезание угла,
//       выталкивание не в ту сторону).
// Сидящие клиенты (isSeated) исключены: их положение это центр стула, стул сам препятствие. Переходы "сел" и "встал со стула"
// (перенос на стул и обратно к точке подхода) отрезком не проверяются, но положение вне стула проверяется по (а).
import type { GameSnapshot, Rect, Vec2 } from "../../contracts";
import { distancePointToRect } from "../../common/math";

// Допуск вдавливания, единиц мира: хорда между двумя соседними положениями у выпуклого угла чуть короче дуги.
const PENETRATION_TOLERANCE = 0.01;

// Шаг выборки точек вдоль отрезка, единиц мира.
const SAMPLE_STEP = 0.05;

// Сколько нарушений запоминается (остальные только считаются).
const MAX_RECORDED = 30;

// Нарушение: что и где произошло.
export interface NpcViolation {
	kind: "inside" | "outside-bounds" | "crossed";
	npcId: string;
	tick: number;
	// Положение на этом шаге и на прошлом (для crossed и outside-bounds прошлого может не быть).
	position: Vec2;
	previous: Vec2 | null;
	// Препятствие, в которое зашёл круг (null для выхода за границу).
	obstacle: Rect | null;
	// Глубина вдавливания, единиц мира.
	depth: number;
}

// Параметры монитора.
export interface NpcCollisionMonitorOptions {
	obstacles: readonly Rect[];
	bounds: Rect;
	// Радиус NPC (NavParams.agentRadius).
	radius: number;
}

// Монитор.
export interface NpcCollisionMonitor {
	// Вызывается на каждом шаге со свежим снимком.
	observe(snapshot: GameSnapshot): void;
	// Первые нарушения (не более MAX_RECORDED).
	readonly violations: readonly NpcViolation[];
	// Сколько всего нарушений.
	readonly violationCount: number;
	// Сколько положений NPC проверено (чтобы тест убедился, что монитор что-то видел).
	readonly checkedPositions: number;
}

// Самое глубокое вдавливание круга в препятствия и границу: obstacle и depth (depth <= допуска: нарушения нет).
function findPenetration(options: NpcCollisionMonitorOptions, position: Vec2): { obstacle: Rect | null; depth: number; outside: boolean } {
	let obstacle: Rect | null = null;
	let depth = 0;
	for (const candidate of options.obstacles) {
		const distance = distancePointToRect(position, candidate);
		// Центр внутри прямоугольника: distance 0, вдавливание не меньше радиуса.
		const candidateDepth = options.radius - distance;
		if (candidateDepth > depth) {
			depth = candidateDepth;
			obstacle = candidate;
		}
	}
	const { bounds, radius } = options;
	const outsideDepth = Math.max(bounds.x + radius - position.x, position.x - (bounds.x + bounds.width - radius), bounds.z + radius - position.z, position.z - (bounds.z + bounds.depth - radius), 0);
	if (outsideDepth > depth) {
		return { obstacle: null, depth: outsideDepth, outside: true };
	}
	return { obstacle, depth, outside: false };
}

// Создаёт монитор.
export function createNpcCollisionMonitor(options: NpcCollisionMonitorOptions): NpcCollisionMonitor {
	const violations: NpcViolation[] = [];
	let violationCount = 0;
	let checkedPositions = 0;
	// Прошлое положение и признак "сидел" по идентификатору NPC.
	const previous = new Map<string, { position: Vec2; seated: boolean }>();

	function report(violation: NpcViolation): void {
		violationCount += 1;
		if (violations.length < MAX_RECORDED) {
			violations.push(violation);
		}
	}

	function checkCharacter(id: string, position: Vec2, seated: boolean, tick: number): void {
		const before = previous.get(id);
		previous.set(id, { position: { x: position.x, z: position.z }, seated });
		if (seated) {
			return;
		}
		checkedPositions += 1;
		// (а) положение круга.
		const found = findPenetration(options, position);
		if (found.depth > PENETRATION_TOLERANCE) {
			report({ kind: found.outside ? "outside-bounds" : "inside", npcId: id, tick, position: { x: position.x, z: position.z }, previous: before ? before.position : null, obstacle: found.obstacle, depth: found.depth });
			return;
		}
		// (б) отрезок от прошлого положения (если NPC не сидел на прошлом шаге).
		if (!before || before.seated) {
			return;
		}
		const length = Math.hypot(position.x - before.position.x, position.z - before.position.z);
		const samples = Math.max(1, Math.ceil(length / SAMPLE_STEP));
		for (let index = 1; index < samples; index += 1) {
			const ratio = index / samples;
			const sample = { x: before.position.x + (position.x - before.position.x) * ratio, z: before.position.z + (position.z - before.position.z) * ratio };
			const crossing = findPenetration(options, sample);
			if (crossing.depth > PENETRATION_TOLERANCE) {
				report({ kind: "crossed", npcId: id, tick, position: { x: position.x, z: position.z }, previous: { x: before.position.x, z: before.position.z }, obstacle: crossing.obstacle, depth: crossing.depth });
				return;
			}
		}
	}

	return {
		observe(snapshot: GameSnapshot): void {
			for (const waiter of snapshot.waiters) {
				checkCharacter(waiter.id, waiter.position, false, snapshot.tick);
			}
			for (const customer of snapshot.customers) {
				checkCharacter(customer.id, customer.position, customer.isSeated, snapshot.tick);
			}
		},
		get violations(): readonly NpcViolation[] {
			return violations;
		},
		get violationCount(): number {
			return violationCount;
		},
		get checkedPositions(): number {
			return checkedPositions;
		},
	};
}

// Короткое описание нарушения для сообщения теста.
export function describeViolation(violation: NpcViolation): string {
	const at = `(${violation.position.x.toFixed(2)}, ${violation.position.z.toFixed(2)})`;
	const from = violation.previous ? ` из (${violation.previous.x.toFixed(2)}, ${violation.previous.z.toFixed(2)})` : "";
	const rect = violation.obstacle ? ` препятствие x ${violation.obstacle.x}..${violation.obstacle.x + violation.obstacle.width}, z ${violation.obstacle.z}..${violation.obstacle.z + violation.obstacle.depth}` : "";
	return `tick ${violation.tick} ${violation.npcId} ${violation.kind} ${at}${from} глубина ${violation.depth.toFixed(3)}${rect}`;
}
