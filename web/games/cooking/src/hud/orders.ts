// Карточки столов с заказами (задачи 7.2 и 7.3): иконка и название блюда, статус заказа, индикатор терпения с пульсацией
// при остатке менее четверти, упорядочивание карточек по срочности (самый срочный стол сверху), показ "Стол обслужен"
// и скрытие карточки через несколько секунд. DOM обновляется точечно: меняется только то, что изменилось.
import type { DishIcons, DishId, GameSnapshot, OrderSnapshot, TableSnapshot } from "../contracts";
import { hudTexts } from "../texts";
import {
	COMPACT_BADGE_PX,
	COMPACT_CARD_HEIGHT_PX,
	COMPACT_CARD_INNER_GAP_PX,
	COMPACT_CARD_PADDING_X_PX,
	COMPACT_ICON_GAP_PX,
	COMPACT_ICON_PX,
	FULL_CARD_WIDTH_PX,
	SERVED_CARD_VISIBLE_MS,
	URGENCY_SORT_STEP_SEC,
	URGENT_PATIENCE_RATIO,
} from "./constants";
import { createElement, setAttribute, setCssVariable, setFlag, setText, toPercent } from "./dom";
import { computeHudMetrics, planOrdersLayout, type HudEnvironment, type OrdersDensity, type OrdersLayoutPlan } from "./ordersLayout";

// Строка заказа в карточке.
interface OrderRow {
	root: HTMLLIElement;
	name: HTMLElement;
	status: HTMLElement;
	patience: HTMLProgressElement;
}

// Карточка стола.
interface TableCard {
	root: HTMLElement;
	title: HTMLElement;
	titleNumber: HTMLElement;
	stateLabel: HTMLElement;
	list: HTMLUListElement;
	rows: Map<string, OrderRow>;
	// Момент (миллисекунды кадра), когда стол стал обслуженным; null, пока не обслужен.
	servedSinceMs: number | null;
	// Порядок сортировки, посчитанный на последнем обновлении.
	sortKey: number;
	tableNumber: number;
}

// Панель карточек столов.
export interface OrdersPanel {
	readonly element: HTMLElement;
	update(snapshot: GameSnapshot, nowMs: number): void;
	// Идентификаторы столов видимых карточек в порядке на экране (сверху вниз).
	getCardOrder(): string[];
	// Последний план раскладки (вид карточек, колонки, строки, размеры) или null, пока карточек не было.
	getPlan(): OrdersLayoutPlan | null;
	// Пересчитывает раскладку по текущему окружению (изменился размер окна или режим ввода).
	relayout(): void;
	dispose(): void;
}

// Оттенок цвета индикатора терпения: 120 (зелёный) при полном терпении, 0 (красный) при нулевом.
function getPatienceHue(ratio: number): string {
	return String(Math.round(Math.min(1, Math.max(0, ratio)) * 120));
}

