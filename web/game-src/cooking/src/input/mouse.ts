// Мышиный слой (задача 3.2): левая кнопка это "взять/положить", правая кнопка с удержанием это рабочее действие.
// Подавляет контекстное меню. Касания и перо обрабатывает сенсорный слой (touch.ts), здесь только pointerType "mouse".
// Владелец: SONNET-2 (geometry-control-nav).
//
// Состояние кнопок сверяется с event.buttons, а не только с парами "нажал-отпустил": в портале игра во фрейме, и кнопку
// можно отпустить за границей фрейма. Защита в три слоя: захват указателя на корневом элементе (события идут до отпускания),
// сверка с event.buttons на pointermove (отпущенная кнопка снимается при любом движении мыши), снятие при уходе курсора из
// документа без нажатых кнопок и при потере захвата. Потерю фокуса окна обрабатывает focus.ts.
// По спецификации Pointer Events нажатие второй кнопки при уже зажатой первой приходит как pointermove (не pointerdown),
// поэтому такие нажатия тоже разбираются на pointermove.
import type { InputCore } from "./inputCore";

// Идентификаторы источников мыши в ядре ввода.
const MOUSE_ACTION_SOURCE = "mouse:left";
const MOUSE_WORK_SOURCE = "mouse:right";

// Биты event.buttons и значения event.button.
const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;
const LEFT_BUTTONS_BIT = 1;
const RIGHT_BUTTONS_BIT = 2;

// Элементы интерфейса, нажатие на которые не считается действием в игре (кнопки HUD и оверлеев, экранные кнопки).
const INTERACTIVE_SELECTOR = "button, a[href], input, select, textarea, [role='button'], [data-input-ignore]";

// true, если событие пришло от интерактивного элемента интерфейса.
function isFromInterface(event: Event): boolean {
	const target = event.target;
	return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}

// Пытается захватить указатель на элементе. Захват необязателен (обработчики стоят на окне и сверяются с buttons), поэтому
// сбой и отсутствие метода (jsdom) молча игнорируются.
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

// Подключает мышь к ядру. root: корневой элемент игры (нажатия ловятся на нём), target: окно (отпускание, движение, меню).
// onMouseUsed вызывается при любом нажатии мыши (для определения режима ввода). Возвращает функцию отключения.
export function attachMouse(core: InputCore, root: HTMLElement, target: Window, onMouseUsed: () => void): () => void {
	function releaseAll(): void {
		core.releaseAction(MOUSE_ACTION_SOURCE);
		core.releaseWork(MOUSE_WORK_SOURCE);
	}

	const onPointerDown = (event: PointerEvent): void => {
		if (event.pointerType !== "mouse") {
			return;
		}
		onMouseUsed();
		if (!core.isEnabled() || isFromInterface(event)) {
			return;
		}
		const left = event.button === LEFT_BUTTON || (event.buttons & LEFT_BUTTONS_BIT) !== 0;
		const right = event.button === RIGHT_BUTTON || (event.buttons & RIGHT_BUTTONS_BIT) !== 0;
		if (left) {
			core.pressAction(MOUSE_ACTION_SOURCE);
		}
		if (right) {
			core.pressWork(MOUSE_WORK_SOURCE);
		}
		if (left || right) {
			// Захват доводит pointermove и pointerup до корня, даже если курсор ушёл за границу фрейма.
			capturePointer(root, event.pointerId);
		}
	};

	// Движение мыши: сверка с event.buttons. Отпущенная кнопка снимается; новое нажатие принимается только как вторая кнопка
	// при уже удерживаемой первой (нажатие на интерфейсе с последующим перетаскиванием на поле игрой не считается).
	const onPointerMove = (event: PointerEvent): void => {
		if (event.pointerType !== "mouse") {
			return;
		}
		const leftHeld = core.isActionSourceHeld(MOUSE_ACTION_SOURCE);
		const rightHeld = core.isWorkSourceHeld(MOUSE_WORK_SOURCE);
		if (!leftHeld && !rightHeld) {
			return;
		}
		if (leftHeld && (event.buttons & LEFT_BUTTONS_BIT) === 0) {
			core.releaseAction(MOUSE_ACTION_SOURCE);
		}
		if (rightHeld && (event.buttons & RIGHT_BUTTONS_BIT) === 0) {
			core.releaseWork(MOUSE_WORK_SOURCE);
		}
		if (!core.isEnabled()) {
			return;
		}
		if (!leftHeld && event.button === LEFT_BUTTON && (event.buttons & LEFT_BUTTONS_BIT) !== 0) {
			core.pressAction(MOUSE_ACTION_SOURCE);
		}
		if (!rightHeld && event.button === RIGHT_BUTTON && (event.buttons & RIGHT_BUTTONS_BIT) !== 0) {
			core.pressWork(MOUSE_WORK_SOURCE);
		}
	};

	// Отпускание ловится на окне (в том числе приходящее от document): кнопку можно отпустить за пределами корневого элемента.
	// Снимается кнопка события и все кнопки, которых нет в event.buttons. Обрабатывается всегда.
	const onPointerUp = (event: PointerEvent): void => {
		if (event.pointerType !== "mouse") {
			return;
		}
		if (event.button === LEFT_BUTTON || (event.buttons & LEFT_BUTTONS_BIT) === 0) {
			core.releaseAction(MOUSE_ACTION_SOURCE);
		}
		if (event.button === RIGHT_BUTTON || (event.buttons & RIGHT_BUTTONS_BIT) === 0) {
			core.releaseWork(MOUSE_WORK_SOURCE);
		}
	};

	// Отмена указателя и потеря захвата: события этого нажатия больше не придут, кнопки считаются отпущенными.
	const onPointerCancel = (event: PointerEvent): void => {
		if (event.pointerType === "mouse") {
			releaseAll();
		}
	};

	// Курсор ушёл из документа (за границу фрейма) без нажатых кнопок: снимаем всё. Если кнопка ещё зажата, оставляем:
	// захват или возврат курсора с pointermove сверят состояние.
	const onMouseLeave = (event: MouseEvent): void => {
		if (event.buttons === 0) {
			releaseAll();
		}
	};

	// Контекстное меню по правой кнопке (и долгому касанию) в игре не нужно.
	const onContextMenu = (event: Event): void => {
		event.preventDefault();
	};

	const documentElement = target.document.documentElement;
	root.addEventListener("pointerdown", onPointerDown);
	root.addEventListener("lostpointercapture", onPointerCancel);
	target.addEventListener("pointermove", onPointerMove);
	target.addEventListener("pointerup", onPointerUp);
	target.addEventListener("pointercancel", onPointerCancel);
	documentElement.addEventListener("mouseleave", onMouseLeave);
	root.addEventListener("contextmenu", onContextMenu);
	target.addEventListener("contextmenu", onContextMenu);
	return () => {
		root.removeEventListener("pointerdown", onPointerDown);
		root.removeEventListener("lostpointercapture", onPointerCancel);
		target.removeEventListener("pointermove", onPointerMove);
		target.removeEventListener("pointerup", onPointerUp);
		target.removeEventListener("pointercancel", onPointerCancel);
		documentElement.removeEventListener("mouseleave", onMouseLeave);
		root.removeEventListener("contextmenu", onContextMenu);
		target.removeEventListener("contextmenu", onContextMenu);
	};
}
