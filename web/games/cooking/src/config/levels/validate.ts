// Структурная проверка данных уровня: сетка, уникальность идентификаторов, пересечения, свободные точки.
// Возвращает список проблем (пустой список: уровень корректен). Используется тестами фикстур и уровней easy, medium, hard.
// Достижимость по навигационной сетке проверяют отдельные тесты уровней (задача 8.5). Владелец: Opus-агент.
import type { LevelConfig, Rect, Vec2 } from "../../contracts";
import { distancePointToRect, isOnGrid, rectContainsPoint, rectInside, rectsOverlap } from "../../common/math";

// Блокирующий прямоугольник уровня с подписью для сообщений.
export interface LabeledRect {
	label: string;
	rect: Rect;
}

// Все блокирующие прямоугольники уровня: блокирующие props, colliders, станции, столы и стулья.
export function collectObstacles(level: LevelConfig): LabeledRect[] {
	const obstacles: LabeledRect[] = [];
	level.props.filter((prop) => prop.blocking).forEach((prop) => obstacles.push({ label: `prop ${prop.id}`, rect: prop.rect }));
	level.colliders.forEach((collider, index) => obstacles.push({ label: `collider ${index}`, rect: collider }));
	level.stations.forEach((station) => obstacles.push({ label: `station ${station.id}`, rect: station.rect }));
	level.tables.forEach((table) => {
		obstacles.push({ label: `table ${table.id}`, rect: table.rect });
		table.seats.forEach((seat, seatIndex) => obstacles.push({ label: `chair ${table.id}#${seatIndex}`, rect: seat.chairRect }));
	});
	return obstacles;
}

