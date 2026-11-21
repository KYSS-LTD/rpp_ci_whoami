// Кухня (задачи 2.4-2.9): рука повара, ящики, прилавки, разделочная доска, плиты со сковородой и кастрюлей, духовка,
// стопка тарелок, урна и окно выдачи. Реализует Kitchen из contracts.ts. Рецепты и переходы лежат в recipes.ts, числа
// (время резки, готовки, подгорания) в LevelParams. Модуль не знает о DOM и three. Владелец: SONNET-1.
//
// Правила взаимодействия "взять/положить" (interact) зависят от руки и станции:
// - рука пуста: берём предмет со станции (ящик и стопка выдают новый, плита отдаёт готовое, сгоревшее или последний
//   положенный вход неполного набора);
// - в руке ингредиент: кладём на станцию, если она его принимает;
// - в руке тарелка: тарелка забирает готовый ингредиент со станции (прилавок, плита, кастрюля, духовка); положить тарелку
//   можно на пустой прилавок, в стопку (пустую), в урну и в окно (готовое блюдо);
// - ингредиент в руке и тарелка на прилавке: ингредиент ложится на тарелку.
// Тарелка принимает ингредиент, только если он подходит хотя бы к одному рецепту меню уровня (recipes.checkPlateAccepts).
import {
	type ActionRejectReason,
	type CookTransition,
	type IngredientItem,
	type InteractResult,
	type Item,
	type Kitchen,
	type KitchenDeps,
	type PlateItem,
	type ServingWindow,
	type StationConfig,
	type StationId,
	type StationPhase,
	type StationSnapshot,
	type WindowDishSnapshot,
} from "../../contracts";
import { debugLog } from "../../config/debug";
import {
	addIngredientToPlate,
	checkPlateAccepts,
	cloneItem,
	createEmptyPlate,
	createIngredientFromSpec,
	createIngredientItem,
	findCookTransitions,
	findCutTransition,
	isBurntIngredient,
	isSameMultiset,
	isSubMultiset,
	specOf,
} from "./recipes";
import { createServingWindow } from "./servingWindow";

// Допуск на накопленную погрешность вещественных чисел при сравнении времени.
const TIME_EPSILON_SEC = 1e-9;

// Состояние плиты или духовки: empty - пусто; loading - положена часть набора, готовка не началась; cooking - идёт готовка;
// ready - готово, идёт отсчёт до подгорания; burnt - сгорело.
type CookStatus = "empty" | "loading" | "cooking" | "ready" | "burnt";

// Изменяемое состояние одной станции. Поля нужных видов станций используются, остальные остаются пустыми.
interface StationRuntime {
	config: StationConfig;
	// Прилавок: любой предмет или тарелка. Доска: ингредиент.
	item: Item | null;
	// Доска: сколько секунд резки накоплено у текущего предмета.
	cutProgressSec: number;
	// Сковорода, кастрюля, духовка.
	cookStatus: CookStatus;
	// Что лежит на плите: набор входов, затем один предмет (котлета, ветчина) или овощи кастрюли, затем готовое или сгоревшее.
	cookItems: IngredientItem[];
	cookRecipe: CookTransition | null;
	// Секунды в текущей стадии: до готовности при cooking, до подгорания при ready.
	cookElapsedSec: number;
	// Кастрюля: сколько порций рагу осталось.
	portions: number;
}

// Результат попытки положить ингредиент на тарелку: новая тарелка или причина отказа.
type PlateAddResult = { ok: true; plate: PlateItem } | { ok: false; reason: ActionRejectReason };

// Успешное действие.
const ACTION_OK: InteractResult = { ok: true };

// Отказ действия с причиной.
function rejected(reason: ActionRejectReason): InteractResult {
	return { ok: false, reason };
}

// Вид станции, готовящей еду сама.
function isCookerKind(kind: StationConfig["kind"]): boolean {
	return kind === "pan" || kind === "pot" || kind === "oven";
}

