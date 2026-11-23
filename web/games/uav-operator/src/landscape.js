import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { add_StoneArch, create_StoneSurface } from './weathered-stone.js';
import { compactGraphics } from './graphics-quality.js';

const up = new THREE.Vector3(0, 1, 0);
const tau = Math.PI * 2;

// Сохраняем шаг сетки в зоне полёта. На дальнем плане оставляем каждую четвёртую линию.
export function ground_Plane(width, depth, columns, rows, bounds) {
	function coordinates(length, segments, min, max) {
		const axis = [];
		for (let i = 0; i <= segments; i++) {
			const point = length * (i / segments - .5);
			if (i % 4 === 0 || i === segments || (point >= min - 12 && point <= max + 12)) axis.push(point);
		}
		return axis;
	}
	const xs = coordinates(width, columns, bounds.minX, bounds.maxX);
	const zs = coordinates(depth, rows, bounds.minZ, bounds.maxZ);
	const plane = new THREE.PlaneGeometry(width, depth, xs.length - 1, zs.length - 1);
	const { position, uv } = plane.attributes;
	let i = 0;
	for (const z of zs) for (const x of xs) {
		position.setXYZ(i, x, 0, z);
		uv.setXY(i++, x / width + .5, .5 - z / depth);
	}
	return plane;
}
function random_Stream(seed) {
	return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function tint(geometry, base) {
	const color = new THREE.Color(base);
	const rgb = new Float32Array(geometry.attributes.position.count * 3);
	for (let i = 0; i < rgb.length; i += 3) color.toArray(rgb, i);
	geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
	return geometry;
}

function limb(from, to, bottom, top, color) {
	const vector = to.clone().sub(from);
	const geometry = new THREE.CylinderGeometry(top, bottom, vector.length(), compactGraphics ? 4 : 6, 1, true);
	geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, vector.normalize()));
	const center = from.clone().lerp(to, .5);
	return tint(geometry.translate(center.x, center.y, center.z), color);
}

// Грозди листьев собраны из атласа Tree Small 02 (Poly Haven, CC0).
function leaf_Texture() {
	const map = new THREE.TextureLoader().load(new URL('./assets/broadleaf-spray.webp', import.meta.url).href);
	map.colorSpace = THREE.SRGBColorSpace;
	map.anisotropy = 4;
	return map;
}

function tree_Model(birch, seed) {
	const random = random_Stream(seed), wood = [], leaves = [];
	const origin = new THREE.Vector3();
	const crown = new THREE.Vector3(.025, .95, -.025);
	const pale = birch ? 0xd2c8a3 : 0x6d5846;
	wood.push(limb(origin, crown, birch ? .016 : .031, .004, pale));
	if (birch && !compactGraphics) {
		for (let i = 1; i < 11; i++) {
			const h = i * .069, center = crown.clone().multiplyScalar(h);
			const radius = .016 - h * .012;
			const mark = new THREE.CylinderGeometry(radius + .0009, radius + .001, .003 + random() * .006, 7, 1, true, random() * tau, 1 + random() * 3);
			wood.push(tint(mark.translate(center.x, center.y, center.z), 0x685f54));
		}
	}
	const angle0 = random() * tau;
	const branches = compactGraphics ? 10 : 19;
	const sprays = compactGraphics ? 3 : 5;
	for (let i = 0; i < branches; i++) {
		const level = i / branches, a = angle0 + i * 2.4 + random() * .45;
		const reach = (birch ? .185 : .30) * (.25 + Math.sin((.13 + level * .84) * Math.PI) * .86) * (.89 + random() * .23);
		const joint = crown.clone().multiplyScalar(.31 + level * .64);
		const tip = new THREE.Vector3(joint.x + reach * Math.cos(a), joint.y + .13 + random() * .045, joint.z + reach * Math.sin(a));
		const elbow = joint.clone().lerp(tip, .47);
		elbow.y += birch ? .052 : -.022;
		wood.push(limb(joint, elbow, birch ? .008 : .014, .006, pale), limb(elbow, tip, .006, .0014, 0x746548));
		for (let j = 0; j < sprays; j++) {
			const pos = tip.clone().lerp(elbow, random() * .65);
			const size = (birch ? .235 : .31) * (.90 + random() * .28) * (1 - level * .18) * (compactGraphics ? 1.2 : 1);
			pos.x += (random() - .5) * size * .85;
			pos.z += (random() - .5) * size * .85;
			pos.y += (random() - .5) * size * .5;
			const leaf = new THREE.PlaneGeometry(size, size * (birch ? 1.27 : .94));
			leaf.rotateX((random() - .48) * 1.95);
			leaf.rotateY(a + j * 1.45);
			leaf.translate(pos.x, pos.y, pos.z);
			const vertex = new THREE.Vector3();
			for (let v = 0; v < leaf.attributes.position.count; v++) {
				vertex.fromBufferAttribute(leaf.attributes.position,v);
				vertex.y = .14 + (vertex.y - .66) * .66;
				vertex.normalize();
				leaf.attributes.normal.setXYZ(v,vertex.x,vertex.y,vertex.z);
			}
			// Наружная часть кроны лучше освещена, в глубине виден более тёмный второй план.
			const color = new THREE.Color(birch ? 0xe1d9ae : 0xc7d6c1).multiplyScalar(.70 + level * .24 + random() * .15);
			leaves.push(tint(leaf, color));
		}
	}
	return [mergeGeometries(wood), mergeGeometries(leaves)];
}

