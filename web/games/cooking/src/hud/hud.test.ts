// Тесты HUD (задачи 7.1-7.7) в jsdom: карточки столов, терпение, порядок по срочности, таймер и счётчики, экраны, провал,
// выход, повторная отправка, раскладка на телефоне. Названия сценариев совпадают со сценариями спецификации cooking-hud.
// В jsdom нет нативных методов <dialog>: HUD открывает диалоги атрибутом open (см. hud/dialogs.ts).
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { getLevelConfig } from "../config/levels";
import type { DishId, FailureInfo, GameSnapshot, HudCallbacks, InputMode, OrderSnapshot, PortalBridgeApi, TableSnapshot, TableState } from "../contracts";
import { createDemoSnapshot } from "../render/demoSnapshot";
import { controlsTexts, hudTexts } from "../texts";
import { createHud } from "./index";
import { createResultReporter } from "./reporter";

const level = getLevelConfig("easy");

// Мост с подсчётом вызовов и теми же правилами приёма результата, что у настоящего моста.
interface FakeBridge extends PortalBridgeApi {
	finish: Mock<PortalBridgeApi["finish"]>;
	exit: Mock<PortalBridgeApi["exit"]>;
}

function createFakeBridge(): FakeBridge {
	let finished = false;
	return {
		protocolVersion: 1,
		isEmbedded: true,
		getLevelId: () => "easy",
		onStart: vi.fn<PortalBridgeApi["onStart"]>(),
		finish: vi.fn<PortalBridgeApi["finish"]>((result) => {
			if (finished || result.maxScore <= 0 || result.score < 0 || result.score > result.maxScore) {
				return false;
			}
			finished = true;
			return true;
		}),
		exit: vi.fn<PortalBridgeApi["exit"]>(),
		reportError: vi.fn<PortalBridgeApi["reportError"]>(),
	};
}

// Размер окна для проверки ориентации: jsdom даёт 1024 x 768, подменяем.
function setWindowSize(width: number, height: number): void {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
	Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
	window.dispatchEvent(new Event("resize"));
}

// Создаёт HUD с подменённым мостом и колбэками.
function setupHud(inputMode: InputMode = "keyboard") {
	const root = document.createElement("div");
	document.body.append(root);
	const callbacks: { [Key in keyof HudCallbacks]: Mock<HudCallbacks[Key]> } = {
		onStartPressed: vi.fn<HudCallbacks["onStartPressed"]>(),
		onPauseRequested: vi.fn<HudCallbacks["onPauseRequested"]>(),
		onResumeRequested: vi.fn<HudCallbacks["onResumeRequested"]>(),
	};
	const bridge = createFakeBridge();
	const onClosed = vi.fn();
	const reporter = createResultReporter(bridge, onClosed);
	const hud = createHud({ root, level, callbacks, reporter, dishIcons: {}, inputMode });
	return { root, hud, callbacks, bridge, onClosed, reporter };
}

// Заказ для карточки.
function createOrder(tableId: string, seatIndex: number, dish: DishId, status: OrderSnapshot["status"], patienceRatio: number, patienceTotalSec = 60): OrderSnapshot {
	return {
		id: `o-${tableId}-${seatIndex}`,
		customerId: `c-${tableId}-${seatIndex}`,
		tableId,
		seatIndex,
		dish,
		status,
		patienceLeftSec: patienceRatio * patienceTotalSec,
		patienceTotalSec,
		patienceRatio,
	};
}

// Стол для снимка.
function createTable(number: number, state: TableState, orders: OrderSnapshot[]): TableSnapshot {
	return { tableId: `table-${number}`, number, capacity: 4, state, groupId: state === "free" ? null : `g-${number}`, orders };
}

// Снимок смены с заданными столами.
function createSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
	return { ...createDemoSnapshot(level, 0, { phase: "running", elapsedSec: 0 }), tables: [], queue: [], queuedGroups: 0, ...overrides };
}

function getCard(root: HTMLElement, tableNumber: number): HTMLElement | null {
	return root.querySelector<HTMLElement>(`.hud-card[data-table-id="table-${tableNumber}"]`);
}

