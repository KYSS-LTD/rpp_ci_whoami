// Окружение ресторана: трава до края кадра, тротуар у входа, дорога с разметкой и переходом, дальний тротуар, ящики с цветами
// вдоль фасада, кадки у двери, фонари (загораются к вечеру), гидрант, урна, штендер, скамейки, велопарковка,
// деревья и кусты вокруг здания, дома через дорогу и проезжающие машины.
// Ничего из этого не участвует в навигации: декор стоит вне сетки уровня или в местах, куда персонажи не заходят
// (вдоль фасада, по краям тротуара). Высокие предметы не ставятся южнее очереди, чтобы не заслонять её от камеры.
// Статичный декор склеивается по материалам (batch.ts) и отбрасывает запечённые тени; машины двигаются и теней не дают.
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, TorusGeometry, type Material } from "three";
import type { LevelConfig, Rect } from "../contracts";
import { createRng } from "../sim/core/rng";
import { createDecorKit, createMeshBatch, createWorldPlaneGeometry, type DecorKit, type DecorMaterials } from "./batch";
import { textureTileSizes, type SceneTextures } from "./textures";

// Окружение сцены.
export interface Environment {
	readonly root: Group;
	// Материал плитки тротуара: им же рисуется зона улицы уровня, чтобы плитка шла без шва.
	readonly pavingMaterial: MeshStandardMaterial;
	update(frameDtSec: number, dayProgress: number): void;
	dispose(): void;
}

// Высоты поверхностей окружения: трава чуть ниже пола уровня, дорога между травой и тротуаром.
const groundY = -0.04;
const roadY = -0.032;
const markingY = -0.028;

// Половина размера травяного поля вокруг ресторана (единицы мира): хватает на портретный экран телефона.
const groundHalfSize = 90;
// Насколько далеко тянутся тротуары и дорога в стороны от ресторана.
const streetReach = 70;

// Палитра окружения (sRGB): подобрана под тёплые цвета пака.
const colors = {
	curb: 0xbdb8ae,
	foundation: 0xcfc9bd,
	marking: 0xf3f1e7,
	markingEdge: 0xe9dfb8,
	trunk: 0x7a5232,
	leaves: [0x5c9e48, 0x6fb24e, 0x4e8a3e, 0x7cbc55, 0x8cc063] as const,
	conifer: [0x3f7d4a, 0x4a8c55, 0x356b40] as const,
	bush: [0x4f9142, 0x5fa64b, 0x6db356] as const,
	planterWood: 0x8b5a3c,
	planterTrim: 0x6e4429,
	soil: 0x4a3628,
	flowers: [0xe63946, 0xff8fab, 0xffd166, 0xfdfdfd, 0x9d4edd, 0xff9f1c] as const,
	terracotta: 0xc0703f,
	lampPost: 0x2f4f4f,
	lampGlass: 0xffe3a3,
	hydrant: 0xc0392b,
	hydrantCap: 0xe0b84a,
	binBody: 0x3d6b4f,
	benchWood: 0xb07a4a,
	benchIron: 0x2b3036,
	doormat: 0x9c7446,
	doormatBorder: 0x6b4c2c,
	houseWalls: [0xf2d0a4, 0xc9e4de, 0xf7d6e0, 0xdbe7f3, 0xf6eac2, 0xe8d5f0] as const,
	houseRoofs: [0xb5524a, 0x5d6d7e, 0x8a5a44, 0x9c6b4e] as const,
	houseWindow: 0x9fc5e8,
	houseFrame: 0xfaf7f0,
	houseDoor: 0x7b4b2a,
	carPaint: [0xd94b3d, 0x3f7fc8, 0xf2c14e, 0xf4f4f0, 0x2fa38e, 0x8e5bb5] as const,
	carGlass: 0x9cc3d8,
	tyre: 0x22252a,
	headlight: 0xfff4cf,
	taillight: 0xff5a4f,
} as const;

