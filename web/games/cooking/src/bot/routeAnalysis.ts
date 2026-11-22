// Разбор маршрутов повара по кухне: для каждого блюда цепочка станций, которую проходит повар от окна выдачи до окна,
// длина пути по навигационной сетке (A* навигатора бота, рабочие точки станций) и частота переходов между станциями.
// По этим числам выбрана расстановка кухни (config/levels/sharedLayout.ts, docs/cooking.md, раздел "Планировка кухни").
// Ожидание готовности не считается: повар в это время занят другим блюдом. Модуль чистый, без DOM и three.js.
import type { DishId, LevelConfig, StationConfig, StationId, Vec2 } from "../contracts";
import { buildGeometry } from "../sim/geometry";
import { createChefNavigator, type ChefNavigator } from "./chefNav";

// Шаг цепочки: конкретная станция или любая из станций вида (повар выбирает ближайшую, например свободную плиту для жарки).
type ChainStep = { label: string; candidates: StationId[] };

// Маршрут блюда: последовательность шагов и доля блюда, которую он покрывает (рагу варится на две порции за раз).
interface DishTour {
	steps: ChainStep[];
	share: number;
}

// Итог по блюду.
export interface DishRoute {
	dish: DishId;
	// Названия станций по порядку (для отчёта), путь в единицах мира и секундах на одно блюдо.
	chain: string[];
	distance: number;
	walkSec: number;
}

// Итог по кухне.
export interface KitchenRouteReport {
	routes: DishRoute[];
	// Средний путь на блюдо меню (все блюда меню одинаково часты), единицы мира и секунды.
	averageDistance: number;
	averageWalkSec: number;
	// Переходы между станциями на одно блюдо меню в среднем: "станция A -> станция B" и сколько раз.
	transitions: Array<{ from: string; to: string; count: number }>;
}

// Подпись станции для отчёта: вид и ингредиент ящика.
function labelOf(station: StationConfig): string {
	if (station.kind === "crate") return `ящик ${station.ingredient}`;
	if (station.kind === "stove") return station.startItem === "pot" ? "плита с кастрюлей" : "плита";
	const names: Partial<Record<StationConfig["kind"], string>> = {
		counter: "прилавок",
		cuttingBoard: "доска",
		oven: "духовка",
		plateStack: "тарелки",
		trash: "урна",
		servingWindow: "окно",
		tap: "раковина",
	};
	return names[station.kind] ?? station.kind;
}

// Строит маршруты блюд меню уровня. null, если для блюда на кухне нет нужных станций.
function buildTours(level: LevelConfig): Map<DishId, DishTour[]> {
	const find = (predicate: (station: StationConfig) => boolean): StationConfig[] => level.stations.filter(predicate);
	const step = (stations: StationConfig[]): ChainStep | null => (stations.length === 0 ? null : { label: labelOf(stations[0]), candidates: stations.map((station) => station.id) });
	const crate = (ingredient: string) => step(find((station) => station.kind === "crate" && station.ingredient === ingredient));
	const window = step(find((station) => station.kind === "servingWindow"));
	const plates = step(find((station) => station.kind === "plateStack"));
	const board = step(find((station) => station.kind === "cuttingBoard"));
	const fryStoves = step(find((station) => station.kind === "stove" && station.startItem !== "pot"));
	const oven = step(find((station) => station.kind === "oven"));
	const potStove = step(find((station) => station.kind === "stove" && station.startItem === "pot"));
	const sink = step(find((station) => station.kind === "tap"));
	const tours = new Map<DishId, DishTour[]>();
	const add = (dish: DishId, share: number, steps: Array<ChainStep | null>) => {
		if (steps.every((entry): entry is ChainStep => entry !== null)) {
			(tours.get(dish) ?? tours.set(dish, []).get(dish)!).push({ steps, share });
		}
	};
	// Окорок: ветчину в духовку, готовую на тарелку, в окно.
	add("ham", 1, [window, crate("ham"), oven, plates, window]);
	// Стейк: целый стейк на плиту, готовый на тарелку, в окно.
	add("steak", 1, [window, crate("steak"), fryStoves, plates, window]);
	// Бургер: стейк нарезать на доске, пожарить, к котлете булочку, на тарелку, в окно.
	add("burger", 1, [window, crate("steak"), board, fryStoves, crate("bun"), plates, window]);
	// Овощной бургер: картофель и морковь нарезать и положить на одну плиту, затем булочка и тарелка.
	add("veggieBurger", 1, [window, crate("potato"), board, fryStoves, crate("carrot"), board, fryStoves, crate("bun"), plates, window]);
	// Рагу: кастрюлю с плиты налить в раковине и вернуть, три овоща нарезать и положить в кастрюлю; две порции на тарелки.
	const stewBatch = [window, potStove, sink, potStove, crate("carrot"), board, potStove, crate("potato"), board, potStove, crate("onion"), board, potStove, plates, potStove, window];
	const stewSecond = [window, plates, potStove, window];
	const portions = level.params.kitchen.stewPortionsPerBatch;
	add("stew", 1 / portions, stewBatch);
	add("stew", (portions - 1) / portions, stewSecond);
	return tours;
}

