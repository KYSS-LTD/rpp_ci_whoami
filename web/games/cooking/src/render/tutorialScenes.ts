// Сцены GIF-подсказок рецептов (страница tutorial-capture.html, только для разработки). Каждый шаг рецепта - небольшая сцена из
// настоящих моделей игры: функция update(t) ставит объекты для момента t от 0 до 1 и возвращает подписи (клавиши, полосы прогресса).
import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Scene, SphereGeometry, Vector3 } from "three";
import { MODEL_SCALE, type DishId, type IngredientKind, type ItemState, type PotItem } from "../contracts";
import type { LoadedAssets } from "./assets";
import type { ItemVisualFactory } from "./items";

// Высоты поверхностей в мировых единицах (см. stationSurfaceHeights в stations.ts).
export const COUNTER_TOP = 0.5;
export const BOARD_TOP = COUNTER_TOP + 0.075;
export const STOVE_TOP = 0.57;
export const OVEN_TOP = 1.0;

export interface Ctx {
	scene: Scene;
	assets: LoadedAssets;
	items: ItemVisualFactory;
	// Модель пака в мировых координатах (масштаб MODEL_SCALE, начало координат модели).
	put(modelName: string, x: number, y: number, z: number, yaw?: number): Group;
	// Добавляет объект предмета в сцену и ставит его.
	item(object: Object3D, x: number, y: number, z: number): Object3D;
}

// Подпись поверх кадра: клавиша действия или две полосы прогресса (зелёная готовка, красная подгорание).
export interface Overlay {
	at: Vector3;
	kind: "key" | "bars";
	label?: string;
	green?: number;
	red?: number;
	alpha?: number;
}

export interface SceneRun {
	// Ставит сцену в момент t (0..1), возвращает подписи кадра.
	update(t: number): Overlay[];
	// Момент кадра-постера для режима reduced motion.
	posterT: number;
	// Камера: расстояние до цели и сдвиг цели по x и y (по умолчанию 4.3 и центр кухни).
	view?: { distance: number; x?: number; y?: number };
}

export type SceneBuilder = (ctx: Ctx) => SceneRun;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => k * k * (3 - 2 * k);
// Доля отрезка [from, to] времени t.
const seg = (t: number, from: number, to: number): number => clamp01((t - from) / (to - from));
const show = (object: Object3D, visible: boolean): void => {
	object.visible = visible;
};
const key = (label: string, x: number, y: number, z = 0.1, alpha = 1): Overlay => ({ kind: "key", label, at: new Vector3(x, y, z), alpha });

// Перелёт предмета из точки в точку по дуге. k от 0 до 1.
function fly(object: Object3D, from: Vector3, to: Vector3, k: number, arc = 0.4): void {
	const eased = ease(k);
	object.position.set(lerp(from.x, to.x, eased), lerp(from.y, to.y, eased) + Math.sin(eased * Math.PI) * arc, lerp(from.z, to.z, eased));
}

const v = (x: number, y: number, z = 0): Vector3 => new Vector3(x, y, z);

// Ингредиент игры: ссылка на пару "вид + состояние".
function ingredient(ctx: Ctx, kind: IngredientKind, state: ItemState): Object3D {
	return ctx.item(ctx.items.createSpecVisual({ kind, state }).object, 0, -10, 0);
}

// Стопка без тарелки: булочка, котлета и вторая булочка (как готовый бургер в руках).
function burgerStack(ctx: Ctx, patty: IngredientKind, withTop: boolean): Object3D {
	const group = new Group();
	const bottom = ctx.assets.cloneModel("food_ingredient_bun_bottom");
	const meat = ctx.items.createSpecVisual({ kind: patty, state: "cooked" }).object;
	group.add(wrapScaled(bottom, 0));
	meat.position.y = 0.1;
	group.add(meat);
	if (withTop) {
		const top = wrapScaled(ctx.assets.cloneModel("food_ingredient_bun_top"), 0.2);
		group.add(top);
	}
	ctx.scene.add(group);
	group.position.y = -10;
	return group;
}

