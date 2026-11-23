// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { IngredientItem, AssemblyItem } from "../../contracts";
import { assembleBurger, chopFromCrate, createKitchenKit, startPatty } from "./kitchenTestKit";

// Ожидаемый ингредиент.
function ingredient(kind: IngredientItem["kind"], state: IngredientItem["state"]): IngredientItem {
	return { type: "ingredient", kind, state };
}

describe("рука повара, ящики и прилавки (2.4)", () => {
	it("Занятая рука: второй предмет из ящика не берётся", () => {
		const kit = createKitchenKit();
		expect(kit.tap("crate-steak")).toEqual({ ok: true });
		expect(kit.tap("crate-bun")).toEqual({ ok: false, reason: "handBusy" });
		expect(kit.hand()).toEqual(ingredient("steak", "raw"));
		const rejections = kit.eventsOf("actionRejected");
		expect(rejections).toHaveLength(1);
		expect(rejections[0]).toMatchObject({ stationId: "crate-bun", reason: "handBusy" });
	});

	it("Тарелка с содержимым: рука считается занятой одним предметом", () => {
		const kit = createKitchenKit();
		kit.tap("crate-bun");
		kit.tap("counter-1");
		kit.tap("plates-1");
		kit.tap("counter-1");
		expect(kit.hand()).toMatchObject({ type: "assembly", plated: true, contents: [ingredient("bun", "raw")] });
		expect(kit.tap("crate-steak")).toEqual({ ok: false, reason: "handBusy" });
		expect(kit.hand()).toMatchObject({ type: "assembly", plated: true });
	});

	it("Взять из ящика: в руке сырой стейк, ящик остаётся полным", () => {
		const kit = createKitchenKit();
		expect(kit.tap("crate-steak")).toEqual({ ok: true });
		expect(kit.hand()).toEqual(ingredient("steak", "raw"));
		expect(kit.eventsOf("itemTaken")[0]).toMatchObject({ stationId: "crate-steak", item: ingredient("steak", "raw") });
		kit.tap("trash-1");
		expect(kit.hand()).toBeNull();
		// Ящик выдаёт снова и снова.
		expect(kit.tap("crate-steak")).toEqual({ ok: true });
		expect(kit.hand()).toEqual(ingredient("steak", "raw"));
		expect(kit.station("crate-steak")).toMatchObject({ items: [], phase: "idle" });
	});

	it("Положить и взять: предмет возвращается в руку", () => {
		const kit = createKitchenKit();
		kit.tap("crate-carrot");
		expect(kit.tap("counter-1")).toEqual({ ok: true });
		expect(kit.hand()).toBeNull();
		expect(kit.station("counter-1")).toMatchObject({ phase: "holding", items: [ingredient("carrot", "raw")] });
		expect(kit.tap("counter-1")).toEqual({ ok: true });
		expect(kit.hand()).toEqual(ingredient("carrot", "raw"));
		expect(kit.station("counter-1")).toMatchObject({ phase: "idle", items: [] });
	});

	it("пустая рука и пустой прилавок: нечего брать; занятый прилавок и занятая рука: станция занята", () => {
		const kit = createKitchenKit();
		expect(kit.tap("counter-1")).toEqual({ ok: false, reason: "nothingToTake" });
		kit.tap("crate-carrot");
		kit.tap("counter-1");
		kit.tap("crate-bun");
		expect(kit.tap("counter-1")).toEqual({ ok: false, reason: "stationOccupied" });
		expect(kit.hand()).toEqual(ingredient("bun", "raw"));
	});

	it("неизвестная станция отклоняется без падения", () => {
		const kit = createKitchenKit();
		expect(kit.tap("no-such-station").ok).toBe(false);
	});

	it("getHand отдаёт копию: изменение копии не портит руку", () => {
		const kit = createKitchenKit();
		kit.tap("crate-steak");
		const copy = kit.hand() as IngredientItem;
		copy.state = "burnt";
		expect(kit.hand()).toEqual(ingredient("steak", "raw"));
	});
});