// Проверяет уровень. clearance: минимальное расстояние от точек (подход, ожидание, очередь) до препятствий.
export function validateLevelConfig(level: LevelConfig, clearance = 0.25): string[] {
	const problems: string[] = [];
	const obstacles = collectObstacles(level);

	// 1. Сетка 0.5, положительные размеры, положение внутри мира.
	const checkRect = (label: string, target: Rect): void => {
		const numbers = [target.x, target.z, target.width, target.depth];
		if (!numbers.every(isOnGrid)) {
			problems.push(`${label}: числа не кратны шагу сетки: ${JSON.stringify(target)}`);
		}
		if (target.width <= 0 || target.depth <= 0) {
			problems.push(`${label}: размеры должны быть положительными`);
		}
		if (!rectInside(target, level.bounds)) {
			problems.push(`${label}: выходит за границы мира`);
		}
	};
	obstacles.forEach((obstacle) => checkRect(obstacle.label, obstacle.rect));
	level.props.filter((prop) => !prop.blocking).forEach((prop) => checkRect(`prop ${prop.id}`, prop.rect));
	level.floors.forEach((floor, index) => checkRect(`floor ${index}`, floor.rect));
	checkRect("door", level.door.rect);
	checkRect("view", level.view);

	// 2. Уникальность идентификаторов.
	const checkUnique = (kind: string, ids: string[]): void => {
		const seen = new Set<string>();
		ids.forEach((id) => {
			if (seen.has(id)) {
				problems.push(`${kind}: повторный идентификатор ${id}`);
			}
			seen.add(id);
		});
	};
	checkUnique("props", level.props.map((prop) => prop.id));
	checkUnique("stations", level.stations.map((station) => station.id));
	checkUnique("tables", level.tables.map((table) => table.id));
	checkUnique("table numbers", level.tables.map((table) => String(table.number)));

	// 3. Блокирующие объекты не пересекаются между собой (касание сторонами допустимо).
	for (let first = 0; first < obstacles.length; first += 1) {
		for (let second = first + 1; second < obstacles.length; second += 1) {
			if (rectsOverlap(obstacles[first].rect, obstacles[second].rect)) {
				problems.push(`пересечение: ${obstacles[first].label} и ${obstacles[second].label}`);
			}
		}
	}

	// 4. Проём двери не закрыт препятствиями.
	obstacles.forEach((obstacle) => {
		if (rectsOverlap(obstacle.rect, level.door.rect)) {
			problems.push(`${obstacle.label} перекрывает проём двери`);
		}
	});

	// 5. Станции: у ящика задан ингредиент, окно выдачи ровно одно и описано в window.
	level.stations.forEach((station) => {
		if (station.kind === "crate" && !station.ingredient) {
			problems.push(`station ${station.id}: у ящика не задан ingredient`);
		}
	});
	const windowStations = level.stations.filter((station) => station.kind === "servingWindow");
	if (windowStations.length !== 1 || windowStations[0].id !== level.window.stationId) {
		problems.push("должна быть ровно одна станция servingWindow, и window.stationId должен на неё указывать");
	}
	if (level.window.dishPoints.length < 1) {
		problems.push("window.dishPoints: нужен хотя бы один слот");
	}

	// Точка должна быть внутри мира и не ближе clearance к препятствию.
	const checkFreePoint = (label: string, point: Vec2): void => {
		const outside =
			point.x < level.bounds.x ||
			point.z < level.bounds.z ||
			point.x > level.bounds.x + level.bounds.width ||
			point.z > level.bounds.z + level.bounds.depth;
		if (outside) {
			problems.push(`${label}: точка вне границ мира`);
			return;
		}
		const blocker = obstacles.find((obstacle) => distancePointToRect(point, obstacle.rect) < clearance);
		if (blocker) {
			problems.push(`${label}: точка ближе ${clearance} к ${blocker.label}`);
		}
	};

	// 6. Столы: 2 или 4 места, блюдо лежит на столе, сидящий на стуле, точки подхода и подачи свободны.
	level.tables.forEach((table) => {
		if (table.seats.length !== 2 && table.seats.length !== 4) {
			problems.push(`table ${table.id}: должно быть 2 или 4 места`);
		}
		table.seats.forEach((seat, seatIndex) => {
			const label = `${table.id}#${seatIndex}`;
			if (!rectContainsPoint(table.rect, seat.dishPoint)) {
				problems.push(`seat ${label}: dishPoint должна лежать на столе`);
			}
			if (!rectContainsPoint(seat.chairRect, seat.sitPoint)) {
				problems.push(`seat ${label}: sitPoint должна лежать на стуле`);
			}
			checkFreePoint(`seat ${label} approachPoint`, seat.approachPoint);
			checkFreePoint(`seat ${label} servePoint`, seat.servePoint);
		});
	});

	// 7. Свободные точки: старт повара, ожидание официантов, дверь, очередь, окно.
	checkFreePoint("chefStart", level.chefStart.position);
	level.waiters.waitPoints.forEach((point, index) => checkFreePoint(`waitPoint ${index}`, point));
	checkFreePoint("door.insidePoint", level.door.insidePoint);
	checkFreePoint("door.outsidePoint", level.door.outsidePoint);
	checkFreePoint("door.spawnPoint", level.door.spawnPoint);
	checkFreePoint("door.exitPoint", level.door.exitPoint);
	checkFreePoint("window.pickupPoint", level.window.pickupPoint);
	level.queue.slots.forEach((slot) => {
		level.queue.memberOffsets.forEach((offset, memberIndex) => {
			checkFreePoint(`queue slot ${slot.index} member ${memberIndex}`, { x: slot.position.x + offset.x, z: slot.position.z + offset.z });
		});
	});

	// 8. Очередь, официанты, seed.
	level.queue.slots.forEach((slot, position) => {
		if (slot.index !== position) {
			problems.push(`queue: слот ${position} имеет index ${slot.index}, ожидается ${position}`);
		}
	});
	if (level.queue.memberOffsets.length < 4) {
		problems.push("queue.memberOffsets: нужно минимум 4 смещения");
	}
	if (level.waiters.waitPoints.length < 1) {
		problems.push("waiters.waitPoints: нужен хотя бы один официант");
	}
	if (level.verifiedSeeds.length < 1) {
		problems.push("verifiedSeeds: нужен хотя бы один проверенный seed");
	}

	// 9. Параметры: размер группы не больше самого большого стола, смена длиннее закрытия потока, у блюд меню есть параметры.
	const largestTable = Math.max(0, ...level.tables.map((table) => table.seats.length));
	if (level.params.schedule.groupSizeWeights.length > largestTable) {
		problems.push(`schedule.groupSizeWeights: размер группы ${level.params.schedule.groupSizeWeights.length} больше самого большого стола (${largestTable})`);
	}
	if (level.params.durationSec <= level.params.schedule.flowCloseBeforeEndSec) {
		problems.push("durationSec должна быть больше flowCloseBeforeEndSec");
	}
	level.params.menu.forEach((dish) => {
		if (!level.params.dishes[dish]) {
			problems.push(`params.dishes: нет параметров блюда ${dish}`);
		}
	});

	return problems;
}