// Кратчайший проход цепочки: на каждом шаге выбирается станция из кандидатов и её рабочая точка (динамика по слоям).
// Плита для жарки на всех шагах одного маршрута одна и та же (котлета не переезжает), поэтому кандидаты перебираются целиком.
function shortestTour(steps: ChainStep[], navigator: ChefNavigator, distanceCache: Map<string, number>): { distance: number; chain: string[] } {
	const multi = [...new Set(steps.filter((entry) => entry.candidates.length > 1).map((entry) => entry.label))];
	const choices = multi.map((label) => steps.find((entry) => entry.label === label)!.candidates);
	let best = { distance: Infinity, chain: [] as string[] };
	const combos: StationId[][] = [[]];
	for (const options of choices) {
		const next: StationId[][] = [];
		combos.forEach((combo) => options.forEach((option) => next.push([...combo, option])));
		combos.splice(0, combos.length, ...next);
	}
	for (const combo of combos) {
		const stationIds = steps.map((entry) => (entry.candidates.length > 1 ? combo[multi.indexOf(entry.label)] : entry.candidates[0]));
		const layers = stationIds.map((id) => navigator.getWorkSpots(id).map((spot) => spot.position));
		let costs = layers[0].map(() => 0);
		for (let index = 1; index < layers.length; index += 1) {
			costs = layers[index].map((to) => Math.min(...layers[index - 1].map((from, fromIndex) => costs[fromIndex] + walk(from, to, navigator, distanceCache))));
		}
		const distance = Math.min(...costs);
		if (distance < best.distance) {
			best = { distance, chain: stationIds };
		}
	}
	return best;
}

// Длина пути между точками с кэшем.
function walk(from: Vec2, to: Vec2, navigator: ChefNavigator, cache: Map<string, number>): number {
	const key = `${from.x.toFixed(2)},${from.z.toFixed(2)}>${to.x.toFixed(2)},${to.z.toFixed(2)}`;
	let length = cache.get(key);
	if (length === undefined) {
		length = navigator.pathLength(from, to) ?? 1e6;
		cache.set(key, length);
	}
	return length;
}

// Разбор маршрутов для меню уровня (уровень уже обставлен на нужный день: config/levels/campaign.ts).
export function analyzeKitchenRoutes(level: LevelConfig): KitchenRouteReport {
	// Рабочие точки по сторонам ограничены разумной выборкой: лучшая точка напротив центра и по одной сбоку.
	const navigator = createChefNavigator(level, buildGeometry(level));
	const sparseNavigator: ChefNavigator = { ...navigator, getWorkSpots: (id) => thinSpots(navigator.getWorkSpots(id)) };
	const byId = new Map(level.stations.map((station) => [station.id, station]));
	const tours = buildTours(level);
	const cache = new Map<string, number>();
	const routes: DishRoute[] = [];
	const transitionCounts = new Map<string, number>();
	for (const dish of level.params.menu) {
		const dishTours = tours.get(dish);
		if (!dishTours) {
			continue;
		}
		let distance = 0;
		let chain: string[] = [];
		for (const tour of dishTours) {
			const result = shortestTour(tour.steps, sparseNavigator, cache);
			distance += result.distance * tour.share;
			const labels = result.chain.map((id) => labelOf(byId.get(id)!));
			if (chain.length === 0) chain = labels;
			for (let index = 1; index < labels.length; index += 1) {
				if (result.chain[index] === result.chain[index - 1]) continue;
				const key = `${labels[index - 1]}|${labels[index]}`;
				transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + tour.share / level.params.menu.length);
			}
		}
		routes.push({ dish, chain, distance, walkSec: distance / level.params.player.speed });
	}
	const averageDistance = routes.reduce((sum, route) => sum + route.distance, 0) / Math.max(1, routes.length);
	const transitions = [...transitionCounts.entries()]
		.map(([key, count]) => ({ from: key.split("|")[0], to: key.split("|")[1], count }))
		.sort((first, second) => second.count - first.count);
	return { routes, averageDistance, averageWalkSec: averageDistance / level.params.player.speed, transitions };
}

// Не больше трёх рабочих точек на сторону станции: напротив центра и крайние (ускоряет перебор без потери точности).
function thinSpots<T extends { facing: number }>(spots: readonly T[]): T[] {
	const bySide = new Map<number, T[]>();
	spots.forEach((spot) => (bySide.get(spot.facing) ?? bySide.set(spot.facing, []).get(spot.facing)!).push(spot));
	return [...bySide.values()].flatMap((side) => (side.length <= 3 ? side : [side[0], side[side.length - 2], side[side.length - 1]]));
}
