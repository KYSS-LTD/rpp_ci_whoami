// Съёмка GIF-подсказок рецептов из настоящих 3D-моделей игры (страница tutorial-capture.html, только для разработки).
// Каждый шаг рецепта - небольшая сцена из моделей пака с анимацией по времени t от 0 до 1. Кадры рендерятся тем же three.js,
// клавиши и полосы прогресса дорисовываются поверх на 2D-холсте, GIF собирается gifenc и кладётся в public/tutorial.
// Адрес: ?dish=burger&step=1 показывает сцену (анимация идёт по кругу), добавьте &save, чтобы записать GIF и PNG-постер.
import { AmbientLight, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, Vector3, WebGLRenderer } from "three";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { assetModelNames } from "../config/assets";
import { MODEL_SCALE } from "../contracts";
import { createLoadedAssets, loadGltfModels, type LoadedAssets } from "./assets";
import { createItemVisualFactory, type ItemVisualFactory } from "./items";
import { backgroundColor } from "./palette";

// Размер кадра подсказки (как у прежних GIF), число кадров цикла и задержка кадра в сотых долях секунды.
const WIDTH = 480;
const HEIGHT = 300;
const FRAME_COUNT = 18;
const FRAME_DELAY_MS = 90;
// Последний кадр держится дольше, чтобы результат успевали рассмотреть.
const LAST_FRAME_DELAY_MS = 900;
const PALETTE_COLORS = 96;

// Высоты поверхностей в мировых единицах (см. stationSurfaceHeights в stations.ts).
const COUNTER_TOP = 0.5;
const BOARD_TOP = COUNTER_TOP + 0.075;
const STOVE_TOP = 0.57;

interface Ctx {
	scene: Scene;
	assets: LoadedAssets;
	items: ItemVisualFactory;
	// Модель пака в мировых координатах (масштаб MODEL_SCALE, начало координат модели).
	put(modelName: string, x: number, y: number, z: number, yaw?: number): Group;
	// Предмет игры: начало координат в центре основания.
	item(object: Object3D, x: number, y: number, z: number): Object3D;
}

// Подпись, которую рисует сцена поверх кадра (клавиша или полоса прогресса).
interface Overlay {
	// Точка в мире, над которой рисуется подпись.
	at: Vector3;
	kind: "key" | "bars";
	label?: string;
	// Для bars: заполнение зелёной и красной полос (0..1).
	green?: number;
	red?: number;
	alpha?: number;
}

interface SceneRun {
	// Ставит сцену в момент t (0..1), возвращает подписи кадра.
	update(t: number): Overlay[];
	// Момент кадра-постера для режима reduced motion.
	posterT: number;
	// Камера: расстояние до цели и сдвиг цели по x и y (по умолчанию 4.3 и центр кухни).
	view?: { distance: number; x?: number; y?: number };
}

type SceneBuilder = (ctx: Ctx) => SceneRun;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => k * k * (3 - 2 * k);
// Доля отрезка [from, to] времени t.
const seg = (t: number, from: number, to: number): number => clamp01((t - from) / (to - from));

function setVisible(object: Object3D, visible: boolean): void {
	object.visible = visible;
}

// Общая кухня: пол, стена с плиткой, свет. Камера смотрит как игровая, сверху под углом.
function buildRoom(scene: Scene): void {
	scene.background = new Color(backgroundColor);
	scene.add(new AmbientLight(0xffffff, 0.9));
	scene.add(new HemisphereLight(0xdfeaff, 0x8c7a66, 1.1));
	const sun = new DirectionalLight(0xfff3df, 1.9);
	sun.position.set(-3, 6, 4);
	scene.add(sun);
	const floor = new Mesh(new PlaneGeometry(14, 10), new MeshStandardMaterial({ color: 0xcdb99a }));
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(0, 0, 0);
	scene.add(floor);
	const wall = new Mesh(new PlaneGeometry(14, 4), new MeshStandardMaterial({ color: 0xe8dcc8 }));
	wall.position.set(0, 2, -1.2);
	scene.add(wall);
}

