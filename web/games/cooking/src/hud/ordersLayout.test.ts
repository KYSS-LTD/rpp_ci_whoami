// @vitest-environment node
// Тесты раскладки карточек заказов (дефект H1): на телефонах в альбомной ориентации все столы hard видны целиком, не обрезаются и
// не заходят под таймер, паузу, стик и экранные кнопки. Размеры считаются чистыми функциями, поэтому проверяются без браузера
// (реальная раскладка в Chrome проверяется отдельно на харнессе).
import { describe, expect, it } from "vitest";
import {
	FULL_RETURN_FILL_RATIO,
	HUD_CENTER_WIDTH_LOW_PX,
	HUD_EDGE_PADDING_PX,
	MAX_ORDERS_PER_TABLE,
} from "./constants";
import { computeHudMetrics, getTouchControlsReservePx, planOrdersLayout, type CardPlacement, type HudEnvironment, type OrdersLayoutPlan } from "./ordersLayout";

// Телефоны в альбомной ориентации из задачи: ширина и высота окна.
const phoneSizes: Array<[number, number]> = [
	[844, 390],
	[667, 375],
	[740, 360],
	[932, 430],
];

function createEnvironment(width: number, height: number, touch: boolean): HudEnvironment {
	return { viewportWidthPx: width, viewportHeightPx: height, paddingLeftPx: HUD_EDGE_PADDING_PX, paddingRightPx: HUD_EDGE_PADDING_PX, paddingTopPx: HUD_EDGE_PADDING_PX, touch };
}

// Пересекаются ли два прямоугольника по площади.
function overlaps(first: CardPlacement, second: CardPlacement): boolean {
	return first.xPx < second.xPx + second.widthPx && second.xPx < first.xPx + first.widthPx && first.yPx < second.yPx + second.heightPx && second.yPx < first.yPx + first.heightPx;
}

// Общие проверки плана: карточки внутри блока, блок внутри зоны, карточки не пересекаются.
function expectPlanInsideZone(plan: OrdersLayoutPlan, label: string): void {
	expect(plan.fits, `${label}: план помещается в зону`).toBe(true);
	expect(plan.widthPx, `${label}: ширина блока`).toBeLessThanOrEqual(plan.zoneWidthPx + 1e-6);
	expect(plan.heightPx, `${label}: высота блока`).toBeLessThanOrEqual(plan.zoneHeightPx + 1e-6);
	for (const placement of plan.placements) {
		expect(placement.xPx, `${label}: карточка ${placement.index} слева`).toBeGreaterThanOrEqual(0);
		expect(placement.yPx, `${label}: карточка ${placement.index} сверху`).toBeGreaterThanOrEqual(0);
		expect(placement.xPx + placement.widthPx, `${label}: карточка ${placement.index} справа`).toBeLessThanOrEqual(plan.widthPx + 1e-6);
		expect(placement.yPx + placement.heightPx, `${label}: карточка ${placement.index} снизу`).toBeLessThanOrEqual(plan.heightPx + 1e-6);
	}
	for (let first = 0; first < plan.placements.length; first += 1) {
		for (let second = first + 1; second < plan.placements.length; second += 1) {
			expect(overlaps(plan.placements[first], plan.placements[second]), `${label}: карточки ${first} и ${second} не пересекаются`).toBe(false);
		}
	}
}

describe.each(phoneSizes)("телефон в альбомной ориентации %i x %i", (width, height) => {
	const environment = createEnvironment(width, height, true);
	const metrics = computeHudMetrics(environment);

	it("зона карточек: справа от таймера, сверху вниз до запаса под экранные кнопки, слева и справа зоны симметричны", () => {
		expect(metrics.lowScreen).toBe(true);
		expect(metrics.centerWidthPx).toBe(HUD_CENTER_WIDTH_LOW_PX);
		// Левая зона + центр + правая зона + зазоры + отступы дают ровно ширину окна.
		expect(HUD_EDGE_PADDING_PX + metrics.zoneWidthPx + metrics.gapPx + metrics.centerWidthPx + metrics.gapPx + metrics.zoneWidthPx + HUD_EDGE_PADDING_PX).toBeCloseTo(width, 6);
		// Низ зоны выше запаса под экранные кнопки "Взять" и "Резать" (они у правого края, как и карточки).
		expect(environment.paddingTopPx + metrics.zoneHeightPx + getTouchControlsReservePx(width, height)).toBeCloseTo(height, 6);
		expect(metrics.zoneWidthPx).toBeGreaterThan(200);
	});

	it("окно считается телефоном: вместо карточек столов показана сводка по блюдам", () => {
		expect(metrics.phone).toBe(true);
	});
});

