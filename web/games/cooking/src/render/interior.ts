// Детали интерьера: холодильник в закрытом углу кухни, полки с банками, часы, рейлинг с утварью и магнитная планка с ножами,
// резиновые коврики у плит и досок, трап в полу; в зале ковры под большими столами, коврик у входа, грифельная доска меню,
// картины, бра, растение в углу и сервировка столов (салфетки, приборы, вазочки, солонки).
// Правило размещения: декор не создаёт ложных препятствий. Настенные вещи висят выше голов или выступают из стены не дальше
// чем на 0.1 (меньше радиуса персонажа 0.3, ближе к стене он не подходит); на полу лежат только плоские коврики; объёмные вещи стоят лишь там,
// куда персонажи не заходят (угол кухни, закрытый ящиками и стопкой тарелок; тупиковый угол зала).
import { DoubleSide, FrontSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, type Texture } from "three";
import { MODEL_SCALE, type LevelConfig, type Rect, type StationConfig, type TableConfig } from "../contracts";
import { rectCenter, rectsOverlap } from "../common/math";
import { createRng } from "../sim/core/rng";
import type { LoadedAssets } from "./assets";
import { createDecorKit, createMeshBatch, type DecorKit, type DecorMaterials } from "./batch";
import { getWallWindowModel, rotationToYaw, wallPieceIndex } from "./layout";
import { tableTopHeight } from "./tableware";
import { textureTileSizes, type SceneTextures } from "./textures";

// Интерьер сцены.
export interface Interior {
	readonly root: Group;
	dispose(): void;
}

// Отступ лицевой стороны стены от края её полосы: модели стен растянуты по толщине на всю полосу 0.5 (layout.ts).
const wallFaceInset = 0;
// Высота плоских ковриков над полом.
const rugY = 0.006;

// Размеры картин в мире по пропорциям их текстур (пейзаж, натюрморт, абстракция).
const paintingSizes = [
	{ width: 0.5, height: 0.38 },
	{ width: 0.32, height: 0.42 },
	{ width: 0.5, height: 0.38 },
] as const;

// Палитра интерьера (sRGB).
const colors = {
	shelfWood: 0x9a6a43,
	bracket: 0x5b6369,
	jarGlass: 0xd9ecef,
	jarContents: [0xc0392b, 0xe9b949, 0x6a994e, 0x8b5a2b, 0xf4e1c1] as const,
	jarLid: 0xb8c4c8,
	steel: 0xc9d1d6,
	darkHandle: 0x2b2f33,
	knifeStrip: 0x3a3f44,
	clockRim: 0x2f3a40,
	clockFace: 0xfaf7ef,
	matBorder: 0x56626a,
	drain: 0x6b7378,
	doormat: 0x9c7446,
	doormatBorder: 0x6b4c2c,
	frameWood: 0x6e4429,
	frameGold: 0xc9a227,
	sconceBrass: 0xb08d57,
	sconceShade: 0xfff1cf,
	potTerracotta: 0xc0703f,
	potRim: 0xa65f33,
	leaves: [0x4f9142, 0x5fa64b, 0x3f7d3a] as const,
	napkin: 0xc94a4a,
	cutlery: 0xd5dade,
	vase: 0xf4f6f8,
	vaseBlue: 0x5b8fc9,
	flowers: [0xe63946, 0xffd166, 0xff8fab, 0x9d4edd] as const,
	salt: 0xf7f7f2,
	pepper: 0x3a3a3a,
	apron: [0xe9e4d8, 0x8fb9c9] as const,
	extinguisher: 0xd23b2f,
} as const;

// Свободна ли клетка от станций.
function isCellFree(cell: Rect, stations: readonly StationConfig[]): boolean {
	return !stations.some((station) => rectsOverlap(cell, station.rect));
}

// Банка на полке: глянцевое тело цвета содержимого, светлое горлышко из стекла и металлическая крышка.
function addJar(kit: DecorKit, materials: DecorMaterials, x: number, y: number, z: number, height: number, contents: number): void {
	kit.cylinder(materials.glossy, contents, 0.05, 0.05, height * 0.78, x, y + height * 0.39, z, undefined, 10);
	kit.cylinder(materials.glossy, colors.jarGlass, 0.046, 0.05, height * 0.22, x, y + height * 0.89, z, undefined, 10);
	kit.cylinder(materials.metal, colors.jarLid, 0.052, 0.052, 0.028, x, y + height + 0.014, z, undefined, 10);
}

