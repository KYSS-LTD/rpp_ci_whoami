// Выбор цели взаимодействия повара (задача 3.6): станция, ближайшая к точке перед поваром по направлению взгляда.
// Владелец: SONNET-2 (geometry-control-nav). Чистые функции без состояния.
import { FACING_VECTORS, type Facing8, type InteractionTarget, type StationConfig, type Vec2 } from "../../contracts";
import { distancePointToRect } from "../../common/math";

// Разница расстояний, в пределах которой цели считаются равноудалёнными (тогда выбирает ближайшая к телу).
const TIE_EPSILON = 1e-9;

// Точка выбора цели: reach вперёд от центра повара по направлению взгляда.
export function probePoint(position: Vec2, facing: Facing8, reach: number): Vec2 {
	const direction = FACING_VECTORS[facing];
	return { x: position.x + direction.x * reach, z: position.z + direction.z * reach };
}

// Цель: станция, расстояние от точки выбора до прямоугольника которой не больше tolerance, минимальное из таких.
// Равноудалённые станции (угол двух прилавков): выигрывает та, что ближе к центру повара, затем первая в списке.
// null, если станции в допуске нет.
export function pickTarget(stations: readonly StationConfig[], position: Vec2, probe: Vec2, tolerance: number): InteractionTarget | null {
	let best: InteractionTarget | null = null;
	let bestBodyDistance = Infinity;
	for (const station of stations) {
		const distance = distancePointToRect(probe, station.rect);
		if (distance > tolerance) {
			continue;
		}
		const bodyDistance = distancePointToRect(position, station.rect);
		const isBetter = best === null || distance < best.distance - TIE_EPSILON || (Math.abs(distance - best.distance) <= TIE_EPSILON && bodyDistance < bestBodyDistance - TIE_EPSILON);
		if (isBetter) {
			best = { stationId: station.id, kind: station.kind, distance };
			bestBodyDistance = bodyDistance;
		}
	}
	return best;
}
