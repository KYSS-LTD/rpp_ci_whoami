import * as THREE from 'three';

const tau = Math.PI * 2;
// Центр, направление прохода, полуширина и высота отверстия, толщина скалы.
export const passages = {
	canyon: [
		[4, -12, -0.13, 8.4, 11, 4.2],
		[-12, -62, 0.3, 5.1, 12, 3.1],
		[10, -122, -0.36, 11.4, 7.4, 5.1],
	],
	alpine: [
		[-7, -26, 0.17, 6.3, 8.4, 3.6],
		[7, -78, -0.34, 9, 6.9, 4.4],
		[-9, -134, 0.3, 6.6, 10.4, 4.1],
	],
};

function stone_Geometry(positions, colors, indices) {
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geo.setIndex(indices);
	geo.computeVertexNormals();
	return geo;
}

function signed_Power(n, p) {
	return Math.sign(n) * Math.pow(Math.abs(n), p);
}

// Пересекаем внутреннюю поверхность свода плоскостью ворот. Та же граница
// определяет пролёт у кромки, в середине и в узкой части под выступом.
function aperture_Section(geometry, strips, sides) {
	const points = geometry.attributes.position,
		indices = geometry.index.array;
	const edges = [],
		feet = [];
	for (let i = 0; i < strips * sides * 6; i += 3) {
		const column = Math.floor(i / 6) % sides;
		if (Math.cos(((column + 0.5) * tau) / sides) > 0) continue;
		const cut = [];
		for (let corner = 0; corner < 3; corner++) {
			const a = indices[i + corner],
				b = indices[i + ((corner + 1) % 3)];
			const za = points.getZ(a),
				zb = points.getZ(b);
			if (za > 0 === zb > 0) continue;
			const t = za / (za - zb);
			const hit = new THREE.Vector2(
				THREE.MathUtils.lerp(points.getX(a), points.getX(b), t),
				THREE.MathUtils.lerp(points.getY(a), points.getY(b), t),
			);
			cut.push(hit);
			if (a < sides && b < sides) feet[0] = hit;
			if (a >= strips * sides && b >= strips * sides) feet[1] = hit;
		}
		if (cut.length === 2) edges.push(cut);
	}
	edges.push(feet);
	return (x, y) => {
		let inside = false;
		for (const [a, b] of edges) {
			if (a.y > y === b.y > y) continue;
			const border = a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
			if (x < border) inside = !inside;
		}
		return inside;
	};
}

