// Визуальные объекты предметов (задача 6.5): ингредиенты, тарелки с содержимым и готовые блюда из моделей пака.
// Все объекты строятся в единицах мира (с MODEL_SCALE), начало координат в центре основания: предмет можно ставить на поверхность.
import { Box3, CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Object3D, RingGeometry, Vector3 } from "three";
import { burntTintItems, dishModelNames, dishToppings, dishToppingScale, getItemKey, getItemModelName, itemTints } from "../config/assets";
import { MODEL_SCALE, type DishId, type Item, type ItemSpec } from "../contracts";
import type { LoadedAssets } from "./assets";
import { burntTintColor } from "./palette";

// Вода внутри кастрюли (pot_A, мировые единицы): высота кастрюли 0.25, внутренний радиус у верхней кромки 0.21.
// Поверхность лежит чуть ниже кромки и не доходит до стенок, чтобы не торчать наружу.
const POT_WATER_LEVEL = 0.2;
const POT_WATER_RADIUS = 0.196;
const potWaterBodyGeometry = new CylinderGeometry(POT_WATER_RADIUS, POT_WATER_RADIUS - 0.012, 0.04, 32, 1, true);
const potWaterSurfaceGeometry = new CircleGeometry(POT_WATER_RADIUS, 32).rotateX(-Math.PI / 2);
const potWaterFoamGeometry = new RingGeometry(POT_WATER_RADIUS - 0.022, POT_WATER_RADIUS, 32).rotateX(-Math.PI / 2);
const potWaterBodyMaterial = new MeshBasicMaterial({ color: 0x3f9fc8 });
const potWaterSurfaceMaterial = new MeshBasicMaterial({ color: 0x5cc3e8 });
const potWaterFoamMaterial = new MeshBasicMaterial({ color: 0x9fdcf2 });

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
	return item.type === "pot"
		? `pot:${item.hasWater}:${item.portions}:${item.cookProgressSec}:${contents.join(",")}`
		: `a:${item.plated}:${item.dish ?? "-"}:${contents.join(",")}`;
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
		const itemKey = getItemKey(spec);
		const tint = burntTintItems.has(itemKey) ? burntTintColor : itemTints[itemKey];
		return createNormalizedModel(modelName, tint);
	}

	function createDishVisual(dish: DishId): ItemVisual {
		const base = createNormalizedModel(dishModelNames[dish]);
		const toppingSpec = dishToppings[dish];
		if (toppingSpec === undefined) {
			return base;
		}
		// Блюдо из тарелки и ингредиента сверху (жареный стейк).
		const topping = createSpecVisual(toppingSpec);
		topping.object.scale.multiplyScalar(dishToppingScale);
		topping.object.position.y = base.height;
		const group = new Group();
		group.add(base.object, topping.object);
		return { object: group, height: base.height + topping.height * dishToppingScale };
	}

	function createItemVisual(item: Item): ItemVisual {
		if (item.type === "ingredient") {
			return createSpecVisual(item);
		}
		if (item.type === "pot") {
			const pot = createNormalizedModel(item.portions > 0 ? "pot_A_stew" : "pot_A");
			const group = new Group();
			group.add(pot.object);
			if (item.hasWater && item.portions === 0) {
				const water = new Group();
				const body = new Mesh(potWaterBodyGeometry, potWaterBodyMaterial);
				body.position.y = POT_WATER_LEVEL - 0.02;
				const surface = new Mesh(potWaterSurfaceGeometry, potWaterSurfaceMaterial);
				surface.position.y = POT_WATER_LEVEL;
				// Светлая кайма у стенки: убирает «зубчатый» стык воды с кромкой.
				const foam = new Mesh(potWaterFoamGeometry, potWaterFoamMaterial);
				foam.position.y = POT_WATER_LEVEL + 0.001;
				water.add(body, surface, foam);
				group.add(water);
			}
			item.contents.forEach((content, index) => {
				const visual = createSpecVisual(content);
				const angle = (index / Math.max(1, item.contents.length)) * Math.PI * 2;
				visual.object.position.set(Math.cos(angle) * 0.08, POT_WATER_LEVEL, Math.sin(angle) * 0.08);
				visual.object.scale.multiplyScalar(0.55);
				group.add(visual.object);
			});
			return { object: group, height: pot.height };
		}
		if (item.dish !== null && item.plated) {
			return createDishVisual(item.dish);
		}
		// Сборка без тарелки или тарелка с ингредиентами: содержимое лежит стопкой, блюдо готово визуально только на тарелке.
		const group = new Group();
		let height = 0;
		if (item.plated) {
			const plate = createNormalizedModel("plate");
			group.add(plate.object);
			height = plate.height;
		}
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
