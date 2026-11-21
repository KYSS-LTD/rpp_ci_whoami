// Объединение статичной геометрии: множество мелких деталей одного материала склеивается в один меш с цветами в вершинах.
// Так декор улицы и зала из сотен примитивов рисуется за несколько вызовов отрисовки, а персонаж за несколько мешей
// (корпус, голова, руки, ноги), что важно для слабых телефонов. Детали задаются примитивами и матрицей положения.
import {
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	Color,
	ConeGeometry,
	CylinderGeometry,
	Euler,
	Group,
	IcosahedronGeometry,
	Matrix3,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Quaternion,
	SphereGeometry,
	Vector3,
	type Material,
} from "three";

// Деталь для склейки: геометрия (не меняется), цвет вершин (sRGB hex) и матрица положения.
export interface ColoredPart {
	geometry: BufferGeometry;
	color: number;
	matrix: Matrix4;
}

// Склеивает детали в одну неиндексированную геометрию с атрибутами position, normal, uv и color (линейный цвет).
// Отражающая матрица (отрицательный определитель) переворачивает порядок вершин треугольника, чтобы грани не вывернулись.
export function mergeColoredParts(parts: readonly ColoredPart[]): BufferGeometry {
	let vertexCount = 0;
	for (const part of parts) {
		vertexCount += part.geometry.index ? part.geometry.index.count : part.geometry.getAttribute("position").count;
	}
	const positions = new Float32Array(vertexCount * 3);
	const normals = new Float32Array(vertexCount * 3);
	const uvs = new Float32Array(vertexCount * 2);
	const colors = new Float32Array(vertexCount * 3);
	const position = new Vector3();
	const normal = new Vector3();
	const normalMatrix = new Matrix3();
	const color = new Color();
	let offset = 0;
	for (const part of parts) {
		const source = part.geometry;
		const positionAttribute = source.getAttribute("position");
		const normalAttribute = source.getAttribute("normal");
		const uvAttribute = source.getAttribute("uv");
		const index = source.index;
		const count = index ? index.count : positionAttribute.count;
		const flip = part.matrix.determinant() < 0;
		normalMatrix.getNormalMatrix(part.matrix);
		color.setHex(part.color);
		for (let vertex = 0; vertex < count; vertex += 1) {
			// При отражении в каждом треугольнике меняются местами вторая и третья вершины.
			let sourceVertex = vertex;
			if (flip) {
				const corner = vertex % 3;
				sourceVertex = corner === 1 ? vertex + 1 : corner === 2 ? vertex - 1 : vertex;
			}
			const sourceIndex = index ? index.getX(sourceVertex) : sourceVertex;
			const base = offset * 3;
			position.fromBufferAttribute(positionAttribute, sourceIndex).applyMatrix4(part.matrix);
			positions[base] = position.x;
			positions[base + 1] = position.y;
			positions[base + 2] = position.z;
			if (normalAttribute) {
				normal.fromBufferAttribute(normalAttribute, sourceIndex).applyMatrix3(normalMatrix).normalize();
				normals[base] = normal.x;
				normals[base + 1] = normal.y;
				normals[base + 2] = normal.z;
			}
			if (uvAttribute) {
				uvs[offset * 2] = uvAttribute.getX(sourceIndex);
				uvs[offset * 2 + 1] = uvAttribute.getY(sourceIndex);
			}
			colors[base] = color.r;
			colors[base + 1] = color.g;
			colors[base + 2] = color.b;
			offset += 1;
		}
	}
	const merged = new BufferGeometry();
	merged.setAttribute("position", new BufferAttribute(positions, 3));
	merged.setAttribute("normal", new BufferAttribute(normals, 3));
	merged.setAttribute("uv", new BufferAttribute(uvs, 2));
	merged.setAttribute("color", new BufferAttribute(colors, 3));
	merged.computeBoundingBox();
	merged.computeBoundingSphere();
	return merged;
}

// Набор деталей по материалам: build склеивает каждую группу в один меш.
export interface MeshBatch {
	add(material: Material, geometry: BufferGeometry, color: number, matrix: Matrix4): void;
	// Меши по материалам. castShadow и receiveShadow ставятся всем мешам (статичный декор отбрасывает запечённые тени).
	build(name: string, shadows?: { cast: boolean; receive: boolean }): Group;
	// Освобождает склеенные геометрии (материалы принадлежат вызывающему).
	dispose(): void;
}

