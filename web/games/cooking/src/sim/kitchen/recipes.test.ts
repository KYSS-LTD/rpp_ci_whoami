// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DISH_IDS, ITEM_CATALOG, type DishId, type ItemSpec } from "../../contracts";
import {
	addIngredientToPlate,
	checkPlateAccepts,
	cloneItem,
	cookTransitions,
	createEmptyPlate,
	createIngredientItem,
	crateIngredientKinds,
	cutTransitions,
	dishRecipes,
	findCookTransitions,
	findCutTransition,
	findDishForContents,
	isCatalogSpec,
	isSameMultiset,
	isSameSpec,
	isSubMultiset,
} from "./recipes";

// Один шаг цепочки: чем и на какой станции получен предмет.
interface ChainStep {
	producer: "crate" | "cuttingBoard" | "stove" | "pot" | "oven";
	output: ItemSpec;
}

// Раскладывает предмет на цепочку действий до сырья из ящиков, читая только таблицы данных. null, если цепочки нет.
function expandChain(target: ItemSpec): ChainStep[] | null {
	if (target.state === "raw" && crateIngredientKinds.includes(target.kind)) {
		return [{ producer: "crate", output: target }];
	}
	const cut = cutTransitions.find((transition) => isSameSpec(transition.output, target));
	if (cut) {
		const before = expandChain(cut.input);
		return before ? [...before, { producer: "cuttingBoard", output: target }] : null;
	}
	const cook = cookTransitions.find((transition) => isSameSpec(transition.cooked, target));
	if (cook) {
		const steps: ChainStep[] = [];
		for (const input of cook.inputs) {
			const before = expandChain(input);
			if (!before) {
				return null;
			}
			steps.push(...before);
		}
		steps.push({ producer: cook.stationKind, output: target });
		return steps;
	}
	return null;
}

describe("таблицы рецептов и переходов", () => {
	it("для каждого из четырёх блюд цепочка переходов приводит от ящиков к готовому блюду", () => {
		DISH_IDS.forEach((dish) => {
			const recipe = dishRecipes[dish];
			expect(recipe.dish).toBe(dish);
			expect(recipe.ingredients.length).toBeGreaterThan(0);
			const chains = recipe.ingredients.map((ingredient) => expandChain(ingredient));
			chains.forEach((chain, index) => {
				expect(chain, `${dish}: нет цепочки для ${recipe.ingredients[index].kind}/${recipe.ingredients[index].state}`).not.toBeNull();
				// Все промежуточные предметы цепочки допустимы в игре.
				chain?.forEach((step) => expect(isCatalogSpec(step.output), `${step.output.kind}/${step.output.state}`).toBe(true));
			});
		});
	});

	it("цепочки блюд идут через нужные станции", () => {
		const producersOf = (dish: DishId): Set<string> => {
			const producers = new Set<string>();
			dishRecipes[dish].ingredients.forEach((ingredient) => expandChain(ingredient)?.forEach((step) => producers.add(step.producer)));
			return producers;
		};
		expect([...producersOf("burger")].sort()).toEqual(["crate", "cuttingBoard", "stove"]);
		expect([...producersOf("veggieBurger")].sort()).toEqual(["crate", "cuttingBoard", "stove"]);
		expect([...producersOf("ham")].sort()).toEqual(["crate", "oven"]);
		expect([...producersOf("stew")].sort()).toEqual(["crate", "cuttingBoard", "pot"]);
	});

	it("все предметы таблиц входят в ITEM_CATALOG, а каждая пара каталога где-то используется", () => {
		const used: ItemSpec[] = [];
		cutTransitions.forEach((transition) => used.push(transition.input, transition.output));
		cookTransitions.forEach((transition) => {
			used.push(...transition.inputs, transition.cooked, transition.burnt);
			if (transition.cooking) {
				used.push(transition.cooking);
			}
		});
		Object.values(dishRecipes).forEach((recipe) => used.push(...recipe.ingredients));
		crateIngredientKinds.forEach((kind) => used.push({ kind, state: "raw" }));
		used.forEach((spec) => expect(isCatalogSpec(spec), `${spec.kind}/${spec.state}`).toBe(true));
		ITEM_CATALOG.forEach((entry) => expect(used.some((spec) => isSameSpec(spec, entry)), `${entry.kind}/${entry.state}`).toBe(true));
	});

	it("сгоревшее не входит ни в один рецепт", () => {
		Object.values(dishRecipes).forEach((recipe) => recipe.ingredients.forEach((ingredient) => expect(ingredient.state).not.toBe("burnt")));
		cookTransitions.forEach((transition) => {
			expect(transition.burnt.state).toBe("burnt");
			expect(transition.cooked.state).toBe("cooked");
		});
	});

	it("переходы станций разложены по видам: плита жарит без сковороды, духовка запекает", () => {
		expect(findCookTransitions("stove").map((transition) => transition.id)).toEqual(["patty", "veggiePatty", "friedSteak"]);
		expect(findCookTransitions("oven").map((transition) => transition.id)).toEqual(["ham"]);
		expect(findCookTransitions("counter")).toEqual([]);
	});

	it("режутся стейк и три овоща, булочка и ветчина не режутся", () => {
		expect(findCutTransition(createIngredientItem("carrot", "raw"))?.output).toEqual({ kind: "carrot", state: "chopped" });
		expect(findCutTransition(createIngredientItem("bun", "raw"))).toBeUndefined();
		expect(findCutTransition(createIngredientItem("ham", "raw"))).toBeUndefined();
		expect(findCutTransition(createIngredientItem("carrot", "chopped"))).toBeUndefined();
		expect(findCutTransition(createIngredientItem("steak", "burnt"))).toBeUndefined();
	});
});