// Модель пака с масштабом игры, основание на высоте y внутри группы.
function wrapScaled(model: Object3D, y: number): Object3D {
	const wrapper = new Group();
	wrapper.add(model);
	wrapper.scale.setScalar(MODEL_SCALE);
	wrapper.position.y = y;
	return wrapper;
}

function potItem(ctx: Ctx, options: Partial<PotItem> & { contents?: PotItem["contents"] }): Object3D {
	const pot: PotItem = { type: "pot", hasWater: false, contents: [], cookProgressSec: 0, portions: 0, ...options };
	return ctx.item(ctx.items.createItemVisual(pot).object, 0, -10, 0);
}

function steam(ctx: Ctx): { update(x: number, y: number, z: number, t: number, strength: number): void } {
	const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
	const puffs: Mesh[] = [];
	for (let index = 0; index < 5; index += 1) {
		const puff = new Mesh(new SphereGeometry(0.06, 10, 8), material.clone());
		ctx.scene.add(puff);
		puffs.push(puff);
	}
	return {
		update(x, y, z, t, strength) {
			puffs.forEach((puff, index) => {
				const phase = (t * 2 + index / puffs.length) % 1;
				puff.position.set(x + Math.sin(phase * 6 + index) * 0.07, y + phase * 0.5, z + Math.cos(index) * 0.05);
				puff.scale.setScalar(0.6 + phase * 1.2);
				(puff.material as MeshBasicMaterial).opacity = strength * 0.55 * (1 - phase);
				puff.visible = strength > 0.02;
			});
		},
	};
}

// Кран: у игры нет модели крана, он рисуется примитивами (труба и носик над прилавком).
function createTap(ctx: Ctx, x: number, z: number): { stream: Mesh } {
	const metal = new MeshStandardMaterial({ color: 0xaab4bd, metalness: 0.4, roughness: 0.4 });
	const pipe = new Mesh(new CylinderGeometry(0.05, 0.05, 0.5, 12), metal);
	pipe.position.set(x, COUNTER_TOP + 0.25, z);
	const spout = new Mesh(new CylinderGeometry(0.045, 0.045, 0.3, 12), metal);
	spout.rotation.x = Math.PI / 2;
	spout.position.set(x, COUNTER_TOP + 0.5, z + 0.15);
	const stream = new Mesh(new CylinderGeometry(0.025, 0.025, 1, 8), new MeshBasicMaterial({ color: 0x57bde0 }));
	stream.position.set(x, COUNTER_TOP + 0.3, z + 0.3);
	ctx.scene.add(pipe, spout, stream);
	return { stream };
}

// --- Общие сцены ---

// Взять предмет из ящика: предмет перелетает в воздух над прилавком (держим в руках).
function takeScene(crateModel: string, make: (ctx: Ctx) => Object3D): SceneBuilder {
	return (ctx) => {
		ctx.put(crateModel, -0.95, 0, 0);
		ctx.put("kitchencounter_straight_A", 0.6, 0, 0);
		const held = make(ctx);
		return {
			posterT: 0.95,
			view: { distance: 3.5, x: -0.15, y: 0.65 },
			update(t) {
				const move = seg(t, 0.15, 0.6);
				fly(held, v(-0.95, 0.62), v(0.6, COUNTER_TOP + 0.45), move, 0.5);
				held.position.y += Math.sin(t * Math.PI * 4) * 0.02 * seg(t, 0.6, 1);
				return t < 0.55 ? [key("E", -0.95, 0.95)] : [];
			},
		};
	};
}

