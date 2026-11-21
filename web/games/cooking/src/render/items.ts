// Визуальные объекты предметов (задача 6.5): ингредиенты, тарелки с содержимым и готовые блюда из моделей пака.
// Все объекты строятся в единицах мира (с MODEL_SCALE), начало координат в центре основания: предмет можно ставить на поверхность.
import { Box3, Group, Object3D, Vector3 } from "three";
import { burntTintItems, dishModelNames, getItemKey, getItemModelName } from "../config/assets";
import { MODEL_SCALE, type DishId, type Item, type ItemSpec } from "../contracts";
import type { LoadedAssets } from "./assets";
import { burntTintColor } from "./palette";

// Результат построения: объект и его высота в единицах мира (для укладки предметов стопкой).
export interface ItemVisual {
	object: Object3D;
	height: number;
}

// Фабрика визуальных объектов предметов.
export interface ItemVisualFactory {
	// Объект для предмета в руке или на станции.
	createItemVisual(item: Item): ItemVisual;
	// Объект для готового блюда на тарелке (без привязки к предмету: блюдо на столе и в окне выдачи).
	createDishVisual(dish: DishId): ItemVisual;
	// Объект для ингредиента по паре "вид + состояние" (содержимое кастрюли и доски).
	createSpecVisual(spec: ItemSpec): ItemVisual;
}

// Ключ предмета для сравнения: меняется только когда должен смениться вид.
export function getItemSignature(item: Item | null): string {
	if (item === null) {
		return "";
	}
	if (item.type === "ingredient") {
		return `i:${getItemKey(item)}`;
	}
	const contents = item.contents.map((content) => getItemKey(content)).sort();
	return `p:${item.dish ?? "-"}:${contents.join(",")}`;
}

// Создаёт фабрику поверх загруженных моделей.
export function createItemVisualFactory(assets: LoadedAssets): ItemVisualFactory {
	const size = new Vector3();
	const center = new Vector3();

	// Модель с началом координат в центре основания и масштабом MODEL_SCALE. Габариты считаются по шаблону модели.
	function createNormalizedModel(modelName: string, tint?: number): ItemVisual {
		const bounds: Box3 = assets.getBounds(modelName);
		bounds.getSize(size);
		bounds.getCenter(center);
		const inner = assets.cloneModel(modelName, tint);
		inner.position.set(-center.x, -bounds.min.y, -center.z);
		const wrapper = new Group();
		wrapper.add(inner);
		wrapper.scale.setScalar(MODEL_SCALE);
		// Обёртка масштабируется целиком, поэтому для укладки возвращаем высоту уже в мировых единицах.
		return { object: wrapper, height: size.y * MODEL_SCALE };
	}

	function createSpecVisual(spec: ItemSpec): ItemVisual {
		const modelName = getItemModelName(spec);
		if (modelName === null) {
			// Пары вне каталога не возникают; заглушка нужна, чтобы сцена не падала при ошибке данных.
			return createNormalizedModel("__missing__");
		}
		const tint = burntTintItems.has(getItemKey(spec)) ? burntTintColor : undefined;
		return createNormalizedModel(modelName, tint);
	}

	function createDishVisual(dish: DishId): ItemVisual {
		return createNormalizedModel(dishModelNames[dish]);
	}

	function createItemVisual(item: Item): ItemVisual {
		if (item.type === "ingredient") {
			return createSpecVisual(item);
		}
		if (item.dish !== null) {
			return createDishVisual(item.dish);
		}
		// Тарелка с неполным набором: тарелка и содержимое стопкой.
		const plate = createNormalizedModel("plate");
		const group = new Group();
		group.add(plate.object);
		let height = plate.height;
		for (const content of item.contents) {
			const visual = createSpecVisual(content);
			visual.object.position.y = height;
			group.add(visual.object);
			height += visual.height;
		}
		return { object: group, height };
	}

	return { createItemVisual, createDishVisual, createSpecVisual };
}
