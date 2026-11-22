// Кухня версии 2: предметы, сборки, переносимая кастрюля, нарезка, готовка и окно выдачи.
// Модуль чистый: он не импортирует DOM или three.js. Баланс читается только из LevelParams.
import {
	type ActionRejectReason,
	type AssemblyItem,
	type CookTransition,
	type IngredientItem,
	type InteractResult,
	type Item,
	type Kitchen,
	type KitchenDeps,
	type PotItem,
	type StationConfig,
	type StationId,
	type StationPhase,
	type StationSnapshot,
	type WindowDishSnapshot,
} from "../../contracts";
import { debugLog } from "../../config/debug";
import {
	cloneItem,
	combineWithIngredient,
	createEmptyPlate,
	createEmptyPot,
	createIngredientFromSpec,
	createIngredientItem,
	findCookTransitions,
	findCutTransition,
	ingredientsFitMenu,
	isBurntIngredient,
	isSameMultiset,
	isSubMultiset,
	makeAssembly,
	plateItem,
	specOf,
	potRecipe,
} from "./recipes";
import { createServingWindow } from "./servingWindow";

const TIME_EPSILON_SEC = 1e-9;
type CookStatus = "empty" | "loading" | "cooking" | "ready" | "burnt";

interface StationRuntime {
	config: StationConfig;
	item: Item | null;
	cutProgressSec: number;
	cookStatus: CookStatus;
	cookItems: IngredientItem[];
	cookRecipe: CookTransition | null;
	cookElapsedSec: number;
	potHeating: boolean;
}

type PotUpdate = { ok: true; pot: PotItem } | { ok: false; reason: ActionRejectReason };
type InteractSuccess = { ok: true };
const ACTION_OK: InteractSuccess = { ok: true };

function rejected(reason: ActionRejectReason): InteractResult {
	return { ok: false, reason };
}

function isIngredient(item: Item): item is IngredientItem {
	return item.type === "ingredient";
}

function isAssembly(item: Item): item is AssemblyItem {
	return item.type === "assembly";
}

function ratioOf(elapsedSec: number, totalSec: number): number {
	return totalSec <= 0 ? 1 : Math.min(1, Math.max(0, elapsedSec / totalSec));
}