// Полка: доска и два кронштейна под ней. Задняя кромка у стены (z = faceZ), полка выступает в комнату.
function addShelf(kit: DecorKit, materials: DecorMaterials, centerX: number, y: number, faceZ: number, width: number, depth: number): void {
	kit.box(materials.matte, colors.shelfWood, width, 0.04, depth, centerX, y, faceZ + depth / 2);
	for (const side of [-1, 1]) {
		kit.box(materials.metal, colors.bracket, 0.03, 0.14, depth * 0.8, centerX + side * (width / 2 - 0.12), y - 0.09, faceZ + depth * 0.4);
	}
}

// Рамка с картинкой: деревянная рамка в общем наборе, картинка отдельным мешем с текстурой.
function addFramedPicture(kit: DecorKit, materials: DecorMaterials, pictures: Group, pictureMaterial: MeshStandardMaterial, x: number, y: number, z: number, rotationY: number, width: number, height: number, frameColor: number): void {
	kit.at(x, y, z, rotationY, () => {
		kit.box(materials.matte, frameColor, width + 0.06, height + 0.06, 0.03, 0, 0, 0.015);
	});
	const picture = new Mesh(new PlaneGeometry(width, height), pictureMaterial);
	picture.position.set(x + Math.sin(rotationY) * 0.032, y, z + Math.cos(rotationY) * 0.032);
	picture.rotation.y = rotationY;
	pictures.add(picture);
}

// Бра: латунное основание, изогнутый держатель и светящийся плафон.
function addSconce(kit: DecorKit, materials: DecorMaterials, x: number, y: number, z: number, rotationY: number): void {
	kit.at(x, y, z, rotationY, () => {
		kit.box(materials.metal, colors.sconceBrass, 0.07, 0.12, 0.02, 0, 0, 0.01);
		kit.box(materials.metal, colors.sconceBrass, 0.02, 0.02, 0.09, 0, 0.02, 0.06);
		kit.cylinder(materials.glow, colors.sconceShade, 0.035, 0.055, 0.09, 0, 0.07, 0.1, undefined, 10);
	});
}

// Растение в кадке: терракотовый горшок, земля и пучок листьев-многогранников.
function addPottedPlant(kit: DecorKit, materials: DecorMaterials, x: number, z: number): void {
	kit.cylinder(materials.matte, colors.potTerracotta, 0.2, 0.15, 0.32, x, 0.16, z, undefined, 12);
	kit.cylinder(materials.matte, colors.potRim, 0.215, 0.215, 0.05, x, 0.32, z, undefined, 12);
	kit.cylinder(materials.matte, 0x4a3628, 0.19, 0.19, 0.02, x, 0.335, z, undefined, 12);
	const leafSpots: Array<[number, number, number, number]> = [
		[0, 0.62, 0, 0.24],
		[0.13, 0.5, 0.05, 0.17],
		[-0.12, 0.52, -0.03, 0.18],
		[0.03, 0.82, -0.04, 0.16],
		[-0.06, 0.44, 0.12, 0.14],
	];
	leafSpots.forEach(([dx, y, dz, radius], index) => {
		kit.icosahedron(materials.foliage, colors.leaves[index % colors.leaves.length], radius, x + dx, y, z + dz, { y: 1.15 }, 1);
	});
}

// Сервировка одного места: салфетка с вилкой с одной стороны тарелки и нож с другой. facingYaw: куда смотрит сидящий.
function addPlaceSetting(kit: DecorKit, materials: DecorMaterials, dishX: number, dishZ: number, facingYaw: number, offset: number, length: number): void {
	kit.at(dishX, tableTopHeight, dishZ, facingYaw, () => {
		kit.box(materials.matte, colors.napkin, 0.1, 0.006, length + 0.02, -offset, 0.003, 0);
		kit.box(materials.metal, colors.cutlery, 0.026, 0.006, length - 0.01, -offset, 0.009, 0);
		kit.box(materials.metal, colors.cutlery, 0.022, 0.006, length, offset, 0.004, 0);
	});
}

