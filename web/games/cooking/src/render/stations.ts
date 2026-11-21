// Станции кухни на сцене (задачи 6.2 и 6.5): модели по виду станции, предметы на станциях со сменой вида по состоянию,
// индикаторы прогресса резки, готовки и подгорания над станциями.
// Станция состоит из статичной части (основание и надстройка) и динамической (предметы по снимку StationSnapshot).
import {
	CylinderGeometry,
	DoubleSide,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	TorusGeometry,
	type BufferGeometry,
	type Material,
	type Object3D,
} from "three";
import { crateModelNames, stationBaseModelNames, stationTopModelNames } from "../config/assets";
import { MODEL_SCALE, type Item, type LevelConfig, type StationConfig, type StationSnapshot } from "../contracts";
import { rectCenter } from "../common/math";
import type { LoadedAssets } from "./assets";
import { getItemSignature, type ItemVisualFactory } from "./items";
import { rotationToYaw, type PlacedRegistry } from "./layout";
import { barBackgroundColor, barBurnColor, barProgressColor, burntTintColor, trashColors } from "./palette";
import { CAMERA_PITCH_DEG } from "./camera";

// Высоты рабочих поверхностей станций (единицы мира, после масштаба): подобраны по габаритам моделей пака.
export const stationSurfaceHeights = {
	// Верх прилавка kitchencounter_straight_A.
	counter: 0.5,
	// Толщина разделочной доски на прилавке.
	boardThickness: 0.075,
	// Верх плиты stove_single под сковородой и кастрюлей.
	stove: 0.57,
	// Дно сковороды над плитой.
	panFloor: 0.07,
	// Верх духовки (модель oven 2.02 в паке).
	oven: 1.0,
	// Высота индикатора над поверхностью станции.
	indicatorLift: 0.55,
} as const;

// Размеры индикатора прогресса над станцией (единицы мира).
const indicatorWidth = 0.72;
const indicatorHeight = 0.11;
const indicatorBorder = 0.025;

// Порог остатка безопасного времени, ниже которого индикатор мигает.
const warningRemainingRatio = 0.35;

// Частота мигания индикатора предупреждения (Гц).
const warningBlinkHz = 5;

// Текущее тело кастрюли и его родитель (модель меняется на кастрюлю с рагу).
interface PotState {
	body: Object3D | null;
	parent: Object3D;
}

// Динамическая часть станции.
export interface StationView {
	readonly id: string;
	readonly config: StationConfig;
	// Применяет состояние станции из снимка. Предметы пересоздаются только при смене вида.
	update(snapshot: StationSnapshot, timeSec: number): void;
}

// Набор видов станций.
export interface StationViews {
	// Статичные объекты станций (для реестра и подсветки), индикаторы лежат в indicatorRoot.
	readonly root: Group;
	// Индикаторы прогресса: в мировых координатах, повёрнуты лицом к камере.
	readonly indicatorRoot: Group;
	views: ReadonlyMap<string, StationView>;
	// Центры станций по идентификатору (для подсветки цели).
	getCenter(stationId: string): { x: number; z: number } | null;
	// Высота рабочей поверхности каждой станции (для стрелки подсветки).
	readonly surfaceHeights: ReadonlyMap<string, number>;
	update(snapshots: readonly StationSnapshot[], timeSec: number): void;
	dispose(): void;
}

// Цвет индикатора между зелёным и красным по доле остатка безопасного времени (1 - зелёный, 0 - красный).
function mixSafeColor(ratio: number): number {
	const clamped = Math.min(1, Math.max(0, ratio));
	const red = Math.round(0xff * (1 - clamped) + 0x4c * clamped);
	const green = Math.round(0x3b * (1 - clamped) + 0xd9 * clamped);
	const blue = Math.round(0x30 * (1 - clamped) + 0x64 * clamped);
	return (red << 16) | (green << 8) | blue;
}

