// HUD игры (задачи 7.1-7.7): DOM-слой над canvas. Собирает карточки заказов (справа сверху), таймер и счётчики (сверху по центру),
// кнопку паузы и очередь (слева сверху) и экраны (старт, пауза, провал, поворот). Нижняя часть экрана HUD не занимает:
// на сенсорных устройствах там стик (слева) и кнопки (справа). Тексты лежат в texts/hud.ts, стили в hud.css.
import type { Hud, HudOptions, SimEvent } from "../contracts";
import { hudTexts } from "../texts";
import { HINT_VISIBLE_MS, HUD_EDGE_PADDING_PX } from "./constants";
import { createElement, setAttribute, setCssVariable } from "./dom";
import { createOrdersPanel } from "./orders";
import { computeHudMetrics, type HudEnvironment } from "./ordersLayout";
import { createScreens } from "./screens";
import { createStatsBar } from "./stats";
import { createSnapshotStore } from "./store";
import "./hud.css";

// Число пикселей из значения стиля; запасное значение, если стиль ещё не посчитан (тестовое окружение без раскладки).
function readPixels(value: string, fallback: number): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

// Создаёт HUD в корневом элементе игры.
export function createHud(options: HudOptions): Hud {
	const { root, level, callbacks, reporter, dishIcons } = options;
	let inputMode = options.inputMode;

	const ownerWindow = root.ownerDocument.defaultView ?? window;
	const element = createElement("div", { className: "cooking-hud" });
	const store = createSnapshotStore();

	// Окружение для раскладки: размер окна, отступы корня HUD (в них входят вырезы экрана) и режим ввода.
	function readEnvironment(): HudEnvironment {
		const style = ownerWindow.getComputedStyle(element);
		return {
			viewportWidthPx: ownerWindow.innerWidth,
			viewportHeightPx: ownerWindow.innerHeight,
			paddingLeftPx: readPixels(style.paddingLeft, HUD_EDGE_PADDING_PX),
			paddingRightPx: readPixels(style.paddingRight, HUD_EDGE_PADDING_PX),
			paddingTopPx: readPixels(style.paddingTop, HUD_EDGE_PADDING_PX),
			touch: inputMode === "touch",
		};
	}

	const orders = createOrdersPanel(dishIcons, readEnvironment);
	const stats = createStatsBar(level);
	const screens = createScreens({ root: element, callbacks, reporter, inputMode, tutorialDishes: options.tutorialDishes, campaignDay: options.campaignDay });

	// Левая зона: кнопка паузы и очередь (справа сверху карточки заказов, по центру таймер).
	const left = createElement("div", { className: "hud-left", attributes: { "data-zone": "top-left" } });
	left.append(screens.pauseButton, stats.queueElement);
	element.append(left, stats.centerElement, orders.element);
	root.append(element);

	// Размеры блоков HUD по окну: на низком экране центральный блок уже, а зазоры меньше (карточкам заказов остаётся больше места).
	function applyMetrics(): void {
		const metrics = computeHudMetrics(readEnvironment());
		setAttribute(element, "data-screen", metrics.lowScreen ? "low" : "normal");
		setCssVariable(element, "--hud-gap", `${metrics.gapPx}px`);
		setCssVariable(element, "--hud-center-width", `${metrics.centerWidthPx}px`);
	}

	// Окно или режим ввода изменились: размеры блоков и раскладка карточек пересчитываются.
	function relayout(): void {
		applyMetrics();
		orders.relayout();
	}

	function applyInputMode(): void {
		setAttribute(element, "data-input-mode", inputMode);
		relayout();
	}
	applyInputMode();
	ownerWindow.addEventListener("resize", relayout);
	ownerWindow.addEventListener("orientationchange", relayout);

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
		showDayComplete(info) {
			screens.showDayComplete(info);
		},
		dispose() {
			ownerWindow.removeEventListener("resize", relayout);
			ownerWindow.removeEventListener("orientationchange", relayout);
			unsubscribe();
			screens.dispose();
			orders.dispose();
			stats.dispose();
			element.remove();
		},
	};
}
