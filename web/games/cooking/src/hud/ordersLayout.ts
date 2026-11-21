// Раскладка карточек заказов (дефект H1): все столы смены должны быть видны целиком, без прокрутки, без обрезки и без перекрытия
// таймера, кнопки паузы, стика и экранных кнопок. Чистые функции без DOM: размеры считаются по константам (hud/constants.ts),
// те же числа уходят в CSS через переменные, поэтому расчёт и вид не расходятся.
//
// Два вида карточки:
// - full: полная карточка (номер стола, значок, название и статус каждого заказа, полоса терпения под строкой);
// - compact: одна строка на стол (номер и ряд значков блюд, статус значком, полоса терпения под каждым значком).
// Карточки идут по колонкам сверху вниз (самый срочный стол первым), число колонок и строк выбирается так, чтобы блок поместился
// в свою зону: слева сверху между краем экрана и центральным блоком (таймер), сверху вниз до запаса под стик.
import {
	COMPACT_BADGE_PX,
	COMPACT_CARD_GAP_PX,
	COMPACT_CARD_HEIGHT_PX,
	COMPACT_CARD_INNER_GAP_PX,
	COMPACT_CARD_PADDING_X_PX,
	COMPACT_ICON_GAP_PX,
	COMPACT_ICON_PX,
	FULL_CARD_HEADER_PX,
	FULL_CARD_PADDING_PX,
	FULL_CARD_WIDTH_PX,
	FULL_ORDER_ROW_PX,
	FULL_RETURN_FILL_RATIO,
	HUD_CENTER_WIDTH_LOW_PX,
	HUD_CENTER_WIDTH_PX,
	HUD_EDGE_PADDING_PX,
	HUD_GAP_LOW_PX,
	HUD_GAP_PX,
	LOW_SCREEN_MAX_HEIGHT_PX,
	TOUCH_CONTROLS_RESERVE_PX,
} from "./constants";

// Вид карточки стола.
export type OrdersDensity = "full" | "compact";

// Окружение HUD: размер окна, отступы корня (в них входят вырезы экрана) и режим ввода.
export interface HudEnvironment {
	viewportWidthPx: number;
	viewportHeightPx: number;
	paddingLeftPx: number;
	paddingRightPx: number;
	paddingTopPx: number;
	// Сенсорный режим: снизу слева стик, снизу справа кнопки, под карточками нужен запас.
	touch: boolean;
}

// Размеры блоков HUD для окружения.
export interface HudMetrics {
	// Низкий экран: сжатые отступы, центральный блок и счётчики.
	lowScreen: boolean;
	gapPx: number;
	centerWidthPx: number;
	// Зона карточек заказов: слева сверху.
	zoneWidthPx: number;
	zoneHeightPx: number;
}

// Размеры блоков HUD по окружению.
export function computeHudMetrics(environment: HudEnvironment): HudMetrics {
	const lowScreen = environment.viewportHeightPx <= LOW_SCREEN_MAX_HEIGHT_PX;
	const gapPx = lowScreen ? HUD_GAP_LOW_PX : HUD_GAP_PX;
	const centerWidthPx = lowScreen ? HUD_CENTER_WIDTH_LOW_PX : HUD_CENTER_WIDTH_PX;
	// Сетка корня: левая зона, центр фиксированной ширины, правая зона (левая и правая равны).
	const zoneWidthPx = Math.max(0, (environment.viewportWidthPx - environment.paddingLeftPx - environment.paddingRightPx - centerWidthPx - 2 * gapPx) / 2);
	const bottomReservePx = environment.touch ? TOUCH_CONTROLS_RESERVE_PX : HUD_EDGE_PADDING_PX;
	const zoneHeightPx = Math.max(0, environment.viewportHeightPx - environment.paddingTopPx - bottomReservePx);
	return { lowScreen, gapPx, centerWidthPx, zoneWidthPx, zoneHeightPx };
}

// Ширина карточки стола с orderCount заказами.
export function getCardWidthPx(density: OrdersDensity, orderCount: number): number {
	if (density === "full") {
		return FULL_CARD_WIDTH_PX;
	}
	const icons = Math.max(1, orderCount);
	return 2 * COMPACT_CARD_PADDING_X_PX + COMPACT_BADGE_PX + COMPACT_CARD_INNER_GAP_PX + icons * COMPACT_ICON_PX + (icons - 1) * COMPACT_ICON_GAP_PX;
}

// Высота карточки стола с orderCount заказами.
export function getCardHeightPx(density: OrdersDensity, orderCount: number): number {
	if (density === "compact") {
		return COMPACT_CARD_HEIGHT_PX;
	}
	return FULL_CARD_PADDING_PX + FULL_CARD_HEADER_PX + Math.max(1, orderCount) * FULL_ORDER_ROW_PX;
}

// Положение карточки в блоке (пиксели от левого верхнего угла блока).
export interface CardPlacement {
	index: number;
	column: number;
	row: number;
	xPx: number;
	yPx: number;
	widthPx: number;
	heightPx: number;
}