function arch_Mesh(alpine, entry, groundAt, material, index) {
	const [x, z, yaw, span, rise, depth] = entry;
	const y = groundAt(x, z),
		seed = 1.2 + index * 2.9;
	const positions = [],
		colors = [],
		indices = [];
	const strips = 80,
		sides = 32;
	const dark = new THREE.Color(alpine ? 0x474b50 : 0x814c38),
		light = new THREE.Color(alpine ? 0x9a9b95 : 0xb47756);
	const snow = new THREE.Color(0xe8f2f4),
		color = new THREE.Color();
	// Полая скальная перемычка. Траектории внутренней и внешней кромок независимы.
	for (let strip = 0; strip <= strips; strip++) {
		const a = (Math.PI * strip) / strips,
			ca = Math.cos(a),
			sa = Math.sin(a);
		const shelter = 1 - sa;
		const flank = 1 + 0.46 * Math.sin(2 * a + seed) + 0.3 * Math.cos(5 * a + seed);
		const outerX = span + (4.2 + 5.4 * shelter) * flank,
			outerY = rise + (2.6 + 2.0 * Math.cos(3 * a + seed) ** 2) * flank;
		for (let j = 0; j < sides; j++) {
			const b = (j / sides) * tau;
			const radius = (signed_Power(Math.cos(b), 0.71) + 1) * 0.5;
			const fissure = 0.11 * Math.cos(strip * 0.85 + seed) * Math.sin(a);
			const asymmetric = 0.42 * Math.sin(3 * a + seed) + 0.21 * Math.sin(8 * a + 0.3 * index);
			let px =
				ca * (span + (outerX - span) * radius) +
				sa * (0.31 * span * Math.sin(seed) + asymmetric);
			let py =
				-1.65 +
				(rise + 1.65 + (outerY - rise) * radius) * signed_Power(sa, 0.81) +
				sa * (asymmetric + 0.43 * Math.sin(a * 6 + b + seed) + fissure);
			let pz =
				signed_Power(Math.sin(b), 0.65) *
					depth *
					(0.75 + 0.76 * shelter + 0.22 * Math.sin(4 * a + seed)) +
				0.65 * Math.sin(3 * a + seed);
			const shear =
				0.63 * Math.sin((2.3 * px) / span + seed) + 0.56 * Math.cos(0.36 * pz + 0.23 * py);
			const weather =
				0.36 * Math.sin(px * 0.87 + py * 0.64 + pz * 0.32 + seed) +
				0.18 * Math.cos(2.8 * py + 0.53 * px + 0.69 * pz) +
				0.15 * Math.sin(1.7 * px - 1.4 * pz);
			const ledge = alpine
				? 0.32 * Math.abs(Math.sin(0.52 * px + 0.37 * py - 0.28 * pz))
				: 0.35 * Math.tanh(2.3 * Math.sin(py * 1.18 + shear)) +
					0.39 * Math.tanh(3.2 * Math.cos(px * 0.57 + 0.17 * py));
			const erosion = weather + ledge;
			px += ca * Math.cos(b) * erosion + shear * sa * 0.49;
			py += sa * Math.cos(b) * erosion;
			pz += Math.sin(b) * erosion + 0.51 * Math.sin(0.59 * px + 0.4 * py);
			positions.push(px, py, pz);
			color
				.copy(dark)
				.lerp(
					light,
					0.26 +
						0.42 * radius +
						0.16 * Math.sin(a * 6 + seed) +
						0.12 * Math.sin(1.2 * py + shear),
				);
			if (alpine)
				color.lerp(
					snow,
					THREE.MathUtils.smoothstep(
						radius * sa + 0.1 * Math.sin(10 * a + seed),
						0.72,
						0.96,
					) * 0.82,
				);
			else
				color.multiplyScalar(
					0.95 +
						0.035 * Math.sin(2.1 * py + Math.sin(px * 0.14)) +
						0.06 * Math.cos(px * 0.9),
				);
			colors.push(color.r, color.g, color.b);
			if (strip < strips) {
				const i = strip * sides + j,
					next = strip * sides + ((j + 1) % sides);
				indices.push(i, i + sides, next, next, i + sides, next + sides);
			}
		}
	}
	for (let j = 1; j < sides - 1; j++) {
		const cap = strips * sides;
		indices.push(0, j, j + 1, cap, cap + j + 1, cap + j);
	}
	const arch = new THREE.Mesh(stone_Geometry(positions, colors, indices), material);
	arch.position.set(x, y, z);
	arch.rotation.y = yaw;
	arch.name = (alpine ? 'Glacial rock bridge ' : 'Sandstone window ') + (index + 1);
	arch.castShadow = arch.receiveShadow = true;
	return { arch, contains: aperture_Section(arch.geometry, strips, sides) };
}

export function add_RockGates(scene, collision, groundAt, material, id) {
	const alpine = id === 'alpine';
	return passages[id].map((entry, index) => {
		const { arch, contains } = arch_Mesh(alpine, entry, groundAt, material, index);
		scene.add(arch);
		collision.add(arch);
		const [x, z, yaw, span, rise] = entry;
		return {
			x,
			z,
			y: groundAt(x, z),
			yaw,
			width: span * 2,
			height: rise,
			label: String(index + 1),
			contains,
		};
	});
}
