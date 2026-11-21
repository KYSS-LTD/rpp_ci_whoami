// Направление взгляда повара: восемь секторов по 45 градусов с гистерезисом на границах (задача 3.5).
// Владелец: SONNET-2 (geometry-control-nav). Чистые функции без состояния.
import type { Facing8, Vec2 } from "../../contracts";
import { vectorToNearestFacing } from "../../common/math";

// Ширина сектора взгляда, градусы.
const SECTOR_DEG = 45;

// Угол вектора движения от направления "вверх по экрану" по часовой стрелке в градусах (-180..180).
function vectorAngleDeg(vector: Vec2): number {
	return (Math.atan2(vector.x, -vector.z) * 180) / Math.PI;
}

// Кратчайшая разность двух углов в градусах (-180..180).
function angleDifferenceDeg(first: number, second: number): number {
	return ((((first - second) % 360) + 540) % 360) - 180;
}

// Новое направление взгляда для вектора ввода. Текущий сектор сохраняется, пока вектор не зашёл за его границу
// (половина сектора 22.5 градуса) больше чем на hysteresisDeg; тогда выбирается ближайший сектор к вектору.
// Так малые колебания стика на границе двух секторов не переключают взгляд.
export function resolveFacing(current: Facing8, vector: Vec2, hysteresisDeg: number): Facing8 {
	const difference = Math.abs(angleDifferenceDeg(vectorAngleDeg(vector), current * SECTOR_DEG));
	if (difference <= SECTOR_DEG / 2 + hysteresisDeg) {
		return current;
	}
	return vectorToNearestFacing(vector);
}
