// Предметы, рецепты блюд и таблицы переходов станций как данные (задача 2.3, design D6) и чистые помощники над ними.
// Таблицы описывают, что можно нарезать, приготовить и собрать на тарелке; логика кухни (index.ts) только читает их.
// Цена, чаевые и трудоёмкость блюд, время резки и готовки лежат в LevelParams (config/levels/defaults.ts), здесь их нет.
// Предметы в кухне неизменяемы: любое изменение создаёт новый объект, поэтому одна ссылка может безопасно лежать в нескольких местах.
// Владелец: SONNET-1.
import {
	ITEM_CATALOG,
	type ActionRejectReason,
	type AssemblyItem,
	type CookTransition,
	type CutTransition,
	type DishId,
	type DishRecipe,
	type IngredientItem,
	type IngredientKind,
	type Item,
	type ItemSpec,
	type ItemState,
	type PotItem,
	type StationKind,
} from "../../contracts";

// ============================================================================
// Таблицы данных
// ============================================================================

// Рецепты блюд: набор ингредиентов на тарелке (мультимножество, порядок не важен).
// ham (окорок): готовая ветчина; steak: целый жареный стейк (без резки); burger: стейк с булочкой;
// veggieBurger: булочка и жареная овощная котлета; stew: одна порция рагу из кастрюли.
export const dishRecipes: Record<DishId, DishRecipe> = {
	ham: {
		dish: "ham",
		ingredients: [{ kind: "ham", state: "cooked" }],
	},
	steak: {
		dish: "steak",
		ingredients: [{ kind: "friedSteak", state: "cooked" }],
	},
	burger: {
		dish: "burger",
		ingredients: [
			{ kind: "bun", state: "raw" },
			{ kind: "patty", state: "cooked" },
		],
	},
	veggieBurger: {
		dish: "veggieBurger",
		ingredients: [
			{ kind: "bun", state: "raw" },
			{ kind: "veggiePatty", state: "cooked" },
		],
	},
	stew: {
		dish: "stew",
		ingredients: [{ kind: "stew", state: "cooked" }],
	},
};

// Резка на доске: сырой овощ или стейк становится нарезанным после удержания рабочего действия (KitchenParams.cutSec).
// Булочка и ветчина не режутся.
export const cutTransitions: CutTransition[] = [
	{ input: { kind: "steak", state: "raw" }, output: { kind: "steak", state: "chopped" } },
	{ input: { kind: "potato", state: "raw" }, output: { kind: "potato", state: "chopped" } },
	{ input: { kind: "carrot", state: "raw" }, output: { kind: "carrot", state: "chopped" } },
	{ input: { kind: "onion", state: "raw" }, output: { kind: "onion", state: "chopped" } },
];

// Готовка на станциях: набор входов (мультимножество) -> готовый предмет -> сгоревший предмет.
// Время cookSec и burnSec лежит в KitchenParams.cooking по id.
export const cookTransitions: CookTransition[] = [
	{
		id: "patty",
		stationKind: "stove",
		inputs: [{ kind: "steak", state: "chopped" }],
		cooking: { kind: "patty", state: "raw" },
		cooked: { kind: "patty", state: "cooked" },
		burnt: { kind: "patty", state: "burnt" },
	},
	{
		id: "veggiePatty",
		stationKind: "stove",
		inputs: [
			{ kind: "potato", state: "chopped" },
			{ kind: "carrot", state: "chopped" },
		],
		cooking: { kind: "veggiePatty", state: "raw" },
		cooked: { kind: "veggiePatty", state: "cooked" },
		burnt: { kind: "veggiePatty", state: "burnt" },
	},
	{
		id: "friedSteak",
		stationKind: "stove",
		inputs: [{ kind: "steak", state: "raw" }],
		cooking: { kind: "friedSteak", state: "raw" },
		cooked: { kind: "friedSteak", state: "cooked" },
		burnt: { kind: "friedSteak", state: "burnt" },
	},
	{
		id: "ham",
		stationKind: "oven",
		inputs: [{ kind: "ham", state: "raw" }],
		cooking: { kind: "ham", state: "raw" },
		cooked: { kind: "ham", state: "cooked" },
		burnt: { kind: "ham", state: "burnt" },
	},
];

