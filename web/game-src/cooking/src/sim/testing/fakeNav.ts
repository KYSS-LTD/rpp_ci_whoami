// Тестовый двойник навигации: агенты идут по прямой, не замечая препятствий. Нужен тестам клиентов, официантов и симуляции,
// чтобы не зависеть от настоящего A* (sim/nav, SONNET-2). Реализует NavSystem из contracts.ts. Владелец: Opus-агент.
// Режим instant: агент приходит к цели на ближайшем шаге (удобно, когда движение в тесте не важно).
import type { NavAgent, NavAgentSpec, NavAgentStatus, NavSystem, Pathfinder, Vec2 } from "../../contracts";

// Параметры двойника.
export interface FakeNavOptions {
	// Агент мгновенно оказывается у цели на ближайшем step.
	instant?: boolean;
	// Расстояние, на котором агент считается пришедшим.
	arriveDistance?: number;
}

// Прямой "поисковик пути": путь это одна точка цели, длина это расстояние по прямой.
export function createStraightPathfinder(): Pathfinder {
	return {
		findPath(from: Vec2, to: Vec2): Vec2[] | null {
			return Math.hypot(to.x - from.x, to.z - from.z) < 1e-9 ? [] : [{ x: to.x, z: to.z }];
		},
		pathLength(from: Vec2, to: Vec2): number | null {
			return Math.hypot(to.x - from.x, to.z - from.z);
		},
	};
}

// Создаёт двойник навигации.
export function createFakeNavSystem(options: FakeNavOptions = {}): NavSystem {
	const arriveDistance = options.arriveDistance ?? 0.05;
	const agents: FakeAgent[] = [];

	class FakeAgent implements NavAgent {
		readonly id: string;
		position: Vec2;
		heading = 0;
		status: NavAgentStatus = "idle";
		path: Vec2[] = [];
		private readonly speed: number;

		constructor(spec: NavAgentSpec) {
			this.id = spec.id;
			this.position = { x: spec.position.x, z: spec.position.z };
			this.speed = spec.speed;
		}

		get isMoving(): boolean {
			return this.status === "moving";
		}

		moveTo(target: Vec2): boolean {
			this.path = [{ x: target.x, z: target.z }];
			this.status = "moving";
			return true;
		}

		stop(): void {
			this.path = [];
			this.status = "idle";
		}

		teleport(position: Vec2, heading?: number): void {
			this.position = { x: position.x, z: position.z };
			this.path = [];
			this.status = "idle";
			if (heading !== undefined) {
				this.heading = heading;
			}
		}

		setHeading(heading: number): void {
			this.heading = heading;
		}

		step(dtSec: number): void {
			if (this.status !== "moving" || this.path.length === 0) {
				return;
			}
			const target = this.path[0];
			const dx = target.x - this.position.x;
			const dz = target.z - this.position.z;
			const distance = Math.hypot(dx, dz);
			if (options.instant || distance <= arriveDistance || distance <= this.speed * dtSec) {
				this.position = { x: target.x, z: target.z };
				this.path = [];
				this.status = "arrived";
				return;
			}
			this.heading = Math.atan2(dx, dz);
			this.position = { x: this.position.x + (dx / distance) * this.speed * dtSec, z: this.position.z + (dz / distance) * this.speed * dtSec };
		}
	}

	return {
		pathfinder: createStraightPathfinder(),
		get agents(): readonly NavAgent[] {
			return agents;
		},
		createAgent(spec: NavAgentSpec): NavAgent {
			const agent = new FakeAgent(spec);
			agents.push(agent);
			return agent;
		},
		removeAgent(agentId: string): void {
			const position = agents.findIndex((agent) => agent.id === agentId);
			if (position >= 0) {
				agents.splice(position, 1);
			}
		},
		step(dtSec: number): void {
			agents.forEach((agent) => agent.step(dtSec));
		},
	};
}