describe("разделочная доска (2.5)", () => {
	it("Резка до конца: нарезанная морковь на доске, прогресс виден", () => {
		const kit = createKitchenKit();
		kit.tap("crate-carrot");
		expect(kit.tap("board-1")).toEqual({ ok: true });
		expect(kit.station("board-1")).toMatchObject({ phase: "holding", progress: 0 });
		kit.advance(0.8, "board-1");
		const halfway = kit.station("board-1");
		expect(halfway.phase).toBe("processing");
		expect(halfway.progress).toBeCloseTo(0.5, 1);
		expect(kit.kitchen.isWorking()).toBe(true);
		kit.advance(0.9, "board-1");
		expect(kit.station("board-1")).toMatchObject({ phase: "holding", progress: 1, items: [ingredient("carrot", "chopped")] });
		expect(kit.eventsOf("cuttingDone")).toHaveLength(1);
		expect(kit.kitchen.isWorking()).toBe(false);
		// Дальше резать нечего: время идёт, ничего не меняется.
		kit.advance(2, "board-1");
		expect(kit.eventsOf("cuttingDone")).toHaveLength(1);
		kit.tap("board-1");
		expect(kit.hand()).toEqual(ingredient("carrot", "chopped"));
	});

	it("Булочка лежит на доске, рабочее действие её не меняет", () => {
		const kit = createKitchenKit();
		kit.tap("crate-bun");
		expect(kit.tap("board-1")).toEqual({ ok: true });
		kit.advance(2, "board-1");
		expect(kit.station("board-1")).toMatchObject({ phase: "holding", progress: 0, items: [ingredient("bun", "raw")] });
		expect(kit.eventsOf("cuttingDone")).toHaveLength(0);
		expect(kit.tap("board-1")).toEqual({ ok: true });
		expect(kit.hand()).toEqual(ingredient("bun", "raw"));
		expect(kit.station("board-1").items).toEqual([]);
	});

	it("Отпускание: прогресс сохраняется, резка продолжается с того же места", () => {
		const kit = createKitchenKit();
		kit.tap("crate-steak");
		kit.tap("board-1");
		kit.advance(0.8, "board-1");
		kit.advance(3, null);
		const paused = kit.station("board-1");
		expect(paused.phase).toBe("holding");
		expect(paused.progress).toBeCloseTo(0.5, 1);
		expect(paused.items).toEqual([ingredient("steak", "raw")]);
		expect(kit.kitchen.isWorking()).toBe(false);
		// Работа над другой станцией доску не режет.
		kit.advance(3, "board-2");
		expect(kit.station("board-1").progress).toBeCloseTo(0.5, 1);
		kit.advance(0.9, "board-1");
		expect(kit.station("board-1").items).toEqual([ingredient("steak", "chopped")]);
	});

	it("если забрать предмет с доски, прогресс сбрасывается", () => {
		const kit = createKitchenKit();
		kit.tap("crate-steak");
		kit.tap("board-1");
		kit.advance(1.5, "board-1");
		kit.tap("board-1");
		expect(kit.hand()).toEqual(ingredient("steak", "raw"));
		kit.tap("board-1");
		expect(kit.station("board-1").progress).toBe(0);
	});

	it("доска хранит тарелку, посторонний ингредиент не вытесняет предмет с доски", () => {
		const kit = createKitchenKit();
		kit.tap("plates-1");
		expect(kit.tap("board-1")).toEqual({ ok: true });
		expect(kit.station("board-1").items).toEqual([{ type: "assembly", plated: true, contents: [], dish: null }]);
		expect(kit.tap("board-1")).toEqual({ ok: true });
		kit.tap("trash-1");
		kit.tap("crate-onion");
		kit.tap("board-1");
		kit.tap("crate-carrot");
		expect(kit.tap("board-1")).toEqual({ ok: false, reason: "stationOccupied" });
		expect(kit.station("board-1").items).toEqual([ingredient("onion", "raw")]);
	});

	it("режутся все четыре нарезаемых предмета", () => {
		const kit = createKitchenKit();
		(["steak", "potato", "carrot", "onion"] as const).forEach((kind) => {
			chopFromCrate(kit, `crate-${kind}`, "board-1");
			expect(kit.hand()).toEqual(ingredient(kind, "chopped"));
			kit.tap("trash-1");
		});
	});
});