// Вазочка с цветком на столе.
function addVase(kit: DecorKit, materials: DecorMaterials, x: number, z: number, vaseColor: number, flowerColor: number): void {
	const y = tableTopHeight;
	kit.cylinder(materials.glossy, vaseColor, 0.03, 0.045, 0.11, x, y + 0.055, z, undefined, 10);
	kit.cylinder(materials.matte, 0x4f9142, 0.006, 0.006, 0.08, x, y + 0.14, z, undefined, 4);
	kit.icosahedron(materials.foliage, 0x5fa64b, 0.028, x + 0.025, y + 0.15, z, { y: 0.6 }, 0);
	kit.sphere(materials.matte, flowerColor, 0.04, x, y + 0.19, z, { y: 0.8 }, 8);
}

// Солонка и перечница.
function addShakers(kit: DecorKit, materials: DecorMaterials, x: number, z: number): void {
	const y = tableTopHeight;
	kit.cylinder(materials.glossy, colors.salt, 0.02, 0.022, 0.06, x - 0.03, y + 0.03, z, undefined, 8);
	kit.cylinder(materials.glossy, colors.pepper, 0.02, 0.022, 0.06, x + 0.03, y + 0.03, z, undefined, 8);
	kit.cylinder(materials.metal, colors.steel, 0.018, 0.018, 0.012, x - 0.03, y + 0.066, z, undefined, 8);
	kit.cylinder(materials.metal, colors.steel, 0.018, 0.018, 0.012, x + 0.03, y + 0.066, z, undefined, 8);
}

// Сервировка стола: приборы у каждого места и украшение в свободной части столешницы.
function addTableDecor(kit: DecorKit, materials: DecorMaterials, table: TableConfig, index: number): void {
	const center = rectCenter(table.rect);
	for (const seat of table.seats) {
		const isLarge = table.seats.length === 4;
		addPlaceSetting(kit, materials, seat.dishPoint.x, seat.dishPoint.z, rotationToYaw(seat.rotationDeg), isLarge ? 0.25 : 0.29, isLarge ? 0.15 : 0.18);
	}
	const flower = colors.flowers[index % colors.flowers.length];
	if (table.seats.length === 4) {
		// Центр большого стола свободен: блюда стоят ближе к краям.
		addVase(kit, materials, center.x - 0.04, center.z - 0.02, colors.vaseBlue, flower);
		addShakers(kit, materials, center.x + 0.08, center.z + 0.06);
	} else {
		// На малом столе блюда занимают середину, вазочка стоит у дальнего от камеры края.
		addVase(kit, materials, center.x, center.z - table.rect.depth * 0.34, colors.vase, flower);
	}
}