// Создаёт станции уровня. Основание и надстройки берутся по виду станции, либо по StationConfig.model.
export function createStationViews(level: LevelConfig, assets: LoadedAssets, items: ItemVisualFactory, registry: PlacedRegistry): StationViews {
	const root = new Group();
	root.name = "stations";
	const indicatorRoot = new Group();
	indicatorRoot.name = "station-indicators";
	const views = new Map<string, StationView>();
	const centers = new Map<string, { x: number; z: number }>();
	const surfaceHeights = new Map<string, number>();
	const disposables: Array<{ dispose(): void }> = [];

	// Общие геометрия и материалы индикаторов.
	const backgroundGeometry = new PlaneGeometry(indicatorWidth + indicatorBorder * 2, indicatorHeight + indicatorBorder * 2);
	const fillGeometry = new PlaneGeometry(indicatorWidth, indicatorHeight).translate(indicatorWidth / 2, 0, 0);
	const backgroundMaterial = new MeshBasicMaterial({ color: barBackgroundColor, side: DoubleSide, transparent: true, opacity: 0.85, depthTest: false });
	disposables.push(backgroundGeometry, fillGeometry, backgroundMaterial);

	// Материалы и геометрия урны.
	const trashGeometries: BufferGeometry[] = [
		new CylinderGeometry(0.3, 0.24, 0.62, 16),
		new TorusGeometry(0.3, 0.035, 8, 20).rotateX(Math.PI / 2),
		new CylinderGeometry(0.32, 0.32, 0.06, 16),
	];
	const trashMaterials: Material[] = [
		new MeshStandardMaterial({ color: trashColors.body, roughness: 0.7 }),
		new MeshStandardMaterial({ color: trashColors.rim, roughness: 0.6 }),
		new MeshStandardMaterial({ color: trashColors.lid, roughness: 0.6 }),
	];
	disposables.push(...trashGeometries, ...trashMaterials);

	function createTrash(): Object3D {
		const group = new Group();
		const body = new Mesh(trashGeometries[0], trashMaterials[0]);
		body.position.y = 0.31;
		const rim = new Mesh(trashGeometries[1], trashMaterials[1]);
		rim.position.y = 0.62;
		const lid = new Mesh(trashGeometries[2], trashMaterials[2]);
		lid.position.y = 0.66;
		lid.scale.set(0.85, 1, 0.85);
		group.add(body, rim, lid);
		return group;
	}

	// Добавляет модель в локальные координаты станции (без масштаба станции): центр в нуле, масштаб MODEL_SCALE.
	function addLocalModel(parent: Object3D, modelName: string, y = 0, scale = 1, tint?: number): Object3D {
		const wrapper = new Group();
		wrapper.add(assets.cloneModel(modelName, tint));
		wrapper.position.y = y;
		wrapper.scale.setScalar(MODEL_SCALE * scale);
		parent.add(wrapper);
		return wrapper;
	}

	for (const station of level.stations) {
		const stationRoot = new Group();
		const itemAnchor = new Group();
		stationRoot.add(itemAnchor);
		let surfaceY: number = stationSurfaceHeights.counter;
		// Тело кастрюли меняется при появлении рагу: храним текущее и родителя.
		const potState: PotState = { body: null, parent: stationRoot };

		// Статичная часть по виду станции.
		switch (station.kind) {
			case "crate":
				addLocalModel(stationRoot, station.model ?? crateModelNames[station.ingredient ?? "patty"]);
				surfaceY = 0.5;
				break;
			case "counter":
				addLocalModel(stationRoot, station.model ?? (stationBaseModelNames.counter as string));
				surfaceY = stationSurfaceHeights.counter;
				break;
			case "cuttingBoard":
				addLocalModel(stationRoot, station.model ?? (stationBaseModelNames.cuttingBoard as string));
				addLocalModel(stationRoot, stationTopModelNames.cuttingBoard, stationSurfaceHeights.counter);
				surfaceY = stationSurfaceHeights.counter + stationSurfaceHeights.boardThickness;
				break;
			case "pan":
				addLocalModel(stationRoot, station.model ?? (stationBaseModelNames.pan as string));
				addLocalModel(stationRoot, stationTopModelNames.pan, stationSurfaceHeights.stove);
				surfaceY = stationSurfaceHeights.stove + stationSurfaceHeights.panFloor;
				break;
			case "pot":
				addLocalModel(stationRoot, station.model ?? (stationBaseModelNames.pot as string));
				potState.body = addLocalModel(stationRoot, stationTopModelNames.pot, stationSurfaceHeights.stove);
				surfaceY = stationSurfaceHeights.stove + 0.05;
				break;
			case "oven":
				addLocalModel(stationRoot, station.model ?? (stationBaseModelNames.oven as string));
				surfaceY = stationSurfaceHeights.oven;
				break;
			case "plateStack":
				addLocalModel(stationRoot, station.model ?? (stationBaseModelNames.plateStack as string));
				addLocalModel(stationRoot, stationTopModelNames.plateStack, stationSurfaceHeights.counter);
				surfaceY = stationSurfaceHeights.counter;
				break;
			case "trash":
				stationRoot.add(createTrash());
				surfaceY = 0.7;
				break;
			case "servingWindow":
				addLocalModel(stationRoot, station.model ?? (stationBaseModelNames.servingWindow as string));
				surfaceY = 0.5;
				break;
		}
		itemAnchor.position.y = surfaceY;

		// Корень станции: центр прямоугольника и поворот rotationDeg. Масштаб MODEL_SCALE уже учтён в addLocalModel, сам корень
		// не масштабируется, чтобы предметы на станции строились в мировых единицах.
		const center = rectCenter(station.rect);
		stationRoot.position.set(center.x, 0, center.z);
		stationRoot.rotation.y = rotationToYaw(station.rotationDeg);
		stationRoot.name = station.id;
		stationRoot.userData.configId = station.id;
		registry.set(station.id, stationRoot);
		root.add(stationRoot);
		centers.set(station.id, center);
		surfaceHeights.set(station.id, surfaceY);

		// Индикатор прогресса: фон и полоса, лицом к камере, над станцией.
		const indicator = new Group();
		indicator.position.set(center.x, surfaceY + stationSurfaceHeights.indicatorLift, center.z);
		indicator.rotation.x = -(CAMERA_PITCH_DEG * Math.PI) / 180;
		indicator.renderOrder = 10;
		indicator.visible = false;
		const background = new Mesh(backgroundGeometry, backgroundMaterial);
		background.renderOrder = 10;
		const fillMaterial = new MeshBasicMaterial({ color: barProgressColor, side: DoubleSide, transparent: true, depthTest: false });
		disposables.push(fillMaterial);
		const fill = new Mesh(fillGeometry, fillMaterial);
		fill.position.set(-indicatorWidth / 2, 0, 0.001);
		fill.renderOrder = 11;
		indicator.add(background, fill);
		indicatorRoot.add(indicator);

		// Состояние динамической части.
		let signature = "";

		views.set(station.id, {
			id: station.id,
			config: station,
			update(snapshot, timeSec) {
				// 1. Предметы пересоздаются только при смене состава или вида.
				const nextSignature = `${snapshot.phase}|${snapshot.items.map((item) => getItemSignature(item)).join(";")}`;
				if (nextSignature !== signature) {
					signature = nextSignature;
					rebuildItems(station, snapshot, itemAnchor, potState);
				}

				// 2. Анимация предметов: покачивание при резке и готовке, подпрыгивание перед подгоранием.
				if (snapshot.phase === "processing") {
					itemAnchor.rotation.z = Math.sin(timeSec * 28) * 0.07;
					itemAnchor.position.y = surfaceY + Math.abs(Math.sin(timeSec * 14)) * 0.02;
				} else if (snapshot.phase === "ready" && snapshot.burnProgress > 1 - warningRemainingRatio) {
					itemAnchor.rotation.z = 0;
					itemAnchor.position.y = surfaceY + Math.abs(Math.sin(timeSec * 9)) * 0.025;
				} else {
					itemAnchor.rotation.z = 0;
					itemAnchor.position.y = surfaceY;
				}

				// 3. Индикатор: процесс идёт, прервана резка с прогрессом или готово (остаток безопасного времени).
				let ratio = 0;
				let color = barProgressColor;
				let visible = false;
				if (snapshot.phase === "processing" || (snapshot.phase === "holding" && snapshot.progress > 0)) {
					visible = true;
					ratio = snapshot.progress;
					color = barProgressColor;
				} else if (snapshot.phase === "ready" && (station.kind === "pan" || station.kind === "pot" || station.kind === "oven")) {
					visible = true;
					const safeRatio = 1 - snapshot.burnProgress;
					ratio = safeRatio;
					color = mixSafeColor(safeRatio);
					if (safeRatio < warningRemainingRatio && Math.floor(timeSec * warningBlinkHz * 2) % 2 === 0) {
						color = barBurnColor;
					}
				}
				indicator.visible = visible;
				if (visible) {
					fill.scale.x = Math.max(0.001, Math.min(1, ratio));
					fillMaterial.color.setHex(color);
				}
			},
		});
	}

	// Пересоздаёт предметы станции по снимку.
	function rebuildItems(station: StationConfig, snapshot: StationSnapshot, anchor: Group, potState: PotState): void {
		for (const child of [...anchor.children]) {
			anchor.remove(child);
		}
		const list: readonly Item[] = snapshot.items;
		if (station.kind === "pot" && potState.body !== null) {
			rebuildPot(snapshot, anchor, potState);
			return;
		}
		if (list.length === 0 || station.kind === "crate" || station.kind === "trash" || station.kind === "plateStack" || station.kind === "servingWindow") {
			return;
		}
		const visual = items.createItemVisual(list[0]);
		anchor.add(visual.object);
	}

	// Кастрюля: до готовки нарезанные овощи внутри, после готовки модель с рагу (сгоревшее затемняется).
	function rebuildPot(snapshot: StationSnapshot, anchor: Group, potState: PotState): void {
		const stew = snapshot.items.find((item) => item.type === "ingredient" && item.kind === "stew");
		const hasStew = stew !== undefined;
		// Меняем модель кастрюли: пустая или с рагу (сгоревшее затемняется).
		if (potState.body !== null) {
			potState.parent.remove(potState.body);
		}
		const burnt = stew?.type === "ingredient" && stew.state === "burnt";
		const nextBody = new Group();
		nextBody.add(assets.cloneModel(hasStew ? stationTopModelNames.potWithStew : stationTopModelNames.pot, burnt ? burntTintColor : undefined));
		nextBody.position.y = stationSurfaceHeights.stove;
		nextBody.scale.setScalar(MODEL_SCALE);
		potState.parent.add(nextBody);
		potState.body = nextBody;
		if (!hasStew) {
			const count = snapshot.items.length;
			snapshot.items.forEach((item, index) => {
				const visual = items.createItemVisual(item);
				const angle = (index / Math.max(count, 1)) * Math.PI * 2;
				visual.object.position.set(Math.cos(angle) * 0.12, 0.02, Math.sin(angle) * 0.12);
				visual.object.scale.multiplyScalar(0.7);
				anchor.add(visual.object);
			});
		}
	}

	return {
		root,
		indicatorRoot,
		views,
		surfaceHeights,
		getCenter(stationId) {
			return centers.get(stationId) ?? null;
		},
		update(snapshots, timeSec) {
			for (const snapshot of snapshots) {
				views.get(snapshot.id)?.update(snapshot, timeSec);
			}
		},
		dispose() {
			disposables.forEach((item) => item.dispose());
		},
	};
}
