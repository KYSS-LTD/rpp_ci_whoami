// Сенсорное управление как DOM-слой (задача 3.7): плавающий стик в левой половине экрана и две кнопки у правого края
// (верхняя "взять/положить", нижняя рабочее действие с удержанием). Мультитач по pointerId: стик и каждая кнопка
// держат свой палец независимо. Слой виден только на сенсорных устройствах (режим touch). Владелец: SONNET-2.
// Разметка и стили по руководствам modern-web-guidance (form-factor-adaptation, drag, natural-interactions, accessibility):
// настоящие button с видимой подписью в имени, отступы от вырезов экрана через env(safe-area-inset-*), pointer capture.
import type { InputCore } from "./inputCore";
import { controlsTexts } from "../texts/controls";
import "./touch.css";

// Радиус стика в пикселях: смещение пальца от точки касания на столько даёт полный вектор длины 1.
export const TOUCH_STICK_RADIUS_PX = 56;
// Мёртвая зона стика как доля радиуса: меньшее смещение не двигает повара (дрожь пальца). Остальная длина растягивается на 0..1.
export const TOUCH_STICK_DEADZONE = 0.12;

// Идентификаторы источников касаний в ядре ввода.
const TOUCH_ACTION_SOURCE = "touch:action";
const TOUCH_WORK_SOURCE = "touch:work";

// Слой сенсорного управления.
export interface TouchLayer {
	// Корневой элемент слоя (для тестов и стилей).
	readonly element: HTMLElement;
	// Показывает или прячет слой (прячет с отпусканием всех касаний).
	setVisible(visible: boolean): void;
	// Принимает касание, пришедшее, пока слой был скрыт (первое касание в клавиатурном режиме): после показа слоя оно
	// начинает стик в левой половине или нажимает кнопку под пальцем, как если бы слой получил его сам.
	adoptTouch(event: PointerEvent): void;
	// Отпускает стик и обе кнопки.
	reset(): void;
	// Убирает слой и обработчики.
	dispose(): void;
}

// Создаёт элемент с классом.
function createElement<Tag extends keyof HTMLElementTagNameMap>(document: Document, tag: Tag, className: string): HTMLElementTagNameMap[Tag] {
	const element = document.createElement(tag);
	element.className = className;
	return element;
}

// Пытается захватить указатель: захват не обязателен (обработчики стоят на окне), поэтому сбой молча игнорируется.
function capturePointer(element: Element, pointerId: number): void {
	if (typeof element.setPointerCapture !== "function") {
		return;
	}
	try {
		element.setPointerCapture(pointerId);
	} catch {
		// Указатель уже неактивен: продолжаем без захвата.
	}
}

