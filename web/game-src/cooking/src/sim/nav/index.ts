// Навигационная система (задачи 4.1-4.4): владеет всеми NPC-агентами, ведёт их по путям A* со столкновением со статикой,
// мягко расталкивает друг от друга и от повара и перестраивает путь при застревании.
// Владелец: SONNET-2 (geometry-control-nav). sim/ не импортирует DOM и three.
import type { NavAgent, NavAgentSpec, NavAgentStatus, NavDeps, NavSystem, NavSystemFactory, Vec2 } from "../../contracts";
import { debugLog } from "../../config/debug";
import { moveCircle, type CollisionWorld } from "../geometry/collision";
import { createPathfinder } from "./pathfinder";
import { computeSeparationPush } from "./separation";

export { findCellPath, cellPathCost, octileDistance, type Cell } from "./astar";
export { createPathfinder, hasLineOfSight, findNearestFreeCell } from "./pathfinder";
export { computeSeparationPush } from "./separation";

// Внутреннее состояние агента.
interface AgentRecord {
	id: string;
	speed: number;
	radius: number;
	position: Vec2;
	heading: number;
	status: NavAgentStatus;
	// Оставшиеся точки пути: последняя это цель (в ней агент "приходит").
	waypoints: Vec2[];
	// Цель, заданная в moveTo (для перепланирования).
	requestedTarget: Vec2 | null;
	// Отслеживание застревания: время с последней проверки и положение на ту проверку.
	stuckElapsedSec: number;
	stuckAnchor: Vec2;
}

// Допуск длины оставшегося пути за шаг.
const EPSILON = 1e-9;

function distanceBetween(first: Vec2, second: Vec2): number {
	return Math.hypot(first.x - second.x, first.z - second.z);
}