// Готовка на сковороде: сырое меняется на готовое, зелёная полоса растёт, красная начинает расти после готовности.
function panScene(rawMake: (ctx: Ctx, x: number, z: number) => Object3D, cookedMake: (ctx: Ctx) => Object3D): SceneBuilder {
	return (ctx) => {
		ctx.put("stove_single", 0, 0, 0);
		ctx.put("pan_A", 0, STOVE_TOP, 0.05, 0);
		const raw = rawMake(ctx, 0, 0.05);
		const cooked = cookedMake(ctx);
		const fumes = steam(ctx);
		return {
			posterT: 0.62,
			view: { distance: 2.7, y: 0.7 },
			update(t) {
				const green = clamp01(t / 0.55);
				const red = seg(t, 0.62, 1) * 0.45;
				const done = green >= 1;
				raw.position.set(0, STOVE_TOP + 0.07, 0.05);
				cooked.position.set(0, STOVE_TOP + 0.07, 0.05);
				show(raw, !done);
				show(cooked, done);
				fumes.update(0, STOVE_TOP + 0.2, 0.05, t, done ? 0.6 : 1);
				return [{ kind: "bars", at: v(0, 1.15, 0.05), green, red }];
			},
		};
	};
}

// Тарелка: тарелка летит со стойки на прилавок, готовое блюдо из рук ложится на неё и становится блюдом на тарелке.
function plateScene(heldMake: (ctx: Ctx) => Object3D, dish: DishId): SceneBuilder {
	return (ctx) => {
		ctx.put("kitchencounter_straight_A", 0.15, 0, 0);
		ctx.put("kitchencounter_straight_A", -0.85, 0, 0);
		ctx.put("dishrack_plates", -0.85, COUNTER_TOP, 0);
		const plate = ctx.item(ctx.items.createItemVisual({ type: "assembly", plated: true, dish: null, contents: [] }).object, 0, 0, 0);
		const held = heldMake(ctx);
		const result = ctx.item(ctx.items.createDishVisual(dish).object, 0.15, COUNTER_TOP, 0);
		return {
			posterT: 0.97,
			view: { distance: 4.0, x: -0.35, y: 0.8 },
			update(t) {
				const platePath = seg(t, 0.05, 0.35);
				const servedDish = t >= 0.78;
				fly(plate, v(-0.85, COUNTER_TOP + 0.6), v(0.15, COUNTER_TOP), platePath, 0.3);
				const heldPath = seg(t, 0.4, 0.75);
				fly(held, v(0.15, COUNTER_TOP + 0.9), v(0.15, COUNTER_TOP + 0.12), heldPath, 0.0);
				if (heldPath === 0) held.position.set(0.15, COUNTER_TOP + 0.9 + Math.sin(t * Math.PI * 6) * 0.03, 0);
				show(plate, !servedDish);
				show(held, !servedDish);
				show(result, servedDish);
				const overlays: Overlay[] = [];
				if (t < 0.35) overlays.push(key("E", -0.85, 1.7));
				else if (t < 0.78) overlays.push(key("E", 0.15, 1.5));
				return overlays;
			},
		};
	};
}