// Треугольная призма для двускатных крыш: основание шириной 1 и глубиной 1 на y = 0, конёк на y = 1 вдоль оси x.
function createGableGeometry(): BufferGeometry {
	const a = [-0.5, 0, -0.5];
	const b = [-0.5, 0, 0.5];
	const c = [-0.5, 1, 0];
	const d = [0.5, 0, -0.5];
	const e = [0.5, 0, 0.5];
	const f = [0.5, 1, 0];
	// Треугольники против часовой стрелки снаружи: торцы, два ската, низ.
	const triangles = [a, b, c, d, f, e, b, e, f, b, f, c, a, c, f, a, f, d, a, d, e, a, e, b];
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new BufferAttribute(new Float32Array(triangles.flat()), 3));
	geometry.setAttribute("uv", new BufferAttribute(new Float32Array(triangles.length * 2), 2));
	geometry.computeVertexNormals();
	return geometry;
}

// Круглое дерево: ствол и две-три кроны-многогранника. detail 1 для деревьев рядом с рестораном, 0 для дальних (меньше вершин).
function addRoundTree(kit: DecorKit, materials: DecorMaterials, x: number, z: number, size: number, colorIndex: number, detail = 1): void {
	const trunkHeight = 1.0 * size;
	kit.cylinder(materials.matte, colors.trunk, 0.08 * size, 0.12 * size, trunkHeight, x, trunkHeight / 2, z, undefined, 7);
	const leafColor = colors.leaves[colorIndex % colors.leaves.length];
	const leafColorAlt = colors.leaves[(colorIndex + 2) % colors.leaves.length];
	kit.icosahedron(materials.foliage, leafColor, 0.82 * size, x, trunkHeight + 0.45 * size, z, { y: 0.92 }, detail);
	kit.icosahedron(materials.foliage, leafColorAlt, 0.55 * size, x + 0.42 * size, trunkHeight + 0.2 * size, z + 0.18 * size, undefined, detail);
	if (detail > 0) {
		kit.icosahedron(materials.foliage, leafColor, 0.5 * size, x - 0.38 * size, trunkHeight + 0.28 * size, z - 0.22 * size, undefined, detail);
	}
}

// Ель: короткий ствол и три конуса.
function addConifer(kit: DecorKit, materials: DecorMaterials, x: number, z: number, size: number, colorIndex: number): void {
	kit.cylinder(materials.matte, colors.trunk, 0.07 * size, 0.1 * size, 0.5 * size, x, 0.25 * size, z, undefined, 6);
	const color = colors.conifer[colorIndex % colors.conifer.length];
	kit.cone(materials.foliage, color, 0.78 * size, 1.0 * size, x, 0.95 * size, z, undefined, 8);
	kit.cone(materials.foliage, color, 0.6 * size, 0.85 * size, x, 1.45 * size, z, undefined, 8);
	kit.cone(materials.foliage, color, 0.4 * size, 0.7 * size, x, 1.9 * size, z, undefined, 8);
}

// Куст из нескольких многогранников.
function addBush(kit: DecorKit, materials: DecorMaterials, x: number, z: number, size: number, colorIndex: number): void {
	const color = colors.bush[colorIndex % colors.bush.length];
	const colorAlt = colors.bush[(colorIndex + 1) % colors.bush.length];
	kit.icosahedron(materials.foliage, color, 0.38 * size, x, 0.26 * size, z, { y: 0.8 }, 1);
	kit.icosahedron(materials.foliage, colorAlt, 0.28 * size, x + 0.3 * size, 0.2 * size, z + 0.08 * size, { y: 0.85 }, 0);
	kit.icosahedron(materials.foliage, color, 0.26 * size, x - 0.28 * size, 0.18 * size, z - 0.05 * size, { y: 0.85 }, 0);
}

// Фонарь: основание, столб, фонарь со светящимся стеклом и крышкой.
function addStreetLamp(kit: DecorKit, materials: DecorMaterials, x: number, z: number): void {
	kit.cylinder(materials.metal, colors.lampPost, 0.09, 0.11, 0.16, x, 0.08, z, undefined, 8);
	kit.cylinder(materials.metal, colors.lampPost, 0.035, 0.04, 2.05, x, 1.15, z, undefined, 8);
	kit.box(materials.metal, colors.lampPost, 0.2, 0.04, 0.2, x, 2.18, z);
	kit.box(materials.glow, colors.lampGlass, 0.15, 0.22, 0.15, x, 2.31, z);
	kit.cone(materials.metal, colors.lampPost, 0.15, 0.12, x, 2.48, z, undefined, 4);
	kit.sphere(materials.metal, colors.lampPost, 0.03, x, 2.56, z, undefined, 6);
}

