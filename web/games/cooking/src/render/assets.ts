// Загрузка и хранение моделей (задача 6.1): GLTFLoader с ограничением числа одновременных запросов, общий кэш моделей,
// один общий экземпляр атласа текстуры. Модели хранятся в единицах пака; масштаб MODEL_SCALE применяет расстановка сцены.
// three.js используется только здесь и в соседних файлах render/: симуляция его не импортирует.
import { BoxGeometry, Box3, Color, Group, Mesh, MeshStandardMaterial, Vector3, type Material, type Object3D, type Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { assetModelNames, getModelUrl } from "../config/assets";
import { debugLog } from "../config/debug";
import { squareWallEnds } from "./wallModels";

// Сколько моделей грузится одновременно: больше браузер всё равно не откроет соединений, а ошибка останавливает очередь раньше.
const maxParallelLoads = 8;

// Цвет заглушки отсутствующей модели (ярко-розовый: сразу видно на сцене). Только для случая, когда имя модели не загружено.
const placeholderColor = 0xff00ff;

// Хранилище загруженных моделей.
export interface LoadedAssets {
	// Имена загруженных моделей.
	readonly modelNames: readonly string[];
	// Есть ли модель с таким именем.
	has(modelName: string): boolean;
	// Новый независимый объект модели: геометрия и материалы общие, узлы свои. Размеры в единицах пака (без MODEL_SCALE).
	// tint: если задан, материалы заменяются копиями с затемнением этим цветом (сгоревшие предметы без своей модели).
	// Неизвестное имя даёт заглушку-куб, чтобы сцена не падала.
	cloneModel(modelName: string, tint?: number): Object3D;
	// Габариты модели в единицах пака (копия).
	getBounds(modelName: string): Box3;
	// Освобождает геометрию, материалы и атлас.
	dispose(): void;
}

// Загружает один glTF и возвращает его сцену.
function loadGltfScene(loader: GLTFLoader, modelName: string): Promise<Object3D> {
	return new Promise((resolve, reject) => {
		loader.load(
			getModelUrl(modelName),
			(gltf) => resolve(gltf.scene),
			undefined,
			(error) => reject(error instanceof Error ? error : new Error(`не загрузилась модель ${modelName}`)),
		);
	});
}

// Загружает все модели списка: до maxParallelLoads запросов одновременно. При первом сбое промис отклоняется, новые запросы
// не начинаются. Результат: карта "имя -> сцена модели".
export async function loadGltfModels(modelNames: readonly string[] = assetModelNames): Promise<Map<string, Object3D>> {
	const loader = new GLTFLoader();
	const result = new Map<string, Object3D>();
	let nextIndex = 0;
	let failed = false;

	async function runWorker(): Promise<void> {
		while (!failed && nextIndex < modelNames.length) {
			const modelName = modelNames[nextIndex];
			nextIndex += 1;
			try {
				result.set(modelName, await loadGltfScene(loader, modelName));
			} catch (error) {
				failed = true;
				throw error;
			}
		}
	}

	const workers: Promise<void>[] = [];
	for (let workerIndex = 0; workerIndex < Math.min(maxParallelLoads, modelNames.length); workerIndex += 1) {
		workers.push(runWorker());
	}
	await Promise.all(workers);
	return result;
}

// Все материалы объекта (у меша может быть массив материалов).
function collectMaterials(root: Object3D): Material[] {
	const materials: Material[] = [];
	root.traverse((node) => {
		const mesh = node as Mesh;
		if (!mesh.isMesh) {
			return;
		}
		if (Array.isArray(mesh.material)) {
			materials.push(...mesh.material);
		} else {
			materials.push(mesh.material);
		}
	});
	return materials;
}

// Заменяет одинаковые атласы разных моделей одним экземпляром (одна загрузка в видеопамять вместо десятков).
function shareAtlasTexture(models: ReadonlyMap<string, Object3D>): Texture | null {
	let atlas: Texture | null = null;
	for (const model of models.values()) {
		for (const material of collectMaterials(model)) {
			const standard = material as MeshStandardMaterial;
			const map = standard.map;
			if (!map) {
				continue;
			}
			if (atlas === null) {
				atlas = map;
			} else if (map !== atlas && map.name === atlas.name) {
				map.dispose();
				standard.map = atlas;
				standard.needsUpdate = true;
			}
		}
	}
	return atlas;
}

// Собирает хранилище из карты загруженных моделей. Нужные для тестов сцены модели можно подать готовыми объектами.
export function createLoadedAssets(models: ReadonlyMap<string, Object3D>): LoadedAssets {
	const store = new Map(models);
	const atlas = shareAtlasTexture(store);
	// Куски стен без боковой фаски на торцах: соседние куски и стены в углах смыкаются без канавок.
	store.forEach((model, modelName) => {
		if (modelName.startsWith("wall")) {
			squareWallEnds(model);
		}
	});
	const boundsCache = new Map<string, Box3>();
	const tintedMaterials = new Map<string, Material>();
	const reportedMissing = new Set<string>();
	const placeholderGeometry = new BoxGeometry(1, 1, 1);
	const placeholderMaterial = new MeshStandardMaterial({ color: placeholderColor });

	// Копия материала с цветом, умноженным на tint (карта текстуры сохраняется: тёмный цвет затемняет рисунок).
	function getTintedMaterial(material: Material, tint: number): Material {
		const key = `${material.uuid}:${tint}`;
		let tinted = tintedMaterials.get(key);
		if (!tinted) {
			tinted = material.clone();
			(tinted as MeshStandardMaterial).color = new Color(tint);
			tintedMaterials.set(key, tinted);
		}
		return tinted;
	}

	function createPlaceholder(modelName: string): Object3D {
		if (!reportedMissing.has(modelName)) {
			reportedMissing.add(modelName);
			debugLog("assets", "модели нет в хранилище, показана заглушка", modelName);
		}
		const group = new Group();
		const box = new Mesh(placeholderGeometry, placeholderMaterial);
		box.position.y = 0.5;
		group.add(box);
		return group;
	}

	return {
		get modelNames() {
			return [...store.keys()];
		},
		has(modelName) {
			return store.has(modelName);
		},
		cloneModel(modelName, tint) {
			const template = store.get(modelName);
			if (!template) {
				return createPlaceholder(modelName);
			}
			const copy = template.clone(true);
			if (tint !== undefined) {
				copy.traverse((node) => {
					const mesh = node as Mesh;
					if (mesh.isMesh) {
						mesh.material = Array.isArray(mesh.material)
							? mesh.material.map((material) => getTintedMaterial(material, tint))
							: getTintedMaterial(mesh.material, tint);
					}
				});
			}
			return copy;
		},
		getBounds(modelName) {
			let bounds = boundsCache.get(modelName);
			if (!bounds) {
				const template = store.get(modelName);
				bounds = template ? new Box3().setFromObject(template) : new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5));
				boundsCache.set(modelName, bounds);
			}
			return bounds.clone();
		},
		dispose() {
			for (const model of store.values()) {
				model.traverse((node) => {
					const mesh = node as Mesh;
					if (mesh.isMesh) {
						mesh.geometry.dispose();
					}
				});
				collectMaterials(model).forEach((material) => material.dispose());
			}
			tintedMaterials.forEach((material) => material.dispose());
			placeholderGeometry.dispose();
			placeholderMaterial.dispose();
			atlas?.dispose();
			store.clear();
		},
	};
}
