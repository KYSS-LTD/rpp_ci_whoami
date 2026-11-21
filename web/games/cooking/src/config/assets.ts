// Список моделей игры (задача 1.6) и сопоставление игровых сущностей моделям KayKit Restaurant Bits.
// Владелец: SONNET-3 (scene-hud). Файлы лежат в public/models/ (относительный адрес models/, Vite кладёт их в сборку).
// Список с запасом: основные модели используются рендером, запасные нужны будущим раскладкам уровней и декору.
// Уровни ссылаются на модели по имени (PropConfig.model, StationConfig.model, TableConfig.model, SeatConfig.chairModel):
// тест уровней сверяет эти имена с assetModelNames.
import type { DishId, IngredientKind, ItemSpec, StationKind } from "../contracts";

// Относительная папка моделей: работает и по прямому адресу, и из /game-builds/cooking/ в изолированном фрейме.
export const MODEL_BASE_PATH = "models/";

// Общий атлас текстуры всего пака: на него ссылаются все .gltf.
export const ATLAS_FILE_NAME = "restaurantbits_texture.png";

// Основные модели: их напрямую использует рендер (предметы, блюда, станции, стены, мебель).
export const coreModelNames = [
	// Тарелки и готовые блюда на тарелке.
	"plate",
	"plate_small",
	"food_burger",
	"food_dinner",
	"food_vegetableburger",
	"food_stew",
	// Ингредиенты и полуфабрикаты по ITEM_CATALOG.
	"food_ingredient_steak",
	"food_ingredient_steak_pieces",
	"food_ingredient_bun",
	"food_ingredient_ham",
	"food_ingredient_ham_cooked",
	"food_ingredient_ham_trash",
	"food_ingredient_potato",
	"food_ingredient_potato_chopped",
	"food_ingredient_carrot",
	"food_ingredient_carrot_chopped",
	"food_ingredient_onion",
	"food_ingredient_onion_chopped",
	"food_ingredient_burger_uncooked",
	"food_ingredient_burger_cooked",
	"food_ingredient_burger_trash",
	"food_ingredient_vegetableburger_uncooked",
	"food_ingredient_vegetableburger_cooked",
	"stew_pot",
	// Ящики с ингредиентами (общий ящик для видов без своего).
	"crate",
	"crate_steak",
	"crate_buns",
	"crate_ham",
	"crate_potatoes",
	"crate_carrots",
	"crate_onions",
	// Станции кухни.
	"kitchencounter_straight_A",
	"cuttingboard",
	"stove_single",
	"pan_A",
	"pot_A",
	"pot_A_stew",
	"lid_A",
	"oven",
	"dishrack_plates",
	// Пол, стены, проёмы, дверь, окно выдачи.
	"floor_kitchen",
	"floor_kitchen_small",
	"wall",
	"wall_doorway",
	"wall_low",
	"wall_doorway_low",
	"wall_orderwindow",
	"door_A",
	// Столы и стулья зала.
	"kitchentable_B",
	"table_round_A",
	"table_round_A_small",
	"chair_A",
	"chair_stool",
] as const;

// Запасные модели: не нужны текущей раскладке, но дают уровням свободу (декор, углы, другая мебель) без правок списка.
export const reserveModelNames = [
	"kitchencounter_straight_B",
	"kitchencounter_innercorner",
	"kitchencounter_outercorner",
	"kitchencounter_straight_A_backsplash",
	"kitchentable_A",
	"kitchentable_A_large",
	"stove_multi",
	"pan_B",
	"pot_B",
	"pot_B_stew",
	"lid_B",
	"fridge_A",
	"fridge_B",
	"door_B",
	"wall_half",
	"wall_decorated",
	"wall_window_open",
	"wall_window_closed",
	"pillar_A",
	"pillar_B",
	"table_round_B",
	"chair_B",
	"menu",
	"ketchup",
	"mustard",
	"extractorhood",
	"shelf_papertowel",
	"papertowel",
	"crate_lid",
	"crate_cheese",
	"crate_lettuce",
	"crate_tomatoes",
	"food_ingredient_bun_bottom",
	"food_ingredient_bun_top",
	"food_ingredient_carrot_pieces",
] as const;

// Имя модели KayKit без расширения.
export type AssetModelName = (typeof coreModelNames)[number] | (typeof reserveModelNames)[number];

// Все модели, которые грузит prepareAssets: основные и запасные.
export const assetModelNames: readonly AssetModelName[] = [...coreModelNames, ...reserveModelNames];

// Адрес файла .gltf модели (относительный).
export function getModelUrl(modelName: string): string {
	return `${MODEL_BASE_PATH}${modelName}.gltf`;
}

// Имена всех файлов, которые должны лежать в public/models/: .gltf, .bin на каждую модель и общий атлас.
export function getAssetFileNames(): string[] {
	const fileNames: string[] = [ATLAS_FILE_NAME];
	for (const modelName of assetModelNames) {
		fileNames.push(`${modelName}.gltf`, `${modelName}.bin`);
	}
	return fileNames;
}