// Сдача в окно выдачи: блюдо на тарелке перелетает с прилавка на подоконник окна выдачи.
function serveScene(heldMake: ((ctx: Ctx) => Object3D) | null, dish: DishId, staticMake?: (ctx: Ctx) => Object3D): SceneBuilder {
	return (ctx) => {
		ctx.put("kitchencounter_straight_A", -1.1, 0, 0);
		ctx.put("dishrack_plates", -1.1, COUNTER_TOP, staticMake ? -0.25 : 0);
		ctx.put("wall_orderwindow", 1.0, 0, -0.8);
		const held = heldMake ? heldMake(ctx) : null;
		const still = staticMake ? staticMake(ctx) : null;
		const result = ctx.item(ctx.items.createDishVisual(dish).object, 0, 0, 0);
		return {
			posterT: 0.97,
			view: { distance: 4.3, x: 0.1, y: 0.95 },
			update(t) {
				const toPlate = ease(seg(t, 0.05, 0.35));
				const toWindow = ease(seg(t, 0.5, 0.88));
				const plated = t >= 0.35;
				if (held) {
					show(held, !plated);
					held.position.set(lerp(-0.6, -1.1, toPlate), lerp(COUNTER_TOP + 0.5, COUNTER_TOP + 0.95, toPlate) + Math.sin(toPlate * Math.PI) * 0.2, 0);
				}
				if (still) still.position.set(-1.1, COUNTER_TOP, 0.3);
				show(result, plated);
				result.position.set(lerp(-1.1, 0.95, toWindow), lerp(COUNTER_TOP + 0.95, 0.55, toWindow) + Math.sin(toWindow * Math.PI) * 0.45, lerp(0, -0.35, toWindow));
				const overlays: Overlay[] = [];
				if (t < 0.4) overlays.push(key("E", -1.1, 1.75));
				else if (t < 0.9) overlays.push(key("E", 0.95, 1.2, -0.3, seg(t, 0.4, 0.5)));
				return overlays;
			},
		};
	};
}

// --- Окорок ---

const hamTake = takeScene("crate_ham", (ctx) => ingredient(ctx, "ham", "raw"));

const hamCook: SceneBuilder = (ctx) => {
	ctx.put("oven", 0, 0, 0);
	const raw = ingredient(ctx, "ham", "raw");
	const cooked = ingredient(ctx, "ham", "cooked");
	const fumes = steam(ctx);
	return {
		posterT: 0.62,
		view: { distance: 3.6, y: 0.85 },
		update(t) {
			const green = clamp01(t / 0.55);
			const red = seg(t, 0.62, 1) * 0.45;
			const done = green >= 1;
			raw.position.set(0, OVEN_TOP, 0.1);
			cooked.position.set(0, OVEN_TOP, 0.1);
			show(raw, !done);
			show(cooked, done);
			fumes.update(0, OVEN_TOP + 0.15, 0.1, t, done ? 0.5 : 0.9);
			return [{ kind: "bars", at: v(0, 1.9, 0.1), green, red }];
		},
	};
};

const hamPlate = plateScene((ctx) => ingredient(ctx, "ham", "cooked"), "ham");
const hamServe = serveScene((ctx) => ingredient(ctx, "ham", "cooked"), "ham");

// --- Стейк ---

const steakTake = takeScene("crate_steak", (ctx) => ingredient(ctx, "steak", "raw"));
const steakCook = panScene((ctx) => ingredient(ctx, "friedSteak", "raw"), (ctx) => ingredient(ctx, "friedSteak", "cooked"));
const steakPlate = plateScene((ctx) => ingredient(ctx, "friedSteak", "cooked"), "steak");
const steakServe = serveScene((ctx) => ingredient(ctx, "friedSteak", "cooked"), "steak");

// --- Бургер ---

// Шаг 1: взять стейк из ящика и нарезать на доске.
const burgerPrepare: SceneBuilder = (ctx) => {
	ctx.put("crate_steak", -0.95, 0, 0);
	ctx.put("kitchencounter_straight_A", 0.6, 0, 0);
	ctx.put("cuttingboard", 0.6, COUNTER_TOP, 0);
	const steak = ingredient(ctx, "steak", "raw");
	const pieces = ingredient(ctx, "steak", "chopped");
	return {
		posterT: 0.95,
		view: { distance: 3.5, x: -0.15, y: 0.6 },
		update(t) {
			const move = seg(t, 0.08, 0.42);
			const chopping = seg(t, 0.5, 0.88);
			const chopped = t >= 0.88;
			show(steak, !chopped);
			show(pieces, chopped);
			fly(steak, v(-0.95, 0.62), v(0.6, BOARD_TOP), move, 0.45);
			if (chopping > 0 && !chopped) steak.position.y = BOARD_TOP + Math.abs(Math.sin(chopping * Math.PI * 4)) * 0.08;
			pieces.position.set(0.6, BOARD_TOP, 0);
			pieces.scale.setScalar(chopped ? 1 + Math.max(0, 0.25 - seg(t, 0.88, 1) * 0.25) : 1);
			const overlays: Overlay[] = [];
			if (t < 0.4) overlays.push(key("E", -0.95, 0.95));
			else if (!chopped) {
				overlays.push(key("Q", 0.6, 1.05));
				overlays.push({ kind: "bars", at: v(0.6, 1.55, 0), green: chopping, red: 0 });
			}
			return overlays;
		},
	};
};