export function createMeshBatch(): MeshBatch {
	const buckets = new Map<Material, ColoredPart[]>();
	const built: BufferGeometry[] = [];
	return {
		add(material, geometry, color, matrix) {
			let bucket = buckets.get(material);
			if (!bucket) {
				bucket = [];
				buckets.set(material, bucket);
			}
			bucket.push({ geometry, color, matrix: matrix.clone() });
		},
		build(name, shadows = { cast: true, receive: true }) {
			const group = new Group();
			group.name = name;
			for (const [material, parts] of buckets) {
				if (parts.length === 0) {
					continue;
				}
				const geometry = mergeColoredParts(parts);
				built.push(geometry);
				const mesh = new Mesh(geometry, material);
				mesh.castShadow = shadows.cast;
				mesh.receiveShadow = shadows.receive;
				group.add(mesh);
			}
			buckets.clear();
			return group;
		},
		dispose() {
			built.forEach((geometry) => geometry.dispose());
			built.length = 0;
		},
	};
}

// Общие материалы декора: цвет берётся из вершин, у материала только свойства поверхности.
export interface DecorMaterials {
	// Матовые поверхности: дерево, ткань, камень, штукатурка.
	readonly matte: MeshStandardMaterial;
	// Листва с плоскими гранями (низкополигональный вид крон и кустов).
	readonly foliage: MeshStandardMaterial;
	// Металл: фонари, рейлинг, кастрюли, велосипед.
	readonly metal: MeshStandardMaterial;
	// Глянец: керамика, стекло банок, краска машин.
	readonly glossy: MeshStandardMaterial;
	// Светящиеся плафоны: не освещаются, яркость меняется к вечеру (setGlow).
	readonly glow: MeshBasicMaterial;
	// Яркость плафонов 0..1: 0 выключены (днём), 1 горят.
	setGlow(level: number): void;
	dispose(): void;
}

export function createDecorMaterials(): DecorMaterials {
	const matte = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
	const foliage = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
	const metal = new MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.55 });
	const glossy = new MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.05 });
	const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
	const offColor = new Color(0x9c958a);
	const onColor = new Color(0xffffff);
	function setGlow(level: number): void {
		glow.color.lerpColors(offColor, onColor, Math.min(1, Math.max(0, level)));
	}
	setGlow(0);
	return {
		matte,
		foliage,
		metal,
		glossy,
		glow,
		setGlow,
		dispose() {
			[matte, foliage, metal, glossy, glow].forEach((material) => material.dispose());
		},
	};
}

// Поворот детали (радианы, порядок XYZ).
export interface Turn {
	x?: number;
	y?: number;
	z?: number;
}

// Набор примитивов для сборки декора в локальных системах координат. Размеры в мировых единицах, позиция задаёт центр детали.
export interface DecorKit {
	readonly batch: MeshBatch;
	// Выполняет build в локальной системе: сдвиг (x, y, z), поворот вокруг вертикали и равномерный масштаб.
	at(x: number, y: number, z: number, rotationY: number, build: () => void, scale?: number): void;
	box(material: Material, color: number, width: number, height: number, depth: number, x: number, y: number, z: number, turn?: Turn): void;
	cylinder(material: Material, color: number, radiusTop: number, radiusBottom: number, height: number, x: number, y: number, z: number, turn?: Turn, segments?: number): void;
	cone(material: Material, color: number, radius: number, height: number, x: number, y: number, z: number, turn?: Turn, segments?: number): void;
	// Эллипсоид: радиус и сжатие по осям.
	sphere(material: Material, color: number, radius: number, x: number, y: number, z: number, scale?: { x?: number; y?: number; z?: number }, segments?: number): void;
	// Многогранник для крон и камней: detail 0 даёт 20 граней, 1 даёт 80.
	icosahedron(material: Material, color: number, radius: number, x: number, y: number, z: number, scale?: { x?: number; y?: number; z?: number }, detail?: number): void;
	// Произвольная геометрия (не освобождается набором).
	shape(material: Material, color: number, geometry: BufferGeometry, x: number, y: number, z: number, turn?: Turn, scale?: { x?: number; y?: number; z?: number }): void;
	// Освобождает кэш шаблонных геометрий (склеенные меши живут дальше).
	disposeTemplates(): void;
}