// --- Сопоставление игровых сущностей моделям ---

// Модель предмета по паре "вид + состояние" (все пары ITEM_CATALOG). Сгоревшая овощная котлета и сгоревшее рагу берут
// модель сгоревшей котлеты и рагу: рендер дополнительно затемняет их (см. burntTintItems).
const itemModelByKey: Readonly<Record<string, AssetModelName>> = {
	"steak:raw": "food_ingredient_steak",
	"steak:chopped": "food_ingredient_steak_pieces",
	"bun:raw": "food_ingredient_bun",
	"ham:raw": "food_ingredient_ham",
	"ham:cooked": "food_ingredient_ham_cooked",
	"ham:burnt": "food_ingredient_ham_trash",
	"potato:raw": "food_ingredient_potato",
	"potato:chopped": "food_ingredient_potato_chopped",
	"carrot:raw": "food_ingredient_carrot",
	"carrot:chopped": "food_ingredient_carrot_chopped",
	"onion:raw": "food_ingredient_onion",
	"onion:chopped": "food_ingredient_onion_chopped",
	"patty:raw": "food_ingredient_burger_uncooked",
	"patty:cooked": "food_ingredient_burger_cooked",
	"patty:burnt": "food_ingredient_burger_trash",
	"veggiePatty:raw": "food_ingredient_vegetableburger_uncooked",
	"veggiePatty:cooked": "food_ingredient_vegetableburger_cooked",
	"veggiePatty:burnt": "food_ingredient_burger_trash",
	// Жареный стейк: своей модели в паке нет, берётся сырой стейк и красится в коричневый (см. itemTints).
	"friedSteak:raw": "food_ingredient_steak",
	"friedSteak:cooked": "food_ingredient_steak",
	"friedSteak:burnt": "food_ingredient_steak",
	"stew:cooked": "stew_pot",
	"stew:burnt": "stew_pot",
};

// Пары, у которых в паке нет своей модели "сгоревшее": рендер красит их в тёмный цвет.
export const burntTintItems: ReadonlySet<string> = new Set(["veggiePatty:burnt", "stew:burnt", "friedSteak:burnt"]);

// Цвет, которым красится копия модели: розовое сырое мясо жареного стейка становится коричневым.
export const itemTints: Readonly<Record<string, number>> = { "friedSteak:cooked": 0xa5693a };

// Ключ пары "вид + состояние" для таблиц.
export function getItemKey(spec: ItemSpec): string {
	return `${spec.kind}:${spec.state}`;
}

// Имя модели предмета или null, если для пары модели нет (такие пары в игре не возникают).
export function getItemModelName(spec: ItemSpec): AssetModelName | null {
	return itemModelByKey[getItemKey(spec)] ?? null;
}

// Модель готового блюда на тарелке (тарелка входит в модель).
export const dishModelNames: Readonly<Record<DishId, AssetModelName>> = {
	burger: "food_burger",
	ham: "food_dinner",
	// Стейк: модель тарелки; жареный стейк кладётся сверху при построении (см. dishToppings), «ужин» с окороком не подходит.
	steak: "plate",
	veggieBurger: "food_vegetableburger",
	stew: "food_stew",
};

// Блюда, которые собираются на модели тарелки из ингредиента сверху (у стейка своей модели «на тарелке» в паке нет).
export const dishToppings: Readonly<Partial<Record<DishId, ItemSpec>>> = {
	steak: { kind: "friedSteak", state: "cooked" },
};

// Доля размера модели ингредиента, с которой он лежит на тарелке: целый стейк чуть меньше тарелки.
export const dishToppingScale = 0.78;

// Модель ящика по ингредиенту. Виды без своего ящика (котлеты, рагу) берут общий.
export const crateModelNames: Readonly<Record<IngredientKind, AssetModelName>> = {
	steak: "crate_steak",
	bun: "crate_buns",
	ham: "crate_ham",
	potato: "crate_potatoes",
	carrot: "crate_carrots",
	onion: "crate_onions",
	patty: "crate",
	veggiePatty: "crate",
	friedSteak: "crate",
	stew: "crate",
};

// Модель основания станции по её виду (если в данных уровня нет StationConfig.model). Ящик определяется по ингредиенту,
// урна рисуется примитивом (модели в паке нет), поэтому для trash и crate значение null.
export const stationBaseModelNames: Readonly<Record<StationKind, AssetModelName | null>> = {
	crate: null,
	counter: "kitchencounter_straight_A",
	cuttingBoard: "kitchencounter_straight_A",
	pan: "stove_single",
	stove: "stove_single",
	oven: "oven",
	plateStack: "kitchencounter_straight_A",
	trash: null,
	servingWindow: "wall_orderwindow",
	tap: null,
};

// Модели-надстройки на станциях.
export const stationTopModelNames = {
	cuttingBoard: "cuttingboard",
	pan: "pan_A",
	pot: "pot_A",
	potWithStew: "pot_A_stew",
	plateStack: "dishrack_plates",
} as const satisfies Record<string, AssetModelName>;