// Создаёт навигационную систему уровня.
export const createNavSystem: NavSystemFactory = (deps: NavDeps): NavSystem => {
	const { level, geometry } = deps;
	const params = level.params.nav;
	const pathfinder = createPathfinder(geometry.navGrid);
	// Мир для столкновений: тот же массив препятствий, что в геометрии (изменения видны сразу).
	const world: CollisionWorld = { obstacles: geometry.obstacles, bounds: level.bounds };
	const records: AgentRecord[] = [];
	const agents: NavAgent[] = [];

	// Начинает отслеживание застревания заново (новая цель, перепланирование, перенос).
	function restartStuckTracking(record: AgentRecord): void {
		record.stuckElapsedSec = 0;
		record.stuckAnchor = record.position;
	}

	// Агент пришёл: путь и цель сброшены.
	function markArrived(record: AgentRecord): void {
		record.status = "arrived";
		record.waypoints = [];
		record.requestedTarget = null;
	}

	// Строит путь к цели от текущего положения. false, если цель недостижима.
	function planPath(record: AgentRecord, target: Vec2): boolean {
		const path = pathfinder.findPath(record.position, target);
		restartStuckTracking(record);
		if (path === null) {
			record.waypoints = [];
			record.requestedTarget = null;
			record.status = "unreachable";
			debugLog("nav", `агент ${record.id}: цель недостижима`, target);
			return false;
		}
		record.requestedTarget = { x: target.x, z: target.z };
		record.waypoints = path;
		record.status = path.length === 0 ? "arrived" : "moving";
		return true;
	}

	// Агент не продвигается: если цель рядом, считаем пришедшим, иначе перестраиваем путь от текущего положения.
	function handleStuck(record: AgentRecord): void {
		const target = record.requestedTarget ?? record.waypoints[record.waypoints.length - 1];
		if (!target) {
			markArrived(record);
			return;
		}
		if (distanceBetween(record.position, target) <= params.arriveDistance + record.radius) {
			markArrived(record);
			return;
		}
		debugLog("nav", `агент ${record.id}: застрял, путь перестраивается`);
		planPath(record, target);
	}

	// Шаг по пути: двигает агента к очередной точке со столкновением со статикой. Возвращает единичное направление движения.
	function followPath(record: AgentRecord, dtSec: number): Vec2 | null {
		let remaining = record.speed * dtSec;
		let travel: Vec2 | null = null;
		while (remaining > EPSILON && record.waypoints.length > 0) {
			const waypoint = record.waypoints[0];
			const dx = waypoint.x - record.position.x;
			const dz = waypoint.z - record.position.z;
			const distance = Math.hypot(dx, dz);
			const isLast = record.waypoints.length === 1;
			if (distance <= params.arriveDistance) {
				if (isLast) {
					break;
				}
				// Промежуточная точка достигнута: идём к следующей, не теряя остаток шага.
				record.waypoints.shift();
				continue;
			}
			const directionX = dx / distance;
			const directionZ = dz / distance;
			if (travel === null) {
				travel = { x: directionX, z: directionZ };
			}
			const stepLength = Math.min(remaining, distance);
			record.position = moveCircle(record.position, { x: directionX * stepLength, z: directionZ * stepLength }, record.radius, world);
			remaining -= stepLength;
		}
		return travel;
	}

	// Один шаг одного движущегося агента. neighbors: положения остальных персонажей на начало шага.
	function stepAgent(record: AgentRecord, dtSec: number, neighbors: readonly Vec2[]): void {
		const travel = followPath(record, dtSec);
		if (travel) {
			record.heading = Math.atan2(travel.x, travel.z);
		}
		// Расталкивание: движущийся агент обходит соседей и отталкивается от них (стоящие этим не сдвигаются).
		const push = computeSeparationPush(record.position, travel, neighbors, { radius: params.separationRadius, strength: params.separationStrength });
		if (Math.hypot(push.x, push.z) > EPSILON) {
			record.position = moveCircle(record.position, { x: push.x * dtSec, z: push.z * dtSec }, record.radius, world);
		}
		// Приход: последняя точка достигнута. Встаём точно в неё, если нет препятствий.
		if (record.waypoints.length === 0) {
			markArrived(record);
			return;
		}
		if (record.waypoints.length === 1) {
			const last = record.waypoints[0];
			if (distanceBetween(record.position, last) <= params.arriveDistance) {
				record.position = moveCircle(record.position, { x: last.x - record.position.x, z: last.z - record.position.z }, record.radius, world);
				markArrived(record);
				return;
			}
		}
		// Застревание: за stuckTimeoutSec агент сместился меньше stuckMinProgress.
		record.stuckElapsedSec += dtSec;
		if (record.stuckElapsedSec >= params.stuckTimeoutSec) {
			const progress = distanceBetween(record.position, record.stuckAnchor);
			restartStuckTracking(record);
			if (progress < params.stuckMinProgress) {
				handleStuck(record);
			}
		}
	}

	// Публичный объект агента поверх внутреннего состояния.
	function createFacade(record: AgentRecord): NavAgent {
		return {
			get id(): string {
				return record.id;
			},
			get position(): Vec2 {
				return record.position;
			},
			get heading(): number {
				return record.heading;
			},
			get status(): NavAgentStatus {
				return record.status;
			},
			get isMoving(): boolean {
				return record.status === "moving";
			},
			get path(): readonly Vec2[] {
				return record.waypoints;
			},
			moveTo(target: Vec2): boolean {
				return planPath(record, target);
			},
			stop(): void {
				record.waypoints = [];
				record.requestedTarget = null;
				record.status = "idle";
			},
			teleport(position: Vec2, heading?: number): void {
				record.position = { x: position.x, z: position.z };
				record.waypoints = [];
				record.requestedTarget = null;
				record.status = "idle";
				if (heading !== undefined) {
					record.heading = heading;
				}
				restartStuckTracking(record);
			},
			setHeading(heading: number): void {
				record.heading = heading;
			},
		};
	}

	return {
		pathfinder,
		get agents(): readonly NavAgent[] {
			return agents;
		},
		createAgent(spec: NavAgentSpec): NavAgent {
			if (records.some((existing) => existing.id === spec.id)) {
				throw new Error(`Агент навигации с идентификатором ${spec.id} уже существует`);
			}
			const position = { x: spec.position.x, z: spec.position.z };
			const record: AgentRecord = {
				id: spec.id,
				speed: spec.speed,
				radius: spec.radius,
				position,
				heading: 0,
				status: "idle",
				waypoints: [],
				requestedTarget: null,
				stuckElapsedSec: 0,
				stuckAnchor: position,
			};
			const agent = createFacade(record);
			records.push(record);
			agents.push(agent);
			return agent;
		},
		removeAgent(agentId: string): void {
			const index = records.findIndex((record) => record.id === agentId);
			if (index >= 0) {
				records.splice(index, 1);
				agents.splice(index, 1);
			}
		},
		step(dtSec: number, chefPosition: Vec2): void {
			// Положения всех на начало шага: расталкивание симметрично и не зависит от порядка агентов.
			const snapshot = records.map((record) => record.position);
			for (let index = 0; index < records.length; index += 1) {
				const record = records[index];
				if (record.status !== "moving") {
					continue;
				}
				const neighbors: Vec2[] = [chefPosition];
				for (let other = 0; other < snapshot.length; other += 1) {
					if (other !== index) {
						neighbors.push(snapshot[other]);
					}
				}
				stepAgent(record, dtSec, neighbors);
			}
		},
	};
};
