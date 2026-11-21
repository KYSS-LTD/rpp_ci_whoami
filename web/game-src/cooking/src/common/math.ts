// Мелкие общие математические помощники игры: прямоугольники, расстояния, направления взгляда.
// Владелец: Opus-агент. Нужна новая функция - пишите в inbox-opus.md (общий файл, чтобы не плодить копии в областях).
import { FACING_COUNT, FACING_VECTORS, GRID_STEP, type Facing8, type Rect, type Vec2 } from "../contracts";

// Допуск сравнения вещественных чисел.
const EPSILON = 1e-9;

// Ограничивает число отрезком [min, max].
export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

// Линейная интерполяция.
export function lerp(from: number, to: number, ratio: number): number {
	return from + (to - from) * ratio;
}

// Расстояние между двумя точками.
export function distanceBetween(first: Vec2, second: Vec2): number {
	return Math.hypot(first.x - second.x, first.z - second.z);
}

// Центр прямоугольника.
export function rectCenter(rect: Rect): Vec2 {
	return { x: rect.x + rect.width / 2, z: rect.z + rect.depth / 2 };
}

// Лежит ли точка внутри прямоугольника (границы включены).
export function rectContainsPoint(rect: Rect, point: Vec2): boolean {
	return point.x >= rect.x && point.x <= rect.x + rect.width && point.z >= rect.z && point.z <= rect.z + rect.depth;
}

// Пересекаются ли два прямоугольника по площади (касание сторонами пересечением не считается).
export function rectsOverlap(first: Rect, second: Rect): boolean {
	return (
		first.x < second.x + second.width - EPSILON &&
		second.x < first.x + first.width - EPSILON &&
		first.z < second.z + second.depth - EPSILON &&
		second.z < first.z + first.depth - EPSILON
	);
}

// Лежит ли внутренний прямоугольник целиком внутри внешнего.
export function rectInside(inner: Rect, outer: Rect): boolean {
	return (
		inner.x >= outer.x - EPSILON &&
		inner.z >= outer.z - EPSILON &&
		inner.x + inner.width <= outer.x + outer.width + EPSILON &&
		inner.z + inner.depth <= outer.z + outer.depth + EPSILON
	);
}

// Расстояние от точки до прямоугольника (0, если точка внутри).
export function distancePointToRect(point: Vec2, rect: Rect): number {
	const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
	const dz = Math.max(rect.z - point.z, 0, point.z - (rect.z + rect.depth));
	return Math.hypot(dx, dz);
}

// Кратно ли число шагу сетки GRID_STEP.
export function isOnGrid(value: number): boolean {
	const cells = value / GRID_STEP;
	return Math.abs(cells - Math.round(cells)) < 1e-6;
}

// Приводит индекс к допустимому направлению взгляда 0..7 (с циклическим переходом, например 8 -> 0, -1 -> 7).
export function normalizeFacing(index: number): Facing8 {
	return ((((Math.round(index) % FACING_COUNT) + FACING_COUNT) % FACING_COUNT) as Facing8);
}

// Угол yaw (как rotation.y в three.js) для вектора на плоскости XZ: модель, смотрящая по +z при yaw=0, поворачивается вдоль вектора.
export function vectorToYaw(vector: Vec2): number {
	return Math.atan2(vector.x, vector.z);
}

// Угол yaw направления взгляда 0..7.
export function facingToYaw(facing: Facing8): number {
	return vectorToYaw(FACING_VECTORS[facing]);
}

// Ближайшее по углу направление взгляда 0..7 для вектора (без гистерезиса; гистерезис реализует sim/player).
export function vectorToNearestFacing(vector: Vec2): Facing8 {
	// Угол от направления "вверх" (-z) по часовой стрелке в градусах: x вправо, z вниз.
	const angle = Math.atan2(vector.x, -vector.z);
	return normalizeFacing((angle / (Math.PI * 2)) * FACING_COUNT);
}