export function createKitchen(deps: KitchenDeps): Kitchen {
	const { level, orders, clock, bus } = deps;
	const { kitchen: params, menu } = level.params;
	const servingWindow = createServingWindow({ level, orders, clock, bus });
	const stationList: StationRuntime[] = level.stations.map((config) => ({
		config,
		item: config.startItem === "pot" ? createEmptyPot() : null,
		cutProgressSec: 0,
		cookStatus: "empty",
		cookItems: [],
		cookRecipe: null,
		cookElapsedSec: 0,
		potHeating: false,
	}));
	const stationsById = new Map<StationId, StationRuntime>(stationList.map((runtime) => [runtime.config.id, runtime]));
	let hand: Item | null = null;
	let workStationId: StationId | null = null;
	let cuttingStationId: StationId | null = null;

	function emitTaken(stationId: StationId, item: Item): void {
		bus.emit({ type: "itemTaken", stationId, item: cloneItem(item) });
	}

	function emitPlaced(stationId: StationId, item: Item): void {
		bus.emit({ type: "itemPlaced", stationId, item: cloneItem(item) });
	}

	function emitCombined(stationId: StationId, item: Item, previousDish: string | null): void {
		bus.emit({ type: "itemCombined", stationId, item: cloneItem(item) });
		if (item.type === "assembly" && item.dish !== null && item.dish !== previousDish) {
			bus.emit({ type: "dishAssembled", dish: item.dish, plated: item.plated });
		}
	}

	function dishOf(item: Item): string | null {
		if (item.type === "assembly") {
			return item.dish;
		}
		if (item.type !== "ingredient" || item.state === "burnt") {
			return null;
		}
		return makeAssembly(menu, [item], false).dish;
	}

	function combineItems(first: Item, second: Item): Item | null {
		if (first.type === "pot" || second.type === "pot" || isBurntIngredient(first) || isBurntIngredient(second)) {
			return null;
		}
		if (isAssembly(first) && first.plated && isAssembly(second) && second.plated) {
			return null;
		}
		const firstItems = isAssembly(first) ? first.contents : [first];
		const secondItems = isAssembly(second) ? second.contents : [second];
		const contents = [...firstItems, ...secondItems];
		if (!ingredientsFitMenu(menu, contents)) {
			return null;
		}
		const plated = isAssembly(first) && first.plated || isAssembly(second) && second.plated;
		return makeAssembly(menu, contents, plated);
	}

	function addVegetable(pot: PotItem, ingredient: IngredientItem): PotUpdate {
		if (!pot.hasWater) {
			return { ok: false, reason: "needsWater" };
		}
		if (pot.portions > 0 || ingredient.state !== "chopped" || !["carrot", "potato", "onion"].includes(ingredient.kind)) {
			return { ok: false, reason: "itemNotAccepted" };
		}
		if (pot.contents.length >= params.potCapacity) {
			return { ok: false, reason: "stationOccupied" };
		}
		const contents = [...pot.contents, { ...ingredient }];
		if (!isSubMultiset(contents.map(specOf), potRecipe.inputs)) {
			return { ok: false, reason: "itemNotAccepted" };
		}
		return { ok: true, pot: { ...pot, contents } };
	}

	function scoopStew(pot: PotItem, stationId: StationId): InteractResult {
		if (hand === null || !isAssembly(hand) || !hand.plated) {
			return rejected(hand === null ? "plateRequired" : "plateRequired");
		}
		if (pot.portions <= 0) {
			return rejected("nothingToTake");
		}
		const previousDish = hand.dish;
		const portion = createIngredientFromSpec(potRecipe.portion);
		const combined = combineWithIngredient(menu, hand, portion);
		if (!combined || !isAssembly(combined)) {
			return rejected("plateNotAccepted");
		}
		hand = combined;
		const remaining = pot.portions - 1;
		const nextPot: PotItem = remaining === 0
			? { ...pot, hasWater: false, contents: [], cookProgressSec: 0, portions: 0 }
			: { ...pot, portions: remaining };
		const runtime = stationsById.get(stationId);
		if (runtime && runtime.item?.type === "pot") {
			runtime.item = nextPot;
		}
		emitCombined(stationId, hand, previousDish);
		return ACTION_OK;
	}

	function interactCrate(runtime: StationRuntime): InteractResult {
		const kind = runtime.config.ingredient;
		if (!kind) {
			debugLog("kitchen", `у ящика ${runtime.config.id} не задан ингредиент`);
			return rejected("nothingToTake");
		}
		if (hand === null) {
			hand = createIngredientItem(kind, "raw");
			emitTaken(runtime.config.id, hand);
			return ACTION_OK;
		}
		const ingredient = createIngredientItem(kind, "raw");
		const combined = combineWithIngredient(menu, hand, ingredient);
		if (!combined) {
			return rejected("handBusy");
		}
		const previousDish = dishOf(hand);
		hand = combined;
		emitCombined(runtime.config.id, hand, previousDish);
		return ACTION_OK;
	}

	function interactSurface(runtime: StationRuntime): InteractResult {
		const stationId = runtime.config.id;
		const onSurface = runtime.item;
		if (hand === null) {
			if (onSurface === null) {
				return rejected("nothingToTake");
			}
			hand = onSurface;
			runtime.item = null;
			runtime.cutProgressSec = 0;
			runtime.potHeating = false;
			emitTaken(stationId, hand);
			return ACTION_OK;
		}
		if (onSurface === null) {
			runtime.item = hand;
			hand = null;
			runtime.cutProgressSec = 0;
			emitPlaced(stationId, runtime.item);
			return ACTION_OK;
		}
		if (onSurface.type === "pot" && isIngredient(hand)) {
			const update = addVegetable(onSurface, hand);
			if (!update.ok) {
				return rejected(update.reason);
			}
			runtime.item = update.pot;
			const placed = hand;
			hand = null;
			bus.emit({ type: "itemCombined", stationId, item: cloneItem(runtime.item) });
			emitPlaced(stationId, placed);
			return ACTION_OK;
		}
		if (hand.type === "pot" && isIngredient(onSurface)) {
			const update = addVegetable(hand, onSurface);
			if (!update.ok) {
				return rejected(update.reason);
			}
			const previousDish = dishOf(onSurface);
			hand = update.pot;
			runtime.item = null;
			emitCombined(stationId, hand, previousDish);
			return ACTION_OK;
		}
		if (onSurface.type === "pot" && isAssembly(hand) && hand.plated) {
			return scoopStew(onSurface, stationId);
		}
		if (hand.type === "pot" && isAssembly(onSurface) && onSurface.plated) {
			return scoopStew(hand, stationId);
		}
		const combined = combineItems(hand, onSurface);
		if (!combined) {
			return rejected("stationOccupied");
		}
		const previousDish = dishOf(hand) ?? dishOf(onSurface);
		const handCarriesPlate = isAssembly(hand) && hand.plated;
		const surfaceCarriesPlate = isAssembly(onSurface) && onSurface.plated;
		if (handCarriesPlate) {
			hand = combined;
			runtime.item = null;
			emitTaken(stationId, onSurface);
		} else {
			runtime.item = combined;
			hand = null;
			emitPlaced(stationId, onSurface);
		}
		if (surfaceCarriesPlate && !handCarriesPlate) {
			runtime.item = combined;
		}
		emitCombined(stationId, combined, previousDish);
		return ACTION_OK;
	}

	function resetCooker(runtime: StationRuntime): void {
		runtime.cookStatus = "empty";
		runtime.cookItems = [];
		runtime.cookRecipe = null;
		runtime.cookElapsedSec = 0;
	}

	function startCooking(runtime: StationRuntime, transition: CookTransition): void {
		runtime.cookStatus = "cooking";
		runtime.cookRecipe = transition;
		runtime.cookElapsedSec = 0;
		runtime.cookItems = transition.cooking ? [createIngredientFromSpec(transition.cooking)] : runtime.cookItems;
		bus.emit({ type: "cookingStarted", stationId: runtime.config.id, recipe: transition.id });
	}

	function loadCooker(runtime: StationRuntime, ingredient: IngredientItem): InteractResult {
		if (runtime.cookStatus !== "empty" && runtime.cookStatus !== "loading") {
			return rejected("stationOccupied");
		}
		if (isBurntIngredient(ingredient)) {
			return rejected("burntItem");
		}
		const nextItems = [...runtime.cookItems, ingredient];
		const specs = nextItems.map(specOf);
		const transition = findCookTransitions(runtime.config.kind).find((candidate) => isSubMultiset(specs, candidate.inputs));
		if (!transition) {
			return rejected("itemNotAccepted");
		}
		runtime.cookItems = nextItems.map((item) => ({ ...item }));
		runtime.cookRecipe = transition;
		runtime.cookStatus = "loading";
		hand = null;
		emitPlaced(runtime.config.id, ingredient);
		if (isSameMultiset(specs, transition.inputs)) {
			startCooking(runtime, transition);
		}
		return ACTION_OK;
	}

	function takeCooker(runtime: StationRuntime): InteractResult {
		if (runtime.cookStatus === "loading") {
			const returned = runtime.cookItems.pop();
			if (!returned) {
				return rejected("nothingToTake");
			}
			if (runtime.cookItems.length === 0) {
				resetCooker(runtime);
			} else {
				const specs = runtime.cookItems.map(specOf);
				runtime.cookRecipe = findCookTransitions(runtime.config.kind).find((entry) => isSubMultiset(specs, entry.inputs)) ?? null;
			}
			hand = returned;
			emitTaken(runtime.config.id, returned);
			return ACTION_OK;
		}
		if (runtime.cookStatus !== "ready" && runtime.cookStatus !== "burnt") {
			return rejected("nothingToTake");
		}
		const item = runtime.cookItems[0];
		if (!item) {
			return rejected("nothingToTake");
		}
		if (runtime.cookStatus === "ready" && hand !== null) {
			const previousDish = dishOf(hand);
			const combined = combineWithIngredient(menu, hand, item);
			if (!combined) {
				return rejected("itemNotAccepted");
			}
			hand = combined;
			emitCombined(runtime.config.id, combined, previousDish);
		} else if (runtime.cookStatus === "burnt" && hand !== null) {
			return rejected("burntItem");
		} else {
			hand = item;
			emitTaken(runtime.config.id, item);
		}
		resetCooker(runtime);
		return ACTION_OK;
	}

	function interactCooker(runtime: StationRuntime): InteractResult {
		if (hand === null) {
			return takeCooker(runtime);
		}
		if (isIngredient(hand)) {
			return loadCooker(runtime, hand);
		}
		return takeCooker(runtime);
	}

	// Плита: без кастрюли жарит продукты прямо на конфорке (как бывшая сковорода), пустая плита принимает кастрюлю.
	function interactStove(runtime: StationRuntime): InteractResult {
		const onStove = runtime.item;
		if (onStove === null) {
			if (hand?.type !== "pot") {
				return interactCooker(runtime);
			}
			if (runtime.cookStatus !== "empty") {
				return rejected("stationOccupied");
			}
			runtime.item = hand;
			hand = null;
			runtime.potHeating = false;
			emitPlaced(runtime.config.id, runtime.item);
			return ACTION_OK;
		}
		if (onStove.type !== "pot") {
			return rejected("stationOccupied");
		}
		if (hand === null) {
			hand = onStove;
			runtime.item = null;
			runtime.potHeating = false;
			emitTaken(runtime.config.id, hand);
			return ACTION_OK;
		}
		if (isIngredient(hand)) {
			const update = addVegetable(onStove, hand);
			if (!update.ok) {
				return rejected(update.reason);
			}
			runtime.item = update.pot;
			const added = hand;
			hand = null;
			bus.emit({ type: "itemCombined", stationId: runtime.config.id, item: cloneItem(update.pot) });
			emitPlaced(runtime.config.id, added);
			return ACTION_OK;
		}
		if (isAssembly(hand) && hand.plated) {
			return scoopStew(onStove, runtime.config.id);
		}
		return rejected("itemNotAccepted");
	}

	function interactTap(runtime: StationRuntime): InteractResult {
		if (hand?.type !== "pot") {
			return rejected(hand === null ? "handEmpty" : "itemNotAccepted");
		}
		if (!hand.hasWater) {
			hand = { ...hand, hasWater: true };
			bus.emit({ type: "potWaterFilled", stationId: runtime.config.id });
		}
		return ACTION_OK;
	}

	function interactPlateStack(runtime: StationRuntime): InteractResult {
		if (hand === null) {
			hand = createEmptyPlate();
			emitTaken(runtime.config.id, hand);
			return ACTION_OK;
		}
		if (isAssembly(hand) && hand.plated && hand.contents.length === 0) {
			const returned = hand;
			hand = null;
			emitPlaced(runtime.config.id, returned);
			return ACTION_OK;
		}
		const plated = plateItem(menu, hand);
		if (!plated) {
			return rejected(isBurntIngredient(hand) ? "burntItem" : "plateNotAccepted");
		}
		const previousDish = dishOf(hand);
		hand = plated;
		if (plated.dish !== null && plated.dish !== previousDish) {
			bus.emit({ type: "dishAssembled", dish: plated.dish, plated: true });
		}
		bus.emit({ type: "itemCombined", stationId: runtime.config.id, item: cloneItem(hand) });
		return ACTION_OK;
	}

	function interactTrash(): InteractResult {
		if (hand === null) {
			return rejected("handEmpty");
		}
		if (hand.type === "pot") {
			return rejected("itemNotAccepted");
		}
		const trashed = hand;
		hand = null;
		bus.emit({ type: "itemTrashed", item: cloneItem(trashed) });
		return ACTION_OK;
	}

	function interactServingWindow(): InteractResult {
		if (hand === null) {
			return rejected("handEmpty");
		}
		if (!isAssembly(hand)) {
			return rejected(dishOf(hand) !== null ? "dishNotPlated" : "dishNotReady");
		}
		if (!hand.plated) {
			return rejected("dishNotPlated");
		}
		if (hand.dish === null) {
			return rejected("dishNotReady");
		}
		const result = servingWindow.tryAccept(hand);
		if (!result.ok) {
			return rejected(result.reason);
		}
		hand = null;
		return ACTION_OK;
	}

	function stepCutting(dtSec: number): void {
		cuttingStationId = null;
		if (workStationId === null) {
			return;
		}
		const runtime = stationsById.get(workStationId);
		if (!runtime || runtime.config.kind !== "counter" && runtime.config.kind !== "cuttingBoard" || runtime.item === null || !isIngredient(runtime.item)) {
			return;
		}
		const transition = findCutTransition(runtime.item);
		if (!transition) {
			return;
		}
		cuttingStationId = runtime.config.id;
		const factor = runtime.config.kind === "cuttingBoard" ? params.boardCutDurationFactor : 1;
		const durationSec = params.cutSec * factor;
		runtime.cutProgressSec += dtSec;
		if (runtime.cutProgressSec + TIME_EPSILON_SEC >= durationSec) {
			runtime.item = createIngredientFromSpec(transition.output);
			runtime.cutProgressSec = durationSec;
			bus.emit({ type: "cuttingDone", stationId: runtime.config.id });
		}
	}

	function stepCooker(runtime: StationRuntime, dtSec: number): void {
		const transition = runtime.cookRecipe;
		if (!transition) {
			return;
		}
		const timing = params.cooking[transition.id];
		if (runtime.cookStatus === "cooking") {
			runtime.cookElapsedSec += dtSec;
			const cookDurationSec = timing.cookSec * params.cookDurationFactor;
			if (runtime.cookElapsedSec + TIME_EPSILON_SEC >= cookDurationSec) {
				const excess = Math.max(0, runtime.cookElapsedSec - cookDurationSec);
				runtime.cookStatus = "ready";
				runtime.cookItems = [createIngredientFromSpec(transition.cooked)];
				runtime.cookElapsedSec = timing.burnSec === null ? 0 : excess;
				bus.emit({ type: "cookingDone", stationId: runtime.config.id, recipe: transition.id });
				if (timing.burnSec !== null && excess + TIME_EPSILON_SEC >= timing.burnSec) {
					runtime.cookStatus = "burnt";
					runtime.cookItems = [createIngredientFromSpec(transition.burnt)];
					runtime.cookElapsedSec = 0;
					bus.emit({ type: "itemBurnt", stationId: runtime.config.id });
				}
			}
		} else if (runtime.cookStatus === "ready" && timing.burnSec !== null) {
			runtime.cookElapsedSec += dtSec;
			if (runtime.cookElapsedSec + TIME_EPSILON_SEC >= timing.burnSec) {
				runtime.cookStatus = "burnt";
				runtime.cookItems = [createIngredientFromSpec(transition.burnt)];
				runtime.cookElapsedSec = 0;
				bus.emit({ type: "itemBurnt", stationId: runtime.config.id });
			}
		}
	}

	function stepPot(runtime: StationRuntime, dtSec: number): void {
		const pot = runtime.item;
		if (runtime.config.kind !== "stove" || pot?.type !== "pot") {
			runtime.potHeating = false;
			return;
		}
		const fullSet = pot.hasWater && pot.portions === 0 && isSameMultiset(pot.contents.map(specOf), potRecipe.inputs);
		if (!fullSet) {
			runtime.potHeating = false;
			return;
		}
		if (!runtime.potHeating) {
			runtime.potHeating = true;
			bus.emit({ type: "cookingStarted", stationId: runtime.config.id, recipe: "stew" });
		}
		const cookDurationSec = params.cooking.stew.cookSec * params.cookDurationFactor;
		const cookProgressSec = pot.cookProgressSec + dtSec;
		if (cookProgressSec + TIME_EPSILON_SEC >= cookDurationSec) {
			runtime.item = { ...pot, contents: [], cookProgressSec: 0, portions: params.stewPortionsPerBatch };
			runtime.potHeating = false;
			bus.emit({ type: "cookingDone", stationId: runtime.config.id, recipe: "stew" });
		} else {
			runtime.item = { ...pot, cookProgressSec };
		}
	}

	function snapshotOf(runtime: StationRuntime): StationSnapshot {
		const { id, kind } = runtime.config;
		const base: StationSnapshot = { id, kind, items: [], phase: "idle", progress: 0, burnProgress: 0, portions: 0, isHeating: false };
		if (kind === "counter" || kind === "cuttingBoard") {
			const item = runtime.item;
			if (item === null) {
				return base;
			}
			const items = [cloneItem(item)];
			if (!isIngredient(item) || !findCutTransition(item)) {
				const ready: StationPhase = isAssembly(item) && item.dish !== null ? "ready" : "holding";
				return { ...base, items, phase: ready, progress: isIngredient(item) && item.state === "chopped" ? 1 : 0 };
			}
			const factor = kind === "cuttingBoard" ? params.boardCutDurationFactor : 1;
			const duration = params.cutSec * factor;
			return {
				...base,
				items,
				phase: cuttingStationId === id ? "processing" : "holding",
				progress: ratioOf(runtime.cutProgressSec, duration),
			};
		}
		if (kind === "oven" || kind === "stove" && runtime.item?.type !== "pot") {
			const items = runtime.cookItems.map((item) => cloneItem(item));
			const transition = runtime.cookRecipe;
			const timing = transition ? params.cooking[transition.id] : null;
			switch (runtime.cookStatus) {
				case "loading":
					return { ...base, items, phase: "holding" };
				case "cooking":
					return {
						...base,
						items,
						phase: "processing",
						progress: ratioOf(runtime.cookElapsedSec, timing ? timing.cookSec * params.cookDurationFactor : 0),
						isHeating: true,
					};
				case "ready":
					return {
						...base,
						items,
						phase: "ready",
						progress: 1,
						burnProgress: timing?.burnSec === null || !timing ? 0 : ratioOf(runtime.cookElapsedSec, timing.burnSec),
					};
				case "burnt":
					return { ...base, items, phase: "burnt", progress: 1, burnProgress: 1 };
				default:
					return base;
			}
		}
		if (kind === "stove" && runtime.item?.type === "pot") {
			const pot = runtime.item;
			const ready = pot.portions > 0;
			const processing = runtime.potHeating;
			return {
				...base,
				items: [cloneItem(pot)],
				phase: ready ? "ready" : processing ? "processing" : "holding",
				progress: ready ? 1 : ratioOf(pot.cookProgressSec, params.cooking.stew.cookSec * params.cookDurationFactor),
				portions: pot.portions,
				isHeating: processing,
			};
		}
		if (runtime.item !== null) {
			const ready = isAssembly(runtime.item) && runtime.item.dish !== null;
			return { ...base, items: [cloneItem(runtime.item)], phase: ready ? "ready" : "holding" };
		}
		return base;
	}

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
				case "cuttingBoard":
					result = interactSurface(runtime);
					break;
				case "oven":
					result = interactCooker(runtime);
					break;
				case "stove":
					result = interactStove(runtime);
					break;
				case "tap":
					result = interactTap(runtime);
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
				if (runtime.config.kind === "oven") {
					stepCooker(runtime, dtSec);
				} else if (runtime.config.kind === "stove") {
					if (runtime.item?.type === "pot") {
						stepPot(runtime, dtSec);
					} else {
						runtime.potHeating = false;
						stepCooker(runtime, dtSec);
					}
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
