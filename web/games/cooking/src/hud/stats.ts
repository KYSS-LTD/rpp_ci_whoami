// Верхняя панель HUD (задача 7.4): таймер смены, счётчик "X из N", очки, число групп в очереди с индикатором терпения очереди,
// баннер закрытия потока и всплывающая подсказка. Все блоки лежат в верхних зонах экрана: нижняя часть свободна для
// стика и кнопок на сенсорных устройствах.
import type { GameSnapshot, LevelConfig } from "../contracts";
import { hudTexts } from "../texts";
import { FLOW_BANNER_VISIBLE_SEC, URGENT_PATIENCE_RATIO } from "./constants";
import { createElement, formatTimer, setAttribute, setCssVariable, setFlag, setText, toPercent } from "./dom";

// Верхняя панель по центру: таймер, счётчики, баннер и подсказка.
export interface StatsBar {
	// Центральная зона: таймер, "X из N", очки, баннер, подсказка.
	readonly centerElement: HTMLElement;
	readonly noticesElement: HTMLElement;
	// Правая зона: очередь на улице (кнопку паузы добавляет сам HUD).
	readonly queueElement: HTMLElement;
	update(snapshot: GameSnapshot): void;
	// Показывает подсказку (null убирает).
	setHint(text: string | null): void;
	dispose(): void;
}

// Создаёт верхнюю панель для уровня (из уровня берётся время закрытия потока).
export function createStatsBar(level: LevelConfig): StatsBar {
	const flowCloseSec = level.params.schedule.flowCloseBeforeEndSec;

	// Центр.
	const centerElement = createElement("section", { className: "hud-stats", attributes: { "data-zone": "top-center" } });
	const timer = createElement("p", { className: "hud-timer", attributes: { role: "timer", "aria-label": hudTexts.stats.timerLabel } });
	const counters = createElement("p", { className: "hud-counters" });
	const servedItem = createElement("span", { className: "hud-counter" });
	const servedLabel = createElement("span", { className: "hud-counter__label", text: hudTexts.stats.servedLabel });
	const servedValue = createElement("span", { className: "hud-counter__value" });
	servedItem.append(servedLabel, servedValue);
	const scoreItem = createElement("span", { className: "hud-counter" });
	const scoreLabel = createElement("span", { className: "hud-counter__label", text: hudTexts.stats.scoreLabel });
	const scoreValue = createElement("span", { className: "hud-counter__value" });
	scoreItem.append(scoreLabel, scoreValue);
	counters.append(servedItem, scoreItem);
	// Баннер и подсказка: живые области, текст появляется и исчезает, пустая область скрыта стилем (:empty).
	const banner = createElement("p", { className: "hud-banner", attributes: { role: "status" } });
	const hint = createElement("p", { className: "hud-hint", attributes: { role: "status" } });
	const noticesElement = createElement("div", { className: "hud-notices" });
	noticesElement.append(banner, hint);
	centerElement.append(timer, counters);

	// Очередь.
	const queueElement = createElement("section", { className: "hud-queue" });
	const queueLabel = createElement("span", { className: "hud-queue__label", text: hudTexts.stats.queueLabel });
	const queueValue = createElement("span", { className: "hud-queue__value" });
	const queuePatience = createElement("progress", { className: "hud-queue__patience hud-order__patience", attributes: { max: "1", value: "1" } });
	queueElement.append(queueLabel, queueValue, queuePatience);

	return {
		centerElement,
		noticesElement,
		queueElement,
		update(snapshot) {
			setText(timer, formatTimer(snapshot.timeLeftSec));
			setFlag(timer, "data-low", snapshot.phase === "running" && snapshot.timeLeftSec <= flowCloseSec);
			setText(servedValue, hudTexts.stats.servedValue(snapshot.servedCustomers, snapshot.totalCustomers));
			setText(scoreValue, String(snapshot.score));

			// Баннер виден первые секунды после закрытия потока по часам симуляции: на паузе время не идёт, баннер остаётся.
			const sinceCloseSec = flowCloseSec - snapshot.timeLeftSec;
			const showBanner = snapshot.flowClosed && snapshot.phase === "running" && sinceCloseSec < FLOW_BANNER_VISIBLE_SEC;
			setText(banner, showBanner ? hudTexts.flowClosedBanner : "");

			// Очередь: число групп и наименьшее терпение среди них.
			const queued = snapshot.queuedGroups;
			setText(queueValue, hudTexts.stats.queueValue(queued));
			setAttribute(queueElement, "aria-label", hudTexts.stats.queueAria(queued));
			setFlag(queueElement, "data-empty", queued === 0);
			if (queued > 0) {
				const minRatio = Math.min(...snapshot.queue.map((group) => group.patienceRatio));
				const percent = toPercent(minRatio);
				setAttribute(queuePatience, "value", (percent / 100).toString());
				setAttribute(queuePatience, "aria-label", hudTexts.stats.queuePatienceLabel(percent));
				setCssVariable(queueElement, "--patience-hue", String(Math.round(Math.min(1, Math.max(0, minRatio)) * 120)));
				setFlag(queueElement, "data-urgent", minRatio < URGENT_PATIENCE_RATIO);
			} else {
				setFlag(queueElement, "data-urgent", false);
			}
		},
		setHint(text) {
			setText(hint, text ?? "");
		},
		dispose() {
			centerElement.remove();
			noticesElement.remove();
			queueElement.remove();
		},
	};
}
