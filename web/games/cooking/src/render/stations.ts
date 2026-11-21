// Станции кухни на сцене (задачи 6.2 и 6.5): модели по виду станции, предметы на станциях со сменой вида по состоянию,
// индикаторы прогресса резки, готовки и подгорания над станциями.
// Станция состоит из статичной части (основание и надстройка) и динамической (предметы по снимку StationSnapshot).
import {
	CylinderGeometry,
	BoxGeometry,
	ConeGeometry,
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
import { barBackgroundColor, barBurnColor, barBurnWarningColor, barProgressColor, trashColors } from "./palette";
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

// Размеры индикаторов над станцией (единицы мира): две полосы друг под другом. Верхняя зелёная заполняется, пока идёт готовка
// (резка), нижняя красная заполняется после готовности: когда она полна, блюдо сгорает.
const indicatorWidth = 0.72;
const indicatorRowHeight = 0.09;
const indicatorRowGap = 0.03;
const indicatorBorder = 0.025;

// Доля заполнения красной полосы, с которой она мигает (блюдо скоро сгорит), и частота мигания (Гц, не больше трёх вспышек в секунду).
const burnWarningRatio = 0.7;
const burnBlinkHz = 2;

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

// Доля, ограниченная отрезком 0..1.
function clampRatio(value: number): number {
	return Math.min(1, Math.max(0, value));
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

	// Общие геометрия и материалы индикаторов: подложка на одну полосу (доска) и на две (сковорода, кастрюля, духовка).
	const singleBackgroundGeometry = new PlaneGeometry(indicatorWidth + indicatorBorder * 2, indicatorRowHeight + indicatorBorder * 2);
	const doubleBackgroundGeometry = new PlaneGeometry(indicatorWidth + indicatorBorder * 2, indicatorRowHeight * 2 + indicatorRowGap + indicatorBorder * 2);
	const fillGeometry = new PlaneGeometry(indicatorWidth, indicatorRowHeight).translate(indicatorWidth / 2, 0, 0);
	const backgroundMaterial = new MeshBasicMaterial({ color: barBackgroundColor, side: DoubleSide, transparent: true, opacity: 0.85, depthTest: false });
	disposables.push(singleBackgroundGeometry, doubleBackgroundGeometry, fillGeometry, backgroundMaterial);

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
		let flame: Group | null = null;

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
			case "stove":
				addLocalModel(stationRoot, station.model ?? (stationBaseModelNames.stove as string));
				potState.body = addLocalModel(stationRoot, stationTopModelNames.pot, stationSurfaceHeights.stove);
				surfaceY = stationSurfaceHeights.stove + 0.05;
				flame = new Group();
				flame.name = `flame-${station.id}`;
				flame.visible = false;
				{
					const geometry = new ConeGeometry(0.075, 0.28, 8);
					const material = new MeshBasicMaterial({ color: 0xff8b24, transparent: true, opacity: 0.9, depthWrite: false });
					disposables.push(geometry, material);
					for (let index = 0; index < 4; index += 1) {
						const tongue = new Mesh(geometry, material);
						const angle = (index / 4) * Math.PI * 2;
						tongue.position.set(Math.cos(angle) * 0.19, 0.17, Math.sin(angle) * 0.19);
						flame.add(tongue);
					}
				}
				stationRoot.add(flame);
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
			case "tap": {
				const metal = new MeshStandardMaterial({ color: 0xb8c4c8, metalness: 0.75, roughness: 0.22 });
				const baseGeometry = new CylinderGeometry(0.2, 0.22, 0.08, 16);
				const stemGeometry = new CylinderGeometry(0.045, 0.06, 0.34, 12);
				const spoutGeometry = new CylinderGeometry(0.045, 0.045, 0.28, 12);
				const handleGeometry = new BoxGeometry(0.22, 0.045, 0.06);
				disposables.push(metal, baseGeometry, stemGeometry, spoutGeometry, handleGeometry);
				const base = new Mesh(baseGeometry, metal);
				base.position.y = 0.04;
				const stem = new Mesh(stemGeometry, metal);
				stem.position.set(0, 0.22, 0);
				const spout = new Mesh(spoutGeometry, metal);
				spout.rotation.z = Math.PI / 2;
				spout.position.set(0.13, 0.38, 0);
				const end = new Mesh(stemGeometry, metal);
				end.scale.set(0.8, 0.5, 0.8);
				end.position.set(0.27, 0.32, 0);
				const handle = new Mesh(handleGeometry, metal);
				handle.position.set(-0.12, 0.4, 0);
				stationRoot.add(base, stem, spout, end, handle);
				surfaceY = 0.52;
				break;
			}
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

		// Индикаторы: подложка и полосы, лицом к камере, над станцией. На сковороде, в кастрюле и в духовке две полосы
		// (готовка зелёная, подгорание красная), на доске одна (резка).
		const hasBurnRow = station.kind === "pan" || station.kind === "oven";
		const indicator = new Group();
		indicator.name = `indicator-${station.id}`;
		indicator.position.set(center.x, surfaceY + stationSurfaceHeights.indicatorLift, center.z);
		indicator.rotation.x = -(CAMERA_PITCH_DEG * Math.PI) / 180;
		indicator.renderOrder = 10;
		indicator.visible = false;
		const background = new Mesh(hasBurnRow ? doubleBackgroundGeometry : singleBackgroundGeometry, backgroundMaterial);
		background.renderOrder = 10;
		const rowOffset = hasBurnRow ? (indicatorRowHeight + indicatorRowGap) / 2 : 0;
		const progressMaterial = new MeshBasicMaterial({ color: barProgressColor, side: DoubleSide, transparent: true, depthTest: false });
		const progressFill = new Mesh(fillGeometry, progressMaterial);
		progressFill.name = "bar-progress";
		progressFill.position.set(-indicatorWidth / 2, rowOffset, 0.001);
		progressFill.renderOrder = 11;
		indicator.add(background, progressFill);
		let burnFill: Mesh | null = null;
		let burnMaterial: MeshBasicMaterial | null = null;
		disposables.push(progressMaterial);
		if (hasBurnRow) {
			burnMaterial = new MeshBasicMaterial({ color: barBurnColor, side: DoubleSide, transparent: true, depthTest: false });
			burnFill = new Mesh(fillGeometry, burnMaterial);
			burnFill.name = "bar-burn";
			burnFill.position.set(-indicatorWidth / 2, -rowOffset, 0.001);
			burnFill.renderOrder = 11;
			indicator.add(burnFill);
			disposables.push(burnMaterial);
		}
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
				if (flame) {
					flame.visible = snapshot.isHeating;
					flame.scale.y = 0.86 + Math.abs(Math.sin(timeSec * 18)) * 0.35;
				}

				// 2. Анимация предметов: покачивание при резке и готовке, подпрыгивание перед подгоранием.
				if (snapshot.phase === "processing") {
					itemAnchor.rotation.z = Math.sin(timeSec * 28) * 0.07;
					itemAnchor.position.y = surfaceY + Math.abs(Math.sin(timeSec * 14)) * 0.02;
				} else if (snapshot.phase === "ready" && snapshot.burnProgress >= burnWarningRatio) {
					itemAnchor.rotation.z = 0;
					itemAnchor.position.y = surfaceY + Math.abs(Math.sin(timeSec * 9)) * 0.025;
				} else {
					itemAnchor.rotation.z = 0;
					itemAnchor.position.y = surfaceY;
				}

				// 3. Индикаторы. Идёт готовка (или резка прервана с прогрессом): зелёная полоса заполняется. Готово: зелёная полна, красная
				// заполняется от пустой до полной, при полной блюдо сгорает. Сгоревшее и пустая станция индикаторов не показывают.
				let progressRatio = 0;
				let burnRatio = 0;
				let visible = false;
				if (snapshot.phase === "processing" || (snapshot.phase === "holding" && snapshot.progress > 0)) {
					visible = true;
					progressRatio = snapshot.progress;
				} else if (snapshot.phase === "ready" && (hasBurnRow || station.kind === "stove")) {
					visible = true;
					progressRatio = 1;
					burnRatio = snapshot.burnProgress;
				}
				indicator.visible = visible;
				if (visible) {
					progressFill.scale.x = Math.max(0.001, clampRatio(progressRatio));
					if (burnFill && burnMaterial) {
						burnFill.scale.x = Math.max(0.001, clampRatio(burnRatio));
						// Почти сгорело: красная полоса мигает с красного на оранжевый.
						const isWarning = burnRatio >= burnWarningRatio && Math.floor(timeSec * burnBlinkHz * 2) % 2 === 0;
						burnMaterial.color.setHex(isWarning ? barBurnWarningColor : barBurnColor);
					}
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
		if (station.kind === "stove" && potState.body !== null) {
			rebuildPot(snapshot, anchor, potState);
			return;
		}
		if (list.length === 0 || station.kind === "crate" || station.kind === "trash" || station.kind === "plateStack" || station.kind === "servingWindow") {
			return;
		}
		const visual = items.createItemVisual(list[0]);
		anchor.add(visual.object);
	}

	// Кастрюля на конфорке: овощи видны внутри до варки, после варки показывается модель готового рагу.
	function rebuildPot(snapshot: StationSnapshot, anchor: Group, potState: PotState): void {
		const pot = snapshot.items.find((item) => item.type === "pot");
		if (!pot || pot.type !== "pot") return;
		const hasStew = pot.portions > 0;
		if (potState.body !== null) {
			potState.parent.remove(potState.body);
		}
		const nextBody = new Group();
		nextBody.add(assets.cloneModel(hasStew ? stationTopModelNames.potWithStew : stationTopModelNames.pot));
		nextBody.position.y = stationSurfaceHeights.stove;
		nextBody.scale.setScalar(MODEL_SCALE);
		potState.parent.add(nextBody);
		potState.body = nextBody;
		if (!hasStew) {
			const count = pot.contents.length;
			pot.contents.forEach((item, index) => {
				const visual = items.createSpecVisual(item);
				const angle = (index / Math.max(count, 1)) * Math.PI * 2;
				visual.object.position.set(Math.cos(angle) * 0.12, 0.08, Math.sin(angle) * 0.12);
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