// Полный набор для кастрюли: овощи остаются внутри во время варки.
export const potRecipe = {
	id: "stew" as const,
	inputs: [
		{ kind: "carrot", state: "chopped" },
		{ kind: "potato", state: "chopped" },
		{ kind: "onion", state: "chopped" },
	] satisfies ItemSpec[],
	portion: { kind: "stew", state: "cooked" } satisfies ItemSpec,
};

// Виды сырья, которые выдают ящики (состояние raw): с них начинается каждая цепочка блюда.
export const crateIngredientKinds: readonly IngredientKind[] = ["steak", "bun", "ham", "potato", "carrot", "onion"];

// ============================================================================
// Предметы
// ============================================================================

// Новый ингредиент.
export function createIngredientItem(kind: IngredientKind, state: ItemState): IngredientItem {
	return { type: "ingredient", kind, state };
}

// Ингредиент по паре "вид + состояние".
export function createIngredientFromSpec(spec: ItemSpec): IngredientItem {
	return createIngredientItem(spec.kind, spec.state);
}

// Новая чистая тарелка: пустая, блюда нет.
export function createEmptyPlate(): AssemblyItem {
	return { type: "assembly", contents: [], dish: null, plated: true };
}

// Создаёт пустую переносимую кастрюлю.
export function createEmptyPot(): PotItem {
	return { type: "pot", hasWater: false, contents: [], cookProgressSec: 0, portions: 0 };
}

// Глубокая копия предмета: для снимков и событий, чтобы потребитель не мог изменить состояние кухни.
export function cloneItem<T extends Item>(item: T): T {
	if (item.type === "assembly") {
		return { ...item, contents: item.contents.map((ingredient) => ({ ...ingredient })) } as T;
	}
	if (item.type === "pot") {
		return { ...item, contents: item.contents.map((ingredient) => ({ ...ingredient })) } as T;
	}
	return { ...item } as T;
}

// Пара "вид + состояние" ингредиента.
export function specOf(ingredient: IngredientItem): ItemSpec {
	return { kind: ingredient.kind, state: ingredient.state };
}

// Совпадают ли две пары "вид + состояние".
export function isSameSpec(first: ItemSpec, second: ItemSpec): boolean {
	return first.kind === second.kind && first.state === second.state;
}

// Сгоревший ли это ингредиент. Тарелка сгоревшей не бывает: сгоревшее на неё не кладётся.
export function isBurntIngredient(item: Item): boolean {
	return item.type === "ingredient" && item.state === "burnt";
}

// Входит ли пара в перечень допустимых пар игры (ITEM_CATALOG).
export function isCatalogSpec(spec: ItemSpec): boolean {
	return ITEM_CATALOG.some((entry) => isSameSpec(entry, spec));
}

// ============================================================================
// Мультимножества пар (тарелка и наборы входов)
// ============================================================================

// Входит ли каждая пара из part в whole с учётом кратности (мультимножество part вложено в whole).
export function isSubMultiset(part: readonly ItemSpec[], whole: readonly ItemSpec[]): boolean {
	const remaining = [...whole];
	for (const spec of part) {
		const position = remaining.findIndex((candidate) => isSameSpec(candidate, spec));
		if (position < 0) {
			return false;
		}
		remaining.splice(position, 1);
	}
	return true;
}

// Равны ли два набора как мультимножества (порядок не важен).
export function isSameMultiset(first: readonly ItemSpec[], second: readonly ItemSpec[]): boolean {
	return first.length === second.length && isSubMultiset(first, second);
}

// ============================================================================
// Переходы станций
// ============================================================================

// Переход резки для предмета или undefined, если предмет не режется (булочка, ветчина, уже нарезанное, сгоревшее).
export function findCutTransition(ingredient: IngredientItem): CutTransition | undefined {
	return cutTransitions.find((transition) => isSameSpec(transition.input, ingredient));
}

// Переходы готовки для вида станции: плита (жарка без сковороды) или духовка. Рагу в кастрюле описывает potRecipe.
export function findCookTransitions(stationKind: StationKind): CookTransition[] {
	return cookTransitions.filter((transition) => transition.stationKind === stationKind);
}

