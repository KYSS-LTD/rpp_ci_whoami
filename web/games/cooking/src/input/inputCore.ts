// Ядро ввода: накапливает состояние всех источников (клавиатура, мышь, касания) в один InputState.
// Источники сообщают о нажатиях через это ядро, ядро ничего не знает о DOM. Владелец: SONNET-2 (geometry-control-nav).
import type { InputState, Vec2 } from "../contracts";

// Направление движения клавишей.
export type MoveDirection = "up" | "down" | "left" | "right";

// Назначение физической клавиши (по event.code: раскладка не влияет).
export type KeyBinding = { kind: "move"; direction: MoveDirection } | { kind: "action" } | { kind: "work" };

// Клавиши игры по event.code: WASD и стрелки двигают, E берёт и кладёт, Q выполняет рабочее действие.
export const KEY_BINDINGS: Readonly<Record<string, KeyBinding>> = {
	KeyW: { kind: "move", direction: "up" },
	ArrowUp: { kind: "move", direction: "up" },
	KeyS: { kind: "move", direction: "down" },
	ArrowDown: { kind: "move", direction: "down" },
	KeyA: { kind: "move", direction: "left" },
	ArrowLeft: { kind: "move", direction: "left" },
	KeyD: { kind: "move", direction: "right" },
	ArrowRight: { kind: "move", direction: "right" },
	KeyE: { kind: "action" },
	KeyQ: { kind: "work" },
};

// Состояние ввода без нажатий. Новый объект на каждый вызов: потребитель может его менять.
function createEmptyState(): InputState {
	return { moveVector: { x: 0, z: 0 }, actionPressed: false, actionHeld: false, workPressed: false, workHeld: false };
}

// Ядро ввода.
export interface InputCore {
	// Включён ли ввод: выключенный не даёт новых нажатий и возвращает пустое состояние.
	isEnabled(): boolean;
	setEnabled(enabled: boolean): void;
	// Клавиатура: code это event.code, isRepeat это event.repeat (автоповтор не даёт нового фронта).
	keyDown(code: string, isRepeat: boolean): void;
	keyUp(code: string): void;
	// Источники действия и рабочего действия (клавиша, мышь, экранная кнопка): sourceId различает источники.
	pressAction(sourceId: string): void;
	releaseAction(sourceId: string): void;
	pressWork(sourceId: string): void;
	releaseWork(sourceId: string): void;
	// Удерживается ли источник сейчас (мышь сверяет своё состояние с event.buttons, не храня копию: сброс ядра её не обманет).
	isActionSourceHeld(sourceId: string): boolean;
	isWorkSourceHeld(sourceId: string): boolean;
	// Вектор стика (длина от 0 до 1), задаёт сенсорный слой.
	setStick(vector: Vec2): void;
	// Собирает состояние на кадр. Фронты (actionPressed, workPressed) однократны: после чтения сбрасываются.
	read(): InputState;
	// Отпускает всё (потеря фокуса, пауза) и сбрасывает необработанные фронты.
	reset(): void;
}

// Создаёт ядро ввода.
export function createInputCore(): InputCore {
	// Нажатые клавиши движения (по event.code) и их направления.
	const heldMoveKeys = new Map<string, MoveDirection>();
	const actionSources = new Set<string>();
	const workSources = new Set<string>();
	let stick: Vec2 = { x: 0, z: 0 };
	let pendingAction = false;
	let pendingWork = false;
	let enabled = true;

	// Есть ли среди нажатых клавиш движения клавиша этого направления.
	function isDirectionHeld(direction: MoveDirection): boolean {
		for (const held of heldMoveKeys.values()) {
			if (held === direction) {
				return true;
			}
		}
		return false;
	}

	const core: InputCore = {
		isEnabled(): boolean {
			return enabled;
		},
		setEnabled(value: boolean): void {
			enabled = value;
			if (!value) {
				// Необработанные нажатия не должны сработать после включения. Удержания клавиш не трогаем: отпускание
				// клавиши в выключенном состоянии всё равно обрабатывается, а потеря фокуса сбрасывает всё.
				pendingAction = false;
				pendingWork = false;
			}
		},
		keyDown(code: string, isRepeat: boolean): void {
			const binding = KEY_BINDINGS[code];
			if (!binding) {
				return;
			}
			if (binding.kind === "move") {
				heldMoveKeys.set(code, binding.direction);
			} else if (binding.kind === "action") {
				// Удержание клавиши учитывается всегда, фронт нажатия только у включённого ввода и без автоповтора.
				if (enabled && !isRepeat) {
					core.pressAction(`key:${code}`);
				} else {
					actionSources.add(`key:${code}`);
				}
			} else if (enabled && !isRepeat) {
				core.pressWork(`key:${code}`);
			} else {
				workSources.add(`key:${code}`);
			}
		},
		keyUp(code: string): void {
			const binding = KEY_BINDINGS[code];
			if (!binding) {
				return;
			}
			if (binding.kind === "move") {
				heldMoveKeys.delete(code);
			} else if (binding.kind === "action") {
				actionSources.delete(`key:${code}`);
			} else {
				workSources.delete(`key:${code}`);
			}
		},
		pressAction(sourceId: string): void {
			actionSources.add(sourceId);
			if (enabled) {
				pendingAction = true;
			}
		},
		releaseAction(sourceId: string): void {
			actionSources.delete(sourceId);
		},
		pressWork(sourceId: string): void {
			workSources.add(sourceId);
			if (enabled) {
				pendingWork = true;
			}
		},
		releaseWork(sourceId: string): void {
			workSources.delete(sourceId);
		},
		isActionSourceHeld(sourceId: string): boolean {
			return actionSources.has(sourceId);
		},
		isWorkSourceHeld(sourceId: string): boolean {
			return workSources.has(sourceId);
		},
		setStick(vector: Vec2): void {
			stick = { x: vector.x, z: vector.z };
		},
		read(): InputState {
			if (!enabled) {
				return createEmptyState();
			}
			let x = (isDirectionHeld("right") ? 1 : 0) - (isDirectionHeld("left") ? 1 : 0);
			let z = (isDirectionHeld("down") ? 1 : 0) - (isDirectionHeld("up") ? 1 : 0);
			// Диагональ нормируется: скорость по диагонали равна скорости по прямой. Противоположные клавиши дают 0 по оси.
			if (x !== 0 && z !== 0) {
				x *= Math.SQRT1_2;
				z *= Math.SQRT1_2;
			}
			x += stick.x;
			z += stick.z;
			const length = Math.hypot(x, z);
			if (length > 1) {
				x /= length;
				z /= length;
			}
			const state: InputState = {
				// "|| 0" убирает отрицательный ноль, чтобы пустой ввод строго равнялся нулевому вектору.
				moveVector: { x: x || 0, z: z || 0 },
				actionPressed: pendingAction,
				actionHeld: actionSources.size > 0,
				workPressed: pendingWork,
				workHeld: workSources.size > 0,
			};
			pendingAction = false;
			pendingWork = false;
			return state;
		},
		reset(): void {
			heldMoveKeys.clear();
			actionSources.clear();
			workSources.clear();
			stick = { x: 0, z: 0 };
			pendingAction = false;
			pendingWork = false;
		},
	};
	return core;
}