// План раскладки.
export interface OrdersLayoutPlan {
	density: OrdersDensity;
	columns: number;
	rows: number;
	// Размер блока карточек.
	widthPx: number;
	heightPx: number;
	// Зона, в которую блок должен поместиться.
	zoneWidthPx: number;
	zoneHeightPx: number;
	// Поместился ли блок в зону по обеим осям.
	fits: boolean;
	// Положения карточек по порядку (срочные первыми).
	placements: CardPlacement[];
}

// Раскладывает карточки по колонкам (сверху вниз, затем следующая колонка) и считает размеры блока.
function arrange(density: OrdersDensity, orderCounts: readonly number[], rows: number, gapPx: number): Pick<OrdersLayoutPlan, "columns" | "rows" | "widthPx" | "heightPx" | "placements"> {
	const cardCount = orderCounts.length;
	if (cardCount === 0) {
		return { columns: 0, rows: 0, widthPx: 0, heightPx: 0, placements: [] };
	}
	const columns = Math.ceil(cardCount / rows);
	const columnWidths: number[] = new Array(columns).fill(0);
	const rowHeights: number[] = new Array(rows).fill(0);
	orderCounts.forEach((orderCount, index) => {
		const column = Math.floor(index / rows);
		const row = index % rows;
		columnWidths[column] = Math.max(columnWidths[column], getCardWidthPx(density, orderCount));
		rowHeights[row] = Math.max(rowHeights[row], getCardHeightPx(density, orderCount));
	});
	const columnStarts: number[] = [];
	let cursorX = 0;
	for (const width of columnWidths) {
		columnStarts.push(cursorX);
		cursorX += width + gapPx;
	}
	const rowStarts: number[] = [];
	let cursorY = 0;
	for (const height of rowHeights) {
		rowStarts.push(cursorY);
		cursorY += height + gapPx;
	}
	const placements: CardPlacement[] = orderCounts.map((orderCount, index) => {
		const column = Math.floor(index / rows);
		const row = index % rows;
		return { index, column, row, xPx: columnStarts[column], yPx: rowStarts[row], widthPx: getCardWidthPx(density, orderCount), heightPx: getCardHeightPx(density, orderCount) };
	});
	return {
		columns,
		rows: Math.min(rows, cardCount),
		widthPx: cursorX - gapPx,
		heightPx: cursorY - gapPx,
		placements,
	};
}

// Перебирает число строк от одной (одна колонка) до числа карточек (один ряд) и берёт первую раскладку, которая помещается.
// Если не помещается ни одна, возвращает самую низкую из тех, что умещаются по ширине (fits = false), либо самую узкую.
function chooseArrangement(density: OrdersDensity, orderCounts: readonly number[], zone: { widthPx: number; heightPx: number }, gapPx: number): OrdersLayoutPlan {
	const cardCount = orderCounts.length;
	const candidates: Array<ReturnType<typeof arrange>> = [];
	for (let rows = cardCount; rows >= 1; rows -= 1) {
		candidates.push(arrange(density, orderCounts, rows, gapPx));
	}
	// candidates идут от одной строки (одна колонка по высоте длинная) к максимуму строк; порядок: сначала меньше колонок.
	const byColumns = [...candidates].sort((first, second) => first.columns - second.columns || first.heightPx - second.heightPx);
	const fitting = byColumns.find((candidate) => candidate.widthPx <= zone.widthPx + 1e-6 && candidate.heightPx <= zone.heightPx + 1e-6);
	const chosen = fitting ?? byColumns.filter((candidate) => candidate.widthPx <= zone.widthPx + 1e-6).sort((first, second) => first.heightPx - second.heightPx)[0] ?? byColumns[byColumns.length - 1];
	return { density, ...chosen, zoneWidthPx: zone.widthPx, zoneHeightPx: zone.heightPx, fits: fitting !== undefined };
}

// Вход планировщика.
export interface OrdersLayoutInput {
	metrics: HudMetrics;
	// Число заказов в каждой видимой карточке по порядку на экране.
	orderCounts: readonly number[];
	// Вид на прошлом обновлении (гистерезис).
	previousDensity: OrdersDensity;
}

// Выбирает вид карточек и число колонок. Полный вид, пока он помещается (возврат в него из компактного только с запасом),
// иначе компактный: при шести столах по четыре заказа он занимает две колонки по три строки на любом из телефонов.
export function planOrdersLayout(input: OrdersLayoutInput): OrdersLayoutPlan {
	const { metrics, orderCounts, previousDensity } = input;
	const zone = { widthPx: metrics.zoneWidthPx, heightPx: metrics.zoneHeightPx };
	const fullPlan = chooseArrangement("full", orderCounts, zone, metrics.gapPx);
	const returnZone = { widthPx: zone.widthPx, heightPx: zone.heightPx * (previousDensity === "full" ? 1 : FULL_RETURN_FILL_RATIO) };
	const fullFits = fullPlan.fits && fullPlan.widthPx <= returnZone.widthPx && fullPlan.heightPx <= returnZone.heightPx;
	if (fullFits) {
		return fullPlan;
	}
	return chooseArrangement("compact", orderCounts, zone, COMPACT_CARD_GAP_PX);
}