// Скамейка из двух досок сиденья, спинки и чугунных боковин. Смотрит вдоль +z локальной системы.
function addBench(kit: DecorKit, materials: DecorMaterials, x: number, z: number, rotationY: number): void {
	kit.at(x, 0, z, rotationY, () => {
		for (const side of [-0.55, 0.55]) {
			kit.box(materials.metal, colors.benchIron, 0.05, 0.42, 0.36, side, 0.21, 0);
		}
		kit.box(materials.matte, colors.benchWood, 1.3, 0.04, 0.16, 0, 0.26, 0.07);
		kit.box(materials.matte, colors.benchWood, 1.3, 0.04, 0.16, 0, 0.26, -0.1);
		kit.box(materials.matte, colors.benchWood, 1.3, 0.14, 0.035, 0, 0.47, -0.18, { x: -0.18 });
	});
}

// Велосипед: два колеса-тора, рама, руль и седло. Стоит вдоль оси x локальной системы.
function addBicycle(kit: DecorKit, materials: DecorMaterials, x: number, z: number, rotationY: number, frameColor: number, wheel: BufferGeometry): void {
	kit.at(x, 0, z, rotationY, () => {
		for (const wheelX of [-0.32, 0.32]) {
			kit.shape(materials.matte, colors.tyre, wheel, wheelX, 0.22, 0, undefined, { x: 1, y: 1, z: 1 });
		}
		kit.box(materials.metal, frameColor, 0.5, 0.03, 0.03, 0, 0.36, 0, { z: 0.15 });
		kit.box(materials.metal, frameColor, 0.03, 0.28, 0.03, -0.08, 0.3, 0, { z: -0.25 });
		kit.box(materials.metal, frameColor, 0.03, 0.26, 0.03, 0.27, 0.34, 0, { z: 0.35 });
		kit.box(materials.matte, 0x22252a, 0.12, 0.03, 0.06, -0.12, 0.46, 0);
		kit.box(materials.metal, 0x22252a, 0.03, 0.03, 0.24, 0.31, 0.49, 0);
	});
}

// Дом через дорогу: стены, двускатная крыша, окна в рамах и дверь на фасаде (фасад смотрит на -z, к ресторану).
function addHouse(kit: DecorKit, materials: DecorMaterials, gable: BufferGeometry, x: number, z: number, width: number, depth: number, height: number, variant: number): void {
	const wallColor = colors.houseWalls[variant % colors.houseWalls.length];
	const roofColor = colors.houseRoofs[variant % colors.houseRoofs.length];
	kit.box(materials.matte, wallColor, width, height, depth, x, height / 2, z);
	kit.shape(materials.matte, roofColor, gable, x, height - 0.02, z, undefined, { x: width + 0.3, y: 1.3, z: depth + 0.4 });
	const frontZ = z - depth / 2 - 0.02;
	const windowCount = Math.max(2, Math.floor(width / 1.4));
	for (let index = 0; index < windowCount; index += 1) {
		const windowX = x - width / 2 + (index + 0.5) * (width / windowCount);
		if (index === Math.floor(windowCount / 2)) {
			kit.box(materials.matte, colors.houseDoor, 0.55, 1.0, 0.06, windowX, 0.5, frontZ);
			continue;
		}
		kit.box(materials.matte, colors.houseFrame, 0.62, 0.62, 0.05, windowX, height * 0.52, frontZ);
		kit.box(materials.glossy, colors.houseWindow, 0.5, 0.5, 0.06, windowX, height * 0.52, frontZ);
	}
}

