// HUD игры (задачи 7.1-7.7): DOM-слой над canvas. Собирает карточки заказов (слева сверху), таймер и счётчики (сверху по центру),
// очередь и кнопку паузы (справа сверху) и экраны (старт, пауза, провал, поворот). Нижняя часть экрана HUD не занимает:
// на сенсорных устройствах там стик и кнопки. Тексты лежат в texts/hud.ts, стили в hud.css.
import type { Hud, HudOptions, InputMode, SimEvent } from "../contracts";
import { hudTexts } from "../texts";
import { HINT_VISIBLE_MS, ORDERS_MAX_HEIGHT_PERCENT_KEYBOARD, ORDERS_MAX_HEIGHT_PERCENT_TOUCH } from "./constants";
import { createElement, setAttribute, setCssVariable } from "./dom";
import { createOrdersPanel } from "./orders";
import { createScreens } from "./screens";
import { createStatsBar } from "./stats";
import { createSnapshotStore } from "./store";
import "./hud.css";

// Максимальная высота колонки карточек (проценты высоты экрана) для режима ввода.
function getOrdersMaxHeight(mode: InputMode): string {
	return String(mode === "touch" ? ORDERS_MAX_HEIGHT_PERCENT_TOUCH : ORDERS_MAX_HEIGHT_PERCENT_KEYBOARD);
}

// Создаёт HUD в корневом элементе игры.
export function createHud(options: HudOptions): Hud {
	const { root, level, callbacks, reporter, dishIcons } = options;
	let inputMode = options.inputMode;

	const element = createElement("div", { className: "cooking-hud" });
	const store = createSnapshotStore();
	const orders = createOrdersPanel(dishIcons);
	const stats = createStatsBar(level);
	const screens = createScreens({ root: element, callbacks, reporter, inputMode });

	// Правая зона: очередь и кнопка паузы.
	const right = createElement("div", { className: "hud-right", attributes: { "data-zone": "top-right" } });
	right.append(stats.queueElement, screens.pauseButton);
	element.append(orders.element, stats.centerElement, right);
	root.append(element);
	// Диалоги можно открывать только после добавления в документ: ориентация проверяется заново.
	screens.refreshOrientation();

	function applyInputMode(): void {
		setAttribute(element, "data-input-mode", inputMode);
		setCssVariable(element, "--hud-orders-max-height", getOrdersMaxHeight(inputMode));
	}
	applyInputMode();

	// Последнее время кадра: от него считается срок показа подсказки.
	let lastNowMs = 0;
	let hintUntilMs: number | null = null;

	function showHint(text: string): void {
		stats.setHint(text);
		hintUntilMs = lastNowMs + HINT_VISIBLE_MS;
	}

	// Подписка на хранилище: все блоки обновляются вместе, не чаще 10 раз в секунду.
	const unsubscribe = store.subscribe((snapshot, deliveredMs) => {
		orders.update(snapshot, deliveredMs);
		stats.update(snapshot);
		screens.update(snapshot);
		if (hintUntilMs !== null && deliveredMs >= hintUntilMs) {
			stats.setHint(null);
			hintUntilMs = null;
		}
	});

	return {
		update(snapshot, nowMs) {
			lastNowMs = nowMs;
			store.push(snapshot, nowMs);
		},
		handleEvents(events: readonly SimEvent[]) {
			for (const event of events) {
				if (event.type === "actionRejected") {
					showHint(hudTexts.rejectReasons[event.reason]);
				} else if (event.type === "dishServed") {
					showHint(hudTexts.hints.dishServed(event.price + event.tip));
				}
			}
		},
		setInputMode(mode) {
			inputMode = mode;
			applyInputMode();
			screens.setInputMode(mode);
		},
		setPaused(paused) {
			screens.setPaused(paused);
		},
		dispose() {
			unsubscribe();
			screens.dispose();
			orders.dispose();
			stats.dispose();
			element.remove();
		},
	};
}