function getDialog(root: HTMLElement, name: string): HTMLDialogElement {
	return root.querySelector<HTMLDialogElement>(`.hud-dialog--${name}`) as HTMLDialogElement;
}

afterEach(() => {
	document.body.replaceChildren();
	setWindowSize(1024, 768);
});

describe("карточки столов (7.2)", () => {
	it("Группа за столом: за стол 3 села группа из двух человек, есть карточка «Стол 3» с двумя заказами", () => {
		const { root, hud } = setupHud();
		hud.update(
			createSnapshot({ tables: [createTable(3, "waiting", [createOrder("table-3", 0, "burger", "waiting", 0.9), createOrder("table-3", 1, "ham", "waiting", 0.8)])] }),
			0,
		);
		const card = getCard(root, 3);
		expect(card).not.toBeNull();
		expect(card?.querySelector(".hud-card__title")?.textContent).toBe("Стол 3");
		const rows = card?.querySelectorAll(".hud-order") ?? [];
		expect(rows.length).toBe(2);
		expect(rows[0].querySelector(".hud-order__name")?.textContent).toBe(hudTexts.dishNames.burger);
		expect(rows[1].querySelector(".hud-order__name")?.textContent).toBe(hudTexts.dishNames.ham);
		expect(rows[0].querySelector(".hud-order__status")?.textContent).toBe(hudTexts.orders.status.waiting);
	});

	it("карточки лежат в панели вверху слева, свободный стол карточки не имеет", () => {
		const { root, hud } = setupHud();
		hud.update(createSnapshot({ tables: [createTable(1, "free", []), createTable(2, "waiting", [createOrder("table-2", 0, "ham", "waiting", 1)])] }), 0);
		expect(getCard(root, 1)).toBeNull();
		expect(getCard(root, 2)).not.toBeNull();
		expect(root.querySelector(".hud-orders")?.getAttribute("data-zone")).toBe("top-left");
	});

	it("есть иконка блюда, а без иконки показывается первая буква названия", () => {
		const root = document.createElement("div");
		document.body.append(root);
		const reporter = createResultReporter(createFakeBridge(), vi.fn());
		const callbacks = { onStartPressed: vi.fn(), onPauseRequested: vi.fn(), onResumeRequested: vi.fn() };
		const hud = createHud({ root, level, callbacks, reporter, dishIcons: { burger: "data:image/png;base64,AAAA" }, inputMode: "keyboard" });
		hud.update(
			createSnapshot({ tables: [createTable(1, "waiting", [createOrder("table-1", 0, "burger", "waiting", 1), createOrder("table-1", 1, "stew", "waiting", 1)])] }),
			0,
		);
		const rows = root.querySelectorAll(".hud-order");
		expect(rows[0].querySelector("img.hud-order__icon")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
		expect(rows[1].querySelector("img")).toBeNull();
		expect(rows[1].querySelector(".hud-order__icon--text")?.textContent).toBe("Р");
	});

	it("Все поданы: карточка показывает «Стол обслужен» и затем скрывается", () => {
		const { root, hud } = setupHud();
		const served = (): GameSnapshot => createSnapshot({ tables: [createTable(3, "served", [createOrder("table-3", 0, "burger", "served", 0.5)])] });
		hud.update(served(), 1000);
		const card = getCard(root, 3);
		expect(card?.getAttribute("data-state")).toBe("served");
		expect(card?.querySelector(".hud-card__state")?.textContent).toBe(hudTexts.orders.tableServed);
		hud.update(served(), 2500);
		expect(getCard(root, 3)).not.toBeNull();
		hud.update(served(), 4200);
		expect(getCard(root, 3)).toBeNull();
	});

	it("Блюдо сдано в окно: заказ получает статус «в доставке», затем «подано»", () => {
		const { root, hud } = setupHud();
		const withStatus = (status: OrderSnapshot["status"]) => createSnapshot({ tables: [createTable(2, "waiting", [createOrder("table-2", 0, "burger", status, 0.7)])] });
		hud.update(withStatus("waiting"), 0);
		const statusOf = () => getCard(root, 2)?.querySelector(".hud-order__status")?.textContent;
		expect(statusOf()).toBe(hudTexts.orders.status.waiting);
		hud.update(withStatus("delivering"), 200);
		expect(statusOf()).toBe("В доставке");
		expect(getCard(root, 2)?.querySelector(".hud-order")?.getAttribute("data-status")).toBe("delivering");
		hud.update(withStatus("served"), 400);
		expect(statusOf()).toBe(hudTexts.orders.status.served);
	});
});

describe("терпение и порядок карточек (7.3)", () => {
	it("Терпение на исходе: остаток меньше четверти даёт пульсацию, при большем остатке её нет", () => {
		const { root, hud } = setupHud();
		hud.update(
			createSnapshot({ tables: [createTable(1, "waiting", [createOrder("table-1", 0, "burger", "waiting", 0.24), createOrder("table-1", 1, "ham", "waiting", 0.6)])] }),
			0,
		);
		const rows = getCard(root, 1)?.querySelectorAll(".hud-order") ?? [];
		expect(rows[0].getAttribute("data-urgent")).toBe("true");
		expect(rows[1].getAttribute("data-urgent")).toBeNull();
		expect(getCard(root, 1)?.getAttribute("data-urgent")).toBe("true");
		// Цвет индикатора идёт от зелёного к красному: оттенок пропорционален остатку терпения.
		expect((rows[0] as HTMLElement).style.getPropertyValue("--patience-hue")).toBe(String(Math.round(0.24 * 120)));
		expect((rows[1] as HTMLElement).style.getPropertyValue("--patience-hue")).toBe(String(Math.round(0.6 * 120)));
		// Индикатор доступен вспомогательным технологиям: нативный progress с именем и значением.
		const bar = rows[0].querySelector("progress");
		expect(bar?.getAttribute("aria-label")).toContain("24");
		expect(bar?.getAttribute("value")).toBe("0.24");
	});

	it("подача замораживает индикатор: поданный заказ не пульсирует даже при малом остатке", () => {
		const { root, hud } = setupHud();
		hud.update(createSnapshot({ tables: [createTable(1, "waiting", [createOrder("table-1", 0, "burger", "served", 0.1), createOrder("table-1", 1, "ham", "waiting", 0.9)])] }), 0);
		expect(getCard(root, 1)?.querySelector(".hud-order")?.getAttribute("data-urgent")).toBeNull();
	});

	it("Смена порядка: карточка стола с меньшим остатком терпения расположена выше", () => {
		const { root, hud } = setupHud();
		const snapshotWith = (ratioOne: number, ratioTwo: number) =>
			createSnapshot({
				tables: [
					createTable(1, "waiting", [createOrder("table-1", 0, "burger", "waiting", ratioOne)]),
					createTable(2, "waiting", [createOrder("table-2", 0, "ham", "waiting", ratioTwo)]),
				],
			});
		const order = () => Array.from(root.querySelectorAll(".hud-orders > .hud-card")).map((card) => card.getAttribute("data-table-id"));
		hud.update(snapshotWith(0.4, 0.9), 0);
		expect(order()).toEqual(["table-1", "table-2"]);
		hud.update(snapshotWith(0.8, 0.3), 200);
		expect(order()).toEqual(["table-2", "table-1"]);
	});

	it("обслуженный стол уходит в конец списка", () => {
		const { root, hud } = setupHud();
		hud.update(
			createSnapshot({
				tables: [
					createTable(1, "served", [createOrder("table-1", 0, "burger", "served", 0.2)]),
					createTable(2, "waiting", [createOrder("table-2", 0, "ham", "waiting", 0.9)]),
				],
			}),
			0,
		);
		expect(Array.from(root.querySelectorAll(".hud-orders > .hud-card")).map((card) => card.getAttribute("data-table-id"))).toEqual(["table-2", "table-1"]);
	});
});

describe("таймер и счётчики (7.4)", () => {
	it("Начало уровня easy: таймер показывает 3:00", () => {
		const { root, hud } = setupHud();
		hud.update(createSnapshot({ phase: "ready", timeLeftSec: 180, elapsedSec: 0, flowClosed: false }), 0);
		expect(root.querySelector(".hud-timer")?.textContent).toBe("3:00");
		expect(root.querySelector(".hud-stats")?.getAttribute("data-zone")).toBe("top-center");
	});

	it("таймер идёт на убывание и округляет остаток вверх", () => {
		const { root, hud } = setupHud();
		hud.update(createSnapshot({ timeLeftSec: 179.2, flowClosed: false }), 0);
		expect(root.querySelector(".hud-timer")?.textContent).toBe("3:00");
		hud.update(createSnapshot({ timeLeftSec: 125.5, flowClosed: false }), 200);
		expect(root.querySelector(".hud-timer")?.textContent).toBe("2:06");
		hud.update(createSnapshot({ timeLeftSec: 0, flowClosed: true }), 400);
		expect(root.querySelector(".hud-timer")?.textContent).toBe("0:00");
	});

	it("Обслужили клиента: счётчик «X из N» увеличивается на единицу, очки обновляются", () => {
		const { root, hud } = setupHud();
		hud.update(createSnapshot({ servedCustomers: 2, totalCustomers: 9, score: 20 }), 0);
		const counters = () => Array.from(root.querySelectorAll(".hud-counter__value")).map((node) => node.textContent);
		expect(counters()).toEqual(["2 из 9", "20"]);
		hud.update(createSnapshot({ servedCustomers: 3, totalCustomers: 9, score: 34 }), 200);
		expect(counters()).toEqual(["3 из 9", "34"]);
	});

	it("число групп в очереди и терпение очереди показываются", () => {
		const { root, hud } = setupHud();
		hud.update(
			createSnapshot({
				queuedGroups: 2,
				queue: [
					{ groupId: "g-1", slotIndex: 0, size: 2, patienceLeftSec: 30, patienceTotalSec: 60, patienceRatio: 0.5 },
					{ groupId: "g-2", slotIndex: 1, size: 1, patienceLeftSec: 12, patienceTotalSec: 60, patienceRatio: 0.2 },
				],
			}),
			0,
		);
		expect(root.querySelector(".hud-queue__value")?.textContent).toBe("2");
		expect(root.querySelector(".hud-queue")?.getAttribute("data-urgent")).toBe("true");
		expect(root.querySelector(".hud-queue__patience")?.getAttribute("value")).toBe("0.2");
	});

	it("Остаётся минута: при таймере 1:00 появляется баннер, а позже он исчезает", () => {
		const { root, hud } = setupHud();
		hud.update(createSnapshot({ timeLeftSec: 61, flowClosed: false }), 0);
		expect(root.querySelector(".hud-banner")?.textContent).toBe("");
		hud.update(createSnapshot({ timeLeftSec: 60, flowClosed: true }), 200);
		expect(root.querySelector(".hud-timer")?.textContent).toBe("1:00");
		expect(root.querySelector(".hud-banner")?.textContent).toBe(hudTexts.flowClosedBanner);
		// Баннер показывается на несколько секунд, а не до конца смены.
		hud.update(createSnapshot({ timeLeftSec: 40, flowClosed: true }), 400);
		expect(root.querySelector(".hud-banner")?.textContent).toBe("");
	});

	it("подсказки: отказ действия и подача показываются коротко", () => {
		const { root, hud } = setupHud();
		hud.update(createSnapshot(), 0);
		hud.handleEvents([{ type: "actionRejected", stationId: "pan-1", reason: "handBusy", t: 1 }]);
		expect(root.querySelector(".hud-hint")?.textContent).toBe(hudTexts.rejectReasons.handBusy);
		hud.update(createSnapshot(), 1000);
		expect(root.querySelector(".hud-hint")?.textContent).toBe(hudTexts.rejectReasons.handBusy);
		hud.update(createSnapshot(), 4000);
		expect(root.querySelector(".hud-hint")?.textContent).toBe("");
		hud.handleEvents([{ type: "dishServed", orderId: "o-1", customerId: "c-1", groupId: "g-1", tableId: "table-1", dish: "burger", price: 10, tip: 3, t: 2 }]);
		expect(root.querySelector(".hud-hint")?.textContent).toBe(hudTexts.hints.dishServed(13));
	});
});

describe("частота обновления (7.1)", () => {
	it("частые снимки не вызывают лишних изменений DOM: без изменений данных их нет совсем, за секунду не больше десяти обновлений", () => {
		const { root, hud } = setupHud();
		const snapshotAt = (index: number) =>
			createSnapshot({
				timeLeftSec: 120 - index * 0.016,
				tables: [createTable(1, "waiting", [createOrder("table-1", 0, "burger", "waiting", Math.max(0.3, 0.9 - index * 0.004))])],
			});
		hud.update(snapshotAt(0), 0);
		const observer = new MutationObserver(() => undefined);
		observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
		observer.takeRecords();

		// Один доставленный снимок с изменением: сколько записей даёт одно обновление.
		hud.update(snapshotAt(10), 110);
		const perUpdate = observer.takeRecords().length;
		expect(perUpdate).toBeGreaterThan(0);

		// Те же данные ещё раз: HUD ничего не пишет в DOM.
		hud.update(snapshotAt(10), 260);
		expect(observer.takeRecords().length).toBe(0);

		// Секунда кадров по 60 в секунду с постоянно меняющимися числами.
		for (let frame = 0; frame < 60; frame += 1) {
			hud.update(snapshotAt(20 + frame), 400 + (frame * 1000) / 60);
		}
		const total = observer.takeRecords().length;
		expect(total).toBeLessThanOrEqual(perUpdate * 11);
		observer.disconnect();
	});
});

describe("стартовый экран, пауза, ориентация (7.5)", () => {
	it("Экран подсказок: до нажатия показаны подсказки управления для клавиатуры и кнопка «Начать», время не идёт", () => {
		const { root, hud, callbacks } = setupHud("keyboard");
		hud.update(createSnapshot({ phase: "ready", timeLeftSec: 180, flowClosed: false }), 0);
		const dialog = getDialog(root, "start");
		expect(dialog.hasAttribute("open")).toBe(true);
		const hints = controlsTexts.hints.keyboard;
		const shownKeys = Array.from(dialog.querySelectorAll(".hud-controls__item dt")).map((node) => node.textContent);
		expect(shownKeys).toEqual(hints.map((hint) => hint.keys));
		const button = dialog.querySelector<HTMLButtonElement>(".hud-button--primary");
		expect(button?.textContent).toBe(hudTexts.start.startButton);
		expect(button?.hasAttribute("autofocus")).toBe(true);
		expect(callbacks.onStartPressed).not.toHaveBeenCalled();
		expect(root.querySelector(".hud-timer")?.textContent).toBe("3:00");
		// Нажатие запускает смену один раз и закрывает экран.
		button?.click();
		button?.click();
		expect(callbacks.onStartPressed).toHaveBeenCalledTimes(1);
		expect(dialog.hasAttribute("open")).toBe(false);
	});

	it("подсказки зависят от устройства: на сенсорном экране показаны подсказки для касаний", () => {
		setWindowSize(844, 390);
		const { root, hud } = setupHud("touch");
		hud.update(createSnapshot({ phase: "ready" }), 0);
		const shownKeys = Array.from(getDialog(root, "start").querySelectorAll(".hud-controls__item dt")).map((node) => node.textContent);
		expect(shownKeys).toEqual(controlsTexts.hints.touch.map((hint) => hint.keys));
		hud.setInputMode("keyboard");
		const afterSwitch = Array.from(getDialog(root, "start").querySelectorAll(".hud-controls__item dt")).map((node) => node.textContent);
		expect(afterSwitch).toEqual(controlsTexts.hints.keyboard.map((hint) => hint.keys));
	});

	it("после старта экран закрывается по снимку running и кнопка паузы появляется", () => {
		const { root, hud } = setupHud();
		hud.update(createSnapshot({ phase: "ready" }), 0);
		const pauseButton = root.querySelector<HTMLButtonElement>(".hud-pause-button");
		expect(pauseButton?.hidden).toBe(true);
		hud.update(createSnapshot({ phase: "running" }), 50);
		expect(getDialog(root, "start").hasAttribute("open")).toBe(false);
		expect(pauseButton?.hidden).toBe(false);
		expect(pauseButton?.getAttribute("aria-label")).toBe(hudTexts.pause.buttonLabel);
	});

	it("Пауза по Escape: нажатие просит паузу, main отвечает setPaused и показывается меню с «Продолжить» и «Выйти»", () => {
		const { root, hud, callbacks } = setupHud();
		hud.update(createSnapshot({ phase: "running" }), 0);
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(callbacks.onPauseRequested).toHaveBeenCalledTimes(1);
		hud.setPaused(true);
		const dialog = getDialog(root, "pause");
		expect(dialog.hasAttribute("open")).toBe(true);
		const buttons = Array.from(dialog.querySelectorAll("button")).map((button) => button.getAttribute("aria-label") ?? button.textContent);
		expect(buttons).toEqual([hudTexts.pause.resume, hudTexts.pause.exit]);
		// Escape на паузе означает "продолжить".
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(callbacks.onResumeRequested).toHaveBeenCalledTimes(1);
		expect(callbacks.onPauseRequested).toHaveBeenCalledTimes(1);
		hud.setPaused(false);
		expect(dialog.hasAttribute("open")).toBe(false);
	});

	it("кнопка паузы просит паузу, «Продолжить» просит возобновить, жест отмены диалога тоже", () => {
		const { root, hud, callbacks } = setupHud();
		hud.update(createSnapshot({ phase: "running" }), 0);
		root.querySelector<HTMLButtonElement>(".hud-pause-button")?.click();
		expect(callbacks.onPauseRequested).toHaveBeenCalledTimes(1);
		hud.setPaused(true);
		getDialog(root, "pause").querySelector<HTMLButtonElement>(".hud-button--primary")?.click();
		expect(callbacks.onResumeRequested).toHaveBeenCalledTimes(1);
		const cancel = new Event("cancel", { cancelable: true });
		getDialog(root, "pause").dispatchEvent(cancel);
		expect(cancel.defaultPrevented).toBe(true);
		expect(callbacks.onResumeRequested).toHaveBeenCalledTimes(2);
	});

	it("Escape не ставит на паузу до старта и после провала", () => {
		const { hud, callbacks } = setupHud();
		hud.update(createSnapshot({ phase: "ready" }), 0);
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		hud.update(createSnapshot({ phase: "failed" }), 100);
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(callbacks.onPauseRequested).not.toHaveBeenCalled();
	});

	it("в портретной ориентации можно начать смену касанием", () => {
		setWindowSize(390, 844);
		const { root, hud, callbacks } = setupHud("touch");
		hud.update(createSnapshot({ phase: "ready" }), 0);
		const startButton = getDialog(root, "start").querySelector<HTMLButtonElement>(".hud-button--primary");
		expect(startButton?.disabled).toBe(false);
		startButton?.click();
		expect(callbacks.onStartPressed).toHaveBeenCalledTimes(1);
	});

	it("смена продолжается при повороте экрана", () => {
		setWindowSize(844, 390);
		const { hud, callbacks } = setupHud("touch");
		hud.update(createSnapshot({ phase: "running" }), 0);
		setWindowSize(390, 844);
		setWindowSize(390, 844);
		expect(callbacks.onPauseRequested).not.toHaveBeenCalled();
	});
});

describe("провал, выход и отправка результата (7.6)", () => {
	const failure: FailureInfo = { place: "table", groupId: "g-3", customerId: "c-3-1", tableId: "table-3", tableNumber: 3, dish: "stew" };

	function failedSnapshot(): GameSnapshot {
		return createSnapshot({ phase: "failed", failure, score: 34, maxScore: 120, result: { completed: false, score: 34, maxScore: 120, reason: "failed" } });
	}

	it("Причина показана: оверлей сообщает о столе 3 и рагу, результат порталу ещё не передан", () => {
		const { root, hud, bridge } = setupHud();
		hud.update(failedSnapshot(), 0);
		const dialog = getDialog(root, "failure");
		expect(dialog.hasAttribute("open")).toBe(true);
		const reason = dialog.querySelector(".hud-failure__reason")?.textContent ?? "";
		expect(reason).toContain("3");
		expect(reason).toContain(hudTexts.dishNames.stew);
		expect(dialog.querySelector(".hud-failure__score")?.textContent).toBe(hudTexts.failure.scoreSummary(34, 120));
		expect(dialog.querySelector("button")?.textContent).toBe(hudTexts.failure.continueButton);
		expect(bridge.finish).not.toHaveBeenCalled();
		expect(bridge.exit).not.toHaveBeenCalled();
	});

	it("причина для очереди называет улицу, а не стол", () => {
		const { root, hud } = setupHud();
		hud.update(createSnapshot({ phase: "failed", failure: { place: "queue", groupId: "g-1", customerId: "c-1-1", tableId: null, tableNumber: null, dish: null }, result: { completed: false, score: 5, maxScore: 50, reason: "failed" } }), 0);
		expect(getDialog(root, "failure").querySelector(".hud-failure__reason")?.textContent).toBe(hudTexts.failure.reason("queue", null, null));
	});

	it("оверлей провала не закрывается Escape и жестом отмены", () => {
		const { root, hud, callbacks } = setupHud();
		hud.update(failedSnapshot(), 0);
		const cancel = new Event("cancel", { cancelable: true });
		getDialog(root, "failure").dispatchEvent(cancel);
		expect(cancel.defaultPrevented).toBe(true);
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(callbacks.onPauseRequested).not.toHaveBeenCalled();
		expect(getDialog(root, "failure").hasAttribute("open")).toBe(true);
	});

	it("Игрок подтвердил провал: портал получает completed=false и набранный score, игра закрывается", () => {
		const { root, hud, bridge, onClosed } = setupHud();
		hud.update(failedSnapshot(), 0);
		getDialog(root, "failure").querySelector<HTMLButtonElement>(".hud-button--primary")?.click();
		expect(bridge.finish).toHaveBeenCalledTimes(1);
		expect(bridge.finish).toHaveBeenCalledWith({ score: 34, maxScore: 120, completed: false });
		expect(onClosed).toHaveBeenCalledTimes(1);
	});

	it("Игрок вышел посреди смены: портал получает выход без результата и без оверлея провала", () => {
		const { root, hud, bridge, onClosed } = setupHud();
		hud.update(createSnapshot({ phase: "running" }), 0);
		hud.setPaused(true);
		getDialog(root, "pause").querySelector<HTMLButtonElement>(".hud-button--secondary")?.click();
		expect(bridge.exit).toHaveBeenCalledTimes(1);
		expect(bridge.finish).not.toHaveBeenCalled();
		expect(getDialog(root, "failure").hasAttribute("open")).toBe(false);
		expect(onClosed).toHaveBeenCalledTimes(1);
	});

	it("Повторная передача исключена: повторные нажатия кнопок не отправляют второе сообщение", () => {
		const { root, hud, bridge } = setupHud();
		hud.update(failedSnapshot(), 0);
		const button = getDialog(root, "failure").querySelector<HTMLButtonElement>(".hud-button--primary");
		button?.click();
		button?.click();
		expect(bridge.finish).toHaveBeenCalledTimes(1);
		// Выход после результата тоже не уходит.
		getDialog(root, "pause").querySelector<HTMLButtonElement>(".hud-button--secondary")?.click();
		expect(bridge.exit).not.toHaveBeenCalled();
	});

	it("мост отклонил числа: кнопка остаётся доступной для повтора", () => {
		const { root, hud, bridge } = setupHud();
		hud.update(createSnapshot({ phase: "failed", failure, score: 10, maxScore: 0, result: { completed: false, score: 10, maxScore: 0, reason: "failed" } }), 0);
		const button = getDialog(root, "failure").querySelector<HTMLButtonElement>(".hud-button--primary");
		button?.click();
		expect(bridge.finish).toHaveBeenCalledTimes(1);
		expect(button?.disabled).toBe(false);
	});
});

describe("раскладка (7.7)", () => {
	// Зоны HUD: все блоки лежат в верхних зонах, нижние зоны HUD не занимает.
	function collectZones(root: HTMLElement): string[] {
		return Array.from(root.querySelectorAll("[data-zone]")).map((node) => node.getAttribute("data-zone") ?? "");
	}

	it("Телефон в альбомной ориентации: карточки вверху слева, нижняя часть экрана свободна для стика и кнопок", () => {
		setWindowSize(844, 390);
		const { root, hud } = setupHud("touch");
		hud.update(createSnapshot({ tables: [createTable(1, "waiting", [createOrder("table-1", 0, "burger", "waiting", 0.5)])] }), 0);
		const hudRoot = root.querySelector<HTMLElement>(".cooking-hud");
		expect(hudRoot?.getAttribute("data-input-mode")).toBe("touch");
		expect(hudRoot?.getAttribute("data-orientation-blocked")).toBeNull();
		expect(root.querySelector(".hud-orders")?.getAttribute("data-zone")).toBe("top-left");
		// Карточки не опускаются ниже верхней половины экрана, где начинается область стика и кнопок.
		const maxHeight = Number.parseFloat(hudRoot?.style.getPropertyValue("--hud-orders-max-height") ?? "");
		expect(maxHeight).toBeGreaterThan(0);
		expect(maxHeight).toBeLessThanOrEqual(50);
		// Нет блоков HUD в нижних зонах.
		const zones = collectZones(root);
		expect(zones.length).toBeGreaterThan(0);
		expect(zones.every((zone) => zone.startsWith("top-"))).toBe(true);
	});

	it("на клавиатурном устройстве колонка карточек может быть выше, при смене режима высота пересчитывается", () => {
		const { root, hud } = setupHud("keyboard");
		const hudRoot = root.querySelector<HTMLElement>(".cooking-hud");
		const keyboardHeight = Number.parseFloat(hudRoot?.style.getPropertyValue("--hud-orders-max-height") ?? "");
		hud.setInputMode("touch");
		const touchHeight = Number.parseFloat(hudRoot?.style.getPropertyValue("--hud-orders-max-height") ?? "");
		expect(touchHeight).toBeLessThan(keyboardHeight);
		expect(hudRoot?.getAttribute("data-input-mode")).toBe("touch");
	});

	it("кнопка паузы не меньше сенсорной цели 44 пикселя (стиль)", async () => {
		const css = await import("node:fs").then((fs) => fs.readFileSync(`${process.cwd()}/games/cooking/src/hud/hud.css`, "utf8"));
		const pauseRule = css.slice(css.indexOf(".hud-pause-button {"), css.indexOf("}", css.indexOf(".hud-pause-button {")));
		expect(pauseRule).toContain("min-inline-size: 44px");
		expect(pauseRule).toContain("min-block-size: 44px");
		// HUD пропускает события к холсту: включены только кнопки и диалоги.
		const hudRule = css.slice(css.indexOf(".cooking-hud {"), css.indexOf("}", css.indexOf(".cooking-hud {")));
		expect(hudRule).toContain("pointer-events: none");
	});

	it("dispose убирает весь DOM HUD и обработчики окна", () => {
		const { root, hud, callbacks } = setupHud();
		hud.update(createSnapshot({ phase: "running" }), 0);
		hud.dispose();
		expect(root.querySelector(".cooking-hud")).toBeNull();
		expect(root.querySelector("dialog")).toBeNull();
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(callbacks.onPauseRequested).not.toHaveBeenCalled();
	});
});