describe("сковорода на плите (2.6)", () => {
	it("Автоматическая готовка: котлета сама становится жареной, повар не нужен", () => {
		const kit = createKitchenKit();
		chopFromCrate(kit, "crate-steak", "board-1");
		expect(kit.tap("pan-1")).toEqual({ ok: true });
		expect(kit.hand()).toBeNull();
		expect(kit.eventsOf("cookingStarted")[0]).toMatchObject({ stationId: "pan-1", recipe: "patty" });
		expect(kit.station("pan-1")).toMatchObject({ phase: "processing", items: [ingredient("patty", "raw")], progress: 0 });
		kit.advance(2.4);
		const halfway = kit.station("pan-1");
		expect(halfway.phase).toBe("processing");
		expect(halfway.progress).toBeCloseTo(0.5, 1);
		kit.advance(2.5);
		expect(kit.station("pan-1")).toMatchObject({ phase: "ready", items: [ingredient("patty", "cooked")], progress: 1 });
		expect(kit.eventsOf("cookingDone")).toHaveLength(1);
	});

	it("Забыли котлету: через время подгорания она заменяется сгоревшей", () => {
		const kit = createKitchenKit();
		startPatty(kit, "pan-1");
		kit.advance(3);
		expect(kit.station("pan-1").burnProgress).toBeCloseTo(0.5, 1);
		kit.advance(3.1);
		expect(kit.station("pan-1")).toMatchObject({ phase: "burnt", items: [ingredient("patty", "burnt")], burnProgress: 1 });
		expect(kit.eventsOf("itemBurnt")).toHaveLength(1);
		// Сгоревшее не горит снова и не готовится дальше.
		kit.advance(20);
		expect(kit.eventsOf("itemBurnt")).toHaveLength(1);
	});

	it("Забрать готовое на тарелку: котлета оказывается на тарелке, сковорода пуста", () => {
		const kit = createKitchenKit();
		startPatty(kit, "pan-1");
		kit.tap("plates-1");
		expect(kit.tap("pan-1")).toEqual({ ok: true });
		expect(kit.hand()).toEqual({ type: "assembly", plated: true, contents: [ingredient("patty", "cooked")], dish: null });
		expect(kit.station("pan-1")).toMatchObject({ phase: "idle", items: [] });
	});

	it("Сгоревшее на тарелку: тарелка сгоревшее не принимает, пустой рукой его берут и несут в урну", () => {
		const kit = createKitchenKit();
		startPatty(kit, "pan-1");
		kit.advance(6.1);
		kit.tap("plates-1");
		expect(kit.tap("pan-1")).toEqual({ ok: false, reason: "burntItem" });
		expect(kit.station("pan-1").phase).toBe("burnt");
		kit.tap("trash-1");
		// Пустой рукой сгоревшее берётся целиком, затем на прилавке тарелка его не принимает.
		expect(kit.tap("pan-1")).toEqual({ ok: true });
		expect(kit.hand()).toEqual(ingredient("patty", "burnt"));
		kit.tap("trash-1");
		expect(kit.hand()).toBeNull();
		expect(kit.station("pan-1").phase).toBe("idle");
	});

	it("сгоревший предмет не кладётся на тарелку на прилавке", () => {
		const kit = createKitchenKit();
		startPatty(kit, "pan-1");
		kit.advance(6.1);
		kit.tap("plates-1");
		kit.tap("counter-1");
		kit.tap("pan-1");
		expect(kit.hand()).toEqual(ingredient("patty", "burnt"));
		expect(kit.tap("counter-1")).toEqual({ ok: false, reason: "stationOccupied" });
		expect(kit.hand()).toEqual(ingredient("patty", "burnt"));
		expect(kit.station("counter-1").items).toEqual([{ type: "assembly", plated: true, contents: [], dish: null }]);
	});

	it("сырую котлету, занятую и неподходящую сковороду не трогаем: причины отказа понятны", () => {
		const kit = createKitchenKit();
		chopFromCrate(kit, "crate-steak", "board-1");
		kit.tap("pan-1");
		// Идёт готовка: нечего брать пустой рукой, положить второй предмет нельзя.
		expect(kit.tap("pan-1")).toEqual({ ok: false, reason: "nothingToTake" });
		kit.tap("crate-bun");
		expect(kit.tap("pan-1")).toEqual({ ok: false, reason: "stationOccupied" });
		expect(kit.tap("pan-2")).toEqual({ ok: false, reason: "itemNotAccepted" });
	});

	it("овощная котлета: нарезанные картофель и морковь по очереди, полный набор запускает готовку", () => {
		const kit = createKitchenKit();
		chopFromCrate(kit, "crate-potato", "board-1");
		expect(kit.tap("pan-1")).toEqual({ ok: true });
		expect(kit.station("pan-1")).toMatchObject({ phase: "holding", items: [ingredient("potato", "chopped")] });
		expect(kit.eventsOf("cookingStarted")).toHaveLength(0);
		chopFromCrate(kit, "crate-carrot", "board-2");
		expect(kit.tap("pan-1")).toEqual({ ok: true });
		expect(kit.station("pan-1")).toMatchObject({ phase: "processing", items: [ingredient("veggiePatty", "raw")] });
		expect(kit.eventsOf("cookingStarted")[0]).toMatchObject({ recipe: "veggiePatty" });
		kit.advance(6.1);
		expect(kit.station("pan-1").items).toEqual([ingredient("veggiePatty", "cooked")]);
	});

	it("неполный набор на сковороде можно забрать обратно, дубликат не принимается", () => {
		const kit = createKitchenKit();
		chopFromCrate(kit, "crate-potato", "board-1");
		kit.tap("pan-1");
		chopFromCrate(kit, "crate-potato", "board-2");
		expect(kit.tap("pan-1")).toEqual({ ok: false, reason: "itemNotAccepted" });
		kit.tap("trash-1");
		expect(kit.tap("pan-1")).toEqual({ ok: true });
		expect(kit.hand()).toEqual(ingredient("potato", "chopped"));
		expect(kit.station("pan-1").phase).toBe("idle");
	});
});