function boulder_Model(seed) {
	const random = random_Stream(seed), shape = new THREE.IcosahedronGeometry(1, 1);
	const vertices = shape.attributes.position, rgb = [], painted = new THREE.Color();
	const phase = random() * tau;
	for (let i = 0; i < vertices.count; i++) {
		const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
		const rough = .92 + .095 * Math.sin(5 * x + 3 * z + phase) + .034 * Math.cos(y * 8 - phase);
		vertices.setXYZ(i, x * rough + .09 * y, Math.max(-.91, Math.min(.85, y * rough)), z * rough - .1 * y);
		painted.set(y > .42 ? 0xd5d5b5 : 0xe4dbcf).multiplyScalar(.92 + .13 * y + .1 * rough);
		rgb.push(painted.r, painted.g, painted.b);
	}
	shape.computeVertexNormals();
	shape.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
	return shape;
}

function grass_Model() {
	const random = random_Stream(798);
	const positions = [], colors = [];
	const base = new THREE.Color(0x687039), tips = new THREE.Color();
	for (let i = 0; i < (compactGraphics ? 7 : 17); i++) {
		const a = random() * tau, d = random() * .37, height = .19 + random() * .38;
		const x = d * Math.cos(a), z = d * Math.sin(a), w = .012 + .026 * random();
		positions.push(x - w * Math.sin(a), -.025, z + w * Math.cos(a), x + w * Math.sin(a), -.025, z - w * Math.cos(a),
			x + height * .45 * Math.cos(a), height, z + height * .45 * Math.sin(a));
		tips.set(i % 6 ? 0x9d9d55 : 0xcab77c);
		colors.push(base.r, base.g, base.b, base.r, base.g, base.b, tips.r, tips.g, tips.b);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.computeVertexNormals();
	return geometry;
}

export function create_Landscape(scene, elevation, seed, collision) {
	const random = random_Stream(seed), cells = new Map(), parts = new Map(), solids = new Map();
	let grassIndex = 0;
	const opaque = new THREE.MeshLambertMaterial({ vertexColors: true });
	const canopy = new THREE.MeshLambertMaterial({
		map: leaf_Texture(), vertexColors: true, side: THREE.DoubleSide, alphaTest: .38, alphaToCoverage: true,
	});
	// Нормали направлены наружу от кроны. Лист освещается одинаково с обеих сторон.
	canopy.onBeforeCompile = shader => {
		shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal *= faceDirection;');
	};
	const grassSurface = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
	function part(name, geometry, surface = opaque) { parts.set(name, { geometry, surface }); }
	for (const species of ['birch', 'oak']) {
		const [wood, leaves] = tree_Model(species === 'birch', species === 'birch' ? 94 : 176);
		part(species, wood);
		part(species + ' leaves', leaves, canopy);
	}
	part('rail', tint(new THREE.BoxGeometry(1, 1, 1), 0x9c825f));
	part('bark', tint(new THREE.CylinderGeometry(.86, 1, 1, 9), 0x756049));
	part('cut', tint(new THREE.CylinderGeometry(1, 1, 1, 9), 0xc6a674));
	const stoneSurface = create_StoneSurface();
	part('stone', boulder_Model(seed), stoneSurface);
	part('grass', grass_Model(), grassSurface);
	const dummy = new THREE.Object3D(), turn = new THREE.Quaternion(), unit = new THREE.Vector3();
	// На телефоне объединяем обе стороны узкой трассы в одном вызове отрисовки.
	const cellSize = compactGraphics ? 145 : 70;
	const offset = compactGraphics ? .5 : 0;
	function instance(name, x, y, z, sx, sy, sz, rotation, shade = 1) {
		const key = name + '/' + Math.floor(x / cellSize + offset) + '/' + Math.floor(z / cellSize + offset);
		if (!cells.has(key)) cells.set(key, { name, matrices: [], shades: [] });
		const batch = cells.get(key);
		dummy.position.set(x, y, z);
		dummy.scale.set(sx, sy, sz);
		if (typeof rotation === 'number') dummy.rotation.set(0, rotation, 0);
		else dummy.quaternion.copy(rotation);
		dummy.updateMatrix();
		batch.matrices.push(dummy.matrix.clone());
		batch.shades.push(shade);
	}
	function collider(x1, z1, x2, z2, test) {
		for (let ix = Math.floor(x1 / 8); ix <= Math.floor(x2 / 8); ix++) {
			for (let iz = Math.floor(z1 / 8); iz <= Math.floor(z2 / 8); iz++) {
				const key = ix + '/' + iz;
				if (!solids.has(key)) solids.set(key, []);
				solids.get(key).push(test);
			}
		}
	}
	function segment(name, a, b, width, depth, solid = true) {
		const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
		const length = Math.hypot(dx, dy, dz);
		if (!length) return;
		turn.setFromUnitVectors(up, unit.set(dx, dy, dz).divideScalar(length));
		instance(name, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, width, length, depth, turn, .83 + .24 * random());
		if (!solid) return;
		const radius = (name === 'rail' ? Math.max(width, depth) * .5 : width) + .11;
		collider(Math.min(a.x,b.x) - radius, Math.min(a.z,b.z) - radius, Math.max(a.x,b.x) + radius, Math.max(a.z,b.z) + radius, (x,y,z) => {
			const t = THREE.MathUtils.clamp(((x-a.x)*dx + (y-a.y)*dy + (z-a.z)*dz) / (length * length), 0, 1);
			return (x-a.x-t*dx)**2 + (y-a.y-t*dy)**2 + (z-a.z-t*dz)**2 < radius * radius;
		});
	}
	const point = (x, z, height) => new THREE.Vector3(x, elevation(x,z) + height, z);
	return {
		tree(x, z, h, species = 'birch') {
			const y = elevation(x, z), yaw = random() * tau, w = h * (.86 + random() * .26);
			const radius = w * (species === 'birch' ? .31 : .44);
			const shade = .82 + random() * .34;
			instance(species, x,y,z, w,h,w,yaw);
			instance(species + ' leaves', x,y,z, w,h,w,yaw,shade);
			collider(x-radius-.2, z-radius-.2, x+radius+.2, z+radius+.2, (px,py,pz) => {
				const r2 = (px-x)**2 + (pz-z)**2, f = (py-y)/h;
				if (f < -.015 || f > 1.12) return false;
				if (r2 < (h * (species === 'birch' ? .016 : .029) + .14)**2) return true;
				return ((f-.729)/.366)**2 + r2 / (radius*radius) < 1;
			});
		},
		fence(x1,z1,x2,z2,h = 1.62) {
			const spans = Math.max(1, Math.ceil(Math.hypot(x2-x1,z2-z1)/3.45));
			let last;
			for (let i = 0; i <= spans; i++) {
				const x = x1 + (x2-x1)*i/spans, z = z1 + (z2-z1)*i/spans;
				const foot = point(x,z,-.07);
				segment('rail', foot, point(x+.035,z,h + .04 * random()), .17, .18);
				if (last) for (const f of [.37, .82]) {
					const a = last.clone(), b = foot.clone();
					a.y += h*f; b.y += h*f;
					segment('rail', a,b, .13,.14);
				}
				last = foot;
			}
		},
		log(x1,z1,x2,z2,r = .35) {
			const a = point(x1,z1,r*.81), b = point(x2,z2,r*.88), axis = b.clone().sub(a).normalize();
			segment('bark', a,b,r,r);
			segment('cut', a.clone().addScaledVector(axis,-.018),a,r*.87,r*.87,false);
			segment('cut', b,b.clone().addScaledVector(axis,.018),r*.77,r*.77,false);
			const branch = a.clone().lerp(b,.32);
			segment('bark', branch, branch.clone().add(new THREE.Vector3(-axis.z*r*1.6,r*1.8,axis.x*r*1.6)), r*.29,r*.29);
		},
		rock(x,z,w,h,d=w,yaw=0,lift=0) {
			const y = elevation(x,z) + lift, rx = w*.5, rz = d*.5, ry = h/.94;
			instance('stone',x,y+h*.09,z,rx,ry,rz,yaw,.8+random()*.35);
		},
		arch(x,z,yaw,shore = false) {
			add_StoneArch(scene, elevation, collision, stoneSurface, x,z,yaw,shore);
		},
		grass(x,z,size=1) {
			if (compactGraphics && ++grassIndex % 3 !== 1) return;
			instance('grass',x,elevation(x,z),z,size,size,size,random()*tau,.76+random()*.49);
		},
		touches(x,y,z) {
			const list = solids.get(Math.floor(x/8)+'/'+Math.floor(z/8));
			if (list) for (const check of list) if (check(x,y,z)) return true;
			return false;
		},
		finish() {
			const color = new THREE.Color();
			for (const {name, matrices, shades} of cells.values()) {
				const {geometry, surface} = parts.get(name);
				const mesh = new THREE.InstancedMesh(geometry, surface, matrices.length);
				mesh.name = name;
				matrices.forEach((matrix, i) => {
					mesh.setMatrixAt(i, matrix);
					mesh.setColorAt(i, color.setScalar(shades[i]));
				});
				mesh.castShadow = name !== 'grass';
				mesh.receiveShadow = true;
				scene.add(mesh);
				if (name === 'stone') collision.add(mesh);
			}
			cells.clear();
		},
	};
}
