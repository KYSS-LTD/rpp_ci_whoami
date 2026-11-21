import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InputMode, InputSource } from "../contracts";
import { controlsTexts } from "../texts/controls";
import { createInputSystem } from "./index";
import { TOUCH_STICK_DEADZONE, TOUCH_STICK_RADIUS_PX } from "./touch";

// Системы ввода и корни, созданные тестом: убираются после каждого теста, чтобы обработчики не копились на window.
let systems: InputSource[] = [];
let roots: HTMLElement[] = [];

// Подменяет matchMedia: coarse это "основной указатель грубый" (телефон).
function setCoarsePointer(coarse: boolean): void {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		writable: true,
		value: (query: string) => ({ matches: coarse && query.includes("coarse"), media: query }),
	});
}

// Создаёт систему ввода в новом корневом элементе, прикреплённом к документу.
function setup(): { input: InputSource; root: HTMLElement } {
	const root = document.createElement("div");
	document.body.appendChild(root);
	const input = createInputSystem({ root, eventTarget: window });
	systems.push(input);
	roots.push(root);
	return { input, root };
}

// Клавиша: code это физическая клавиша, key это символ раскладки (для русской раскладки они различаются).
function keyDown(code: string, init: KeyboardEventInit = {}): KeyboardEvent {
	const event = new KeyboardEvent("keydown", { code, key: init.key ?? code, bubbles: true, cancelable: true, ...init });
	window.dispatchEvent(event);
	return event;
}

function keyUp(code: string, init: KeyboardEventInit = {}): void {
	window.dispatchEvent(new KeyboardEvent("keyup", { code, key: init.key ?? code, bubbles: true, cancelable: true, ...init }));
}

// Событие указателя на элементе (всплывает до window).
function firePointer(element: EventTarget, type: string, init: PointerEventInit): PointerEvent {
	const event = new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
	element.dispatchEvent(event);
	return event;
}

// Слой касаний и его кнопки.
function getTouchParts(root: HTMLElement): { layer: HTMLElement; actionButton: HTMLButtonElement; workButton: HTMLButtonElement } {
	const layer = root.querySelector<HTMLElement>(".cooking-touch-layer");
	const actionButton = root.querySelector<HTMLButtonElement>(".cooking-touch-button-action");
	const workButton = root.querySelector<HTMLButtonElement>(".cooking-touch-button-work");
	if (!layer || !actionButton || !workButton) {
		throw new Error("слой касаний не создан");
	}
	return { layer, actionButton, workButton };
}

beforeEach(() => {
	systems = [];
	roots = [];
	setCoarsePointer(false);
});

afterEach(() => {
	systems.forEach((system) => system.dispose());
	roots.forEach((root) => root.remove());
	Reflect.deleteProperty(window, "matchMedia");
	Reflect.deleteProperty(document, "visibilityState");
	Reflect.deleteProperty(document, "elementFromPoint");
});