// Машина: кузов, кабина со стёклами, колёса, фары и стоп-сигналы. Длина вдоль оси x.
function buildCar(materials: DecorMaterials, paint: number, isVan: boolean): { group: Group; dispose(): void } {
	const batch = createMeshBatch();
	const kit = createDecorKit(batch);
	const length = isVan ? 1.9 : 1.75;
	kit.box(materials.glossy, paint, length, 0.34, 0.86, 0, 0.32, 0);
	if (isVan) {
		kit.box(materials.glossy, paint, 1.25, 0.42, 0.82, -0.25, 0.68, 0);
		kit.box(materials.glossy, colors.carGlass, 0.06, 0.28, 0.72, 0.38, 0.7, 0);
		kit.box(materials.glossy, colors.carGlass, 0.9, 0.24, 0.84, -0.3, 0.72, 0);
	} else {
		kit.box(materials.glossy, paint, 0.95, 0.3, 0.8, -0.1, 0.62, 0);
		kit.box(materials.glossy, colors.carGlass, 0.06, 0.22, 0.7, 0.39, 0.62, 0, { z: -0.35 });
		kit.box(materials.glossy, colors.carGlass, 0.06, 0.22, 0.7, -0.59, 0.62, 0, { z: 0.35 });
		kit.box(materials.glossy, colors.carGlass, 0.7, 0.2, 0.82, -0.1, 0.63, 0);
	}
	for (const wheelX of [-length * 0.3, length * 0.3]) {
		for (const wheelZ of [-0.42, 0.42]) {
			kit.cylinder(materials.matte, colors.tyre, 0.16, 0.16, 0.12, wheelX, 0.16, wheelZ, { x: Math.PI / 2 }, 10);
		}
	}
	for (const lightZ of [-0.3, 0.3]) {
		kit.box(materials.glow, colors.headlight, 0.04, 0.08, 0.14, length / 2, 0.38, lightZ);
		kit.box(materials.glow, colors.taillight, 0.04, 0.08, 0.12, -length / 2, 0.38, lightZ);
	}
	const group = batch.build("car", { cast: false, receive: true });
	kit.disposeTemplates();
	// Мягкая тень-пятно под машиной.
	const shadowGeometry = new PlaneGeometry(length * 1.05, 0.95).rotateX(-Math.PI / 2);
	const shadowMaterial = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
	const shadow = new Mesh(shadowGeometry, shadowMaterial);
	shadow.position.y = 0.006;
	group.add(shadow);
	return {
		group,
		dispose() {
			batch.dispose();
			shadowGeometry.dispose();
			shadowMaterial.dispose();
		},
	};
}

// Плоскость с материалом и UV в мировых единицах.
function addWorldPlane(root: Group, disposables: Array<{ dispose(): void }>, material: Material, x0: number, z0: number, x1: number, z1: number, y: number, tileSize: number, name: string): Mesh {
	const geometry = createWorldPlaneGeometry(x0, z0, x1, z1, tileSize);
	disposables.push(geometry);
	const mesh = new Mesh(geometry, material);
	mesh.position.y = y;
	mesh.receiveShadow = true;
	mesh.name = name;
	root.add(mesh);
	return mesh;
}

// Машина на дороге: полоса, направление, скорость и пауза до следующего проезда.
interface CarState {
	group: Group;
	direction: 1 | -1;
	speed: number;
	waitSec: number;
	active: boolean;
}