function addWater(kit: ReturnType<typeof createKitchenKit>, destination = "stove-1"): void {
	expect(kit.tap("stove-1")).toEqual({ ok: true });
	expect(kit.tap("tap-1")).toEqual({ ok: true });
	expect(kit.tap(destination)).toEqual({ ok: true });
}

function fillPot(kit: ReturnType<typeof createKitchenKit>, stationId = "stove-1"): void {
	addWater(kit, stationId);
	for (const crateId of ["crate-carrot", "crate-potato", "crate-onion"]) {
		chopFromCrate(kit, crateId, "board-1");
		expect(kit.tap(stationId)).toEqual({ ok: true });
	}
}

describe("кастрюля для рагу и духовка (2.7)", () => {
	it("Вода и три нарезанных овоща запускают варку на плите", () => {
		const kit = createKitchenKit();
		addWater(kit);
		chopFromCrate(kit, "crate-carrot", "board-1");
		kit.tap("stove-1");
		chopFromCrate(kit, "crate-potato", "board-1");
		kit.tap("stove-1");
		kit.advance(1);
		expect(kit.station("stove-1")).toMatchObject({
			phase: "holding",
			isHeating: false,
			items: [{ type: "pot", hasWater: true, contents: [ingredient("carrot", "chopped"), ingredient("potato", "chopped")] }],
		});
		expect(kit.eventsOf("cookingStarted")).toHaveLength(0);
		chopFromCrate(kit, "crate-onion", "board-1");
		expect(kit.tap("stove-1")).toEqual({ ok: true });
		kit.advance(4);
		expect(kit.station("stove-1")).toMatchObject({ phase: "processing", isHeating: true });
		expect(kit.station("stove-1").progress).toBeCloseTo(0.5, 1);
		expect(kit.eventsOf("cookingStarted")[0]).toMatchObject({ stationId: "stove-1", recipe: "stew" });
		kit.advance(4.1);
		expect(kit.station("stove-1")).toMatchObject({ phase: "ready", isHeating: false, portions: 2 });
	});

	it("Кастрюле нужна вода, сырая морковь и повтор овоща отклоняются", () => {
		const kit = createKitchenKit();
		chopFromCrate(kit, "crate-carrot", "board-1");
		expect(kit.tap("stove-1")).toEqual({ ok: false, reason: "needsWater" });
		expect(kit.hand()).toEqual(ingredient("carrot", "chopped"));
		kit.tap("trash-1");
		addWater(kit);
		kit.tap("crate-carrot");
		expect(kit.tap("stove-1")).toEqual({ ok: false, reason: "itemNotAccepted" });
		expect(kit.hand()).toEqual(ingredient("carrot", "raw"));
		kit.tap("board-1");
		kit.advance(2.1, "board-1");
		kit.tap("board-1");
		expect(kit.tap("stove-1")).toEqual({ ok: true });
		chopFromCrate(kit, "crate-carrot", "board-1");
		expect(kit.tap("stove-1")).toEqual({ ok: false, reason: "itemNotAccepted" });
		expect(kit.station("stove-1").items).toMatchObject([{ type: "pot", contents: [ingredient("carrot", "chopped")] }]);
	});

	it("порции рагу берутся только на тарелку, по одной, потом кастрюля пуста", () => {
		const kit = createKitchenKit();
		fillPot(kit);
		kit.advance(8.1);
		// Пустой рукой повар забирает всю кастрюлю.
		expect(kit.tap("stove-1")).toEqual({ ok: true });
		expect(kit.hand()).toMatchObject({ type: "pot", portions: 2 });
		expect(kit.tap("counter-pot")).toEqual({ ok: true });
		kit.tap("plates-1");
		expect(kit.tap("counter-pot")).toEqual({ ok: true });
		expect(kit.hand()).toEqual({ type: "assembly", plated: true, contents: [ingredient("stew", "cooked")], dish: "stew" });
		expect(kit.eventsOf("dishAssembled").map((event) => event.dish)).toEqual(["stew"]);
		expect(kit.station("counter-pot").items).toMatchObject([{ type: "pot", portions: 1 }]);
		kit.tap("counter-1");
		kit.tap("plates-1");
		expect(kit.tap("counter-pot")).toEqual({ ok: true });
		expect(kit.hand()).toMatchObject({ type: "assembly", plated: true, dish: "stew" });
		expect(kit.station("counter-pot").items).toEqual([{ type: "pot", hasWater: false, contents: [], cookProgressSec: 0, portions: 0 }]);
	});

	it("кастрюля варит только на плите, готовое рагу не подгорает", () => {
		const kit = createKitchenKit();
		fillPot(kit, "counter-pot");
		kit.advance(9);
		expect(kit.eventsOf("cookingStarted")).toHaveLength(0);
		expect(kit.tap("counter-pot")).toEqual({ ok: true });
		expect(kit.tap("stove-1")).toEqual({ ok: true });
		kit.advance(8.1);
		kit.advance(20);
		expect(kit.station("stove-1")).toMatchObject({ phase: "ready", isHeating: false, portions: 2 });
		expect(kit.eventsOf("itemBurnt")).toHaveLength(0);
		kit.tap("plates-1");
		expect(kit.tap("stove-1")).toEqual({ ok: true });
		expect(kit.hand()).toMatchObject({ type: "assembly", plated: true, dish: "stew" });
	});

	it("Ветчина в духовке: по окончании времени в духовке готовая ветчина, потом сгорает", () => {
		const kit = createKitchenKit();
		kit.tap("crate-ham");
		expect(kit.tap("oven-1")).toEqual({ ok: true });
		expect(kit.eventsOf("cookingStarted")[0]).toMatchObject({ stationId: "oven-1", recipe: "ham" });
		expect(kit.station("oven-1")).toMatchObject({ phase: "processing", items: [ingredient("ham", "raw")] });
		kit.advance(6.3);
		expect(kit.station("oven-1").phase).toBe("processing");
		kit.advance(0.3);
		expect(kit.station("oven-1")).toMatchObject({ phase: "ready", items: [ingredient("ham", "cooked")] });
		kit.advance(8.1);
		expect(kit.station("oven-1")).toMatchObject({ phase: "burnt", items: [ingredient("ham", "burnt")] });
	});

	it("готовая ветчина берётся на тарелку и сразу даёт блюдо окорок", () => {
		const kit = createKitchenKit();
		kit.tap("crate-ham");
		kit.tap("oven-1");
		kit.advance(6.5);
		kit.tap("plates-1");
		expect(kit.tap("oven-1")).toEqual({ ok: true });
		expect(kit.hand()).toMatchObject({ type: "assembly", plated: true, dish: "ham" });
	});

	it("сырую ветчину можно положить в духовку, булочку нельзя", () => {
		const kit = createKitchenKit();
		kit.tap("crate-bun");
		expect(kit.tap("oven-1")).toEqual({ ok: false, reason: "itemNotAccepted" });
	});

	it("время готовки берётся из параметров уровня", () => {
		const kit = createKitchenKit({ kitchen: { cooking: { ham: { cookSec: 2, burnSec: 3 } } } });
		kit.tap("crate-ham");
		kit.tap("oven-1");
		kit.advance(1.5);
		expect(kit.station("oven-1").phase).toBe("processing");
		kit.advance(0.2);
		expect(kit.station("oven-1").phase).toBe("ready");
		kit.advance(3.1);
		expect(kit.station("oven-1").phase).toBe("burnt");
	});
});