// Переход готовки по идентификатору процесса.
export function getCookTransition(id: CookTransition["id"]): CookTransition {
	const transition = cookTransitions.find((candidate) => candidate.id === id);
	if (!transition) {
		throw new Error(`recipes.getCookTransition: неизвестный процесс готовки ${id}`);
	}
	return transition;
}

// ============================================================================
// Тарелка и блюда
// ============================================================================

// Блюдо меню, которое образует содержимое тарелки целиком, или null, если содержимое не совпало ни с одним рецептом меню.
export function findDishForContents(menu: readonly DishId[], contents: readonly IngredientItem[]): DishId | null {
	const specs = contents.map(specOf);
	for (const dish of menu) {
		if (isSameMultiset(specs, dishRecipes[dish].ingredients)) {
			return dish;
		}
	}
	return null;
}

// Может ли тарелка принять ингредиент. null: может. Иначе причина отказа: burntItem (сгоревшее не годится никуда) или
// plateNotAccepted (ингредиент не подходит ни к одному рецепту меню вместе с тем, что уже лежит на тарелке).
export function checkPlateAccepts(menu: readonly DishId[], plate: AssemblyItem, ingredient: IngredientItem): ActionRejectReason | null {
	if (ingredient.state === "burnt") {
		return "burntItem";
	}
	const contentsAfter = [...plate.contents, ingredient].map(specOf);
	const fitsSomeRecipe = menu.some((dish) => isSubMultiset(contentsAfter, dishRecipes[dish].ingredients));
	return fitsSomeRecipe ? null : "plateNotAccepted";
}

// Новая тарелка с добавленным ингредиентом. Если содержимое совпало с рецептом меню, dish равен блюду.
// Допустимость ингредиента проверяет checkPlateAccepts: эта функция её не повторяет.
export function addIngredientToPlate(menu: readonly DishId[], plate: AssemblyItem, ingredient: IngredientItem): AssemblyItem {
	const contents = [...plate.contents.map((existing) => ({ ...existing })), { ...ingredient }];
	return { type: "assembly", contents, dish: findDishForContents(menu, contents), plated: plate.plated };
}

// Превращает ингредиент или сборку в контейнер и пересчитывает распознанное блюдо.
export function makeAssembly(menu: readonly DishId[], items: readonly IngredientItem[], plated: boolean): AssemblyItem {
	const contents = items.map((item) => ({ ...item }));
	return { type: "assembly", contents, dish: findDishForContents(menu, contents), plated };
}

// Проверяет, что ингредиенты пока подходят хотя бы к одному блюду меню.
export function ingredientsFitMenu(menu: readonly DishId[], items: readonly IngredientItem[]): boolean {
	if (items.some((item) => item.state === "burnt")) {
		return false;
	}
	const specs = items.map(specOf);
	return menu.some((dish) => isSubMultiset(specs, dishRecipes[dish].ingredients));
}

// Объединяет ингредиент или сборку с ингредиентом, если вместе они остаются частью блюда меню.
export function combineWithIngredient(menu: readonly DishId[], carrier: Item, ingredient: IngredientItem): Item | null {
	if (ingredient.state === "burnt" || carrier.type === "pot" || carrier.type === "ingredient" && carrier.state === "burnt") {
		return null;
	}
	const plated = carrier.type === "assembly" && carrier.plated;
	const contents = carrier.type === "assembly" ? carrier.contents : [carrier];
	const combined = [...contents, ingredient];
	if (!ingredientsFitMenu(menu, combined)) {
		return null;
	}
	return makeAssembly(menu, combined, plated);
}

// Проверяет, можно ли перенести предмет на тарелку как последний этап.
export function plateItem(menu: readonly DishId[], item: Item): AssemblyItem | null {
	if (item.type === "pot" || item.type === "ingredient" && item.state === "burnt") {
		return null;
	}
	const contents = item.type === "assembly" ? item.contents : [item];
	if (!ingredientsFitMenu(menu, contents)) {
		return null;
	}
	return makeAssembly(menu, contents, true);
}