// Строит интерьер по данным уровня. Положения настенных вещей берутся от стен и пола кухни и зала.
export function createInterior(level: LevelConfig, assets: LoadedAssets, materials: DecorMaterials, textures: SceneTextures): Interior {
	const root = new Group();
	root.name = "interior";
	const disposables: Array<{ dispose(): void }> = [];
	const batch = createMeshBatch();
	const kit = createDecorKit(batch);
	const rng = createRng(7031);
	const pictures = new Group();
	pictures.name = "interior-pictures";
	const kitchen = level.floors.find((floor) => floor.zone === "kitchen")?.rect ?? null;
	const hall = level.floors.find((floor) => floor.zone === "hall")?.rect ?? null;

	// Материалы с текстурами: картины, доска меню, ковры, коврик кухни.
	function texturedMaterial(texture: Texture | null, fallbackColor: number): MeshStandardMaterial {
		const material = new MeshStandardMaterial({ map: texture, color: texture ? 0xffffff : fallbackColor, roughness: 0.85, side: DoubleSide });
		disposables.push(material);
		return material;
	}
	const paintingMaterials = textures.paintings.map((texture, index) => texturedMaterial(texture, [0x7cc0e8, 0xf2dcb3, 0xe9c46a][index % 3]));
	const chalkboardMaterial = texturedMaterial(textures.chalkboard, 0x2f3d36);
	const rugMaterial = texturedMaterial(textures.rug, 0x8a2f3b);
	rugMaterial.side = FrontSide;
	const kitchenMatMaterial = new MeshStandardMaterial({ map: textures.kitchenMat, color: textures.kitchenMat ? 0xffffff : 0x6c7a83, roughness: 0.95 });
	disposables.push(kitchenMatMaterial);

	// Северная стена: какие куски уже заняты окнами (окна ставит layout.ts по тем же правилам).
	const northFaceZ = level.bounds.z + 0.5 - wallFaceInset;
	const windowPieces = new Set(level.props.filter((prop) => getWallWindowModel(prop) !== null).map((prop) => prop.id));

	// 1. Кухня.
	if (kitchen) {
		const kitchenRight = kitchen.x + kitchen.width;
		// Холодильник в северо-восточном углу кухни, если клетка свободна и закрыта станциями с юга и запада (туда не зайти).
		const fridgeCell: Rect = { x: kitchenRight - 1, z: kitchen.z, width: 1, depth: 1 };
		const southCell: Rect = { x: fridgeCell.x, z: fridgeCell.z + 1, width: 1, depth: 1 };
		const westCell: Rect = { x: fridgeCell.x - 1, z: fridgeCell.z, width: 1, depth: 1 };
		const hasFridge = assets.has("fridge_A") && isCellFree(fridgeCell, level.stations) && !isCellFree(southCell, level.stations) && !isCellFree(westCell, level.stations);
		if (hasFridge) {
			const fridge = new Group();
			fridge.add(assets.cloneModel("fridge_A"));
			fridge.scale.setScalar(MODEL_SCALE);
			// Задняя стенка модели (z = -0.5 после масштаба) прижата к стене.
			fridge.position.set(fridgeCell.x + 0.5, 0, northFaceZ + 0.5);
			fridge.name = "decor-fridge";
			fridge.traverse((node) => {
				node.castShadow = true;
				node.receiveShadow = true;
			});
			root.add(fridge);
		}

		// Полки с банками в левой части северной стены (над ящиками).
		const shelfX = kitchen.x + 0.85;
		addShelf(kit, materials, shelfX, 1.02, northFaceZ, 1.2, 0.22);
		addShelf(kit, materials, shelfX, 1.46, northFaceZ, 1.2, 0.22);
		for (let index = 0; index < 4; index += 1) {
			const jarX = shelfX - 0.42 + index * 0.27;
			addJar(kit, materials, jarX, 1.04, northFaceZ + 0.11, 0.12 + (index % 2) * 0.04, colors.jarContents[index % colors.jarContents.length]);
		}
		// Верхняя полка: кастрюлька, стопка мисок и две банки.
		kit.cylinder(materials.metal, colors.steel, 0.1, 0.09, 0.12, shelfX - 0.35, 1.54, northFaceZ + 0.11, undefined, 12);
		kit.box(materials.metal, colors.darkHandle, 0.12, 0.02, 0.02, shelfX - 0.35 + 0.15, 1.58, northFaceZ + 0.11);
		for (let bowl = 0; bowl < 3; bowl += 1) {
			kit.cylinder(materials.glossy, 0xf2efe6, 0.085 - bowl * 0.008, 0.06 - bowl * 0.006, 0.035, shelfX + 0.05, 1.5 + bowl * 0.03, northFaceZ + 0.11, undefined, 12);
		}
		addJar(kit, materials, shelfX + 0.3, 1.48, northFaceZ + 0.11, 0.14, colors.jarContents[4]);
		addJar(kit, materials, shelfX + 0.45, 1.48, northFaceZ + 0.11, 0.1, colors.jarContents[1]);

		// Часы над полками.
		{
			const clockX = shelfX + 0.28;
			const clockY = 1.83;
			kit.cylinder(materials.matte, colors.clockRim, 0.14, 0.14, 0.04, clockX, clockY, northFaceZ + 0.02, { x: Math.PI / 2 }, 20);
			kit.cylinder(materials.matte, colors.clockFace, 0.118, 0.118, 0.02, clockX, clockY, northFaceZ + 0.035, { x: Math.PI / 2 }, 20);
			kit.box(materials.matte, colors.darkHandle, 0.016, 0.085, 0.008, clockX + 0.02, clockY + 0.035, northFaceZ + 0.05, { z: -0.6 });
			kit.box(materials.matte, colors.darkHandle, 0.012, 0.11, 0.008, clockX - 0.03, clockY + 0.045, northFaceZ + 0.052, { z: 0.55 });
			kit.sphere(materials.matte, colors.napkin, 0.012, clockX, clockY, northFaceZ + 0.058, undefined, 6);
		}

		// Рейлинг с утварью и магнитная планка с ножами в середине северной стены.
		{
			const railCenter = kitchen.x + 4.4;
			const railY = 1.56;
			const railZ = northFaceZ + 0.07;
			kit.cylinder(materials.metal, colors.steel, 0.012, 0.012, 1.4, railCenter, railY, railZ, { z: Math.PI / 2 }, 6);
			for (const side of [-0.66, 0.66]) {
				kit.box(materials.metal, colors.steel, 0.02, 0.02, 0.08, railCenter + side, railY, railZ - 0.035);
			}
			// Половник, лопатка, венчик, сковородка, шумовка.
			const utensilXs = [-0.5, -0.25, 0, 0.27, 0.52];
			utensilXs.forEach((offset, index) => {
				const x = railCenter + offset;
				kit.box(materials.metal, colors.steel, 0.012, 0.05, 0.012, x, railY - 0.03, railZ);
				if (index === 3) {
					kit.box(materials.metal, colors.darkHandle, 0.025, 0.16, 0.015, x, railY - 0.13, railZ);
					kit.cylinder(materials.metal, 0x3d4247, 0.11, 0.1, 0.025, x, railY - 0.32, railZ + 0.01, { x: Math.PI / 2 }, 16);
					return;
				}
				kit.box(materials.metal, index === 1 ? colors.darkHandle : colors.steel, 0.018, 0.24, 0.012, x, railY - 0.17, railZ);
				if (index === 0 || index === 4) {
					kit.sphere(materials.metal, colors.steel, 0.055, x, railY - 0.31, railZ + 0.02, { z: 0.55 }, 10);
				} else if (index === 1) {
					kit.box(materials.metal, colors.steel, 0.075, 0.1, 0.008, x, railY - 0.33, railZ);
				} else {
					kit.sphere(materials.metal, colors.steel, 0.045, x, railY - 0.33, railZ, { y: 1.6 }, 8);
				}
			});
			const stripY = 1.12;
			kit.box(materials.matte, colors.knifeStrip, 0.62, 0.05, 0.02, railCenter, stripY, northFaceZ + 0.012);
			for (let knife = 0; knife < 4; knife += 1) {
				const x = railCenter - 0.22 + knife * 0.145;
				kit.box(materials.matte, colors.darkHandle, 0.026, 0.07, 0.022, x, stripY + 0.055, northFaceZ + 0.03);
				kit.box(materials.metal, colors.steel, 0.032 - knife * 0.003, 0.15 + (knife % 2) * 0.03, 0.006, x, stripY - 0.07, northFaceZ + 0.03);
			}
		}

		// Полка с бумажными полотенцами справа на северной стене (модель пака).
		if (assets.has("shelf_papertowel")) {
			const towelShelf = new Group();
			towelShelf.add(assets.cloneModel("shelf_papertowel"));
			towelShelf.scale.setScalar(MODEL_SCALE * 0.8);
			towelShelf.position.set(kitchenRight - (hasFridge ? 1.55 : 0.8), 1.55, northFaceZ);
			towelShelf.traverse((node) => {
				node.castShadow = true;
			});
			root.add(towelShelf);
		}

		// Западная стена: крючки с фартуками и огнетушитель внизу (выступают от стены не дальше 0.1).
		const westFaceX = level.bounds.x + 0.5 - wallFaceInset;
		{
			const hookZ = kitchen.z + kitchen.depth * 0.5;
			for (let apron = 0; apron < 2; apron += 1) {
				const z = hookZ + apron * 0.35;
				kit.box(materials.metal, colors.steel, 0.05, 0.02, 0.02, westFaceX + 0.025, 1.38, z);
				kit.box(materials.matte, colors.apron[apron], 0.03, 0.42, 0.24, westFaceX + 0.035, 1.16, z, { z: 0.03 });
			}
			const extinguisherZ = kitchen.z + kitchen.depth - 0.7;
			kit.cylinder(materials.glossy, colors.extinguisher, 0.055, 0.055, 0.3, westFaceX + 0.06, 0.42, extinguisherZ, undefined, 10);
			kit.cylinder(materials.metal, colors.darkHandle, 0.025, 0.035, 0.06, westFaceX + 0.06, 0.6, extinguisherZ, undefined, 8);
			kit.box(materials.metal, colors.darkHandle, 0.05, 0.015, 0.06, westFaceX + 0.07, 0.64, extinguisherZ + 0.03);
		}

		// Резиновые коврики: перед рядом плит (сковороды, конфорки, духовка) и перед рядом разделочных досок.
		const addMatInFront = (kinds: ReadonlyArray<StationConfig["kind"]>) => {
			const row = level.stations.filter((station) => kinds.includes(station.kind));
			if (row.length === 0) {
				return;
			}
			const rowZ = row[0].rect.z;
			const sameRow = row.filter((station) => station.rect.z === rowZ);
			const left = Math.min(...sameRow.map((station) => station.rect.x)) + 0.05;
			const right = Math.min(kitchenRight, Math.max(...sameRow.map((station) => station.rect.x + station.rect.width))) - 0.05;
			const matTop = rowZ + 1.06;
			const matBottom = Math.min(kitchen.z + kitchen.depth - 0.1, matTop + 0.6);
			// Коврик только на свободном полу перед рядом.
			const matRect: Rect = { x: left, z: matTop, width: right - left, depth: matBottom - matTop };
			if (!isCellFree(matRect, level.stations)) {
				return;
			}
			const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
			const uv = geometry.getAttribute("uv");
			for (let index = 0; index < uv.count; index += 1) {
				uv.setXY(index, (uv.getX(index) * matRect.width) / textureTileSizes.kitchenMat, (uv.getY(index) * matRect.depth) / textureTileSizes.kitchenMat);
			}
			disposables.push(geometry);
			const mat = new Mesh(geometry, kitchenMatMaterial);
			mat.scale.set(matRect.width, 1, matRect.depth);
			mat.position.set(left + matRect.width / 2, rugY, matTop + matRect.depth / 2);
			mat.receiveShadow = true;
			root.add(mat);
			kit.box(materials.matte, colors.matBorder, matRect.width + 0.05, 0.008, matRect.depth + 0.05, left + matRect.width / 2, rugY - 0.002, matTop + matRect.depth / 2);
		};
		addMatInFront(["pan", "stove", "oven"]);
		addMatInFront(["cuttingBoard"]);

		// Трап в полу у южной стены кухни.
		{
			const drainX = kitchen.x + kitchen.width * 0.55;
			const drainZ = kitchen.z + kitchen.depth - 0.9;
			kit.box(materials.metal, colors.drain, 0.32, 0.01, 0.32, drainX, 0.004, drainZ);
			for (let slot = 0; slot < 4; slot += 1) {
				kit.box(materials.matte, 0x23282c, 0.24, 0.012, 0.025, drainX, 0.006, drainZ - 0.105 + slot * 0.07);
			}
		}
	}

	// 2. Зал.
	if (hall) {
		const hallCenterX = hall.x + hall.width / 2;
		// Грифельная доска меню на северной стене в левой части зала.
		{
			const boardX = hall.x + 0.8;
			const boardY = 1.38;
			kit.box(materials.matte, 0x6e4429, 1.08, 0.74, 0.03, boardX, boardY, northFaceZ + 0.015);
			const board = new Mesh(new PlaneGeometry(1.0, 0.66), chalkboardMaterial);
			board.position.set(boardX, boardY, northFaceZ + 0.032);
			pictures.add(board);
		}
		// Бра по сторонам от окна и картины в правой части северной стены.
		const northWindow = level.props.find((prop) => windowPieces.has(prop.id) && wallPieceIndex(prop.id, "north") !== null && prop.rect.x >= hall.x - 0.01);
		const sconceXs = northWindow ? [northWindow.rect.x - 0.08, northWindow.rect.x + northWindow.rect.width + 0.08] : [hallCenterX - 1, hallCenterX + 1];
		sconceXs.forEach((x) => addSconce(kit, materials, x, 1.45, northFaceZ, 0));
		const picturesStart = northWindow ? northWindow.rect.x + northWindow.rect.width + 0.55 : hallCenterX + 1.4;
		// Восточная стена зала: лицевая сторона её модели ограничивает картины северной стены справа.
		const eastFaceX = level.bounds.x + level.bounds.width - 0.5 + wallFaceInset;
		if (picturesStart + 0.28 < eastFaceX - 0.05) {
			addFramedPicture(kit, materials, pictures, paintingMaterials[0], picturesStart, 1.4, northFaceZ, 0, paintingSizes[0].width, paintingSizes[0].height, colors.frameGold);
		}
		if (picturesStart + 0.68 + 0.2 < eastFaceX - 0.05) {
			addFramedPicture(kit, materials, pictures, paintingMaterials[1], picturesStart + 0.68, 1.36, northFaceZ, 0, paintingSizes[1].width, paintingSizes[1].height, colors.frameWood);
		}

		// Восточная стена зала: картины и бра на кусках без окон.
		for (const prop of level.props) {
			const pieceIndex = wallPieceIndex(prop.id, "east");
			if (pieceIndex === null || windowPieces.has(prop.id)) {
				continue;
			}
			const middleZ = prop.rect.z + prop.rect.depth / 2;
			if (pieceIndex % 2 === 0) {
				const paintingIndex = (pieceIndex / 2) % paintingMaterials.length;
				const size = paintingSizes[paintingIndex % paintingSizes.length];
				addFramedPicture(kit, materials, pictures, paintingMaterials[paintingIndex], eastFaceX, 1.4, middleZ, -Math.PI / 2, size.width * 1.1, size.height * 1.1, pieceIndex === 2 ? colors.frameWood : colors.frameGold);
			}
			addSconce(kit, materials, eastFaceX, 1.45, prop.rect.z + (pieceIndex === 0 ? 0.25 : 0.15), -Math.PI / 2);
		}

		// Растение в северо-западном углу зала, если рядом нет мест и точек подхода (угол тупиковый).
		const plantX = hall.x + 0.38;
		const plantZ = hall.z + 0.38;
		const nearSeat = level.tables.some((table) =>
			table.seats.some((seat) => Math.hypot(seat.approachPoint.x - plantX, seat.approachPoint.z - plantZ) < 0.8 || Math.hypot(seat.sitPoint.x - plantX, seat.sitPoint.z - plantZ) < 0.8),
		);
		const nearWaiter = level.waiters.waitPoints.some((waitPoint) => Math.hypot(waitPoint.x - plantX, waitPoint.z - plantZ) < 0.8) || Math.hypot(level.window.pickupPoint.x - plantX, level.window.pickupPoint.z - plantZ) < 0.8;
		if (!nearSeat && !nearWaiter) {
			addPottedPlant(kit, materials, plantX, plantZ);
		}

		// Ковры под столами на четыре места.
		const rugGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
		disposables.push(rugGeometry);
		for (const table of level.tables) {
			if (table.seats.length !== 4) {
				continue;
			}
			const center = rectCenter(table.rect);
			const size = table.rect.width + 0.85;
			const rug = new Mesh(rugGeometry, rugMaterial);
			rug.scale.set(size, 1, size);
			rug.position.set(center.x, rugY, center.z);
			rug.receiveShadow = true;
			root.add(rug);
		}

		// Коврик у двери изнутри.
		const door = level.door.rect;
		kit.box(materials.matte, colors.doormatBorder, 1.3, 0.012, 0.46, door.x + door.width / 2, rugY, door.z - 0.28);
		kit.box(materials.matte, colors.doormat, 1.16, 0.014, 0.34, door.x + door.width / 2, rugY + 0.001, door.z - 0.28);

		// Сервировка столов.
		level.tables.forEach((table, index) => addTableDecor(kit, materials, table, index + Math.floor(rng.next() * 2)));
	}

	const decor = batch.build("interior-decor");
	root.add(decor, pictures);
	kit.disposeTemplates();
	disposables.push(batch);
	pictures.traverse((node) => {
		const mesh = node as Mesh;
		if (mesh.isMesh) {
			disposables.push(mesh.geometry);
			mesh.receiveShadow = true;
		}
	});

	return {
		root,
		dispose() {
			disposables.forEach((item) => item.dispose());
			root.clear();
		},
	};
}
