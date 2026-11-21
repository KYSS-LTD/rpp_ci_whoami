// Предметы, рецепты блюд и таблицы переходов станций как данные (задача 2.3, design D6) и чистые помощники над ними.
// Таблицы описывают, что можно нарезать, приготовить и собрать на тарелке; логика кухни (index.ts) только читает их.
// Цена, чаевые и трудоёмкость блюд, время резки и готовки лежат в LevelParams (config/levels/defaults.ts), здесь их нет.
// Предметы в кухне неизменяемы: любое изменение создаёт новый объект, поэтому одна ссылка может безопасно лежать в нескольких местах.
// Владелец: SONNET-1.
import {
	ITEM_CATALOG,
	type ActionRejectReason,
	type CookTransition,
	type CutTransition,
	type DishId,
	type DishRecipe,
	type IngredientItem,
	type IngredientKind,
	type Item,
	type ItemSpec,
	type ItemState,
	type PlateItem,
	type StationKind,
} from "../../contracts";

// ============================================================================
// Таблицы данных
// ============================================================================

// Рецепты блюд: набор ингредиентов на тарелке (мультимножество, порядок не важен).
// burger: булочка и жареная котлета из нарезанного стейка; ham (окорок): одна готовая ветчина;
// veggieBurger: булочка и жареная овощная котлета; stew: одна порция рагу из кастрюли.
export const dishRecipes: Record<DishId, DishRecipe> = {
	burger: {
		dish: "burger",
		ingredients: [
			{ kind: "bun", state: "raw" },
			{ kind: "patty", state: "cooked" },
		],
	},
	ham: {
		dish: "ham",
		ingredients: [{ kind: "ham", state: "cooked" }],
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
		stationKind: "pan",
		inputs: [{ kind: "steak", state: "chopped" }],
		cooking: { kind: "patty", state: "raw" },
		cooked: { kind: "patty", state: "cooked" },
		burnt: { kind: "patty", state: "burnt" },
	},
	{
		id: "veggiePatty",
		stationKind: "pan",
		inputs: [
			{ kind: "potato", state: "chopped" },
			{ kind: "carrot", state: "chopped" },
		],
		cooking: { kind: "veggiePatty", state: "raw" },
		cooked: { kind: "veggiePatty", state: "cooked" },
		burnt: { kind: "veggiePatty", state: "burnt" },
	},
	{
		id: "ham",
		stationKind: "oven",
		inputs: [{ kind: "ham", state: "raw" }],
		cooking: { kind: "ham", state: "raw" },
		cooked: { kind: "ham", state: "cooked" },
		burnt: { kind: "ham", state: "burnt" },
	},
	{
		// Рагу: полный набор из одного нарезанного овоща каждого вида; овощи остаются в кастрюле, пока идёт варка.
		id: "stew",
		stationKind: "pot",
		inputs: [
			{ kind: "carrot", state: "chopped" },
			{ kind: "potato", state: "chopped" },
			{ kind: "onion", state: "chopped" },
		],
		cooking: null,
		cooked: { kind: "stew", state: "cooked" },
		burnt: { kind: "stew", state: "burnt" },
	},
];

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
export function createEmptyPlate(): PlateItem {
	return { type: "plate", contents: [], dish: null };
}

// Глубокая копия предмета: для снимков и событий, чтобы потребитель не мог изменить состояние кухни.
export function cloneItem<T extends Item>(item: T): T {
	if (item.type === "plate") {
		return { type: "plate", contents: item.contents.map((ingredient) => ({ ...ingredient })), dish: item.dish } as T;
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

// Переходы готовки для вида станции: сковорода, кастрюля или духовка.
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
export function checkPlateAccepts(menu: readonly DishId[], plate: PlateItem, ingredient: IngredientItem): ActionRejectReason | null {
	if (ingredient.state === "burnt") {
		return "burntItem";
	}
	const contentsAfter = [...plate.contents, ingredient].map(specOf);
	const fitsSomeRecipe = menu.some((dish) => isSubMultiset(contentsAfter, dishRecipes[dish].ingredients));
	return fitsSomeRecipe ? null : "plateNotAccepted";
}

// Новая тарелка с добавленным ингредиентом. Если содержимое совпало с рецептом меню, dish равен блюду.
// Допустимость ингредиента проверяет checkPlateAccepts: эта функция её не повторяет.
export function addIngredientToPlate(menu: readonly DishId[], plate: PlateItem, ingredient: IngredientItem): PlateItem {
	const contents = [...plate.contents.map((existing) => ({ ...existing })), { ...ingredient }];
	return { type: "plate", contents, dish: findDishForContents(menu, contents) };
}