const burgerCook = panScene((ctx) => ingredient(ctx, "patty", "raw"), (ctx) => ingredient(ctx, "patty", "cooked"));

// Во сколько раз бургер в руках крупнее игрового, чтобы собранный бургер был хорошо виден в маленьком кадре.
const BIG = 1.6;

// Бургер из котлеты и булочек: котлета в руках, булочка летит из ящика и ложится сверху, получается бургер.
function assembleScene(patty: IngredientKind): SceneBuilder {
	return (ctx) => {
		ctx.put("kitchencounter_straight_A", -0.45, 0, 0);
		ctx.put("crate_buns", 1.05, 0, 0);
		const base = new Group();
		const bottom = wrapScaled(ctx.assets.cloneModel("food_ingredient_bun_bottom"), 0);
		const meat = ctx.items.createSpecVisual({ kind: patty, state: "cooked" }).object;
		meat.position.y = 0.1;
		base.add(bottom, meat);
		ctx.scene.add(base);
		const top = wrapScaled(ctx.assets.cloneModel("food_ingredient_bun_top"), 0);
		ctx.scene.add(top);
		return {
			posterT: 0.97,
			view: { distance: 3.4, x: 0.3, y: 0.95 },
			update(t) {
				const move = seg(t, 0.2, 0.6);
				const hover = COUNTER_TOP + 0.3 + Math.sin(t * Math.PI * 4) * 0.02;
				base.position.set(-0.45, hover, 0);
				base.scale.setScalar(BIG);
				fly(top, v(1.05, 0.55), v(-0.45, hover + 0.2 * BIG), move, 0.4);
				if (move >= 1) top.position.set(-0.45, hover + 0.2 * BIG - Math.sin(seg(t, 0.6, 0.75) * Math.PI) * 0.05, 0);
				top.scale.setScalar(BIG * MODEL_SCALE * (1 + Math.sin(seg(t, 0.6, 0.78) * Math.PI) * 0.1));
				return t < 0.55 ? [key("E", 1.05, 1.05)] : [];
			},
		};
	};
}

// Бургер на сдачу: стопка булка-котлета-булка вместо отдельных ингредиентов.
const burgerAssemble = assembleScene("patty");
const burgerServe = serveScene((ctx) => burgerStack(ctx, "patty", true), "burger");

// --- Овощной бургер ---

const veggiePrepare: SceneBuilder = (ctx) => {
	ctx.put("crate_potatoes", -1.35, 0, 0);
	ctx.put("crate_carrots", -0.35, 0, 0);
	ctx.put("kitchencounter_straight_A", 0.95, 0, 0);
	ctx.put("cuttingboard", 0.95, COUNTER_TOP, 0);
	const potato = ingredient(ctx, "potato", "raw");
	const carrot = ingredient(ctx, "carrot", "raw");
	const potatoCut = ingredient(ctx, "potato", "chopped");
	const carrotCut = ingredient(ctx, "carrot", "chopped");
	return {
		posterT: 0.95,
		view: { distance: 4.2, x: -0.2, y: 0.6 },
		update(t) {
			const chopping = seg(t, 0.55, 0.88);
			const chopped = t >= 0.88;
			show(potato, !chopped);
			show(carrot, !chopped);
			show(potatoCut, chopped);
			show(carrotCut, chopped);
			fly(potato, v(-1.35, 0.6), v(0.8, BOARD_TOP), seg(t, 0.05, 0.3), 0.5);
			fly(carrot, v(-0.35, 0.6), v(1.1, BOARD_TOP), seg(t, 0.3, 0.52), 0.5);
			potatoCut.position.set(0.8, BOARD_TOP, 0);
			carrotCut.position.set(1.1, BOARD_TOP, 0);
			const overlays: Overlay[] = [];
			if (t < 0.5) overlays.push(key("E", t < 0.28 ? -1.35 : -0.35, 0.95));
			else if (!chopped) {
				overlays.push(key("Q", 0.95, 1.05));
				overlays.push({ kind: "bars", at: v(0.95, 1.55, 0), green: chopping, red: 0 });
			}
			return overlays;
		},
	};
};