describe("стопка тарелок, сборка блюда и урна (2.8)", () => {
	it("Взять тарелку: в руке пустая тарелка", () => {
		const kit = createKitchenKit();
		expect(kit.tap("plates-1")).toEqual({ ok: true });
		expect(kit.hand()).toEqual({ type: "assembly", plated: true, contents: [], dish: null });
		// Стопка бесконечна.
		kit.tap("trash-1");
		expect(kit.tap("plates-1")).toEqual({ ok: true });
	});

	it("Вернуть пустую тарелку: тарелка возвращается в стопку", () => {
		const kit = createKitchenKit();
		kit.tap("plates-1");
		expect(kit.tap("plates-1")).toEqual({ ok: true });
		expect(kit.hand()).toBeNull();
	});

	it("Повторное действие у стопки сохраняет тарелку с содержимым", () => {
		const kit = createKitchenKit();
		kit.tap("crate-bun");
		kit.tap("counter-1");
		kit.tap("plates-1");
		kit.tap("counter-1");
		const plate = kit.hand();
		expect(plate).toMatchObject({ type: "assembly", plated: true, contents: [ingredient("bun", "raw")] });
		expect(kit.tap("plates-1")).toEqual({ ok: true });
		expect(kit.hand()).toEqual(plate);
	});

	it("стопка подаёт тарелку для подходящего ингредиента и отклоняет сырой стейк", () => {
		const kit = createKitchenKit();
		kit.tap("crate-steak");
		expect(kit.tap("plates-1")).toEqual({ ok: false, reason: "plateNotAccepted" });
		expect(kit.hand()).toEqual(ingredient("steak", "raw"));
		kit.tap("trash-1");
		kit.tap("crate-bun");
		expect(kit.tap("plates-1")).toEqual({ ok: true });
		expect(kit.hand()).toEqual({ type: "assembly", plated: true, contents: [ingredient("bun", "raw")], dish: null });
	});

	it("Сборка бургера: булочка и жареная котлета превращают тарелку в бургер", () => {
		const kit = createKitchenKit();
		kit.tap("crate-bun");
		kit.tap("counter-1");
		startPatty(kit, "pan-1");
		kit.tap("plates-1");
		kit.tap("counter-1");
		expect((kit.hand() as AssemblyItem).dish).toBeNull();
		kit.tap("pan-1");
		const plate = kit.hand() as AssemblyItem;
		expect(plate.dish).toBe("burger");
		expect(plate.contents).toHaveLength(2);
		expect(kit.eventsOf("dishAssembled").map((event) => event.dish)).toEqual(["burger"]);
	});

	it("сборка другим порядком: котлета на тарелке на прилавке, булочка из руки", () => {
		const kit = createKitchenKit();
		startPatty(kit, "pan-1");
		kit.tap("plates-1");
		kit.tap("pan-1");
		kit.tap("counter-2");
		kit.tap("crate-bun");
		expect(kit.tap("counter-2")).toEqual({ ok: true });
		expect(kit.hand()).toBeNull();
		expect(kit.station("counter-2").items[0]).toMatchObject({ type: "assembly", plated: true, dish: "burger" });
		kit.tap("counter-2");
		expect((kit.hand() as AssemblyItem).dish).toBe("burger");
	});

	it("овощной бургер собирается из булочки и овощной котлеты", () => {
		const kit = createKitchenKit();
		kit.tap("crate-bun");
		kit.tap("counter-1");
		chopFromCrate(kit, "crate-potato", "board-1");
		kit.tap("pan-1");
		chopFromCrate(kit, "crate-carrot", "board-2");
		kit.tap("pan-1");
		kit.advance(6.1);
		kit.tap("plates-1");
		kit.tap("counter-1");
		kit.tap("pan-1");
		expect((kit.hand() as AssemblyItem).dish).toBe("veggieBurger");
	});

	it("Лишний ингредиент: к тарелке с булочкой нарезанный лук не добавляется", () => {
		const kit = createKitchenKit();
		kit.tap("crate-bun");
		kit.tap("counter-1");
		kit.tap("plates-1");
		kit.tap("counter-1");
		kit.tap("counter-2");
		chopFromCrate(kit, "crate-onion", "board-1");
		expect(kit.tap("counter-2")).toEqual({ ok: false, reason: "stationOccupied" });
		expect(kit.hand()).toEqual(ingredient("onion", "chopped"));
		expect(kit.station("counter-2").items[0]).toMatchObject({ type: "assembly", plated: true, contents: [ingredient("bun", "raw")] });
	});

	it("готовый бургер не принимает ещё одну булочку", () => {
		const kit = createKitchenKit();
		assembleBurger(kit);
		const burger = kit.hand();
		kit.tap("counter-2");
		kit.tap("crate-bun");
		expect(kit.tap("counter-2")).toEqual({ ok: false, reason: "stationOccupied" });
		expect(kit.hand()).toEqual(ingredient("bun", "raw"));
		expect(kit.station("counter-2").items).toEqual([burger]);
	});

	it("тарелка принимает только ингредиенты рецептов меню уровня", () => {
		const kit = createKitchenKit({ menu: ["burger", "ham"] });
		chopFromCrate(kit, "crate-potato", "board-1");
		kit.tap("pan-1");
		chopFromCrate(kit, "crate-carrot", "board-2");
		kit.tap("pan-1");
		kit.advance(6.1);
		kit.tap("plates-1");
		// Овощной бургер вне меню: овощная котлета на тарелку не кладётся.
		expect(kit.tap("pan-1")).toEqual({ ok: false, reason: "itemNotAccepted" });
		expect(kit.station("pan-1").items).toEqual([ingredient("veggiePatty", "cooked")]);
		expect(kit.hand()).toEqual({ type: "assembly", plated: true, contents: [], dish: null });
	});

	it("Выбросить сгоревшее: рука пуста", () => {
		const kit = createKitchenKit();
		startPatty(kit, "pan-1");
		kit.advance(6.1);
		kit.tap("pan-1");
		expect(kit.tap("trash-1")).toEqual({ ok: true });
		expect(kit.hand()).toBeNull();
		expect(kit.eventsOf("itemTrashed")[0].item).toEqual(ingredient("patty", "burnt"));
	});

	it("Выбросить тарелку: рука пуста и из стопки можно взять новую тарелку", () => {
		const kit = createKitchenKit();
		assembleBurger(kit);
		expect(kit.tap("trash-1")).toEqual({ ok: true });
		expect(kit.hand()).toBeNull();
		expect(kit.tap("plates-1")).toEqual({ ok: true });
		expect(kit.hand()).toEqual({ type: "assembly", plated: true, contents: [], dish: null });
	});

	it("урна с пустой рукой: нечего положить", () => {
		const kit = createKitchenKit();
		expect(kit.tap("trash-1")).toEqual({ ok: false, reason: "handEmpty" });
	});
});

