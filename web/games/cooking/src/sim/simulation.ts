// Сборка симуляции целиком (задача 9.1, часть интеграции): единственный интерфейс Simulation для main, рендера, HUD и бота.
// Собирает реальные модули областей в одном порядке шага (см. комментарий перед Simulation в contracts.ts):
// ввод -> повар -> кухня -> клиенты -> официанты -> навигация -> смена. sim/ не импортирует three и DOM.
// Владелец: Opus-агент.
import {
	SIM_STEP_SEC,
	type DebugInfo,
	type EventBus,
	type GameSnapshot,
	type InputState,
	type Item,
	type ShiftPhase,
	type SimClock,
	type SimEvent,
	type Simulation,
	type SimulationFactory,
	type SimulationOptions,
} from "../contracts";
import { facingToYaw } from "../common/math";
import { createFixedStepLoop } from "./core/loop";
import { createCustomerSystem } from "./customers";
import { buildDaySchedule } from "./customers/schedule";
import { createEventBus } from "./eventBus";
import { buildGeometry } from "./geometry";
import { createKitchen } from "./kitchen";
import { createNavSystem } from "./nav";
import { createPlayer } from "./player";
import { createShift } from "./shift";
import { createWaiterSystem } from "./waiter";

// Глубокая копия предмета для снимка: потребитель снимка не должен делить объекты с кухней.
function copyItem(item: Item): Item {
	if (item.type === "ingredient") {
		return { ...item };
	}
	return { ...item, contents: item.contents.map((ingredient) => ({ ...ingredient })) };
}

// Создаёт симуляцию уровня по seed расписания. Расписание, геометрия и все модули строятся сразу; смена стоит в фазе ready,
// пока не вызван start().
export const createSimulation: SimulationFactory = (options: SimulationOptions): Simulation => {
	const { level, seed } = options;
	const clock: SimClock = { nowSec: 0 };
	const bus: EventBus = createEventBus(clock);

	const schedule = buildDaySchedule(level, seed);
	const geometry = buildGeometry(level);
	const nav = createNavSystem({ level, geometry });
	const player = createPlayer({ level, geometry });
	// Смена подписывается на шину в конструкторе, поэтому создаётся до первого шага.
	const shift = createShift({ level, schedule, clock, bus });
	const customers = createCustomerSystem({ level, schedule, nav, clock, bus });
	const kitchen = createKitchen({ level, orders: customers, clock, bus });
	const waiters = createWaiterSystem({ level, nav, window: kitchen.window, orders: customers, clock, bus });

	// Фаза смены отслеживается по событиям шины: так шаг не собирает снимок смены ради одной проверки.
	let phase: ShiftPhase = "ready";
	bus.subscribe((event) => {
		if (event.type === "phaseChanged") {
			phase = event.phase;
		}
	});

	let tick = 0;

	// Ввод текущего кадра для накопителя и признаки "нажато", которые ещё не достались ни одному шагу.
	let frameInput: InputState = { moveVector: { x: 0, z: 0 }, actionPressed: false, actionHeld: false, workPressed: false, workHeld: false };
	let pendingActionPressed = false;
	let pendingWorkPressed = false;

	// Один фиксированный шаг (только в фазе running), порядок по contracts.ts.
	function runStep(input: InputState): void {
		if (phase !== "running") {
			return;
		}
		clock.nowSec += SIM_STEP_SEC;
		tick += 1;
		player.step(input, SIM_STEP_SEC);
		const target = player.getTarget();
		kitchen.setWork(input.workHeld && target ? target.stationId : null);
		if (input.actionPressed && target) {
			kitchen.interact(target.stationId);
		}
		kitchen.step(SIM_STEP_SEC);
		customers.step(SIM_STEP_SEC);
		// Клиент ушёл (провал смены): остаток шага пропускается, симуляция замирает.
		if (phase !== "running") {
			return;
		}
		waiters.step(SIM_STEP_SEC);
		nav.step(SIM_STEP_SEC, player.state.position);
		shift.step();
	}

	// Цикл накопителя: каждый фиксированный шаг получает ввод кадра, а однократные признаки достаются только первому шагу.
	const loop = createFixedStepLoop({
		stepSec: SIM_STEP_SEC,
		onStep: () => {
			runStep({ ...frameInput, actionPressed: pendingActionPressed, workPressed: pendingWorkPressed });
			pendingActionPressed = false;
			pendingWorkPressed = false;
		},
	});

	return {
		level,
		seed,
		schedule,
		geometry,
		pathfinder: nav.pathfinder,

		start(): void {
			shift.start();
		},

		step(input: InputState): void {
			runStep(input);
		},

		advance(frameDtSec: number, input: InputState): number {
			frameInput = input;
			pendingActionPressed = pendingActionPressed || input.actionPressed;
			pendingWorkPressed = pendingWorkPressed || input.workPressed;
			// В фазах ready, failed и finished время не идёт: накопитель не копится, признаки не залипают.
			if (phase !== "running") {
				pendingActionPressed = false;
				pendingWorkPressed = false;
				loop.reset();
				return 0;
			}
			return loop.advance(frameDtSec);
		},

		getSnapshot(): GameSnapshot {
			const shiftSnapshot = shift.getSnapshot();
			const target = player.getTarget();
			const hand = kitchen.getHand();
			const queue = customers.getQueueSnapshots();
			return {
				...shiftSnapshot,
				tick,
				chef: {
					position: { x: player.state.position.x, z: player.state.position.z },
					facing: player.state.facing,
					yaw: facingToYaw(player.state.facing),
					moving: player.state.moving,
					hand: hand === null ? null : copyItem(hand),
					target: target === null ? null : { stationId: target.stationId, kind: target.kind },
					working: kitchen.isWorking(),
				},
				waiters: waiters.getWaiterSnapshots(),
				customers: customers.getCustomerSnapshots(),
				stations: kitchen.getStationSnapshots(),
				windowDishes: kitchen.getWindowDishSnapshots(),
				tables: customers.getTableSnapshots(),
				queue,
				queuedGroups: queue.length,
			};
		},

		drainEvents(): SimEvent[] {
			return bus.drain();
		},

		subscribe(listener: (event: SimEvent) => void): () => void {
			return bus.subscribe(listener);
		},

		getResult() {
			return shift.getResult();
		},

		getDebugInfo(): DebugInfo {
			return {
				collisionGrid: geometry.collisionGrid,
				navGrid: geometry.navGrid,
				paths: nav.agents.map((agent) => ({ agentId: agent.id, points: [...agent.path] })),
				chefProbe: player.getProbePoint(),
			};
		},
	};
};