const veggieCook = panScene((ctx) => ingredient(ctx, "veggiePatty", "raw"), (ctx) => ingredient(ctx, "veggiePatty", "cooked"));
const veggieAssemble = assembleScene("veggiePatty");
const veggieServe = serveScene((ctx) => burgerStack(ctx, "veggiePatty", true), "veggieBurger");

// --- Рагу ---

// Шаг 1: взять пустую кастрюлю со стола.
const stewPot: SceneBuilder = (ctx) => {
	ctx.put("kitchencounter_straight_A", 0, 0, 0);
	const pot = potItem(ctx, {});
	return {
		posterT: 0.95,
		view: { distance: 3.2, y: 0.8 },
		update(t) {
			const lift = ease(seg(t, 0.3, 0.7));
			pot.position.set(0, COUNTER_TOP + lift * 0.5 + Math.sin(t * Math.PI * 4) * 0.02 * seg(t, 0.7, 1), lerp(0, 0.1, lift));
			return t < 0.65 ? [key("E", 0, 1.3)] : [];
		},
	};
};

// Шаг 2: наполнить кастрюлю водой у крана.
const stewWater: SceneBuilder = (ctx) => {
	ctx.put("kitchencounter_straight_A", 0, 0, 0);
	const tap = createTap(ctx, 0, -0.3);
	const empty = potItem(ctx, {});
	const full = potItem(ctx, { hasWater: true });
	return {
		posterT: 0.95,
		view: { distance: 3.2, y: 0.85 },
		update(t) {
			const fill = seg(t, 0.25, 0.75);
			const done = t >= 0.75;
			empty.position.set(0, COUNTER_TOP, 0.05);
			full.position.set(0, COUNTER_TOP, 0.05);
			show(empty, !done);
			show(full, done);
			const flowing = fill > 0 && fill < 1;
			show(tap.stream, flowing);
			tap.stream.scale.y = 0.45;
			tap.stream.position.y = COUNTER_TOP + 0.42;
			return flowing || t < 0.25 ? [key("E", 0.5, 1.15)] : [];
		},
	};
};

// Шаг 3: нарезать картофель, морковь и лук на досках.
const stewChop: SceneBuilder = (ctx) => {
	const xs = [-0.9, 0, 0.9];
	const kinds: IngredientKind[] = ["potato", "carrot", "onion"];
	xs.forEach((x) => {
		ctx.put("kitchencounter_straight_A", x, 0, 0);
		ctx.put("cuttingboard", x, COUNTER_TOP, 0);
	});
	const raws = kinds.map((kind) => ingredient(ctx, kind, "raw"));
	const cuts = kinds.map((kind) => ingredient(ctx, kind, "chopped"));
	const windows: Array<[number, number]> = [[0.05, 0.32], [0.32, 0.6], [0.6, 0.88]];
	return {
		posterT: 0.97,
		view: { distance: 4.4, y: 0.7 },
		update(t) {
			const overlays: Overlay[] = [];
			windows.forEach(([from, to], index) => {
				const progress = seg(t, from, to);
				const done = t >= to;
				show(raws[index], !done);
				show(cuts[index], done);
				const bounce = progress > 0 && !done ? Math.abs(Math.sin(progress * Math.PI * 3)) * 0.07 : 0;
				raws[index].position.set(xs[index], BOARD_TOP + bounce, 0);
				cuts[index].position.set(xs[index], BOARD_TOP, 0);
				if (progress > 0 && !done) {
					overlays.push(key("Q", xs[index], 1.05));
					overlays.push({ kind: "bars", at: v(xs[index], 1.55, 0), green: progress, red: 0 });
				}
			});
			return overlays;
		},
	};
};

