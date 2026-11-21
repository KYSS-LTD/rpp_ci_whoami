// Система ввода (задачи 3.1-3.3, 3.7): клавиатура по event.code, мышь, сброс при потере фокуса и сенсорный слой собираются
// в нормализованный InputState. Симуляция не знает об устройстве ввода. Владелец: SONNET-2 (geometry-control-nav).
//
// Подсказки для интеграции (main.ts, HUD):
// - read() вызывать один раз за кадр: фронты actionPressed и workPressed после чтения сбрасываются.
// - Пока открыт оверлей (старт, пауза, провал), вызывать setEnabled(false), при закрытии setEnabled(true); при паузе ещё reset().
// - Слой касаний лежит в root с z-index 1: слои HUD и оверлеев должны иметь z-index больше.
import type { InputFactory, InputMode, InputOptions, InputSource } from "../contracts";
import { attachFocusReset } from "./focus";
import { createInputCore } from "./inputCore";
import { attachKeyboard } from "./keyboard";
import { attachMouse } from "./mouse";
import { createTouchLayer } from "./touch";

export { KEY_BINDINGS } from "./inputCore";
export { TOUCH_STICK_DEADZONE, TOUCH_STICK_RADIUS_PX } from "./touch";

// Запрос "основной указатель грубый" (палец): признак телефона и планшета.
const COARSE_POINTER_QUERY = "(pointer: coarse)";

// Режим при запуске: касания на устройствах с грубым основным указателем, иначе клавиатура и мышь.
// matchMedia есть не везде (например, в тестовом окружении), тогда считаем устройство клавиатурным.
function detectInitialMode(target: Window): InputMode {
	if (typeof target.matchMedia !== "function") {
		return "keyboard";
	}
	return target.matchMedia(COARSE_POINTER_QUERY).matches ? "touch" : "keyboard";
}

// Создаёт систему ввода.
export const createInputSystem: InputFactory = (options: InputOptions): InputSource => {
	const target: Window = options.eventTarget ?? window;
	const core = createInputCore();
	const modeListeners: Array<(mode: InputMode) => void> = [];
	let mode: InputMode = detectInitialMode(target);
	let disposed = false;

	// Меняет режим устройства: показывает или прячет слой касаний и сообщает подписчикам. true, если режим сменился.
	function switchMode(next: InputMode): boolean {
		if (disposed || next === mode) {
			return false;
		}
		mode = next;
		touchLayer.setVisible(mode === "touch");
		for (const listener of [...modeListeners]) {
			listener(mode);
		}
		return true;
	}

	// Касание включает режим касаний, клавиша игры или мышь возвращают клавиатурный режим.
	const touchLayer = createTouchLayer(core, options.root, target, () => switchMode("touch"));
	touchLayer.setVisible(mode === "touch");
	const detachKeyboard = attachKeyboard(core, target, () => switchMode("keyboard"));
	const detachMouse = attachMouse(core, options.root, target, () => switchMode("keyboard"));
	const detachFocus = attachFocusReset(target, () => {
		core.reset();
		touchLayer.reset();
	});
	// Первое касание (или перо) в клавиатурном режиме включает режим касаний. Слой в этот момент был скрыт и само касание не
	// получил, поэтому его принимает слой, уже показанный: стик начинается сразу, а не со второго касания.
	const onFirstTouch = (event: PointerEvent): void => {
		if ((event.pointerType === "touch" || event.pointerType === "pen") && switchMode("touch")) {
			touchLayer.adoptTouch(event);
		}
	};
	target.addEventListener("pointerdown", onFirstTouch, true);

	return {
		read() {
			return core.read();
		},
		reset(): void {
			core.reset();
			touchLayer.reset();
		},
		setEnabled(enabled: boolean): void {
			core.setEnabled(enabled);
		},
		getMode(): InputMode {
			return mode;
		},
		onModeChange(listener: (nextMode: InputMode) => void): () => void {
			modeListeners.push(listener);
			return () => {
				const position = modeListeners.indexOf(listener);
				if (position >= 0) {
					modeListeners.splice(position, 1);
				}
			};
		},
		dispose(): void {
			if (disposed) {
				return;
			}
			disposed = true;
			detachKeyboard();
			detachMouse();
			detachFocus();
			target.removeEventListener("pointerdown", onFirstTouch, true);
			touchLayer.dispose();
			core.reset();
			modeListeners.length = 0;
		},
	};
};
