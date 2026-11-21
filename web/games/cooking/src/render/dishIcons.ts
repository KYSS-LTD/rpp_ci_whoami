// Иконки блюд для HUD (задача 7.2): каждое блюдо один раз рисуется из glTF во внеэкранный canvas и отдаётся как data URL.
// Если WebGL недоступен или рендер не удался, возвращается пустой набор: HUD покажет текстовую подпись блюда.
import { AmbientLight, Box3, DirectionalLight, Group, OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";
import { debugLog } from "../config/debug";
import { DISH_IDS, type DishIcons } from "../contracts";
import type { LoadedAssets } from "./assets";
import { createItemVisualFactory } from "./items";

// Размер иконки в пикселях (квадрат): с запасом под плотные экраны, в HUD иконка показывается примерно вдвое меньше.
const iconSizePx = 128;

// Наклон камеры иконки над горизонтом, градусы: чуть выше, чем у игровой камеры, чтобы было видно блюдо на тарелке.
const iconPitchDeg = 38;

// Запас вокруг блюда в кадре иконки.
const iconPadding = 1.12;

// Рисует иконки всех блюд. Временный контекст WebGL освобождается сразу после отрисовки.
export function createDishIcons(assets: LoadedAssets): DishIcons {
	const icons: DishIcons = {};
	let renderer: WebGLRenderer | null = null;
	try {
		renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
		renderer.setPixelRatio(1);
		renderer.setSize(iconSizePx, iconSizePx, false);
		renderer.setClearColor(0x000000, 0);

		const items = createItemVisualFactory(assets);
		const pitch = (iconPitchDeg * Math.PI) / 180;
		const direction = new Vector3(0, -Math.sin(pitch), -Math.cos(pitch));
		const bounds = new Box3();
		const size = new Vector3();
		const center = new Vector3();

		for (const dish of DISH_IDS) {
			const scene = new Scene();
			scene.add(new AmbientLight(0xffffff, 1.6));
			const light = new DirectionalLight(0xffffff, 1.8);
			light.position.set(-3, 6, 4);
			scene.add(light);

			const holder = new Group();
			holder.add(items.createDishVisual(dish).object);
			scene.add(holder);
			holder.updateMatrixWorld(true);
			bounds.setFromObject(holder);
			bounds.getSize(size);
			bounds.getCenter(center);

			// Ортографическая камера: блюдо вписывается по наибольшему размеру.
			const half = (Math.max(size.x, size.z, size.y * 1.4) * iconPadding) / 2;
			const camera = new OrthographicCamera(-half, half, half, -half, 0.1, 50);
			camera.position.copy(center).addScaledVector(direction, -10);
			camera.lookAt(center);
			camera.updateMatrixWorld(true);

			renderer.render(scene, camera);
			icons[dish] = renderer.domElement.toDataURL("image/png");
		}
	} catch (error) {
		debugLog("icons", "иконки блюд не созданы, HUD покажет текст", error);
		return {};
	} finally {
		if (renderer) {
			renderer.dispose();
			renderer.forceContextLoss();
		}
	}
	return icons;
}