describe("окно выдачи (2.9)", () => {
	it("Подходящее блюдо: бургер принимается, заказ уходит в доставку", () => {
		const kit = createKitchenKit();
		const order = kit.orders.addOrder("burger");
		assembleBurger(kit);
		expect(kit.tap("window-1")).toEqual({ ok: true });
		expect(kit.hand()).toBeNull();
		expect(order.status).toBe("delivering");
		const dishes = kit.kitchen.window.getDishes();
		expect(dishes).toHaveLength(1);
		expect(dishes[0]).toMatchObject({ id: "wd-1", dish: "burger", orderId: order.id, slotIndex: 0 });
		expect(kit.kitchen.getWindowDishSnapshots()).toEqual([{ id: "wd-1", dish: "burger", orderId: order.id, slotIndex: 0 }]);
		expect(kit.eventsOf("dishAccepted")[0]).toMatchObject({ windowDishId: "wd-1", orderId: order.id, dish: "burger" });
	});

	it("Недоделанная тарелка: тарелка с одной булочкой остаётся в руке", () => {
		const kit = createKitchenKit();
		kit.orders.addOrder("burger");
		kit.tap("crate-bun");
		kit.tap("counter-1");
		kit.tap("plates-1");
		kit.tap("counter-1");
		expect(kit.tap("window-1")).toEqual({ ok: false, reason: "dishNotReady" });
		expect(kit.hand()).toMatchObject({ type: "assembly", plated: true, contents: [ingredient("bun", "raw")] });
		expect(kit.kitchen.window.getDishes()).toHaveLength(0);
		expect(kit.eventsOf("actionRejected").at(-1)).toMatchObject({ stationId: "window-1", reason: "dishNotReady" });
	});

	it("окно отклоняет пустую руку, ингредиент и готовое блюдо без тарелки", () => {
		const kit = createKitchenKit();
		expect(kit.tap("window-1")).toEqual({ ok: false, reason: "handEmpty" });
		kit.tap("crate-bun");
		expect(kit.tap("window-1")).toEqual({ ok: false, reason: "dishNotReady" });
		kit.tap("trash-1");
		const order = kit.orders.addOrder("ham");
		kit.tap("crate-ham");
		kit.tap("oven-1");
		kit.advance(6.5);
		expect(kit.tap("oven-1")).toEqual({ ok: true });
		expect(kit.tap("window-1")).toEqual({ ok: false, reason: "dishNotPlated" });
		expect(kit.hand()).toEqual(ingredient("ham", "cooked"));
		expect(order.status).toBe("waiting");
	});

	it("Нет такого заказа: блюдо остаётся в руке, заказ не затронут", () => {
		const kit = createKitchenKit();
		const hamOrder = kit.orders.addOrder("ham");
		assembleBurger(kit);
		expect(kit.tap("window-1")).toEqual({ ok: false, reason: "noOpenOrder" });
		expect((kit.hand() as AssemblyItem).dish).toBe("burger");
		expect(hamOrder.status).toBe("waiting");
		expect(kit.kitchen.window.getDishes()).toHaveLength(0);
	});

	it("Два одинаковых заказа: привязывается заказ, появившийся раньше", () => {
		const kit = createKitchenKit();
		const first = kit.orders.addOrder("burger");
		kit.clock.nowSec += 1;
		const second = kit.orders.addOrder("burger");
		assembleBurger(kit);
		kit.tap("window-1");
		expect(first.status).toBe("delivering");
		expect(second.status).toBe("waiting");
		expect(kit.kitchen.window.getDishes()[0].orderId).toBe(first.id);
		// Второй бургер уходит ко второму заказу.
		const accepted = kit.kitchen.window.tryAccept({ type: "assembly", plated: true, contents: [ingredient("bun", "raw"), ingredient("patty", "cooked")], dish: "burger" });
		expect(accepted.ok).toBe(true);
		expect(second.status).toBe("delivering");
	});

	it("слоты заполняются по порядку, полное окно отказывает, освободившийся слот занимается снова", () => {
		const kit = createKitchenKit();
		const ham: AssemblyItem = { type: "assembly", plated: true, contents: [ingredient("ham", "cooked")], dish: "ham" };
		for (let index = 0; index < 4; index += 1) {
			kit.orders.addOrder("ham");
		}
		const accepted = [1, 2, 3].map(() => kit.kitchen.window.tryAccept(ham));
		expect(accepted.map((result) => (result.ok ? result.windowDish.slotIndex : -1))).toEqual([0, 1, 2]);
		expect(kit.kitchen.window.tryAccept(ham)).toEqual({ ok: false, reason: "windowFull" });
		// Официант забирает среднее блюдо: свободен слот 1.
		expect(kit.kitchen.window.takeDish("wd-2")).toMatchObject({ id: "wd-2", slotIndex: 1 });
		expect(kit.kitchen.window.takeDish("wd-2")).toBeNull();
		const again = kit.kitchen.window.tryAccept(ham);
		expect(again.ok && again.windowDish.slotIndex).toBe(1);
		// Порядок выдачи официантам: по порядку приёма.
		expect(kit.kitchen.window.getDishes().map((dish) => dish.id)).toEqual(["wd-1", "wd-3", "wd-4"]);
	});

	it("tryAccept с неготовой тарелкой возвращает dishNotReady, без заказов noOpenOrder", () => {
		const kit = createKitchenKit();
		expect(kit.kitchen.window.tryAccept({ type: "assembly", plated: true, contents: [], dish: null })).toEqual({ ok: false, reason: "dishNotReady" });
		expect(kit.kitchen.window.tryAccept({ type: "assembly", plated: true, contents: [ingredient("ham", "cooked")], dish: "ham" })).toEqual({ ok: false, reason: "noOpenOrder" });
	});
});

