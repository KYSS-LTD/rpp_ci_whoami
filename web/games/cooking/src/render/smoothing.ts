// Сглаживание движения для рендера (задача 6.6): доворот угла по кратчайшей дуге и плавное приближение позиции.
// Симуляция идёт фиксированным шагом, а кадры рисуются с частотой экрана: сглаживание убирает рывки между кадрами.
import type { Vec2 } from "../contracts";

// Полный оборот.
const fullTurn = Math.PI * 2;

// Приводит угол к диапазону [-PI, PI).
export function wrapAngle(angle: number): number {
	const wrapped = (((angle + Math.PI) % fullTurn) + fullTurn) % fullTurn;
	return wrapped - Math.PI;
}

// Кратчайшая разность углов target - current в диапазоне [-PI, PI).
export function shortestAngleDelta(current: number, target: number): number {
	return wrapAngle(target - current);
}

// Коэффициент экспоненциального приближения за кадр: не зависит от частоты кадров.
export function getSmoothingFactor(rate: number, frameDtSec: number): number {
	return 1 - Math.exp(-rate * Math.max(frameDtSec, 0));
}

// Приближает угол current к target по кратчайшей дуге. Поворот на 180 градусов идёт плавно, а не мгновенно.
// rate - скорость приближения (1/сек): чем больше, тем быстрее. Возвращает новый угол (не обязательно в [-PI, PI)).
export function approachAngle(current: number, target: number, frameDtSec: number, rate: number): number {
	const delta = shortestAngleDelta(current, target);
	if (Math.abs(delta) < 1e-4) {
		return target;
	}
	return current + delta * getSmoothingFactor(rate, frameDtSec);
}

// Приближает позицию к цели. Если цель дальше snapDistance (посадка, появление), позиция переносится сразу.
export function approachPosition(current: Vec2, target: Vec2, frameDtSec: number, rate: number, snapDistance: number): Vec2 {
	const distance = Math.hypot(target.x - current.x, target.z - current.z);
	if (distance > snapDistance || distance < 1e-4) {
		return { x: target.x, z: target.z };
	}
	const factor = getSmoothingFactor(rate, frameDtSec);
	return { x: current.x + (target.x - current.x) * factor, z: current.z + (target.z - current.z) * factor };
}