describe("мультимножества и тарелка", () => {
	it("isSubMultiset и isSameMultiset учитывают кратность и не зависят от порядка", () => {
		const carrot: ItemSpec = { kind: "carrot", state: "chopped" };
		const potato: ItemSpec = { kind: "potato", state: "chopped" };
		expect(isSubMultiset([carrot], [carrot, potato])).toBe(true);
		expect(isSubMultiset([carrot, carrot], [carrot, potato])).toBe(false);
		expect(isSameMultiset([carrot, potato], [potato, carrot])).toBe(true);
		expect(isSameMultiset([carrot], [carrot, potato])).toBe(false);
	});

	it("тарелка превращается в блюдо, как только содержимое совпало с рецептом меню", () => {
		const menu: DishId[] = ["burger", "ham"];
		const withBun = addIngredientToPlate(menu, createEmptyPlate(), createIngredientItem("bun", "raw"));
		expect(withBun.dish).toBeNull();
		const burger = addIngredientToPlate(menu, withBun, createIngredientItem("patty", "cooked"));
		expect(burger.dish).toBe("burger");
		expect(burger.contents).toHaveLength(2);
		// Исходная тарелка не изменилась: предметы неизменяемы.
		expect(withBun.contents).toHaveLength(1);
		expect(findDishForContents(menu, [createIngredientItem("ham", "cooked")])).toBe("ham");
	});

	it("тарелка принимает только ингредиенты, подходящие хотя бы к одному рецепту меню", () => {
		const menu: DishId[] = ["burger", "ham"];
		const plate = createEmptyPlate();
		expect(checkPlateAccepts(menu, plate, createIngredientItem("bun", "raw"))).toBeNull();
		expect(checkPlateAccepts(menu, plate, createIngredientItem("ham", "cooked"))).toBeNull();
		// Овощной бургер вне меню: овощная котлета не принимается.
		expect(checkPlateAccepts(menu, plate, createIngredientItem("veggiePatty", "cooked"))).toBe("plateNotAccepted");
		// Сырая и нарезанная еда на тарелку не кладётся.
		expect(checkPlateAccepts(menu, plate, createIngredientItem("steak", "raw"))).toBe("plateNotAccepted");
		expect(checkPlateAccepts(menu, plate, createIngredientItem("onion", "chopped"))).toBe("plateNotAccepted");
		// Сгоревшее не годится никуда.
		expect(checkPlateAccepts(menu, plate, createIngredientItem("patty", "burnt"))).toBe("burntItem");
	});

	it("готовое блюдо и тарелка с булочкой не принимают лишнего", () => {
		const menu: DishId[] = ["burger", "veggieBurger"];
		const burger = addIngredientToPlate(menu, addIngredientToPlate(menu, createEmptyPlate(), createIngredientItem("bun", "raw")), createIngredientItem("patty", "cooked"));
		expect(checkPlateAccepts(menu, burger, createIngredientItem("bun", "raw"))).toBe("plateNotAccepted");
		expect(checkPlateAccepts(menu, burger, createIngredientItem("veggiePatty", "cooked"))).toBe("plateNotAccepted");
		const withBun = addIngredientToPlate(menu, createEmptyPlate(), createIngredientItem("bun", "raw"));
		expect(checkPlateAccepts(menu, withBun, createIngredientItem("onion", "chopped"))).toBe("plateNotAccepted");
		expect(checkPlateAccepts(menu, withBun, createIngredientItem("veggiePatty", "cooked"))).toBeNull();
	});

	it("cloneItem делает глубокую копию тарелки", () => {
		const plate = addIngredientToPlate(["burger"], createEmptyPlate(), createIngredientItem("bun", "raw"));
		const copy = cloneItem(plate);
		expect(copy).toEqual(plate);
		copy.contents[0].state = "burnt";
		expect(plate.contents[0].state).toBe("raw");
	});
});