describe("полные цепочки пяти блюд на кухне", () => {
	it("каждое блюдо готовится от ящиков до окна и привязывается к заказу", () => {
		const menu = ["burger", "ham", "veggieBurger", "steak", "stew"] as const;
		const kit = createKitchenKit({ menu: [...menu] });
		const orders = menu.map((dish) => kit.orders.addOrder(dish));

		// Бургер.
		assembleBurger(kit);
		expect(kit.tap("window-1").ok).toBe(true);

		// Окорок.
		kit.tap("crate-ham");
		kit.tap("oven-1");
		kit.advance(6.5);
		kit.tap("plates-1");
		kit.tap("oven-1");
		expect(kit.tap("window-1").ok).toBe(true);

		// Овощной бургер.
		kit.tap("crate-bun");
		kit.tap("counter-1");
		chopFromCrate(kit, "crate-potato", "board-1");
		kit.tap("pan-1");
		chopFromCrate(kit, "crate-carrot", "board-2");
		kit.tap("pan-1");
		kit.advance(6.1);
		kit.tap("plates-1");
		kit.tap("counter-1");
		kit.tap("pan-1");
		expect(kit.tap("window-1").ok).toBe(true);

		// Стейк. Окно вмещает три блюда: официант забирает бургер, освобождая слот.
		expect(kit.kitchen.window.takeDish("wd-1")).not.toBeNull();
		kit.tap("crate-steak");
		kit.tap("pan-1");
		kit.advance(4.8);
		kit.tap("plates-1");
		expect(kit.tap("pan-1")).toEqual({ ok: true });
		expect(kit.tap("window-1").ok).toBe(true);

		// Рагу.
		expect(kit.kitchen.window.takeDish("wd-2")).not.toBeNull();
		fillPot(kit);
		kit.advance(8.1);
		kit.tap("plates-1");
		expect(kit.tap("stove-1")).toEqual({ ok: true });
		expect(kit.tap("window-1").ok).toBe(true);

		expect(orders.map((order) => order.status)).toEqual(menu.map(() => "delivering"));
		expect(kit.eventsOf("dishAssembled").map((event) => event.dish)).toEqual(menu);
		expect(kit.eventsOf("dishAccepted").map((event) => event.orderId)).toEqual(orders.map((order) => order.id));
	});
});