// Шаг 4: положить нарезанные овощи в кастрюлю с водой.
const stewFill: SceneBuilder = (ctx) => {
	ctx.put("kitchencounter_straight_A", 0.5, 0, 0);
	const kinds: IngredientKind[] = ["carrot", "potato", "onion"];
	const pots = [0, 1, 2, 3].map((count) =>
		potItem(ctx, { hasWater: true, contents: kinds.slice(0, count).map((kind) => ({ type: "ingredient" as const, kind, state: "chopped" as const })) }),
	);
	const veggies = kinds.map((kind) => ingredient(ctx, kind, "chopped"));
	const starts = [v(-1.2, 0.95), v(-0.7, 1.05), v(-0.2, 0.95)];
	return {
		posterT: 0.95,
		view: { distance: 4.3, x: -0.35, y: 0.85 },
		update(t) {
			const slots = [seg(t, 0.1, 0.36), seg(t, 0.36, 0.62), seg(t, 0.62, 0.88)];
			const count = slots.filter((value) => value >= 1).length;
			pots.forEach((pot, index) => {
				pot.position.set(0.5, COUNTER_TOP, 0.05);
				show(pot, index === count);
			});
			veggies.forEach((veggie, index) => {
				const inPot = slots[index] >= 1;
				show(veggie, !inPot);
				fly(veggie, starts[index], v(0.5, COUNTER_TOP + 0.4, 0.05), slots[index], 0.3);
			});
			return count < 3 ? [key("E", 0.5, 1.4)] : [];
		},
	};
};

// Шаг 5: поставить кастрюлю на конфорку, она варится и выключается сама.
const stewCook: SceneBuilder = (ctx) => {
	ctx.put("stove_single", 0, 0, 0);
	const kinds: IngredientKind[] = ["carrot", "potato", "onion"];
	const raw = potItem(ctx, { hasWater: true, contents: kinds.map((kind) => ({ type: "ingredient" as const, kind, state: "chopped" as const })) });
	const done = potItem(ctx, { hasWater: true, portions: 2 });
	const fumes = steam(ctx);
	return {
		posterT: 0.95,
		view: { distance: 2.8, y: 0.75 },
		update(t) {
			const progress = clamp01((t - 0.1) / 0.7);
			const ready = progress >= 1;
			raw.position.set(0, STOVE_TOP, 0.05);
			done.position.set(0, STOVE_TOP, 0.05);
			show(raw, !ready);
			show(done, ready);
			fumes.update(0, STOVE_TOP + 0.4, 0.05, t, ready ? 0.3 : progress > 0 ? 1 : 0);
			return t < 0.1 ? [] : [{ kind: "bars", at: v(0, 1.3, 0.05), green: progress, red: 0 }];
		},
	};
};

const stewServe = serveScene(null, "stew", (ctx) => potItem(ctx, { hasWater: true, portions: 2 }));

export const dishScenes: Record<string, readonly SceneBuilder[]> = {
	ham: [hamTake, hamCook, hamPlate, hamServe],
	steak: [steakTake, steakCook, steakPlate, steakServe],
	burger: [burgerPrepare, burgerCook, burgerAssemble, burgerServe],
	veggieBurger: [veggiePrepare, veggieCook, veggieAssemble, veggieServe],
	stew: [stewPot, stewWater, stewChop, stewFill, stewCook, stewServe],
};
