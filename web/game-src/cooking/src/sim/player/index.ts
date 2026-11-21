// Повар (задачи 3.4, 3.5, 3.6): движение кругом с коллизиями и скольжением, взгляд в восемь направлений с гистерезисом,
// выбор цели взаимодействия. Владелец: SONNET-2 (geometry-control-nav). sim/ не импортирует three и DOM.
import type { InteractionTarget, InputState, Player, PlayerDeps, PlayerFactory, PlayerState, Vec2 } from "../../contracts";
import { moveCircle, type CollisionWorld } from "../geometry/collision";
import { resolveFacing } from "./facing";
import { pickTarget, probePoint } from "./target";

export { resolveFacing } from "./facing";
export { pickTarget, probePoint } from "./target";

// Доля намеченного смещения, ниже которой упор в препятствие считается "не иду" (для покачивания модели).
const MOVING_MIN_RATIO = 0.1;

// Создаёт повара в точке chefStart уровня.
export const createPlayer: PlayerFactory = (deps: PlayerDeps): Player => {
	const { level, geometry } = deps;
	const params = level.params.player;
	const world: CollisionWorld = { obstacles: geometry.obstacles, bounds: level.bounds };
	const state: PlayerState = {
		position: { x: level.chefStart.position.x, z: level.chefStart.position.z },
		facing: level.chefStart.facing,
		moving: false,
	};
	let target: InteractionTarget | null = null;

	// Точка выбора цели перед поваром.
	function computeProbe(): Vec2 {
		return probePoint(state.position, state.facing, params.reach);
	}

	// Пересчитывает цель по текущему положению и взгляду.
	function refreshTarget(): void {
		target = pickTarget(level.stations, state.position, computeProbe(), params.targetTolerance);
	}

	refreshTarget();

	return {
		get state(): PlayerState {
			return state;
		},
		step(input: InputState, dtSec: number): void {
			let moveX = input.moveVector.x;
			let moveZ = input.moveVector.z;
			const inputLength = Math.hypot(moveX, moveZ);
			// Длина ввода не больше 1: диагональ не быстрее прямой, даже если ввод пришёл ненормированным.
			if (inputLength > 1) {
				moveX /= inputLength;
				moveZ /= inputLength;
			}
			const intended = Math.min(inputLength, 1) * params.speed * dtSec;
			const before = state.position;
			if (intended > 0) {
				state.position = moveCircle(before, { x: moveX * params.speed * dtSec, z: moveZ * params.speed * dtSec }, params.radius, world);
			} else {
				state.position = moveCircle(before, { x: 0, z: 0 }, params.radius, world);
			}
			const moved = Math.hypot(state.position.x - before.x, state.position.z - before.z);
			state.moving = intended > 0 && moved > intended * MOVING_MIN_RATIO;
			// Взгляд обновляется по вводу, а не по фактическому смещению: поворот к прилавку работает и при упоре в него.
			if (inputLength >= params.facingDeadzone) {
				state.facing = resolveFacing(state.facing, { x: moveX, z: moveZ }, params.facingHysteresisDeg);
			}
			refreshTarget();
		},
		getTarget(): InteractionTarget | null {
			return target === null ? null : { ...target };
		},
		getProbePoint(): Vec2 {
			return computeProbe();
		},
	};
};
