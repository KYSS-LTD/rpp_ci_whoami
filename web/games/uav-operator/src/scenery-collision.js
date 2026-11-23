import { Box3, Matrix4, Triangle, Vector3 } from 'three';

const cellSize = 8;
const epsilon = 1e-10;
const direction = new Vector3();
const offset = new Vector3();
const edge = new Vector3();
const perpendicular = new Vector3();
const velocity = new Vector3();
const closest = new Vector3();
const contact = new Vector3();
const bounds = new Box3();

// Момент входа в сферу вершины или цилиндр вокруг ребра.
function entry_Time(delta, speed, radius) {
	const a = speed.lengthSq(), b = delta.dot(speed);
	if (a < epsilon || b >= 0) return Infinity;
	const c = delta.lengthSq() - radius * radius;
	const discriminant = b * b - a * c;
	if (c < 0 || discriminant < 0) return Infinity;
	return c / (-b + Math.sqrt(discriminant));
}

function edge_Time(start, a, b, radius, limit) {
	edge.subVectors(b, a);
	const length = edge.length();
	if (length < epsilon) return limit;
	edge.multiplyScalar(1 / length);
	offset.subVectors(start, a);
	const vertexTime = entry_Time(offset, direction, radius);
	const along = offset.dot(edge), alongSpeed = direction.dot(edge);
	perpendicular.copy(offset).addScaledVector(edge, -along);
	velocity.copy(direction).addScaledVector(edge, -alongSpeed);
	const t = entry_Time(perpendicular, velocity, radius);
	const position = along + t * alongSpeed;
	return Math.min(limit, vertexTime, position >= 0 && position <= length ? t : Infinity);
}

function triangle_Time(triangle, start, radius, limit) {
	const { a, b, c, normal } = triangle;
	triangle.closestPointToPoint(start, closest);
	offset.subVectors(start, closest);
	if (offset.lengthSq() <= radius * radius) {
		// Дрон может отлететь от поверхности после касания.
		return offset.dot(direction) < 0 ? 0 : Infinity;
	}
	const distance = offset.subVectors(start, a).dot(normal);
	const approach = direction.dot(normal);
	if (Math.abs(distance) >= radius && distance * approach < 0) {
		const signedRadius = Math.sign(distance) * radius;
		const t = (signedRadius - distance) / approach;
		if (t <= limit) {
			contact.copy(start).addScaledVector(direction, t).addScaledVector(normal, -signedRadius);
			if (triangle.containsPoint(contact)) return t;
		}
	}
	let time = edge_Time(start, a, b, radius, Infinity);
	time = edge_Time(start, b, c, radius, time);
	return edge_Time(start, c, a, radius, time);
}

// Запоминаем статичную геометрию после расстановки, до объединения мешей.
// В ячейках хранятся отдельные треугольники в мировых координатах.
export function create_SceneryCollision() {
	const grid = new Map();
	const result = { time: 0, normal: new Vector3() };
	let queryId = 0;

	function insert(geometry, matrix) {
		const { position } = geometry.attributes;
		const vertices = Array.from({ length: position.count }, (_, i) =>
			new Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix));
		const indices = geometry.index;
		const count = indices?.count ?? position.count;
		const vertex = i => vertices[indices ? indices.getX(i) : i];
		for (let i = 0; i + 2 < count; i += 3) {
			const triangle = new Triangle(vertex(i), vertex(i + 1), vertex(i + 2));
			triangle.normal = triangle.getNormal(new Vector3());
			if (!triangle.normal.lengthSq()) continue;
			triangle.bounds = new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]);
			const { min, max } = triangle.bounds;
			for (let x = Math.floor(min.x / cellSize); x <= Math.floor(max.x / cellSize); x++) {
				for (let z = Math.floor(min.z / cellSize); z <= Math.floor(max.z / cellSize); z++) {
					const key = x + '/' + z;
					if (!grid.has(key)) grid.set(key, []);
					grid.get(key).push(triangle);
				}
			}
		}
	}

	return {
		add(root) {
			root.updateWorldMatrix(true, true);
			root.traverse(mesh => {
				if (!mesh.isMesh) return;
				if (!mesh.isInstancedMesh) {
					insert(mesh.geometry, mesh.matrixWorld);
					return;
				}
				const matrix = new Matrix4();
				for (let i = 0; i < mesh.count; i++) {
					mesh.getMatrixAt(i, matrix);
					insert(mesh.geometry, matrix.premultiply(mesh.matrixWorld));
				}
			});
		},
		// Следующая проверка переиспользует результат. Столкновение учитывается с обеих сторон грани.
		sweep(start, end, radius) {
			direction.subVectors(end, start);
			bounds.makeEmpty().expandByPoint(start).expandByPoint(end).expandByScalar(radius);
			const { min, max } = bounds;
			let nearest = null, time = 1;
			queryId++;
			for (let x = Math.floor(min.x / cellSize); x <= Math.floor(max.x / cellSize); x++) {
				for (let z = Math.floor(min.z / cellSize); z <= Math.floor(max.z / cellSize); z++) {
					const triangles = grid.get(x + '/' + z);
					if (!triangles) continue;
					for (const triangle of triangles) {
						if (triangle.queryId === queryId) continue;
						triangle.queryId = queryId;
						if (!bounds.intersectsBox(triangle.bounds)) continue;
						const t = triangle_Time(triangle, start, radius, time);
						if (t <= time) {
							time = t;
							nearest = triangle;
						}
					}
				}
			}
			if (!nearest) return null;
			result.time = time;
			contact.copy(start).addScaledVector(direction, time);
			nearest.closestPointToPoint(contact, closest);
			result.normal.subVectors(contact, closest).normalize();
			return result;
		},
	};
}