// Создаёт кухню: рука пуста, все станции пусты, окно выдачи пусто.
export function createKitchen(deps: KitchenDeps): Kitchen {
	const params = deps.level.params.kitchen;
	const menu = deps.level.params.menu;
	const bus = deps.bus;
	const servingWindow: ServingWindow = createServingWindow({ level: deps.level, orders: deps.orders, clock: deps.clock, bus });

	const stationList: StationRuntime[] = deps.level.stations.map((config) => ({
		config,
		item: null,
		cutProgressSec: 0,
		cookStatus: "empty",
		cookItems: [],
		cookRecipe: null,
		cookElapsedSec: 0,
		portions: 0,
	}));
	const stationsById = new Map<StationId, StationRuntime>(stationList.map((runtime) => [runtime.config.id, runtime]));

	// Предмет в руке повара.
	let hand: Item | null = null;
	// Станция, над которой удерживается рабочее действие.
	let workStationId: StationId | null = null;
	// Доска, на которой резка шла на последнем шаге (для phase processing и isWorking).
	let cuttingStationId: StationId | null = null;

	// ------------------------------------------------------------------------
	// Общие помощники
	// ------------------------------------------------------------------------

	// Кладёт ингредиент на тарелку, если рецепты меню это позволяют. Шлёт dishAssembled, когда тарелка стала блюдом.
	function addToPlate(plate: PlateItem, ingredient: IngredientItem): PlateAddResult {
		const reason = checkPlateAccepts(menu, plate, ingredient);
		if (reason !== null) {
			return { ok: false, reason };
		}
		const updated = addIngredientToPlate(menu, plate, ingredient);
		if (updated.dish !== null) {
			bus.emit({ type: "dishAssembled", dish: updated.dish });
		}
		return { ok: true, plate: updated };
	}

	function emitTaken(stationId: StationId, item: Item): void {
		bus.emit({ type: "itemTaken", stationId, item: cloneItem(item) });
	}

	function emitPlaced(stationId: StationId, item: Item): void {
		bus.emit({ type: "itemPlaced", stationId, item: cloneItem(item) });
	}

	// Сбрасывает плиту в пустое состояние.
	function resetCooker(runtime: StationRuntime): void {
		runtime.cookStatus = "empty";
		runtime.cookItems = [];
		runtime.cookRecipe = null;
		runtime.cookElapsedSec = 0;
		runtime.portions = 0;
	}

	// ------------------------------------------------------------------------
	// Взаимодействие по видам станций
	// ------------------------------------------------------------------------

	// Ящик: выдаёт один сырой ингредиент в пустую руку.
	function interactCrate(runtime: StationRuntime): InteractResult {
		if (hand !== null) {
			return rejected("handBusy");
		}
		const kind = runtime.config.ingredient;
		if (!kind) {
			debugLog("kitchen", `у ящика ${runtime.config.id} не задан ингредиент`);
			return rejected("nothingToTake");
		}
		hand = createIngredientItem(kind, "raw");
		emitTaken(runtime.config.id, hand);
		return ACTION_OK;
	}

	// Прилавок: хранит один предмет; ингредиент и тарелка соединяются в одну тарелку.
	function interactCounter(runtime: StationRuntime): InteractResult {
		const stationId = runtime.config.id;
		const onCounter = runtime.item;
		if (hand === null) {
			if (onCounter === null) {
				return rejected("nothingToTake");
			}
			hand = onCounter;
			runtime.item = null;
			emitTaken(stationId, hand);
			return ACTION_OK;
		}
		if (onCounter === null) {
			const placed = hand;
			runtime.item = placed;
			hand = null;
			emitPlaced(stationId, placed);
			return ACTION_OK;
		}
		// Занято и в руке, и на прилавке: возможно соединение тарелки с ингредиентом.
		if (hand.type === "plate" && onCounter.type === "ingredient") {
			const result = addToPlate(hand, onCounter);
			if (!result.ok) {
				return rejected(result.reason);
			}
			hand = result.plate;
			runtime.item = null;
			emitTaken(stationId, onCounter);
			return ACTION_OK;
		}
		if (hand.type === "ingredient" && onCounter.type === "plate") {
			const result = addToPlate(onCounter, hand);
			if (!result.ok) {
				return rejected(result.reason);
			}
			const placed = hand;
			runtime.item = result.plate;
			hand = null;
			emitPlaced(stationId, placed);
			return ACTION_OK;
		}
		return rejected("stationOccupied");
	}

	// Разделочная доска: принимает сырой нарезаемый предмет, режет по удержанию (см. step), отдаёт предмет обратно.
	function interactBoard(runtime: StationRuntime): InteractResult {
		const stationId = runtime.config.id;
		const onBoard = runtime.item;
		if (hand === null) {
			if (onBoard === null) {
				return rejected("nothingToTake");
			}
			hand = onBoard;
			runtime.item = null;
			// Прогресс резки привязан к предмету на доске: забрали предмет, прогресс потерян.
			runtime.cutProgressSec = 0;
			emitTaken(stationId, hand);
			return ACTION_OK;
		}
		if (onBoard !== null) {
			if (hand.type === "plate" && onBoard.type === "ingredient") {
				const result = addToPlate(hand, onBoard);
				if (!result.ok) {
					return rejected(result.reason);
				}
				hand = result.plate;
				runtime.item = null;
				runtime.cutProgressSec = 0;
				emitTaken(stationId, onBoard);
				return ACTION_OK;
			}
			return rejected("stationOccupied");
		}
		if (hand.type !== "ingredient") {
			return rejected("itemNotAccepted");
		}
		if (isBurntIngredient(hand)) {
			return rejected("burntItem");
		}
		if (!findCutTransition(hand)) {
			return rejected("itemNotAccepted");
		}
		const placed = hand;
		runtime.item = placed;
		runtime.cutProgressSec = 0;
		hand = null;
		emitPlaced(stationId, placed);
		return ACTION_OK;
	}

	// Начинает готовку по полному набору входов.
	function startCooking(runtime: StationRuntime, transition: CookTransition): void {
		runtime.cookStatus = "cooking";
		runtime.cookRecipe = transition;
		runtime.cookElapsedSec = 0;
		// Сковорода и духовка заменяют набор одним предметом в процессе (котлета, ветчина), кастрюля оставляет овощи.
		if (transition.cooking) {
			runtime.cookItems = [createIngredientFromSpec(transition.cooking)];
		}
		bus.emit({ type: "cookingStarted", stationId: runtime.config.id, recipe: transition.id });
	}

	// Плита: кладём ингредиент (часть набора или весь), в пустой руке берём готовое или сгоревшее, тарелка забирает готовое.
	function interactCooker(runtime: StationRuntime): InteractResult {
		if (hand === null) {
			return takeFromCooker(runtime);
		}
		if (hand.type === "plate") {
			return takeFromCookerOntoPlate(runtime, hand);
		}
		return placeIntoCooker(runtime, hand);
	}

	// Пустая рука берёт со станции то, что она может отдать без тарелки.
	function takeFromCooker(runtime: StationRuntime): InteractResult {
		const stationId = runtime.config.id;
		switch (runtime.cookStatus) {
			case "loading": {
				// Положенное, но ещё не запущенное в готовку, можно забрать обратно (последним положенным).
				const returned = runtime.cookItems.pop();
				if (!returned) {
					return rejected("nothingToTake");
				}
				if (runtime.cookItems.length === 0) {
					resetCooker(runtime);
				}
				hand = returned;
				emitTaken(stationId, returned);
				return ACTION_OK;
			}
			case "ready": {
				// Порция рагу берётся только на тарелку.
				if (runtime.config.kind === "pot") {
					return rejected("plateRequired");
				}
				hand = runtime.cookItems[0];
				resetCooker(runtime);
				emitTaken(stationId, hand);
				return ACTION_OK;
			}
			case "burnt": {
				// Сгоревшее можно только вынести в урну: берём в руку целиком.
				hand = runtime.cookItems[0];
				resetCooker(runtime);
				emitTaken(stationId, hand);
				return ACTION_OK;
			}
			default:
				return rejected("nothingToTake");
		}
	}

	// Тарелка в руке забирает готовое: котлету, ветчину, порцию рагу.
	function takeFromCookerOntoPlate(runtime: StationRuntime, plate: PlateItem): InteractResult {
		const stationId = runtime.config.id;
		if (runtime.cookStatus === "burnt") {
			return rejected("burntItem");
		}
		if (runtime.cookStatus !== "ready") {
			return rejected("nothingToTake");
		}
		const taken: IngredientItem = runtime.cookItems[0];
		const result = addToPlate(plate, taken);
		if (!result.ok) {
			return rejected(result.reason);
		}
		hand = result.plate;
		if (runtime.config.kind === "pot" && runtime.portions > 1) {
			// В кастрюле остались порции: готовое рагу и отсчёт до подгорания продолжаются.
			runtime.portions -= 1;
		} else {
			resetCooker(runtime);
		}
		emitTaken(stationId, taken);
		return ACTION_OK;
	}

	// Ингредиент в руке кладётся в плиту, если вместе с лежащим он входит в набор одного из переходов этой плиты.
	function placeIntoCooker(runtime: StationRuntime, ingredient: IngredientItem): InteractResult {
		if (runtime.cookStatus !== "empty" && runtime.cookStatus !== "loading") {
			return rejected("stationOccupied");
		}
		if (isBurntIngredient(ingredient)) {
			return rejected("burntItem");
		}
		if (runtime.config.kind === "pot" && runtime.cookItems.length >= params.potCapacity) {
			return rejected("stationOccupied");
		}
		const loadedSpecs = [...runtime.cookItems.map(specOf), specOf(ingredient)];
		const transition = findCookTransitions(runtime.config.kind).find((candidate) => isSubMultiset(loadedSpecs, candidate.inputs));
		if (!transition) {
			return rejected("itemNotAccepted");
		}
		runtime.cookItems = [...runtime.cookItems, ingredient];
		runtime.cookRecipe = transition;
		runtime.cookStatus = "loading";
		hand = null;
		emitPlaced(runtime.config.id, ingredient);
		if (isSameMultiset(loadedSpecs, transition.inputs)) {
			startCooking(runtime, transition);
		}
		return ACTION_OK;
	}

	// Стопка тарелок: бесконечно выдаёт чистые тарелки, принимает назад только пустую.
	function interactPlateStack(runtime: StationRuntime): InteractResult {
		const stationId = runtime.config.id;
		if (hand === null) {
			hand = createEmptyPlate();
			emitTaken(stationId, hand);
			return ACTION_OK;
		}
		if (hand.type === "plate" && hand.contents.length === 0) {
			const returned = hand;
			hand = null;
			emitPlaced(stationId, returned);
			return ACTION_OK;
		}
		return rejected("itemNotAccepted");
	}

	// Урна: уничтожает любой предмет в руке, в том числе тарелку с содержимым.
	function interactTrash(): InteractResult {
		if (hand === null) {
			return rejected("handEmpty");
		}
		const thrown = hand;
		hand = null;
		bus.emit({ type: "itemTrashed", item: cloneItem(thrown) });
		return ACTION_OK;
	}

	// Окно выдачи: принимает тарелку с готовым блюдом, для которого есть открытый заказ.
	function interactServingWindow(): InteractResult {
		if (hand === null) {
			return rejected("handEmpty");
		}
		if (hand.type !== "plate") {
			return rejected("dishNotReady");
		}
		const result = servingWindow.tryAccept(hand);
		if (!result.ok) {
			return rejected(result.reason);
		}
		hand = null;
		return ACTION_OK;
	}

	// ------------------------------------------------------------------------
	// Шаг: резка, готовка, подгорание
	// ------------------------------------------------------------------------

	// Резка на доске под рабочим действием.
	function stepCutting(dtSec: number): void {
		cuttingStationId = null;
		if (workStationId === null) {
			return;
		}
		const runtime = stationsById.get(workStationId);
		if (!runtime || runtime.config.kind !== "cuttingBoard" || runtime.item === null || runtime.item.type !== "ingredient") {
			return;
		}
		const transition = findCutTransition(runtime.item);
		if (!transition) {
			return;
		}
		cuttingStationId = runtime.config.id;
		runtime.cutProgressSec += dtSec;
		if (runtime.cutProgressSec + TIME_EPSILON_SEC >= params.cutSec) {
			runtime.item = createIngredientFromSpec(transition.output);
			runtime.cutProgressSec = params.cutSec;
			bus.emit({ type: "cuttingDone", stationId: runtime.config.id });
		}
	}

	// Готовка и подгорание на одной плите.
	function stepCooker(runtime: StationRuntime, dtSec: number): void {
		const transition = runtime.cookRecipe;
		if (!transition) {
			return;
		}
		const timing = params.cooking[transition.id];
		if (runtime.cookStatus === "cooking") {
			runtime.cookElapsedSec += dtSec;
			if (runtime.cookElapsedSec + TIME_EPSILON_SEC >= timing.cookSec) {
				// Излишек времени уходит в отсчёт до подгорания.
				runtime.cookElapsedSec = Math.max(0, runtime.cookElapsedSec - timing.cookSec);
				runtime.cookStatus = "ready";
				runtime.cookItems = [createIngredientFromSpec(transition.cooked)];
				runtime.portions = transition.id === "stew" ? params.stewPortionsPerBatch : 0;
				bus.emit({ type: "cookingDone", stationId: runtime.config.id, recipe: transition.id });
			}
		} else if (runtime.cookStatus === "ready") {
			runtime.cookElapsedSec += dtSec;
			if (runtime.cookElapsedSec + TIME_EPSILON_SEC >= timing.burnSec) {
				runtime.cookStatus = "burnt";
				runtime.cookItems = [createIngredientFromSpec(transition.burnt)];
				runtime.cookElapsedSec = 0;
				runtime.portions = 0;
				bus.emit({ type: "itemBurnt", stationId: runtime.config.id });
			}
		}
	}

	// ------------------------------------------------------------------------
	// Снимки
	// ------------------------------------------------------------------------

	// Доля пройденного пути с защитой от деления на ноль, в пределах 0..1.
	function ratioOf(elapsedSec: number, totalSec: number): number {
		if (totalSec <= 0) {
			return 1;
		}
		return Math.min(1, Math.max(0, elapsedSec / totalSec));
	}

	function snapshotOf(runtime: StationRuntime): StationSnapshot {
		const { id, kind } = runtime.config;
		const base: StationSnapshot = { id, kind, items: [], phase: "idle", progress: 0, burnProgress: 0, portions: 0 };
		if (kind === "counter") {
			return runtime.item === null ? base : { ...base, items: [cloneItem(runtime.item)], phase: "holding" };
		}
		if (kind === "cuttingBoard") {
			const onBoard = runtime.item;
			if (onBoard === null || onBoard.type !== "ingredient") {
				return base;
			}
			const items = [cloneItem(onBoard)];
			if (!findCutTransition(onBoard)) {
				// Нарезано: можно забирать.
				return { ...base, items, phase: "ready", progress: 1 };
			}
			const phase: StationPhase = cuttingStationId === id ? "processing" : "holding";
			return { ...base, items, phase, progress: ratioOf(runtime.cutProgressSec, params.cutSec) };
		}
		if (isCookerKind(kind)) {
			const items = runtime.cookItems.map((ingredient) => cloneItem(ingredient));
			const timing = runtime.cookRecipe ? params.cooking[runtime.cookRecipe.id] : null;
			switch (runtime.cookStatus) {
				case "loading":
					return { ...base, items, phase: "holding" };
				case "cooking":
					return { ...base, items, phase: "processing", progress: ratioOf(runtime.cookElapsedSec, timing ? timing.cookSec : 0) };
				case "ready":
					return {
						...base,
						items,
						phase: "ready",
						progress: 1,
						burnProgress: ratioOf(runtime.cookElapsedSec, timing ? timing.burnSec : 0),
						portions: kind === "pot" ? runtime.portions : 0,
					};
				case "burnt":
					return { ...base, items, phase: "burnt" };
				default:
					return base;
			}
		}
		// Ящик, стопка тарелок, урна и окно своих предметов не хранят.
		return base;
	}

	// ------------------------------------------------------------------------
	// Интерфейс Kitchen
	// ------------------------------------------------------------------------

	return {
		window: servingWindow,

		interact(stationId: StationId): InteractResult {
			const runtime = stationsById.get(stationId);
			if (!runtime) {
				debugLog("kitchen", `interact: неизвестная станция ${stationId}`);
				return rejected("nothingToTake");
			}
			let result: InteractResult;
			switch (runtime.config.kind) {
				case "crate":
					result = interactCrate(runtime);
					break;
				case "counter":
					result = interactCounter(runtime);
					break;
				case "cuttingBoard":
					result = interactBoard(runtime);
					break;
				case "pan":
				case "pot":
				case "oven":
					result = interactCooker(runtime);
					break;
				case "plateStack":
					result = interactPlateStack(runtime);
					break;
				case "trash":
					result = interactTrash();
					break;
				case "servingWindow":
					result = interactServingWindow();
					break;
			}
			if (!result.ok) {
				bus.emit({ type: "actionRejected", stationId, reason: result.reason });
			}
			return result;
		},

		setWork(stationId: StationId | null): void {
			workStationId = stationId;
		},

		step(dtSec: number): void {
			stepCutting(dtSec);
			stationList.forEach((runtime) => {
				if (isCookerKind(runtime.config.kind)) {
					stepCooker(runtime, dtSec);
				}
			});
		},

		getHand(): Item | null {
			return hand === null ? null : cloneItem(hand);
		},

		isWorking(): boolean {
			return cuttingStationId !== null;
		},

		getStationSnapshots(): StationSnapshot[] {
			return stationList.map(snapshotOf);
		},

		getWindowDishSnapshots(): WindowDishSnapshot[] {
			return servingWindow.getDishes().map((dish) => ({ id: dish.id, dish: dish.dish, orderId: dish.orderId, slotIndex: dish.slotIndex }));
		},
	};
}