// Создаёт панель. dishIcons: иконки блюд, нет иконки - показывается первая буква названия. readEnvironment даёт размер окна,
// отступы корня HUD и режим ввода: по ним выбирается вид карточек (полный или компактный) и число колонок.
export function createOrdersPanel(dishIcons: DishIcons, readEnvironment: () => HudEnvironment): OrdersPanel {
	const element = createElement("section", { className: "hud-orders", attributes: { "aria-label": hudTexts.orders.panelLabel, "data-zone": "top-right", "data-density": "full" } });
	const cards = new Map<string, TableCard>();
	// Размеры карточек уходят в CSS из тех же констант, по которым считается раскладка: расчёт и стили не расходятся.
	element.style.setProperty("--hud-full-card-width", `${FULL_CARD_WIDTH_PX}px`);
	element.style.setProperty("--hud-compact-icon", `${COMPACT_ICON_PX}px`);
	element.style.setProperty("--hud-compact-icon-gap", `${COMPACT_ICON_GAP_PX}px`);
	element.style.setProperty("--hud-compact-badge", `${COMPACT_BADGE_PX}px`);
	element.style.setProperty("--hud-compact-pad-x", `${COMPACT_CARD_PADDING_X_PX}px`);
	element.style.setProperty("--hud-compact-inner-gap", `${COMPACT_CARD_INNER_GAP_PX}px`);
	element.style.setProperty("--hud-compact-card-height", `${COMPACT_CARD_HEIGHT_PX}px`);
	let plan: OrdersLayoutPlan | null = null;
	let density: OrdersDensity = "full";
	// Число заказов в видимых карточках на последнем обновлении (для пересчёта раскладки при смене окружения).
	let lastOrderCounts: number[] = [];

	function createIcon(dish: DishId): HTMLElement {
		const iconUrl = dishIcons[dish];
		if (iconUrl) {
			return createElement("img", { className: "hud-order__icon", attributes: { src: iconUrl, alt: "", width: "40", height: "40", draggable: "false" } });
		}
		// Запасной вариант без иконки: плашка с первой буквой названия блюда.
		return createElement("span", { className: "hud-order__icon hud-order__icon--text", text: hudTexts.dishNames[dish].charAt(0), attributes: { "aria-hidden": "true" } });
	}

	function createRow(order: OrderSnapshot): OrderRow {
		const root = createElement("li", { className: "hud-order", attributes: { "data-order-id": order.id } });
		const name = createElement("span", { className: "hud-order__name", text: hudTexts.dishNames[order.dish] });
		const status = createElement("span", { className: "hud-order__status" });
		const patience = createElement("progress", { className: "hud-order__patience", attributes: { max: "1", value: "1" } });
		root.append(createIcon(order.dish), name, status, patience);
		return { root, name, status, patience };
	}

	function createCard(table: TableSnapshot): TableCard {
		const root = createElement("article", { className: "hud-card", attributes: { "data-table-id": table.tableId } });
		const header = createElement("header", { className: "hud-card__header" });
		// Слово и номер в отдельных узлах: компактный вид показывает только номер, слово остаётся для вспомогательных технологий.
		const title = createElement("h2", { className: "hud-card__title" });
		const titleWord = createElement("span", { className: "hud-card__title-word", text: hudTexts.orders.tableWord });
		const titleNumber = createElement("span", { className: "hud-card__title-number" });
		title.append(titleWord, " ", titleNumber);
		const stateLabel = createElement("span", { className: "hud-card__state" });
		header.append(title, stateLabel);
		const list = createElement("ul", { className: "hud-card__orders" });
		root.append(header, list);
		return { root, title, titleNumber, stateLabel, list, rows: new Map(), servedSinceMs: null, sortKey: 0, tableNumber: table.number };
	}

	// Обновляет строки заказов карточки по снимку стола.
	function updateRows(card: TableCard, orders: readonly OrderSnapshot[]): boolean {
		let anyUrgent = false;
		const seen = new Set<string>();
		for (const order of orders) {
			seen.add(order.id);
			let row = card.rows.get(order.id);
			if (!row) {
				row = createRow(order);
				card.rows.set(order.id, row);
				card.list.append(row.root);
			}
			const isServed = order.status === "served";
			const isUrgent = !isServed && order.patienceRatio < URGENT_PATIENCE_RATIO;
			anyUrgent = anyUrgent || isUrgent;
			setText(row.status, hudTexts.orders.status[order.status]);
			setAttribute(row.root, "data-status", order.status);
			setFlag(row.root, "data-urgent", isUrgent);
			const percent = toPercent(order.patienceRatio);
			setAttribute(row.patience, "value", (percent / 100).toString());
			setAttribute(row.patience, "aria-label", hudTexts.orders.patienceLabel(hudTexts.dishNames[order.dish], percent));
			setCssVariable(row.root, "--patience-hue", getPatienceHue(order.patienceRatio));
		}
		for (const [orderId, row] of card.rows) {
			if (!seen.has(orderId)) {
				row.root.remove();
				card.rows.delete(orderId);
			}
		}
		return anyUrgent;
	}

	// Ключ срочности: наименьший остаток терпения среди неподанных заказов, в секундах с квантованием. Обслуженные столы в конце.
	function getSortKey(table: TableSnapshot): number {
		if (table.state === "served") {
			return Number.POSITIVE_INFINITY;
		}
		let minLeftSec = Number.POSITIVE_INFINITY;
		for (const order of table.orders) {
			if (order.status !== "served") {
				minLeftSec = Math.min(minLeftSec, order.patienceLeftSec);
			}
		}
		return Number.isFinite(minLeftSec) ? Math.floor(minLeftSec / URGENCY_SORT_STEP_SEC) * URGENCY_SORT_STEP_SEC : Number.POSITIVE_INFINITY;
	}

	// Расставляет карточки в DOM по ключу срочности; существующие узлы переставляются только при смене порядка.
	function applyOrder(visible: TableCard[]): void {
		visible.sort((first, second) => (first.sortKey === second.sortKey ? first.tableNumber - second.tableNumber : first.sortKey < second.sortKey ? -1 : 1));
		const current = Array.from(element.children);
		const sameOrder = current.length === visible.length && visible.every((card, index) => current[index] === card.root);
		if (!sameOrder) {
			element.append(...visible.map((card) => card.root));
		}
	}

	// Выбирает вид и число колонок по текущему окружению и применяет их к панели.
	function layout(orderCounts: number[]): void {
		lastOrderCounts = orderCounts;
		const metrics = computeHudMetrics(readEnvironment());
		plan = planOrdersLayout({ metrics, orderCounts, previousDensity: density });
		density = plan.density;
		setAttribute(element, "data-density", plan.density);
		setAttribute(element, "data-fits", plan.fits ? "true" : "false");
		setCssVariable(element, "--hud-orders-rows", String(Math.max(plan.rows, 1)));
		setCssVariable(element, "--hud-orders-columns", String(Math.max(plan.columns, 1)));
		setCssVariable(element, "--hud-orders-gap", `${plan.density === "compact" ? 3 : metrics.gapPx}px`);
	}

	return {
		element,
		update(snapshot, nowMs) {
			const visibleCards: TableCard[] = [];
			const liveTableIds = new Set<string>();
			for (const table of snapshot.tables) {
				liveTableIds.add(table.tableId);
				if (table.state === "free") {
					// Группа ушла: карточка убирается сразу, таймер "обслужен" сбрасывается.
					const stale = cards.get(table.tableId);
					if (stale) {
						stale.root.remove();
						cards.delete(table.tableId);
					}
					continue;
				}
				let card = cards.get(table.tableId);
				if (!card) {
					card = createCard(table);
					cards.set(table.tableId, card);
				}
				if (table.state === "served") {
					if (card.servedSinceMs === null) {
						card.servedSinceMs = nowMs;
					}
					if (nowMs - card.servedSinceMs >= SERVED_CARD_VISIBLE_MS) {
						// Стол обслужен давно: карточка скрыта, пока за стол не сядет новая группа.
						card.root.remove();
						continue;
					}
				} else {
					card.servedSinceMs = null;
				}
				setText(card.titleNumber, String(table.number));
				setText(card.stateLabel, table.state === "served" ? hudTexts.orders.tableServed : "");
				setAttribute(card.root, "data-state", table.state);
				card.tableNumber = table.number;
				const anyUrgent = updateRows(card, table.orders);
				setFlag(card.root, "data-urgent", anyUrgent);
				card.sortKey = getSortKey(table);
				visibleCards.push(card);
			}
			// Столы, исчезнувшие из снимка (другой уровень), убираются.
			for (const [tableId, card] of cards) {
				if (!liveTableIds.has(tableId)) {
					card.root.remove();
					cards.delete(tableId);
				}
			}
			applyOrder(visibleCards);
			// Вид карточек и число колонок выбираются по числу столов и заказов (visibleCards уже отсортированы по срочности).
			layout(visibleCards.map((card) => card.rows.size));
			// Скрытая карточка обслуженного стола остаётся вне DOM, но возвращается, если стол снова станет waiting.
		},
		getCardOrder() {
			return Array.from(element.children).map((child) => child.getAttribute("data-table-id") ?? "");
		},
		getPlan() {
			return plan;
		},
		relayout() {
			layout(lastOrderCounts);
		},
		dispose() {
			element.remove();
			cards.clear();
		},
	};
}