// Облачко пара над сковородой.
function createSteam(scene: Scene): { puffs: Mesh[]; update(x: number, y: number, z: number, t: number, strength: number): void } {
	const material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
	const puffs: Mesh[] = [];
	for (let index = 0; index < 5; index += 1) {
		const puff = new Mesh(new SphereGeometry(0.06, 10, 8), material.clone());
		scene.add(puff);
		puffs.push(puff);
	}
	return {
		puffs,
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

// --- Бургер ---

// Шаг 1: взять стейк из ящика и нарезать на доске.
const burgerPrepare: SceneBuilder = (ctx) => {
	ctx.put("crate_steak", -0.95, 0, 0);
	ctx.put("kitchencounter_straight_A", 0.6, 0, 0);
	ctx.put("cuttingboard", 0.6, COUNTER_TOP, 0);
	const steak = ctx.item(ctx.items.createSpecVisual({ kind: "steak", state: "raw" }).object, 0, 0, 0);
	const pieces = ctx.item(ctx.items.createSpecVisual({ kind: "steak", state: "chopped" }).object, 0.6, BOARD_TOP, 0);
	return {
		posterT: 0.95,
		view: { distance: 3.5, x: -0.15, y: 0.6 },
		update(t) {
			const fly = ease(seg(t, 0.08, 0.42));
			const chopping = seg(t, 0.5, 0.88);
			const chopped = chopping >= 1 || t >= 0.88;
			setVisible(steak, !chopped);
			setVisible(pieces, chopped);
			steak.position.set(lerp(-0.95, 0.6, fly), lerp(0.62, BOARD_TOP, fly) + Math.sin(fly * Math.PI) * 0.45, 0);
			// Резка: заготовка подпрыгивает под ударами ножа.
			const chop = chopping > 0 && chopping < 1 ? Math.abs(Math.sin(chopping * Math.PI * 4)) * 0.08 : 0;
			if (chopping > 0 && !chopped) {
				steak.position.y = BOARD_TOP + chop;
			}
			const pop = chopped ? 1 + Math.max(0, 0.25 - seg(t, 0.88, 1) * 0.25) : 1;
			pieces.scale.setScalar(pop);
			const overlays: Overlay[] = [];
			if (t < 0.4) {
				overlays.push({ kind: "key", label: "E", at: new Vector3(-0.95, 0.95, 0.1), alpha: 1 });
			} else if (!chopped) {
				overlays.push({ kind: "key", label: "Q", at: new Vector3(0.6, 1.05, 0.1), alpha: 1 });
				overlays.push({ kind: "bars", at: new Vector3(0.6, 1.55, 0), green: chopping, red: 0 });
			}
			return overlays;
		},
	};
};

// Шаг 2: пожарить нарезанный стейк. Зелёная полоса - готовка, красная заполняется, если блюдо забыли снять.
const burgerCook: SceneBuilder = (ctx) => {
	ctx.put("stove_single", 0, 0, 0);
	ctx.put("pan_A", 0, STOVE_TOP, 0.05, 0);
	const raw = ctx.item(ctx.items.createSpecVisual({ kind: "patty", state: "raw" }).object, 0, STOVE_TOP + 0.07, 0.05);
	const cooked = ctx.item(ctx.items.createSpecVisual({ kind: "patty", state: "cooked" }).object, 0, STOVE_TOP + 0.07, 0.05);
	const steam = createSteam(ctx.scene);
	return {
		posterT: 0.62,
		view: { distance: 2.7, y: 0.7 },
		update(t) {
			const green = clamp01(t / 0.55);
			const red = seg(t, 0.62, 1) * 0.45;
			const done = green >= 1;
			setVisible(raw, !done);
			setVisible(cooked, done);
			steam.update(0, STOVE_TOP + 0.2, 0.05, t, done ? 0.6 : 1);
			return [{ kind: "bars", at: new Vector3(0, 1.15, 0.05), green, red }];
		},
	};
};

// Шаг 3: котлета в руках, берём булочку из ящика и получаем бургер.
const burgerAssemble: SceneBuilder = (ctx) => {
	ctx.put("kitchencounter_straight_A", -0.45, 0, 0);
	ctx.put("crate_buns", 1.05, 0, 0);
	const patty = ctx.item(ctx.items.createSpecVisual({ kind: "patty", state: "cooked" }).object, -0.45, COUNTER_TOP + 0.3, 0);
	const bun = ctx.item(ctx.items.createSpecVisual({ kind: "bun", state: "raw" }).object, 0, 0, 0);
	return {
		posterT: 0.95,
		view: { distance: 4.1, x: 0.3, y: 1.0 },
		update(t) {
			const fly = ease(seg(t, 0.2, 0.6));
			const hover = COUNTER_TOP + 0.3 + Math.sin(t * Math.PI * 4) * 0.025;
			patty.position.set(-0.45, hover, 0);
			const stackY = hover + 0.2;
			bun.position.set(lerp(1.05, -0.45, fly), lerp(0.55, stackY, fly) + Math.sin(fly * Math.PI) * 0.4, 0);
			const settle = seg(t, 0.6, 0.75);
			bun.scale.setScalar(1 + Math.sin(settle * Math.PI) * 0.12);
			const overlays: Overlay[] = [];
			if (t < 0.55) {
				overlays.push({ kind: "key", label: "E", at: new Vector3(1.05, 1.05, 0.1), alpha: 1 });
			}
			return overlays;
		},
	};
};

// Шаг 4: берём тарелку у стойки с тарелками и сдаём бургер в окно выдачи.
const burgerServe: SceneBuilder = (ctx) => {
	ctx.put("kitchencounter_straight_A", -1.1, 0, 0);
	ctx.put("dishrack_plates", -1.1, COUNTER_TOP, 0);
	ctx.put("wall_orderwindow", 1.0, 0, -0.8);
	const stack = ctx.item(ctx.items.createItemVisual({ type: "assembly", plated: false, dish: null, contents: [{ type: "ingredient", kind: "patty", state: "cooked" }, { type: "ingredient", kind: "bun", state: "raw" }] }).object, 0, 0, 0);
	const dish = ctx.item(ctx.items.createDishVisual("burger").object, 0, 0, 0);
	return {
		posterT: 0.97,
		view: { distance: 4.3, x: 0.1, y: 0.95 },
		update(t) {
			const toPlate = ease(seg(t, 0.05, 0.35));
			const toWindow = ease(seg(t, 0.5, 0.88));
			const plated = t >= 0.35;
			setVisible(stack, !plated);
			setVisible(dish, plated);
			stack.position.set(lerp(-0.6, -1.1, toPlate), lerp(COUNTER_TOP + 0.5, COUNTER_TOP + 0.95, toPlate) + Math.sin(toPlate * Math.PI) * 0.2, 0);
			dish.position.set(lerp(-1.1, 0.95, toWindow), lerp(COUNTER_TOP + 0.95, 0.55, toWindow) + Math.sin(toWindow * Math.PI) * 0.45, lerp(0, -0.35, toWindow));
			const overlays: Overlay[] = [];
			if (t < 0.4) {
				overlays.push({ kind: "key", label: "E", at: new Vector3(-1.1, 1.75, 0.1), alpha: 1 });
			} else if (t < 0.9) {
				overlays.push({ kind: "key", label: "E", at: new Vector3(0.95, 1.2, -0.3), alpha: seg(t, 0.4, 0.5) });
			}
			return overlays;
		},
	};
};

const dishScenes: Record<string, readonly SceneBuilder[]> = {
	burger: [burgerPrepare, burgerCook, burgerAssemble, burgerServe],
};

// --- Рендер и запись ---

function drawKey(g: CanvasRenderingContext2D, x: number, y: number, label: string, pulse: number, alpha: number): void {
	const size = 34 + pulse * 3;
	g.save();
	g.globalAlpha = alpha;
	g.fillStyle = "#1c2430";
	g.strokeStyle = "#ffd24a";
	g.lineWidth = 3;
	g.beginPath();
	g.roundRect(x - size / 2, y - size / 2 + pulse * -2, size, size, 8);
	g.fill();
	g.stroke();
	g.fillStyle = "#ffd24a";
	g.font = "bold 22px sans-serif";
	g.textAlign = "center";
	g.textBaseline = "middle";
	g.fillText(label, x, y - pulse * 2 + 1);
	g.restore();
}

function drawBars(g: CanvasRenderingContext2D, x: number, y: number, green: number, red: number): void {
	const width = 108;
	const height = 12;
	const rows: Array<[number, string]> = [[green, "#49c45a"], [red, "#e04a3a"]];
	rows.forEach(([value, color], index) => {
		const top = y + index * (height + 5);
		g.fillStyle = "#1c2430";
		g.beginPath();
		g.roundRect(x - width / 2 - 3, top - 3, width + 6, height + 6, 5);
		g.fill();
		g.fillStyle = "#3a4452";
		g.fillRect(x - width / 2, top, width, height);
		g.fillStyle = color;
		g.fillRect(x - width / 2, top, width * clamp01(value), height);
	});
}

async function main(): Promise<void> {
	const params = new URLSearchParams(window.location.search);
	const dish = params.get("dish") ?? "burger";
	const stepParam = params.get("step");
	const scenes = dishScenes[dish];
	if (!scenes) {
		document.body.textContent = `Нет сцен для блюда ${dish}`;
		return;
	}
	const assets = createLoadedAssets(await loadGltfModels(assetModelNames));
	const items = createItemVisualFactory(assets);

	const glCanvas = document.createElement("canvas");
	const renderer = new WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
	renderer.setPixelRatio(1);
	renderer.setSize(WIDTH, HEIGHT, false);

	const view = document.createElement("canvas");
	view.width = WIDTH;
	view.height = HEIGHT;
	view.style.width = "780px";
	document.body.append(view);
	const g = view.getContext("2d", { willReadFrequently: true });
	if (!g) {
		return;
	}

	const camera = new PerspectiveCamera(30, WIDTH / HEIGHT, 0.1, 50);
	const pitch = (40 * Math.PI) / 180;
	function aimCamera(view: SceneRun["view"]): void {
		const distance = view?.distance ?? 4.3;
		const target = new Vector3(view?.x ?? 0, view?.y ?? 0.55, 0);
		camera.position.set(target.x, target.y + distance * Math.sin(pitch), target.z + distance * Math.cos(pitch));
		camera.lookAt(target);
		camera.updateMatrixWorld(true);
	}

	// Кадр сцены в момент t: рендер three.js и подписи поверх.
	function renderFrame(run: SceneRun, t: number): void {
		const overlays = run.update(t);
		renderer.render(currentScene, camera);
		g!.drawImage(glCanvas, 0, 0, WIDTH, HEIGHT);
		const point = new Vector3();
		for (const overlay of overlays) {
			point.copy(overlay.at).project(camera);
			const x = (point.x * 0.5 + 0.5) * WIDTH;
			const y = (-point.y * 0.5 + 0.5) * HEIGHT;
			if (overlay.kind === "key") {
				drawKey(g!, x, y, overlay.label ?? "E", (Math.sin(t * Math.PI * 8) + 1) / 2, overlay.alpha ?? 1);
			} else {
				drawBars(g!, x, y, overlay.green ?? 0, overlay.red ?? 0);
			}
		}
	}

	let currentScene = new Scene();
	function buildScene(builder: SceneBuilder): SceneRun {
		currentScene = new Scene();
		buildRoom(currentScene);
		const ctx: Ctx = {
			scene: currentScene,
			assets,
			items,
			put(modelName, x, y, z, yaw = 0) {
				const group = new Group();
				group.add(assets.cloneModel(modelName));
				group.scale.setScalar(MODEL_SCALE);
				group.position.set(x, y, z);
				group.rotation.y = yaw;
				currentScene.add(group);
				return group;
			},
			item(object, x, y, z) {
				object.position.set(x, y, z);
				currentScene.add(object);
				return object;
			},
		};
		const run = builder(ctx);
		aimCamera(run.view);
		return run;
	}

	async function save(name: string, body: BodyInit): Promise<void> {
		const response = await fetch(`/__tutorial-save?name=${name}`, { method: "POST", body });
		if (!response.ok) {
			throw new Error(`не сохранился ${name}`);
		}
	}

	async function captureStep(index: number): Promise<string> {
		const run = buildScene(scenes[index]);
		const encoder = GIFEncoder();
		for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
			renderFrame(run, frame / (FRAME_COUNT - 1) * 0.999);
			const rgba = g!.getImageData(0, 0, WIDTH, HEIGHT).data;
			const palette = quantize(rgba, PALETTE_COLORS);
			encoder.writeFrame(applyPalette(rgba, palette), WIDTH, HEIGHT, { palette, delay: frame === FRAME_COUNT - 1 ? LAST_FRAME_DELAY_MS : FRAME_DELAY_MS, repeat: 0 });
		}
		encoder.finish();
		const bytes = encoder.bytes();
		await save(`${dish}-${index + 1}.gif`, bytes as BodyInit);
		renderFrame(run, run.posterT);
		const poster = await new Promise<Blob | null>((resolve) => view.toBlob(resolve, "image/png"));
		if (poster) {
			await save(`${dish}-${index + 1}.png`, poster);
		}
		return `${dish}-${index + 1}: gif ${(bytes.length / 1024).toFixed(0)} КБ, png ${((poster?.size ?? 0) / 1024).toFixed(0)} КБ`;
	}

	if (params.has("save")) {
		const report: string[] = [];
		const indices = stepParam === null ? scenes.map((_, i) => i) : [Number(stepParam) - 1];
		for (const index of indices) {
			report.push(await captureStep(index));
		}
		document.title = "saved";
		document.body.append(Object.assign(document.createElement("pre"), { id: "report", textContent: report.join("\n") }));
		return;
	}

	// Просмотр: выбранный шаг крутится по кругу.
	const run = buildScene(scenes[Number(stepParam ?? 1) - 1]);
	const fixed = params.get("t");
	function loop(nowMs: number): void {
		const t = fixed === null ? (nowMs / 2600) % 1 : Number(fixed);
		renderFrame(run, t);
		requestAnimationFrame(loop);
	}
	requestAnimationFrame(loop);
}

void main();
