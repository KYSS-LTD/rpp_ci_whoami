// Подготовка моделей стен пака к стыковке кусков.
// У моделей стен (wall*, включая окно выдачи) вертикальные рёбра торцов срезаны фаской: стенка толщиной ±0.25 к торцу
// сужается до ±0.137. Соседние куски ряда и стены в углах из-за этого стыкуются V-образной канавкой снаружи и внутри.
// Здесь торцевые вершины разводятся на полную толщину, так что лицевые стороны соседних кусков сходятся в одну плоскость.
// Фаска по верху торца (и полоса-канавка на середине высоты) остаётся: меняется только смещение по z.
import { BufferAttribute, Vector3, type BufferGeometry, type Mesh, type Object3D } from "three";

// Толщина стенки модели стены пака в единицах модели (без MODEL_SCALE): лицевые стороны на z = ±0.25.
export const WALL_MODEL_THICKNESS = 0.5;

// Вершины ближе этого к торцу (по x, в единицах модели) считаются торцевыми: фаска начинается в 0.1 от торца.
const endBand = 0.05;

// Убирает боковую фаску на торцах всех мешей модели стены. Геометрия меняется на месте (у шаблона в хранилище моделей, до клонов).
export function squareWallEnds(model: Object3D): void {
	model.traverse((node) => {
		const mesh = node as Mesh;
		if (mesh.isMesh && !mesh.geometry.userData.wallEndsSquared) {
			mesh.geometry = squareGeometryEnds(mesh.geometry);
			mesh.geometry.userData.wallEndsSquared = true;
		}
	});
}

function squareGeometryEnds(source: BufferGeometry): BufferGeometry {
	// Без индекса у каждого треугольника свои вершины: нормали затронутых граней можно пересчитать, не трогая соседей.
	const geometry = source.index ? source.toNonIndexed() : source;
	if (geometry !== source) {
		source.dispose();
	}
	const position = geometry.getAttribute("position") as BufferAttribute;
	let maxX = 0;
	for (let index = 0; index < position.count; index += 1) {
		maxX = Math.max(maxX, Math.abs(position.getX(index)));
	}
	const halfThickness = WALL_MODEL_THICKNESS / 2;
	// Полутолщина торца (наибольшая |z| среди торцевых вершин): на столько торец уже стенки.
	let endHalf = 0;
	for (let index = 0; index < position.count; index += 1) {
		if (Math.abs(position.getX(index)) > maxX - endBand) {
			endHalf = Math.max(endHalf, Math.abs(position.getZ(index)));
		}
	}
	const shift = halfThickness - endHalf;
	if (endHalf <= 0 || shift <= 1e-4) {
		return geometry;
	}
	const moved = new Uint8Array(position.count);
	for (let index = 0; index < position.count; index += 1) {
		if (Math.abs(position.getX(index)) > maxX - endBand) {
			const z = position.getZ(index);
			if (Math.abs(z) > 1e-6) {
				position.setZ(index, Math.sign(z) * Math.min(halfThickness, Math.abs(z) + shift));
				moved[index] = 1;
			}
		}
	}
	position.needsUpdate = true;
	recomputeFaceNormals(geometry, moved);
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	return geometry;
}

// Плоские нормали треугольников, у которых сдвинута хотя бы одна вершина (бывшие грани фаски стали частью лицевой стороны).
function recomputeFaceNormals(geometry: BufferGeometry, moved: Uint8Array): void {
	const position = geometry.getAttribute("position") as BufferAttribute;
	const normal = geometry.getAttribute("normal") as BufferAttribute | undefined;
	if (!normal) {
		return;
	}
	const a = new Vector3();
	const b = new Vector3();
	const c = new Vector3();
	for (let first = 0; first + 2 < position.count; first += 3) {
		if (!moved[first] && !moved[first + 1] && !moved[first + 2]) {
			continue;
		}
		a.fromBufferAttribute(position, first);
		b.fromBufferAttribute(position, first + 1);
		c.fromBufferAttribute(position, first + 2);
		const face = c.sub(b).cross(a.sub(b));
		// Вырожденный треугольник (бывшая фаска схлопнулась в линию) не виден: нормаль не трогаем.
		if (face.lengthSq() < 1e-12) {
			continue;
		}
		face.normalize();
		for (let vertex = first; vertex < first + 3; vertex += 1) {
			normal.setXYZ(vertex, face.x, face.y, face.z);
		}
	}
	normal.needsUpdate = true;
}
