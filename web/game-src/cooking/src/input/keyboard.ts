// Клавиатурный слой (задачи 3.1, 3.2): клавиши определяются по event.code, поэтому русская раскладка не ломает WASD, E и Q.
// Подавляет прокрутку страницы стрелками. Владелец: SONNET-2 (geometry-control-nav).
import { KEY_BINDINGS, type InputCore } from "./inputCore";

// Стрелки: у них есть действие браузера по умолчанию (прокрутка), его подавляем всегда, пока игра в фокусе.
const SCROLL_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

// Подключает клавиатуру к ядру. onGameKeyUsed вызывается при нажатии клавиши игры (для определения режима ввода).
// Возвращает функцию отключения.
export function attachKeyboard(core: InputCore, target: Window, onGameKeyUsed: () => void): () => void {
	const onKeyDown = (event: KeyboardEvent): void => {
		// Сочетания с Ctrl, Alt и Meta принадлежат браузеру (например, Alt+стрелка влево это "назад"): игра их не трогает.
		if (event.ctrlKey || event.altKey || event.metaKey) {
			return;
		}
		if (SCROLL_KEYS.has(event.code)) {
			event.preventDefault();
		}
		if (KEY_BINDINGS[event.code]) {
			core.keyDown(event.code, event.repeat);
			onGameKeyUsed();
		}
	};
	// Отпускание обрабатывается всегда, даже с зажатыми модификаторами: иначе клавиша "залипнет".
	const onKeyUp = (event: KeyboardEvent): void => {
		if (KEY_BINDINGS[event.code]) {
			core.keyUp(event.code);
		}
	};
	target.addEventListener("keydown", onKeyDown);
	target.addEventListener("keyup", onKeyUp);
	return () => {
		target.removeEventListener("keydown", onKeyDown);
		target.removeEventListener("keyup", onKeyUp);
	};
}