describe("клавиатура: движение", () => {
	it("Русская раскладка: физическая клавиша W двигает вверх независимо от символа раскладки", () => {
		const { input } = setup();
		keyDown("KeyW", { key: "ц" });
		expect(input.read().moveVector).toEqual({ x: 0, z: -1 });
		keyUp("KeyW", { key: "ц" });
		keyDown("KeyA", { key: "ф" });
		expect(input.read().moveVector).toEqual({ x: -1, z: 0 });
		keyUp("KeyA", { key: "ф" });
		keyDown("KeyS", { key: "ы" });
		expect(input.read().moveVector).toEqual({ x: 0, z: 1 });
		keyUp("KeyS", { key: "ы" });
		keyDown("KeyD", { key: "в" });
		expect(input.read().moveVector).toEqual({ x: 1, z: 0 });
	});

	it("стрелки двигают так же, как WASD", () => {
		const { input } = setup();
		keyDown("ArrowUp");
		expect(input.read().moveVector).toEqual({ x: 0, z: -1 });
		keyUp("ArrowUp");
		keyDown("ArrowRight");
		expect(input.read().moveVector).toEqual({ x: 1, z: 0 });
		keyUp("ArrowRight");
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
	});

	it("Диагональ: вектор по диагонали нормирован, длина равна длине по прямой", () => {
		const { input } = setup();
		keyDown("KeyW");
		keyDown("KeyD");
		const diagonal = input.read().moveVector;
		expect(diagonal.x).toBeCloseTo(Math.SQRT1_2, 9);
		expect(diagonal.z).toBeCloseTo(-Math.SQRT1_2, 9);
		expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1, 9);
		keyUp("KeyW");
		keyUp("KeyD");
		keyDown("KeyS");
		const straight = input.read().moveVector;
		expect(Math.hypot(straight.x, straight.z)).toBeCloseTo(1, 9);
	});

	it("Противоположные клавиши: влево и вправо вместе гасят друг друга по оси", () => {
		const { input } = setup();
		keyDown("KeyA");
		keyDown("KeyD");
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
		// Ось z при этом работает, и вектор остаётся единичным.
		keyDown("KeyW");
		expect(input.read().moveVector).toEqual({ x: 0, z: -1 });
		keyDown("KeyS");
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
	});

	it("две клавиши одного направления: отпускание одной не останавливает движение", () => {
		const { input } = setup();
		keyDown("KeyW");
		keyDown("ArrowUp");
		keyUp("KeyW");
		expect(input.read().moveVector).toEqual({ x: 0, z: -1 });
		keyUp("ArrowUp");
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
	});

	it("клавиши с Ctrl, Alt и Meta игрой не обрабатываются", () => {
		const { input } = setup();
		keyDown("KeyW", { ctrlKey: true });
		keyDown("KeyE", { metaKey: true });
		const state = input.read();
		expect(state.moveVector).toEqual({ x: 0, z: 0 });
		expect(state.actionPressed).toBe(false);
	});

	it("посторонние клавиши ввод не меняют", () => {
		const { input } = setup();
		keyDown("KeyZ");
		keyDown("Space");
		expect(input.read()).toEqual({ moveVector: { x: 0, z: 0 }, actionPressed: false, actionHeld: false, workPressed: false, workHeld: false });
	});
});

