// Съёмка GIF-подсказок рецептов из настоящих 3D-моделей игры (страница tutorial-capture.html, только для разработки).
// Каждый шаг рецепта - небольшая сцена из моделей пака с анимацией по времени t от 0 до 1. Кадры рендерятся тем же three.js,
// клавиши и полосы прогресса дорисовываются поверх на 2D-холсте, GIF собирается gifenc и кладётся в public/tutorial.
// Адрес: ?dish=burger&step=1 показывает сцену (анимация идёт по кругу), добавьте &save, чтобы записать GIF и PNG-постер.
import { AmbientLight, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer } from "three";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { assetModelNames } from "../config/assets";
import { MODEL_SCALE } from "../contracts";
import { createLoadedAssets, loadGltfModels } from "./assets";
import { createItemVisualFactory } from "./items";
import { backgroundColor } from "./palette";
import { dishScenes, type Ctx, type SceneBuilder, type SceneRun } from "./tutorialScenes";

// Размер кадра подсказки (как у прежних GIF), число кадров цикла и задержка кадра в сотых долях секунды.
const WIDTH = 480;
const HEIGHT = 300;
const FRAME_COUNT = 18;
const FRAME_DELAY_MS = 90;
// Последний кадр держится дольше, чтобы результат успевали рассмотреть.
const LAST_FRAME_DELAY_MS = 900;
const PALETTE_COLORS = 80;

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
	scene.add(floor);
	const wall = new Mesh(new PlaneGeometry(14, 4), new MeshStandardMaterial({ color: 0xe8dcc8 }));
	wall.position.set(0, 2, -1.2);
	scene.add(wall);
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

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

	// Контрольный лист: все шаги блюда в четыре момента времени, чтобы быстро просмотреть сцены.
	if (params.has("sheet")) {
		view.remove();
		document.body.style.cssText = "margin:0;background:#222";
		scenes.forEach((builder, index) => {
			const row = document.createElement("div");
			row.style.cssText = "display:flex;gap:4px;margin:4px";
			document.body.append(row);
			const run = buildScene(builder);
			[0.15, 0.45, 0.75, 0.98].forEach((moment) => {
				renderFrame(run, moment);
				const copy = document.createElement("canvas");
				copy.width = WIDTH;
				copy.height = HEIGHT;
				copy.style.width = "190px";
				copy.getContext("2d")?.drawImage(view, 0, 0);
				row.append(copy);
			});
			void index;
		});
		return;
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
