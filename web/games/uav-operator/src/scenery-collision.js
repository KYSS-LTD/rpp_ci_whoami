import { Box3, Matrix4, Triangle, Vector3 } from 'three';

const cellSize = 8;
const facesPerBlock = 16;
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

// В сетке храним границы небольших групп граней. Вершины одного экземпляра
// лежат в общем массиве, точный треугольник собираем только у самого дрона.
export function create_SceneryCollision() {
	const grid = new Map();
	const result = { time: 0, normal: new Vector3() };
	const face = new Triangle(), nearest = new Triangle();
	face.normal = new Vector3();
	const vertex = new Vector3(), faceBounds = new Box3();
	let queryId = 0;

	function insert(geometry, matrix, indices) {
		const { position } = geometry.attributes;
		const vertices = new Float64Array(position.count * 3);
		for (let i = 0; i < position.count; i++)
			vertex.fromBufferAttribute(position, i).applyMatrix4(matrix).toArray(vertices, i * 3);
		const count = indices?.length ?? position.count;
		for (let first = 0; first + 2 < count; first += facesPerBlock * 3) {
			const end = Math.min(count, first + facesPerBlock * 3);
			const box = new Box3();
			for (let i = first; i < end; i++)
				box.expandByPoint(vertex.fromArray(vertices, (indices ? indices[i] : i) * 3));
			const block = { box, vertices, indices, first, end, queryId: 0 };
			const { min, max } = box;
			for (let x = Math.floor(min.x / cellSize); x <= Math.floor(max.x / cellSize); x++) {
				for (let z = Math.floor(min.z / cellSize); z <= Math.floor(max.z / cellSize); z++) {
					const key = x + '/' + z;
					if (!grid.has(key)) grid.set(key, []);
					grid.get(key).push(block);
				}
			}
		}
	}

	return {
		add(root) {
			root.updateWorldMatrix(true, true);
			root.traverse(mesh => {
				if (!mesh.isMesh) return;
				const indices = mesh.geometry.index?.array.slice();
				if (!mesh.isInstancedMesh) {
					insert(mesh.geometry, mesh.matrixWorld, indices);
					return;
				}
				const matrix = new Matrix4();
				for (let i = 0; i < mesh.count; i++) {
					mesh.getMatrixAt(i, matrix);
					insert(mesh.geometry, matrix.premultiply(mesh.matrixWorld), indices);
				}
			});
		},
		// Следующая проверка переиспользует результат. Столкновение учитывается с обеих сторон грани.
		sweep(start, end, radius) {
			direction.subVectors(end, start);
			if (direction.lengthSq() === 0) return null;
			bounds.makeEmpty().expandByPoint(start).expandByPoint(end).expandByScalar(radius);
			const { min, max } = bounds;
			let found = false, time = 1;
			queryId++;
			for (let x = Math.floor(min.x / cellSize); x <= Math.floor(max.x / cellSize); x++) {
				for (let z = Math.floor(min.z / cellSize); z <= Math.floor(max.z / cellSize); z++) {
					const blocks = grid.get(x + '/' + z);
					if (!blocks) continue;
					for (const block of blocks) {
						if (block.queryId === queryId) continue;
						block.queryId = queryId;
						if (!bounds.intersectsBox(block.box)) continue;
						const { vertices, indices, first, end } = block;
						for (let i = first; i + 2 < end; i += 3) {
							face.a.fromArray(vertices, (indices ? indices[i] : i) * 3);
							face.b.fromArray(vertices, (indices ? indices[i + 1] : i + 1) * 3);
							face.c.fromArray(vertices, (indices ? indices[i + 2] : i + 2) * 3);
							faceBounds.set(face.a, face.a).expandByPoint(face.b).expandByPoint(face.c);
							if (!bounds.intersectsBox(faceBounds)) continue;
							if (!face.getNormal(face.normal).lengthSq()) continue;
							const t = triangle_Time(face, start, radius, time);
							if (t <= time) {
								time = t;
								nearest.copy(face);
								found = true;
							}
						}
					}
				}
			}
			if (!found) return null;
			result.time = time;
			contact.copy(start).addScaledVector(direction, time);
			nearest.closestPointToPoint(contact, closest);
			result.normal.subVectors(contact, closest).normalize();
			return result;
		},
	};
}