describe("клавиши действий и мышь", () => {
	it("E: фронт нажатия приходит ровно в одном чтении, удержание остаётся", () => {
		const { input } = setup();
		keyDown("KeyE");
		const first = input.read();
		expect(first.actionPressed).toBe(true);
		expect(first.actionHeld).toBe(true);
		const second = input.read();
		expect(second.actionPressed).toBe(false);
		expect(second.actionHeld).toBe(true);
		keyUp("KeyE");
		expect(input.read().actionHeld).toBe(false);
	});

	it("автоповтор клавиши E нового нажатия не даёт", () => {
		const { input } = setup();
		keyDown("KeyE");
		input.read();
		keyDown("KeyE", { repeat: true });
		keyDown("KeyE", { repeat: true });
		expect(input.read().actionPressed).toBe(false);
		keyUp("KeyE");
		keyDown("KeyE");
		expect(input.read().actionPressed).toBe(true);
	});

	it("быстрое нажатие и отпускание между чтениями не теряет фронт", () => {
		const { input } = setup();
		keyDown("KeyE");
		keyUp("KeyE");
		const state = input.read();
		expect(state.actionPressed).toBe(true);
		expect(state.actionHeld).toBe(false);
	});

	it("Левая кнопка мыши: даёт то же действие, что клавиша E", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 0 });
		const pressed = input.read();
		expect(pressed.actionPressed).toBe(true);
		expect(pressed.actionHeld).toBe(true);
		expect(pressed.workHeld).toBe(false);
		firePointer(root, "pointerup", { pointerType: "mouse", pointerId: 1, button: 0 });
		expect(input.read().actionHeld).toBe(false);
	});

	it("Правая кнопка: рабочее действие держится, пока кнопка зажата, контекстное меню подавлено", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 2 });
		const held = input.read();
		expect(held.workPressed).toBe(true);
		expect(held.workHeld).toBe(true);
		expect(held.actionHeld).toBe(false);
		expect(input.read().workHeld).toBe(true);
		// Отпускание вне корневого элемента (на окне) тоже ловится.
		firePointer(window, "pointerup", { pointerType: "mouse", pointerId: 1, button: 2 });
		expect(input.read().workHeld).toBe(false);
		const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
		root.dispatchEvent(menu);
		expect(menu.defaultPrevented).toBe(true);
	});

	it("Q: рабочее действие с удержанием", () => {
		const { input } = setup();
		keyDown("KeyQ");
		expect(input.read().workPressed).toBe(true);
		expect(input.read().workHeld).toBe(true);
		keyUp("KeyQ");
		expect(input.read().workHeld).toBe(false);
	});

	it("Стрелки: прокрутка страницы подавлена, остальные клавиши не подавляются", () => {
		setup();
		expect(keyDown("ArrowDown").defaultPrevented).toBe(true);
		expect(keyDown("ArrowUp").defaultPrevented).toBe(true);
		expect(keyDown("ArrowLeft").defaultPrevented).toBe(true);
		expect(keyDown("ArrowRight").defaultPrevented).toBe(true);
		expect(keyDown("KeyW").defaultPrevented).toBe(false);
		// Alt и стрелка это "назад" в браузере: не подавляем.
		expect(keyDown("ArrowLeft", { altKey: true }).defaultPrevented).toBe(false);
	});

	it("нажатие на кнопку интерфейса внутри корня не считается действием в игре", () => {
		const { input, root } = setup();
		const hudButton = document.createElement("button");
		root.appendChild(hudButton);
		firePointer(hudButton, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 0 });
		expect(input.read().actionPressed).toBe(false);
		expect(input.read().actionHeld).toBe(false);
	});

	it("средняя кнопка мыши игрой не обрабатывается", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 1 });
		const state = input.read();
		expect(state.actionHeld || state.workHeld).toBe(false);
	});
});

describe("сброс ввода и управление системой", () => {
	it("Окно потеряло фокус при зажатой клавише: после возврата повар не идёт сам", () => {
		const { input, root } = setup();
		keyDown("KeyW");
		keyDown("KeyE");
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 2 });
		expect(input.read().moveVector).toEqual({ x: 0, z: -1 });
		window.dispatchEvent(new Event("blur"));
		const state = input.read();
		expect(state.moveVector).toEqual({ x: 0, z: 0 });
		expect(state.actionHeld).toBe(false);
		expect(state.workHeld).toBe(false);
		expect(state.actionPressed).toBe(false);
	});

	it("скрытие вкладки тоже сбрасывает ввод", () => {
		const { input } = setup();
		keyDown("KeyD");
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
		document.dispatchEvent(new Event("visibilitychange"));
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
	});

	it("показ вкладки ввод не сбрасывает", () => {
		const { input } = setup();
		keyDown("KeyD");
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
		document.dispatchEvent(new Event("visibilitychange"));
		expect(input.read().moveVector).toEqual({ x: 1, z: 0 });
	});

	it("reset отпускает всё и сбрасывает необработанные фронты", () => {
		const { input } = setup();
		keyDown("KeyW");
		keyDown("KeyE");
		input.reset();
		expect(input.read()).toEqual({ moveVector: { x: 0, z: 0 }, actionPressed: false, actionHeld: false, workPressed: false, workHeld: false });
	});

	it("выключенный ввод возвращает пустое состояние и не копит фронты", () => {
		const { input } = setup();
		input.setEnabled(false);
		keyDown("KeyW");
		keyDown("KeyE");
		expect(input.read()).toEqual({ moveVector: { x: 0, z: 0 }, actionPressed: false, actionHeld: false, workPressed: false, workHeld: false });
		input.setEnabled(true);
		// Фронт, пришедший при выключенном вводе, не срабатывает после включения; удерживаемая клавиша движения работает.
		const state = input.read();
		expect(state.actionPressed).toBe(false);
		expect(state.moveVector).toEqual({ x: 0, z: -1 });
	});

	it("dispose снимает обработчики и убирает слой касаний", () => {
		const { input, root } = setup();
		input.dispose();
		keyDown("KeyW");
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
		expect(root.querySelector(".cooking-touch-layer")).toBeNull();
	});
});