export function createDecorKit(batch: MeshBatch = createMeshBatch()): DecorKit {
	const stack: Matrix4[] = [new Matrix4()];
	const templates = new Map<string, BufferGeometry>();
	const local = new Matrix4();
	const world = new Matrix4();
	const quaternion = new Quaternion();
	const euler = new Euler();
	const position = new Vector3();
	const scaleVector = new Vector3();

	function template(key: string, create: () => BufferGeometry): BufferGeometry {
		let geometry = templates.get(key);
		if (!geometry) {
			geometry = create();
			templates.set(key, geometry);
		}
		return geometry;
	}

	function place(material: Material, color: number, geometry: BufferGeometry, x: number, y: number, z: number, turn: Turn | undefined, sx: number, sy: number, sz: number): void {
		euler.set(turn?.x ?? 0, turn?.y ?? 0, turn?.z ?? 0, "XYZ");
		quaternion.setFromEuler(euler);
		position.set(x, y, z);
		scaleVector.set(sx, sy, sz);
		local.compose(position, quaternion, scaleVector);
		world.multiplyMatrices(stack[stack.length - 1], local);
		batch.add(material, geometry, color, world);
	}

	return {
		batch,
		at(x, y, z, rotationY, build, scale = 1) {
			euler.set(0, rotationY, 0, "XYZ");
			quaternion.setFromEuler(euler);
			local.compose(position.set(x, y, z), quaternion, scaleVector.set(scale, scale, scale));
			stack.push(new Matrix4().multiplyMatrices(stack[stack.length - 1], local));
			try {
				build();
			} finally {
				stack.pop();
			}
		},
		box(material, color, width, height, depth, x, y, z, turn) {
			place(material, color, template("box", () => new BoxGeometry(1, 1, 1)), x, y, z, turn, width, height, depth);
		},
		cylinder(material, color, radiusTop, radiusBottom, height, x, y, z, turn, segments = 12) {
			const radius = Math.max(radiusTop, radiusBottom, 1e-4);
			const topRatio = Math.round((radiusTop / radius) * 100) / 100;
			const bottomRatio = Math.round((radiusBottom / radius) * 100) / 100;
			const geometry = template(`cyl:${topRatio}:${bottomRatio}:${segments}`, () => new CylinderGeometry(topRatio, bottomRatio, 1, segments));
			place(material, color, geometry, x, y, z, turn, radius, height, radius);
		},
		cone(material, color, radius, height, x, y, z, turn, segments = 10) {
			place(material, color, template(`cone:${segments}`, () => new ConeGeometry(1, 1, segments)), x, y, z, turn, radius, height, radius);
		},
		sphere(material, color, radius, x, y, z, scale, segments = 12) {
			const geometry = template(`sphere:${segments}`, () => new SphereGeometry(1, segments, Math.max(6, Math.round(segments * 0.7))));
			place(material, color, geometry, x, y, z, undefined, radius * (scale?.x ?? 1), radius * (scale?.y ?? 1), radius * (scale?.z ?? 1));
		},
		icosahedron(material, color, radius, x, y, z, scale, detail = 0) {
			const geometry = template(`ico:${detail}`, () => new IcosahedronGeometry(1, detail));
			place(material, color, geometry, x, y, z, undefined, radius * (scale?.x ?? 1), radius * (scale?.y ?? 1), radius * (scale?.z ?? 1));
		},
		shape(material, color, geometry, x, y, z, turn, scale) {
			place(material, color, geometry, x, y, z, turn, scale?.x ?? 1, scale?.y ?? 1, scale?.z ?? 1);
		},
		disposeTemplates() {
			templates.forEach((geometry) => geometry.dispose());
			templates.clear();
		},
	};
}

// Плоскость на полу с UV в мировых единицах (повтор текстуры через каждые tileSize): соседние плоскости стыкуются без шва.
export function createWorldPlaneGeometry(x0: number, z0: number, x1: number, z1: number, tileSize: number): BufferGeometry {
	const geometry = new BufferGeometry();
	const positions = new Float32Array([x0, 0, z0, x0, 0, z1, x1, 0, z1, x1, 0, z0]);
	const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
	const uvs = new Float32Array([x0 / tileSize, -z0 / tileSize, x0 / tileSize, -z1 / tileSize, x1 / tileSize, -z1 / tileSize, x1 / tileSize, -z0 / tileSize]);
	geometry.setAttribute("position", new BufferAttribute(positions, 3));
	geometry.setAttribute("normal", new BufferAttribute(normals, 3));
	geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
	geometry.setIndex([0, 1, 2, 0, 2, 3]);
	geometry.computeBoundingSphere();
	return geometry;
}