// Создаёт слой касаний внутри root. onTouchUsed вызывается при касании (определение режима ввода).
export function createTouchLayer(core: InputCore, root: HTMLElement, target: Window, onTouchUsed: () => void): TouchLayer {
	const document = root.ownerDocument;
	const layer = createElement(document, "div", "cooking-touch-layer");
	layer.setAttribute("role", "group");
	layer.setAttribute("aria-label", controlsTexts.touch.layerLabel);
	layer.hidden = true;

	// Стик: декоративный (aria-hidden), показывает точку касания и смещение пальца.
	const stick = createElement(document, "div", "cooking-touch-stick");
	stick.setAttribute("aria-hidden", "true");
	const knob = createElement(document, "div", "cooking-touch-stick-knob");
	stick.appendChild(knob);
	layer.appendChild(stick);

	// Кнопки: действие сверху, рабочее действие под ним.
	const buttons = createElement(document, "div", "cooking-touch-buttons");
	const actionButton = createElement(document, "button", "cooking-touch-button cooking-touch-button-action");
	actionButton.type = "button";
	actionButton.textContent = controlsTexts.touch.actionButton.label;
	actionButton.setAttribute("aria-label", controlsTexts.touch.actionButton.ariaLabel);
	const workButton = createElement(document, "button", "cooking-touch-button cooking-touch-button-work");
	workButton.type = "button";
	workButton.textContent = controlsTexts.touch.workButton.label;
	workButton.setAttribute("aria-label", controlsTexts.touch.workButton.ariaLabel);
	buttons.appendChild(actionButton);
	buttons.appendChild(workButton);
	layer.appendChild(buttons);
	root.appendChild(layer);

	// Какой палец держит стик и каждую кнопку (null: никакой).
	let stickPointerId: number | null = null;
	let actionPointerId: number | null = null;
	let workPointerId: number | null = null;
	// Точка касания стика в координатах окна.
	let stickOriginX = 0;
	let stickOriginY = 0;

	// Размеры слоя: у слоя без раскладки (тесты) берём размер окна.
	function getLayerBox(): { left: number; top: number; width: number } {
		const rect = layer.getBoundingClientRect();
		return { left: rect.left, top: rect.top, width: rect.width > 0 ? rect.width : target.innerWidth };
	}

	// Возвращает стик на место и гасит подсветку.
	function resetStickVisual(): void {
		stick.removeAttribute("data-active");
		stick.style.removeProperty("--stick-x");
		stick.style.removeProperty("--stick-y");
		knob.style.removeProperty("--knob-x");
		knob.style.removeProperty("--knob-y");
	}

	function releaseStick(): void {
		stickPointerId = null;
		core.setStick({ x: 0, z: 0 });
		resetStickVisual();
	}

	function releaseButton(kind: "action" | "work"): void {
		if (kind === "action") {
			actionPointerId = null;
			core.releaseAction(TOUCH_ACTION_SOURCE);
			actionButton.removeAttribute("data-pressed");
		} else {
			workPointerId = null;
			core.releaseWork(TOUCH_WORK_SOURCE);
			workButton.removeAttribute("data-pressed");
		}
	}

	// Начинает стик этим пальцем, если он в левой половине слоя и стик свободен.
	function startStick(event: PointerEvent): void {
		if (!core.isEnabled() || stickPointerId !== null) {
			return;
		}
		const box = getLayerBox();
		if (event.clientX - box.left >= box.width / 2) {
			return;
		}
		stickPointerId = event.pointerId;
		stickOriginX = event.clientX;
		stickOriginY = event.clientY;
		capturePointer(layer, event.pointerId);
		stick.dataset.active = "true";
		stick.style.setProperty("--stick-x", `${event.clientX - box.left}px`);
		stick.style.setProperty("--stick-y", `${event.clientY - box.top}px`);
		core.setStick({ x: 0, z: 0 });
	}

	// Нажимает экранную кнопку этим пальцем, если она свободна: каждая кнопка держит свой палец, пока он не поднят.
	function pressButton(kind: "action" | "work", event: PointerEvent): void {
		const heldBy = kind === "action" ? actionPointerId : workPointerId;
		if (!core.isEnabled() || heldBy !== null) {
			return;
		}
		const button = kind === "action" ? actionButton : workButton;
		capturePointer(button, event.pointerId);
		button.dataset.pressed = "true";
		if (kind === "action") {
			actionPointerId = event.pointerId;
			core.pressAction(TOUCH_ACTION_SOURCE);
		} else {
			workPointerId = event.pointerId;
			core.pressWork(TOUCH_WORK_SOURCE);
		}
	}

	// Касание слоя: стик создаётся только в левой половине, мимо кнопок, одним пальцем.
	const onLayerPointerDown = (event: PointerEvent): void => {
		if (event.pointerType === "mouse") {
			return;
		}
		onTouchUsed();
		const fromButton = event.target instanceof Element && event.target.closest("button") !== null;
		if (!fromButton) {
			startStick(event);
		}
	};

	// Смещение пальца даёт вектор стика: длина до радиуса, мёртвая зона, остальное растягивается на 0..1.
	const onPointerMove = (event: PointerEvent): void => {
		if (event.pointerId !== stickPointerId) {
			return;
		}
		const dx = event.clientX - stickOriginX;
		const dy = event.clientY - stickOriginY;
		const length = Math.hypot(dx, dy);
		const clamped = Math.min(length, TOUCH_STICK_RADIUS_PX);
		const directionX = length > 0 ? dx / length : 0;
		const directionY = length > 0 ? dy / length : 0;
		knob.style.setProperty("--knob-x", `${directionX * clamped}px`);
		knob.style.setProperty("--knob-y", `${directionY * clamped}px`);
		const ratio = clamped / TOUCH_STICK_RADIUS_PX;
		const strength = ratio <= TOUCH_STICK_DEADZONE ? 0 : (ratio - TOUCH_STICK_DEADZONE) / (1 - TOUCH_STICK_DEADZONE);
		core.setStick({ x: directionX * strength, z: directionY * strength });
	};

	// Палец поднят или касание отменено системой: отпускаем то, что он держал.
	const onPointerEnd = (event: PointerEvent): void => {
		if (event.pointerId === stickPointerId) {
			releaseStick();
		}
		if (event.pointerId === actionPointerId) {
			releaseButton("action");
		}
		if (event.pointerId === workPointerId) {
			releaseButton("work");
		}
	};

	// Нажатие экранной кнопки.
	const onButtonPointerDown = (kind: "action" | "work") => (event: PointerEvent) => {
		if (event.pointerType === "mouse") {
			return;
		}
		onTouchUsed();
		pressButton(kind, event);
	};
	const onActionPointerDown = onButtonPointerDown("action");
	const onWorkPointerDown = onButtonPointerDown("work");

	// Долгое касание не должно открывать контекстное меню.
	const onContextMenu = (event: Event): void => {
		event.preventDefault();
	};

	layer.addEventListener("pointerdown", onLayerPointerDown);
	actionButton.addEventListener("pointerdown", onActionPointerDown);
	workButton.addEventListener("pointerdown", onWorkPointerDown);
	layer.addEventListener("contextmenu", onContextMenu);
	target.addEventListener("pointermove", onPointerMove);
	target.addEventListener("pointerup", onPointerEnd);
	target.addEventListener("pointercancel", onPointerEnd);

	function reset(): void {
		releaseStick();
		releaseButton("action");
		releaseButton("work");
	}

	return {
		element: layer,
		setVisible(visible: boolean): void {
			if (!visible) {
				reset();
			}
			layer.hidden = !visible;
		},
		adoptTouch(event: PointerEvent): void {
			if (event.pointerType === "mouse" || layer.hidden) {
				return;
			}
			// Что под пальцем: кнопка (раскладка слоя после показа считается сразу) или свободное поле для стика.
			const under = typeof document.elementFromPoint === "function" ? document.elementFromPoint(event.clientX, event.clientY) : null;
			if (under !== null && actionButton.contains(under)) {
				pressButton("action", event);
			} else if (under !== null && workButton.contains(under)) {
				pressButton("work", event);
			} else {
				startStick(event);
			}
		},
		reset,
		dispose(): void {
			reset();
			layer.removeEventListener("pointerdown", onLayerPointerDown);
			actionButton.removeEventListener("pointerdown", onActionPointerDown);
			workButton.removeEventListener("pointerdown", onWorkPointerDown);
			layer.removeEventListener("contextmenu", onContextMenu);
			target.removeEventListener("pointermove", onPointerMove);
			target.removeEventListener("pointerup", onPointerEnd);
			target.removeEventListener("pointercancel", onPointerEnd);
			layer.remove();
		},
	};
}