describe("сенсорное управление", () => {
	it("Экранные кнопки на ПК: без сенсорного экрана стик и кнопки не показываются", () => {
		const { input, root } = setup();
		expect(input.getMode()).toBe("keyboard");
		const { layer } = getTouchParts(root);
		expect(layer.hidden).toBe(true);
	});

	it("на устройстве с грубым указателем слой показан и режим touch", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		expect(input.getMode()).toBe("touch");
		expect(getTouchParts(root).layer.hidden).toBe(false);
	});

	it("первое касание включает режим касаний и сообщает подписчикам, мышь возвращает клавиатурный режим", () => {
		const { input, root } = setup();
		const modes: InputMode[] = [];
		const unsubscribe = input.onModeChange((mode) => modes.push(mode));
		firePointer(root, "pointerdown", { pointerType: "touch", pointerId: 7, clientX: 900, clientY: 300 });
		expect(input.getMode()).toBe("touch");
		expect(getTouchParts(root).layer.hidden).toBe(false);
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 0, clientX: 10, clientY: 10 });
		expect(input.getMode()).toBe("keyboard");
		expect(getTouchParts(root).layer.hidden).toBe(true);
		expect(modes).toEqual(["touch", "keyboard"]);
		unsubscribe();
		firePointer(root, "pointerdown", { pointerType: "touch", pointerId: 8, clientX: 900, clientY: 300 });
		expect(modes).toEqual(["touch", "keyboard"]);
	});

	it("кнопки подписаны текстами из файла текстов, подпись входит в имя для вспомогательных технологий", () => {
		setCoarsePointer(true);
		const { root } = setup();
		const { actionButton, workButton } = getTouchParts(root);
		expect(actionButton.textContent).toBe(controlsTexts.touch.actionButton.label);
		expect(workButton.textContent).toBe(controlsTexts.touch.workButton.label);
		expect(actionButton.getAttribute("aria-label")).toContain(controlsTexts.touch.actionButton.label);
		expect(workButton.getAttribute("aria-label")).toContain(controlsTexts.touch.workButton.label);
		expect(actionButton.type).toBe("button");
	});

	it("Касание в левой половине: палец ведёт повара в направлении смещения", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		const { layer } = getTouchParts(root);
		// innerWidth окна jsdom 1024: x = 200 это левая половина.
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 200, clientY: 400 });
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
		// Смещение на полный радиус вправо: вектор (1, 0).
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 200 + TOUCH_STICK_RADIUS_PX, clientY: 400 });
		const right = input.read().moveVector;
		expect(right.x).toBeCloseTo(1, 9);
		expect(right.z).toBeCloseTo(0, 9);
		// Смещение вверх (экранная y уменьшается): z отрицательный, это "вверх по экрану".
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 200, clientY: 400 - TOUCH_STICK_RADIUS_PX });
		const up = input.read().moveVector;
		expect(up.x).toBeCloseTo(0, 9);
		expect(up.z).toBeCloseTo(-1, 9);
		// Диагональ вниз-влево с превышением радиуса: длина вектора не больше 1.
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 200 - 100, clientY: 400 + 100 });
		const diagonal = input.read().moveVector;
		expect(diagonal.x).toBeCloseTo(-Math.SQRT1_2, 6);
		expect(diagonal.z).toBeCloseTo(Math.SQRT1_2, 6);
		expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1, 6);
		// Палец поднят: движение прекращается.
		firePointer(window, "pointerup", { pointerType: "touch", pointerId: 1, clientX: 100, clientY: 500 });
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
	});

	it("мёртвая зона стика: дрожь пальца у точки касания повара не двигает, остальная длина растягивается на 0..1", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		const { layer } = getTouchParts(root);
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 200, clientY: 400 });
		const jitter = TOUCH_STICK_RADIUS_PX * TOUCH_STICK_DEADZONE * 0.9;
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 200 + jitter, clientY: 400 });
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
		const half = TOUCH_STICK_RADIUS_PX * 0.5;
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 200 + half, clientY: 400 });
		expect(input.read().moveVector.x).toBeCloseTo((0.5 - TOUCH_STICK_DEADZONE) / (1 - TOUCH_STICK_DEADZONE), 9);
	});

	it("касание в правой половине стик не создаёт", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		const { layer } = getTouchParts(root);
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 800, clientY: 400 });
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 860, clientY: 400 });
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
	});

	it("второй палец в левой половине стик не перехватывает, а чужое движение игнорируется", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		const { layer } = getTouchParts(root);
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 200, clientY: 400 });
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 2, clientX: 300, clientY: 400 });
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 2, clientX: 360, clientY: 400 });
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 200, clientY: 400 + TOUCH_STICK_RADIUS_PX });
		expect(input.read().moveVector.z).toBeCloseTo(1, 9);
		// Подъём второго пальца стик не отпускает.
		firePointer(window, "pointerup", { pointerType: "touch", pointerId: 2 });
		expect(input.read().moveVector.z).toBeCloseTo(1, 9);
	});

	it("Движение и действие одновременно: стик одним пальцем и кнопка действия другим", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		const { layer, actionButton, workButton } = getTouchParts(root);
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 150, clientY: 500 });
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 150 + TOUCH_STICK_RADIUS_PX, clientY: 500 });
		firePointer(actionButton, "pointerdown", { pointerType: "touch", pointerId: 2, clientX: 950, clientY: 300 });
		const both = input.read();
		expect(both.moveVector.x).toBeCloseTo(1, 9);
		expect(both.actionPressed).toBe(true);
		expect(both.actionHeld).toBe(true);
		// Рабочая кнопка удерживается третьим пальцем независимо от первых двух.
		firePointer(workButton, "pointerdown", { pointerType: "touch", pointerId: 3, clientX: 950, clientY: 500 });
		const three = input.read();
		expect(three.workPressed).toBe(true);
		expect(three.workHeld).toBe(true);
		expect(three.actionPressed).toBe(false);
		expect(three.actionHeld).toBe(true);
		// Отпускание кнопки действия не трогает стик и рабочую кнопку.
		firePointer(window, "pointerup", { pointerType: "touch", pointerId: 2 });
		const afterAction = input.read();
		expect(afterAction.actionHeld).toBe(false);
		expect(afterAction.workHeld).toBe(true);
		expect(afterAction.moveVector.x).toBeCloseTo(1, 9);
		firePointer(window, "pointerup", { pointerType: "touch", pointerId: 3 });
		expect(input.read().workHeld).toBe(false);
	});

	it("кнопка в левой половине экрана стик не создаёт (касание кнопки не уходит в стик)", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		const { actionButton } = getTouchParts(root);
		firePointer(actionButton, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 100, clientY: 400 });
		firePointer(actionButton, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 160, clientY: 400 });
		const state = input.read();
		expect(state.moveVector).toEqual({ x: 0, z: 0 });
		expect(state.actionHeld).toBe(true);
	});

	it("системная отмена касания (pointercancel) отпускает стик и кнопку", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		const { layer, workButton } = getTouchParts(root);
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 150, clientY: 500 });
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 150 + TOUCH_STICK_RADIUS_PX, clientY: 500 });
		firePointer(workButton, "pointerdown", { pointerType: "touch", pointerId: 2 });
		expect(input.read().workHeld).toBe(true);
		firePointer(window, "pointercancel", { pointerType: "touch", pointerId: 1 });
		firePointer(window, "pointercancel", { pointerType: "touch", pointerId: 2 });
		const state = input.read();
		expect(state.moveVector).toEqual({ x: 0, z: 0 });
		expect(state.workHeld).toBe(false);
	});

	it("потеря фокуса отпускает касания", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		const { layer, actionButton } = getTouchParts(root);
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 150, clientY: 500 });
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 150 + TOUCH_STICK_RADIUS_PX, clientY: 500 });
		firePointer(actionButton, "pointerdown", { pointerType: "touch", pointerId: 2 });
		window.dispatchEvent(new Event("blur"));
		const state = input.read();
		expect(state.moveVector).toEqual({ x: 0, z: 0 });
		expect(state.actionHeld).toBe(false);
		// После сброса тот же палец стик не продолжает: нужно новое касание.
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 150 + TOUCH_STICK_RADIUS_PX, clientY: 500 });
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
	});

	it("выключенный ввод касания не принимает", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		const { layer, actionButton } = getTouchParts(root);
		input.setEnabled(false);
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 150, clientY: 500 });
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 150 + TOUCH_STICK_RADIUS_PX, clientY: 500 });
		firePointer(actionButton, "pointerdown", { pointerType: "touch", pointerId: 2 });
		input.setEnabled(true);
		const state = input.read();
		expect(state.moveVector).toEqual({ x: 0, z: 0 });
		expect(state.actionHeld).toBe(false);
	});

	it("стик следует за пальцем визуально, а после подъёма возвращается на место подсказки", () => {
		setCoarsePointer(true);
		const { root } = setup();
		const { layer } = getTouchParts(root);
		const stick = layer.querySelector<HTMLElement>(".cooking-touch-stick");
		const knob = layer.querySelector<HTMLElement>(".cooking-touch-stick-knob");
		expect(stick).not.toBeNull();
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 210, clientY: 410 });
		expect(stick?.dataset.active).toBe("true");
		expect(stick?.style.getPropertyValue("--stick-x")).toBe("210px");
		expect(stick?.style.getPropertyValue("--stick-y")).toBe("410px");
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 210 + 20, clientY: 410 });
		expect(knob?.style.getPropertyValue("--knob-x")).toBe("20px");
		firePointer(window, "pointerup", { pointerType: "touch", pointerId: 1 });
		expect(stick?.dataset.active).toBeUndefined();
		expect(stick?.style.getPropertyValue("--stick-x")).toBe("");
		expect(knob?.style.getPropertyValue("--knob-x")).toBe("");
	});

	it("контекстное меню по долгому касанию слоя подавлено", () => {
		setCoarsePointer(true);
		const { root } = setup();
		const { layer } = getTouchParts(root);
		const menu = new Event("contextmenu", { bubbles: true, cancelable: true });
		layer.dispatchEvent(menu);
		expect(menu.defaultPrevented).toBe(true);
	});

	it("возврат в клавиатурный режим отпускает стик", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		const { layer } = getTouchParts(root);
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 150, clientY: 500 });
		firePointer(layer, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 150 + TOUCH_STICK_RADIUS_PX, clientY: 500 });
		expect(input.read().moveVector.x).toBeCloseTo(1, 9);
		keyDown("KeyE");
		expect(input.getMode()).toBe("keyboard");
		const state = input.read();
		expect(state.moveVector).toEqual({ x: 0, z: 0 });
		expect(state.actionPressed).toBe(true);
	});
});

