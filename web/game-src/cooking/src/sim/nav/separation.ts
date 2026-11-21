// Мягкое расталкивание персонажей (задача 4.3): сила отталкивания от соседей и боковой обход при встречном движении.
// Чистая функция без состояния. Владелец: SONNET-2 (geometry-control-nav).
import type { Vec2 } from "../../contracts";

// Боковое смещение соседа от линии движения (в долях единичного вектора), меньше которого сосед считается "строго впереди":
// тогда обход идёт вправо по ходу движения, и два встречных персонажа расходятся в разные стороны.
const LATERAL_DEADZONE = 0.05;

// Расстояние между центрами, меньше которого центры считаются совпавшими (направление "от соседа" не определено).
const COINCIDENT_DISTANCE = 1e-6;

// Параметры расталкивания (NavParams.separationRadius и separationStrength).
export interface SeparationParams {
	// Расстояние, на котором соседи начинают отталкивать.
	radius: number;
	// Скорость отталкивания при полном перекрытии (центры совпали), единиц мира в секунду.
	strength: number;
}

// Скорость расталкивания движущегося персонажа в точке position от соседей neighbors (единиц мира в секунду).
// travelDirection: единичный вектор движения персонажа или null, если он не идёт. Сила каждого соседа растёт линейно от
// нуля на расстоянии radius до strength при совпадении центров. Для соседа впереди по ходу добавляется боковая
// составляющая: персонаж уходит в сторону, откуда сосед смещён меньше (при равенстве вправо по ходу). Суммарная скорость
// ограничена strength: пока strength меньше скорости ходьбы, расталкивание не может остановить движение вперёд насовсем.
export function computeSeparationPush(position: Vec2, travelDirection: Vec2 | null, neighbors: readonly Vec2[], params: SeparationParams): Vec2 {
	let pushX = 0;
	let pushZ = 0;
	// Вправо по ходу движения на экране (z вниз): поворот направления на 90 градусов по часовой стрелке.
	const rightX = travelDirection ? -travelDirection.z : 1;
	const rightZ = travelDirection ? travelDirection.x : 0;
	for (const neighbor of neighbors) {
		const dx = position.x - neighbor.x;
		const dz = position.z - neighbor.z;
		const distance = Math.hypot(dx, dz);
		if (distance >= params.radius) {
			continue;
		}
		const magnitude = params.strength * ((params.radius - distance) / params.radius);
		if (distance < COINCIDENT_DISTANCE) {
			// Центры совпали: уходим вправо по ходу движения.
			pushX += rightX * magnitude;
			pushZ += rightZ * magnitude;
			continue;
		}
		const awayX = dx / distance;
		const awayZ = dz / distance;
		pushX += awayX * magnitude;
		pushZ += awayZ * magnitude;
		if (travelDirection) {
			// Сосед впереди по ходу: добавляем обход в сторону.
			const frontness = -awayX * travelDirection.x + -awayZ * travelDirection.z;
			if (frontness > 0) {
				const lateral = -awayX * rightX + -awayZ * rightZ;
				const side = Math.abs(lateral) > LATERAL_DEADZONE ? (lateral > 0 ? -1 : 1) : 1;
				pushX += rightX * side * magnitude * frontness;
				pushZ += rightZ * side * magnitude * frontness;
			}
		}
	}
	const length = Math.hypot(pushX, pushZ);
	if (length > params.strength) {
		pushX = (pushX / length) * params.strength;
		pushZ = (pushZ / length) * params.strength;
	}
	return { x: pushX, z: pushZ };
}
