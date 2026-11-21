// Столкновения круга с прямоугольниками и границами мира со скольжением вдоль препятствий.
// Общий код для повара (sim/player) и NPC (sim/nav). Владелец: SONNET-2 (geometry-control-nav).
import type { Rect, Vec2 } from "../../contracts";

// Допуск сравнения вещественных чисел: касание допустимо, вдавливание больше допуска выталкивается.
const EPSILON = 1e-9;

// Допуск остаточного вдавливания, при котором положение ещё считается корректным.
const PENETRATION_TOLERANCE = 1e-6;

// Сколько проходов выталкивания делается за один вызов (угол двух стен требует нескольких).
const RESOLVE_PASSES = 4;

// Мир для столкновений: список препятствий и граница, за которую круг выйти не может.
export interface CollisionWorld {
	obstacles: readonly Rect[];
	bounds: Rect;
}

// Глубина вдавливания круга в прямоугольник (0, если круг только касается или не касается).
function penetrationDepth(position: Vec2, radius: number, rect: Rect): number {
	const nearestX = Math.min(Math.max(position.x, rect.x), rect.x + rect.width);
	const nearestZ = Math.min(Math.max(position.z, rect.z), rect.z + rect.depth);
	const distance = Math.hypot(position.x - nearestX, position.z - nearestZ);
	// Центр внутри прямоугольника: вдавливание больше радиуса (до ближайшей грани и ещё радиус).
	if (distance < EPSILON && position.x >= rect.x && position.x <= rect.x + rect.width && position.z >= rect.z && position.z <= rect.z + rect.depth) {
		return radius + Math.min(position.x - rect.x, rect.x + rect.width - position.x, position.z - rect.z, rect.z + rect.depth - position.z);
	}
	return Math.max(0, radius - distance);
}

// Выталкивает круг из одного прямоугольника по нормали ближайшей точки. Возвращает новую точку.
function pushOutOfRect(position: Vec2, radius: number, rect: Rect): Vec2 {
	const nearestX = Math.min(Math.max(position.x, rect.x), rect.x + rect.width);
	const nearestZ = Math.min(Math.max(position.z, rect.z), rect.z + rect.depth);
	const dx = position.x - nearestX;
	const dz = position.z - nearestZ;
	const distance = Math.hypot(dx, dz);
	if (distance >= radius - EPSILON) {
		return position;
	}
	if (distance > EPSILON) {
		const scale = radius / distance;
		return { x: nearestX + dx * scale, z: nearestZ + dz * scale };
	}
	// Центр внутри прямоугольника: выходим через ближайшую грань.
	const toLeft = position.x - rect.x;
	const toRight = rect.x + rect.width - position.x;
	const toTop = position.z - rect.z;
	const toBottom = rect.z + rect.depth - position.z;
	const smallest = Math.min(toLeft, toRight, toTop, toBottom);
	if (smallest === toLeft) {
		return { x: rect.x - radius, z: position.z };
	}
	if (smallest === toRight) {
		return { x: rect.x + rect.width + radius, z: position.z };
	}
	if (smallest === toTop) {
		return { x: position.x, z: rect.z - radius };
	}
	return { x: position.x, z: rect.z + rect.depth + radius };
}

// Прижимает центр круга так, чтобы круг целиком лежал внутри границы мира.
function clampToBounds(position: Vec2, radius: number, bounds: Rect): Vec2 {
	const minX = bounds.x + radius;
	const maxX = bounds.x + bounds.width - radius;
	const minZ = bounds.z + radius;
	const maxZ = bounds.z + bounds.depth - radius;
	return {
		x: maxX < minX ? bounds.x + bounds.width / 2 : Math.min(Math.max(position.x, minX), maxX),
		z: maxZ < minZ ? bounds.z + bounds.depth / 2 : Math.min(Math.max(position.z, minZ), maxZ),
	};
}

// Максимальное вдавливание круга в любое препятствие мира (0: положение корректно).
export function maxPenetration(position: Vec2, radius: number, world: CollisionWorld): number {
	let deepest = 0;
	for (const obstacle of world.obstacles) {
		deepest = Math.max(deepest, penetrationDepth(position, radius, obstacle));
	}
	return deepest;
}

// Выталкивает круг из всех препятствий и границы мира (несколько проходов: угол двух стен).
export function resolveCircle(position: Vec2, radius: number, world: CollisionWorld): Vec2 {
	let current = clampToBounds(position, radius, world.bounds);
	for (let pass = 0; pass < RESOLVE_PASSES; pass += 1) {
		let moved = false;
		for (const obstacle of world.obstacles) {
			const pushed = pushOutOfRect(current, radius, obstacle);
			if (pushed !== current) {
				current = pushed;
				moved = true;
			}
		}
		current = clampToBounds(current, radius, world.bounds);
		if (!moved) {
			break;
		}
	}
	return current;
}

// Двигает круг на delta с выталкиванием из препятствий (скольжение вдоль стен). Движение режется на подшаги не длиннее
// половины радиуса, чтобы большой шаг не пропустил тонкую стену. Если после выталкивания положение всё ещё некорректно
// (зажало между двумя препятствиями), подшаг отменяется и круг остаётся на месте.
export function moveCircle(from: Vec2, delta: Vec2, radius: number, world: CollisionWorld): Vec2 {
	let current = resolveCircle(from, radius, world);
	const length = Math.hypot(delta.x, delta.z);
	if (length < EPSILON) {
		return current;
	}
	const subSteps = Math.max(1, Math.ceil(length / Math.max(radius * 0.5, 0.05)));
	const stepX = delta.x / subSteps;
	const stepZ = delta.z / subSteps;
	for (let index = 0; index < subSteps; index += 1) {
		const candidate = resolveCircle({ x: current.x + stepX, z: current.z + stepZ }, radius, world);
		if (maxPenetration(candidate, radius, world) <= PENETRATION_TOLERANCE) {
			current = candidate;
		}
	}
	return current;
}