describe("мышь: кнопка отпущена вне окна или фрейма", () => {
	// Движение мыши без смены кнопок (button равен -1, как в браузере).
	function moveMouse(buttons: number, button = -1): void {
		firePointer(window, "pointermove", { pointerType: "mouse", pointerId: 1, button, buttons });
	}

	it("Кнопка отпущена вне окна: после нажатия правой pointermove с buttons 0 снимает рабочее действие, повторный клик работает", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 2, buttons: 2 });
		expect(input.read().workHeld).toBe(true);
		// Кнопку отпустили за границей фрейма: pointerup не пришёл, но следующее движение показывает buttons 0.
		moveMouse(0);
		const released = input.read();
		expect(released.workHeld).toBe(false);
		expect(released.actionHeld).toBe(false);
		// Повторный клик работает: новый фронт и удержание.
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 2, buttons: 2 });
		const again = input.read();
		expect(again.workPressed).toBe(true);
		expect(again.workHeld).toBe(true);
	});

	it("Кнопка отпущена вне окна: левая кнопка (взять и положить) снимается так же", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 0, buttons: 1 });
		expect(input.read().actionHeld).toBe(true);
		moveMouse(0);
		expect(input.read().actionHeld).toBe(false);
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 0, buttons: 1 });
		const again = input.read();
		expect(again.actionPressed).toBe(true);
		expect(again.actionHeld).toBe(true);
	});

	it("движение при всё ещё зажатой кнопке удержание не снимает", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 2, buttons: 2 });
		moveMouse(2);
		moveMouse(2);
		expect(input.read().workHeld).toBe(true);
	});

	it("отпускание, пришедшее на document, снимает кнопку", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 2, buttons: 2 });
		firePointer(document, "pointerup", { pointerType: "mouse", pointerId: 1, button: 2, buttons: 0 });
		expect(input.read().workHeld).toBe(false);
	});

	it("вторая кнопка при зажатой первой приходит как pointermove и тоже разбирается", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 0, buttons: 1 });
		input.read();
		// Нажали правую при зажатой левой: по спецификации это pointermove с button 2 и buttons 3.
		moveMouse(3, 2);
		const chord = input.read();
		expect(chord.workPressed).toBe(true);
		expect(chord.workHeld).toBe(true);
		expect(chord.actionHeld).toBe(true);
		// Левую отпустили, правая держится.
		moveMouse(2, 0);
		const rightOnly = input.read();
		expect(rightOnly.actionHeld).toBe(false);
		expect(rightOnly.workHeld).toBe(true);
		// Последнюю кнопку отпустили: pointerup.
		firePointer(window, "pointerup", { pointerType: "mouse", pointerId: 1, button: 2, buttons: 0 });
		expect(input.read().workHeld).toBe(false);
	});

	it("кнопка интерфейса, нажатая и перетащенная на поле игры, игрой не считается", () => {
		const { input, root } = setup();
		const hudButton = document.createElement("button");
		root.appendChild(hudButton);
		firePointer(hudButton, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 0, buttons: 1 });
		moveMouse(1);
		moveMouse(3, 2);
		const state = input.read();
		expect(state.actionHeld).toBe(false);
		expect(state.workHeld).toBe(false);
		expect(state.actionPressed).toBe(false);
	});

	it("курсор ушёл из документа: без нажатых кнопок всё снимается, при зажатой кнопке остаётся", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 2, buttons: 2 });
		document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { buttons: 2 }));
		expect(input.read().workHeld).toBe(true);
		document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { buttons: 0 }));
		expect(input.read().workHeld).toBe(false);
	});

	it("на нажатии захватывается указатель корневого элемента, на кнопке интерфейса и при выключенном вводе нет", () => {
		const { input, root } = setup();
		const capture = vi.fn();
		root.setPointerCapture = capture;
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 4, button: 0, buttons: 1 });
		expect(capture).toHaveBeenCalledWith(4);
		capture.mockClear();
		const hudButton = document.createElement("button");
		root.appendChild(hudButton);
		firePointer(hudButton, "pointerdown", { pointerType: "mouse", pointerId: 5, button: 0, buttons: 1 });
		input.setEnabled(false);
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 6, button: 2, buttons: 2 });
		expect(capture).not.toHaveBeenCalled();
	});

	it("потеря захвата указателя и отмена указателя снимают кнопки", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 2, buttons: 2 });
		firePointer(root, "lostpointercapture", { pointerType: "mouse", pointerId: 1 });
		expect(input.read().workHeld).toBe(false);
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 0, buttons: 1 });
		firePointer(window, "pointercancel", { pointerType: "mouse", pointerId: 1 });
		expect(input.read().actionHeld).toBe(false);
	});

	it("после потери фокуса движение с зажатой физически кнопкой удержание не возвращает", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 2, buttons: 2 });
		window.dispatchEvent(new Event("blur"));
		moveMouse(2);
		expect(input.read().workHeld).toBe(false);
	});

	it("кнопка, отпущенная, пока ввод выключен (пауза), не залипает после включения", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "mouse", pointerId: 1, button: 2, buttons: 2 });
		input.setEnabled(false);
		moveMouse(0);
		input.setEnabled(true);
		expect(input.read().workHeld).toBe(false);
	});
});