describe("низкое окно компьютера 1280 x 520", () => {
	const metrics = computeHudMetrics(createEnvironment(1280, 520, false));

	it("не телефон: компактные карточки в обычном масштабе, шесть столов по четыре заказа и hard видны целиком", () => {
		expect(metrics.phone).toBe(false);
		expect(metrics.compactScale).toBe(1);
		const heavy = planOrdersLayout({ metrics, orderCounts: new Array(6).fill(MAX_ORDERS_PER_TABLE), previousDensity: "full" });
		expectPlanInsideZone(heavy, "1280x520 6x4");
		expect(heavy.density).toBe("compact");
		expectPlanInsideZone(planOrdersLayout({ metrics, orderCounts: [4, 4, 2, 2, 2, 2], previousDensity: "full" }), "1280x520 hard");
	});
});

describe("компьютер и планшет", () => {
	it("на большом экране при малой нагрузке карточки полные, при большой нагрузке вид компактный и кухня остаётся видна", () => {
		const metrics = computeHudMetrics(createEnvironment(1280, 800, false));
		expect(metrics.lowScreen).toBe(false);
		const light = planOrdersLayout({ metrics, orderCounts: [2, 1], previousDensity: "full" });
		expectPlanInsideZone(light, "1280x800 два стола");
		expect(light.density).toBe("full");
		const heavy = planOrdersLayout({ metrics, orderCounts: [4, 4, 4, 4, 4, 4], previousDensity: "full" });
		expectPlanInsideZone(heavy, "1280x800 шесть столов по четыре");
		expect(heavy.density).toBe("compact");
		expect(heavy.heightPx).toBeLessThan(metrics.zoneHeightPx * 0.5);
	});

	it("сенсорный планшет 1024 x 768: шесть столов по четыре заказа помещаются над запасом под стик", () => {
		const metrics = computeHudMetrics(createEnvironment(1024, 768, true));
		expectPlanInsideZone(planOrdersLayout({ metrics, orderCounts: [4, 4, 4, 4, 4, 4], previousDensity: "full" }), "1024x768 touch");
	});

	it("гистерезис: из компактного вида возврат в полный только с запасом по высоте, из полного уход только при нехватке места", () => {
		const metrics = computeHudMetrics(createEnvironment(1280, 800, false));
		// Подбираем нагрузку, при которой полный вид занимает между 45 и 60 процентами высоты зоны.
		let borderline: number[] | null = null;
		for (let tables = 1; tables <= 8 && borderline === null; tables += 1) {
			for (let ordersPerTable = 1; ordersPerTable <= MAX_ORDERS_PER_TABLE && borderline === null; ordersPerTable += 1) {
				const counts = new Array(tables).fill(ordersPerTable);
				const fullPlan = planOrdersLayout({ metrics, orderCounts: counts, previousDensity: "full" });
				if (fullPlan.density === "full" && fullPlan.heightPx > metrics.zoneHeightPx * FULL_RETURN_FILL_RATIO) {
					borderline = counts;
				}
			}
		}
		expect(borderline, "нужна граничная нагрузка для проверки").not.toBeNull();
		const counts = borderline as number[];
		expect(planOrdersLayout({ metrics, orderCounts: counts, previousDensity: "full" }).density).toBe("full");
		expect(planOrdersLayout({ metrics, orderCounts: counts, previousDensity: "compact" }).density).toBe("compact");
	});
});

describe("крайние случаи", () => {
	it("нет карточек: пустой план без колонок", () => {
		const plan = planOrdersLayout({ metrics: computeHudMetrics(createEnvironment(844, 390, true)), orderCounts: [], previousDensity: "full" });
		expect(plan.columns).toBe(0);
		expect(plan.placements).toHaveLength(0);
		expect(plan.fits).toBe(true);
	});

	it("крошечное окно не бросает исключений: план честно сообщает, что не поместился", () => {
		const plan = planOrdersLayout({ metrics: computeHudMetrics(createEnvironment(200, 120, true)), orderCounts: [4, 4, 4, 4, 4, 4], previousDensity: "full" });
		expect(plan.placements).toHaveLength(6);
		expect(plan.fits).toBe(false);
	});

	it("срочные столы идут первыми: первая карточка в левом верхнем углу блока", () => {
		const plan = planOrdersLayout({ metrics: computeHudMetrics(createEnvironment(844, 390, true)), orderCounts: [4, 2, 2, 4, 2, 2], previousDensity: "full" });
		expect(plan.placements[0]).toMatchObject({ column: 0, row: 0, xPx: 0, yPx: 0 });
		expect(plan.placements[1].column === 0 && plan.placements[1].row === 1).toBe(true);
	});
});