// Строит окружение по данным уровня. Тротуар у входа рисует сам уровень (зона street), здесь его продолжение и всё вокруг.
export function createEnvironment(level: LevelConfig, materials: DecorMaterials, textures: SceneTextures): Environment {
	const root = new Group();
	root.name = "environment";
	const disposables: Array<{ dispose(): void }> = [];
	const rng = createRng(20251121);
	const bounds = level.bounds;
	const boundsRight = bounds.x + bounds.width;
	const boundsBottom = bounds.z + bounds.depth;
	const street: Rect = level.floors.find((floor) => floor.zone === "street")?.rect ?? { x: bounds.x, z: boundsBottom - 3, width: bounds.width, depth: 3 };
	const streetBottom = street.z + street.depth;
	// Лицевая сторона передней стены: модель стены растянута на всю полосу (layout.ts) и стоит вплотную к краю улицы.
	const facadeZ = street.z;
	const door = level.door.rect;
	const doorRight = door.x + door.width;

	// Материалы поверхностей с текстурами (без canvas остаются ровные цвета).
	const grassMaterial = new MeshStandardMaterial({ map: textures.grass, color: textures.grass ? 0xffffff : 0x79a94f, roughness: 1 });
	const pavingMaterial = new MeshStandardMaterial({ map: textures.paving, color: textures.paving ? 0xffffff : 0xd6cec0, roughness: 0.92 });
	const asphaltMaterial = new MeshStandardMaterial({ map: textures.asphalt, color: textures.asphalt ? 0xffffff : 0x4d535a, roughness: 0.95 });
	disposables.push(grassMaterial, pavingMaterial, asphaltMaterial);

	// 1. Трава, продолжение тротуара по сторонам от ресторана, дорога и дальний тротуар.
	const centerX = bounds.x + bounds.width / 2;
	const centerZ = bounds.z + bounds.depth / 2;
	addWorldPlane(root, disposables, grassMaterial, centerX - groundHalfSize, centerZ - groundHalfSize, centerX + groundHalfSize, centerZ + groundHalfSize, groundY, textureTileSizes.grass, "ground");
	addWorldPlane(root, disposables, pavingMaterial, bounds.x - streetReach, street.z, bounds.x, streetBottom, 0, textureTileSizes.paving, "sidewalk-west");
	addWorldPlane(root, disposables, pavingMaterial, boundsRight, street.z, boundsRight + streetReach, streetBottom, 0, textureTileSizes.paving, "sidewalk-east");
	const curbDepth = 0.15;
	const roadTop = streetBottom + curbDepth;
	const roadBottom = roadTop + 4.2;
	const farSidewalkTop = roadBottom + curbDepth;
	const farSidewalkBottom = farSidewalkTop + 2.4;
	addWorldPlane(root, disposables, asphaltMaterial, bounds.x - streetReach, roadTop, boundsRight + streetReach, roadBottom, roadY, textureTileSizes.asphalt, "road");
	addWorldPlane(root, disposables, pavingMaterial, bounds.x - streetReach, farSidewalkTop, boundsRight + streetReach, farSidewalkBottom, 0, textureTileSizes.paving, "sidewalk-far");

	const batch = createMeshBatch();
	const kit = createDecorKit(batch);
	const streetLength = bounds.width + streetReach * 2;
	const streetMiddleX = centerX;

	// Бордюры по обе стороны дороги и отмостка вокруг здания.
	kit.box(materials.matte, colors.curb, streetLength, 0.1, curbDepth, streetMiddleX, 0.01, streetBottom + curbDepth / 2);
	kit.box(materials.matte, colors.curb, streetLength, 0.1, curbDepth, streetMiddleX, 0.01, roadBottom + curbDepth / 2);
	kit.box(materials.matte, colors.foundation, bounds.width + 1.2, 0.03, 0.6, centerX, 0.0, bounds.z - 0.3);
	kit.box(materials.matte, colors.foundation, 0.6, 0.03, street.z - bounds.z + 0.6, bounds.x - 0.3, 0.0, (bounds.z - 0.6 + street.z) / 2);
	kit.box(materials.matte, colors.foundation, 0.6, 0.03, street.z - bounds.z + 0.6, boundsRight + 0.3, 0.0, (bounds.z - 0.6 + street.z) / 2);

	// Разметка: прерывистая осевая, сплошные по краям, пешеходный переход напротив выхода из ресторана.
	const roadMiddle = (roadTop + roadBottom) / 2;
	for (let dashX = bounds.x - streetReach + 1; dashX < boundsRight + streetReach - 1; dashX += 2.6) {
		kit.box(materials.matte, colors.marking, 1.4, 0.006, 0.12, dashX, markingY, roadMiddle);
	}
	kit.box(materials.matte, colors.markingEdge, streetLength, 0.006, 0.07, streetMiddleX, markingY, roadTop + 0.28);
	kit.box(materials.matte, colors.markingEdge, streetLength, 0.006, 0.07, streetMiddleX, markingY, roadBottom - 0.28);
	const crossingX = Math.min(boundsRight - 1.4, level.door.exitPoint.x - 0.2);
	for (let stripeZ = roadTop + 0.55; stripeZ < roadBottom - 0.4; stripeZ += 0.75) {
		kit.box(materials.matte, colors.marking, 1.9, 0.007, 0.38, crossingX, markingY + 0.001, stripeZ);
	}

	// 2. Фасад: ящики с цветами вдоль передней стены (кроме двери), кадки по бокам от двери, коврик.
	const flowerBoxDepth = 0.28;
	const flowerBoxZ = facadeZ + flowerBoxDepth / 2 + 0.02;
	const flowerSegments: Array<[number, number]> = [];
	{
		let start = street.x + 0.5;
		const leftEnd = door.x - 0.75;
		while (start < leftEnd - 0.6) {
			const end = Math.min(leftEnd, start + 3.8);
			flowerSegments.push([start, end]);
			start = end + 0.5;
		}
		const rightStart = doorRight + 0.75;
		const rightEnd = street.x + street.width - 0.5;
		if (rightEnd - rightStart >= 0.6) {
			flowerSegments.push([rightStart, rightEnd]);
		}
	}
	for (const [start, end] of flowerSegments) {
		const length = end - start;
		const middle = (start + end) / 2;
		kit.box(materials.matte, colors.planterWood, length, 0.24, flowerBoxDepth, middle, 0.12, flowerBoxZ);
		kit.box(materials.matte, colors.planterTrim, length + 0.04, 0.04, flowerBoxDepth + 0.04, middle, 0.25, flowerBoxZ);
		kit.box(materials.matte, colors.soil, length - 0.06, 0.02, flowerBoxDepth - 0.06, middle, 0.265, flowerBoxZ);
		const flowerCount = Math.max(3, Math.round(length / 0.13));
		for (let index = 0; index < flowerCount; index += 1) {
			const flowerX = start + 0.07 + (index + rng.next() * 0.6) * ((length - 0.14) / flowerCount);
			const flowerZ = flowerBoxZ + (rng.next() - 0.5) * 0.14;
			kit.sphere(materials.foliage, colors.bush[index % colors.bush.length], 0.07, flowerX, 0.31, flowerZ, { y: 0.7 }, 6);
			kit.sphere(materials.matte, colors.flowers[Math.floor(rng.next() * colors.flowers.length)], 0.045, flowerX + 0.02, 0.37 + rng.next() * 0.04, flowerZ, undefined, 6);
		}
	}
	// Кадки с подстриженными кустами-шарами по бокам от двери.
	for (const potX of [door.x - 0.4, doorRight + 0.45]) {
		const potZ = facadeZ + 0.35;
		kit.cylinder(materials.matte, colors.terracotta, 0.2, 0.15, 0.3, potX, 0.15, potZ, undefined, 10);
		kit.cylinder(materials.matte, 0xa65f33, 0.215, 0.215, 0.05, potX, 0.3, potZ, undefined, 10);
		kit.cylinder(materials.matte, colors.trunk, 0.025, 0.025, 0.3, potX, 0.42, potZ, undefined, 5);
		kit.icosahedron(materials.foliage, colors.bush[1], 0.22, potX, 0.62, potZ, undefined, 1);
		kit.icosahedron(materials.foliage, colors.bush[2], 0.13, potX, 0.86, potZ, undefined, 1);
	}
	// Коврик у двери снаружи.
	kit.box(materials.matte, colors.doormatBorder, 1.3, 0.012, 0.5, door.x + door.width / 2, 0.006, facadeZ + 0.3);
	kit.box(materials.matte, colors.doormat, 1.16, 0.014, 0.38, door.x + door.width / 2, 0.007, facadeZ + 0.3);

	// 3. Ближний тротуар: фонари по краям, гидрант слева, урна справа.
	const lampZ = streetBottom - 0.3;
	addStreetLamp(kit, materials, street.x + 0.35, lampZ);
	addStreetLamp(kit, materials, street.x + street.width - 0.35, lampZ);
	{
		const hydrantX = street.x + 0.4;
		const hydrantZ = street.z + 1.55;
		kit.cylinder(materials.glossy, colors.hydrant, 0.08, 0.1, 0.36, hydrantX, 0.18, hydrantZ, undefined, 10);
		kit.sphere(materials.glossy, colors.hydrant, 0.085, hydrantX, 0.37, hydrantZ, { y: 0.8 }, 10);
		kit.cylinder(materials.glossy, colors.hydrantCap, 0.035, 0.035, 0.26, hydrantX, 0.25, hydrantZ, { z: Math.PI / 2 }, 8);
		kit.cylinder(materials.glossy, colors.hydrantCap, 0.11, 0.11, 0.04, hydrantX, 0.02, hydrantZ, undefined, 10);
	}
	{
		const binX = street.x + street.width - 0.4;
		const binZ = street.z + 1.6;
		kit.cylinder(materials.matte, colors.binBody, 0.17, 0.14, 0.52, binX, 0.26, binZ, undefined, 12);
		kit.cylinder(materials.metal, 0x9aa3a8, 0.18, 0.18, 0.05, binX, 0.54, binZ, undefined, 12);
	}

	// 4. Дальний тротуар: фонари, скамейки, велопарковка.
	const farLampZ = farSidewalkTop + 0.35;
	for (let lampX = centerX - 32; lampX <= centerX + 32; lampX += 8) {
		addStreetLamp(kit, materials, lampX, farLampZ);
	}
	addBench(kit, materials, centerX - 3.5, farSidewalkTop + 1.2, Math.PI);
	addBench(kit, materials, centerX + 4.5, farSidewalkTop + 1.2, Math.PI);
	{
		const wheel = new TorusGeometry(0.2, 0.02, 5, 16);
		disposables.push(wheel);
		const rackX = centerX + 0.6;
		const rackZ = farSidewalkTop + 1.3;
		kit.box(materials.metal, 0x8f989e, 1.8, 0.04, 0.04, rackX, 0.32, rackZ);
		for (const legX of [-0.85, 0.85]) {
			kit.box(materials.metal, 0x8f989e, 0.04, 0.32, 0.04, rackX + legX, 0.16, rackZ);
		}
		addBicycle(kit, materials, rackX - 0.45, rackZ + 0.05, 0.05, 0x2fa38e, wheel);
		addBicycle(kit, materials, rackX + 0.5, rackZ - 0.02, -0.08, 0xd94b3d, wheel);
	}

	// 5. Зелень: кусты вдоль стен здания, деревья вокруг, ряд деревьев и дома за дальним тротуаром.
	for (let bushX = bounds.x + 0.6; bushX < boundsRight - 0.4; bushX += 1.35 + rng.next() * 0.5) {
		addBush(kit, materials, bushX, bounds.z - 0.85 - rng.next() * 0.2, 0.9 + rng.next() * 0.4, Math.floor(rng.next() * 3));
	}
	for (let bushZ = bounds.z + 0.5; bushZ < street.z - 0.6; bushZ += 1.5 + rng.next() * 0.6) {
		addBush(kit, materials, bounds.x - 0.85 - rng.next() * 0.2, bushZ, 0.85 + rng.next() * 0.4, Math.floor(rng.next() * 3));
		addBush(kit, materials, boundsRight + 0.85 + rng.next() * 0.2, bushZ + 0.6, 0.85 + rng.next() * 0.4, Math.floor(rng.next() * 3));
	}
	// Места деревьев: вокруг здания (не ближе 1.6 к стенам) и на свободной траве вплоть до края поля; не на дорогах и не у домов.
	const housesTop = farSidewalkBottom + 3;
	const housesBottom = housesTop + 4.5;
	function isTreeSpotFree(x: number, z: number): boolean {
		const nearBuilding = x > bounds.x - 1.6 && x < boundsRight + 1.6 && z > bounds.z - 1.6 && z < street.z;
		const onStreet = z > street.z - 0.6 && z < farSidewalkBottom + 0.6;
		const onHouses = z > housesTop - 0.8 && z < housesBottom + 0.5 && x > centerX - 40 && x < centerX + 44;
		return !nearBuilding && !onStreet && !onHouses;
	}
	// Поле деревьев ограничено областью, которую камера видит на широком и на портретном экране; дальние кроны проще.
	let treeIndex = 0;
	for (let gridZ = bounds.z - 24; gridZ <= boundsBottom + 26; gridZ += 3.4) {
		for (let gridX = bounds.x - 24; gridX <= boundsRight + 24; gridX += 3.4) {
			const x = gridX + (rng.next() - 0.5) * 2.4;
			const z = gridZ + (rng.next() - 0.5) * 2.4;
			const distance = Math.hypot((x - centerX) / (bounds.width / 2 + 2), (z - centerZ) / (bounds.depth / 2 + 2));
			// Ближе к ресторану деревья реже: середина кадра остаётся открытой.
			const density = distance < 1.6 ? 0.55 : 0.75;
			if (!isTreeSpotFree(x, z) || rng.next() > density) {
				continue;
			}
			treeIndex += 1;
			const size = 0.85 + rng.next() * 0.55;
			const detail = distance < 1.9 ? 1 : 0;
			if (rng.next() < 0.32) {
				addConifer(kit, materials, x, z, size, treeIndex);
			} else if (rng.next() < 0.22) {
				addBush(kit, materials, x, z, 1.1 + rng.next() * 0.5, treeIndex);
			} else {
				addRoundTree(kit, materials, x, z, size, treeIndex, detail);
			}
		}
	}
	// Ряд деревьев вдоль дальнего тротуара.
	for (let treeX = centerX - 44; treeX <= centerX + 44; treeX += 4.4 + rng.next() * 1.2) {
		addRoundTree(kit, materials, treeX, farSidewalkBottom + 0.9, 0.95 + rng.next() * 0.3, Math.floor(rng.next() * 5), Math.abs(treeX - centerX) < 16 ? 1 : 0);
	}
	// Дома через дорогу.
	const gable = createGableGeometry();
	disposables.push(gable);
	let houseVariant = 0;
	for (let houseX = centerX - 36; houseX <= centerX + 40; houseX += 6.6 + rng.next() * 1.2) {
		const width = 4.4 + rng.next() * 1.2;
		const height = 2.4 + rng.next() * 0.9;
		addHouse(kit, materials, gable, houseX, housesTop + 2.2, width, 4, height, houseVariant);
		houseVariant += 1;
	}

	const decor = batch.build("environment-decor");
	root.add(decor);
	kit.disposeTemplates();
	disposables.push(batch);

	// 6. Штендер-доска у входа: рамка в общем наборе не нужна, лицевая сторона с грифельной текстурой отдельным мешем.
	{
		const signBatch = createMeshBatch();
		const signKit = createDecorKit(signBatch);
		const signX = Math.min(street.x + street.width - 0.75, doorRight + 1.15);
		const signZ = facadeZ + 0.65;
		signKit.at(signX, 0, signZ, -0.35, () => {
			signKit.box(materials.matte, 0x7a4e2d, 0.46, 0.62, 0.04, 0, 0.32, 0.1, { x: -0.16 });
			signKit.box(materials.matte, 0x7a4e2d, 0.46, 0.62, 0.04, 0, 0.32, -0.1, { x: 0.16 });
		});
		const signGroup = signBatch.build("sign");
		signKit.disposeTemplates();
		disposables.push(signBatch);
		const faceMaterial = new MeshStandardMaterial({ map: textures.chalkboard, color: textures.chalkboard ? 0xffffff : 0x2f3d36, roughness: 0.9, side: DoubleSide });
		const faceGeometry = new PlaneGeometry(0.4, 0.54);
		disposables.push(faceMaterial, faceGeometry);
		const face = new Mesh(faceGeometry, faceMaterial);
		face.position.set(signX + Math.sin(-0.35) * 0.123, 0.33, signZ + Math.cos(-0.35) * 0.123);
		face.rotation.set(-0.16, -0.35, 0, "YXZ");
		face.castShadow = false;
		signGroup.add(face);
		root.add(signGroup);
	}

	// 7. Машины: несколько заранее собранных, по очереди проезжают по своей полосе.
	const carLanes = [roadTop + 1.05, roadBottom - 1.05];
	const cars: CarState[] = [];
	colors.carPaint.slice(0, 5).forEach((paint, index) => {
		const car = buildCar(materials, paint, index === 2);
		disposables.push(car);
		const direction: 1 | -1 = index % 2 === 0 ? 1 : -1;
		car.group.position.set(direction === 1 ? centerX - streetReach : centerX + streetReach, 0, direction === 1 ? carLanes[0] : carLanes[1]);
		car.group.rotation.y = direction === 1 ? 0 : Math.PI;
		car.group.visible = false;
		root.add(car.group);
		cars.push({ group: car.group, direction, speed: 3.2 + rng.next() * 2.2, waitSec: 1 + index * 3.5 + rng.next() * 3, active: false });
	});
	const carRange = 48;

	return {
		root,
		pavingMaterial,
		update(frameDtSec, dayProgress) {
			// Фонари загораются во второй половине смены.
			materials.setGlow(Math.min(1, Math.max(0, (dayProgress - 0.5) / 0.35)));
			for (const car of cars) {
				if (!car.active) {
					car.waitSec -= frameDtSec;
					if (car.waitSec <= 0) {
						car.active = true;
						car.group.visible = true;
						car.group.position.x = centerX - car.direction * carRange;
					}
					continue;
				}
				car.group.position.x += car.direction * car.speed * frameDtSec;
				if (Math.abs(car.group.position.x - centerX) > carRange) {
					car.active = false;
					car.group.visible = false;
					car.waitSec = 4 + rng.next() * 9;
				}
			}
		},
		dispose() {
			disposables.forEach((item) => item.dispose());
			root.clear();
		},
	};
}