describe("сенсорное управление: первое касание в клавиатурном режиме", () => {
	it("первое касание в левой половине включает режим касаний и сразу начинает стик", () => {
		const { input, root } = setup();
		expect(input.getMode()).toBe("keyboard");
		firePointer(root, "pointerdown", { pointerType: "touch", pointerId: 7, clientX: 200, clientY: 400 });
		expect(input.getMode()).toBe("touch");
		const { layer } = getTouchParts(root);
		expect(layer.hidden).toBe(false);
		firePointer(window, "pointermove", { pointerType: "touch", pointerId: 7, clientX: 200 + TOUCH_STICK_RADIUS_PX, clientY: 400 });
		const state = input.read();
		expect(state.moveVector.x).toBeCloseTo(1, 9);
		firePointer(window, "pointerup", { pointerType: "touch", pointerId: 7 });
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
	});

	it("первое касание в правой половине режим включает, но стик не начинает", () => {
		const { input, root } = setup();
		firePointer(root, "pointerdown", { pointerType: "touch", pointerId: 7, clientX: 900, clientY: 400 });
		expect(input.getMode()).toBe("touch");
		firePointer(window, "pointermove", { pointerType: "touch", pointerId: 7, clientX: 960, clientY: 400 });
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
	});

	it("первое касание прямо на экранной кнопке нажимает её", () => {
		const { input, root } = setup();
		const { actionButton } = getTouchParts(root);
		Object.defineProperty(document, "elementFromPoint", { configurable: true, writable: true, value: () => actionButton });
		firePointer(root, "pointerdown", { pointerType: "touch", pointerId: 8, clientX: 950, clientY: 300 });
		const state = input.read();
		expect(state.actionPressed).toBe(true);
		expect(state.actionHeld).toBe(true);
		firePointer(window, "pointerup", { pointerType: "touch", pointerId: 8 });
		expect(input.read().actionHeld).toBe(false);
	});

	it("при выключенном вводе первое касание режим включает, но стик не начинает", () => {
		const { input, root } = setup();
		input.setEnabled(false);
		firePointer(root, "pointerdown", { pointerType: "touch", pointerId: 7, clientX: 200, clientY: 400 });
		expect(input.getMode()).toBe("touch");
		input.setEnabled(true);
		firePointer(window, "pointermove", { pointerType: "touch", pointerId: 7, clientX: 200 + TOUCH_STICK_RADIUS_PX, clientY: 400 });
		expect(input.read().moveVector).toEqual({ x: 0, z: 0 });
	});

	it("в уже включённом режиме касаний касание слоя обрабатывается один раз (без двойного приёма)", () => {
		setCoarsePointer(true);
		const { input, root } = setup();
		const { layer } = getTouchParts(root);
		firePointer(layer, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 200, clientY: 400 });
		firePointer(window, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 200 + TOUCH_STICK_RADIUS_PX, clientY: 400 });
		expect(input.read().moveVector.x).toBeCloseTo(1, 9);
		expect(input.getMode()).toBe("touch");
	});
});
