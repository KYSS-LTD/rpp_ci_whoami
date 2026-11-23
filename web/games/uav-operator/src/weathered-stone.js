import * as THREE from 'three';

// Rock Boulder Dry, скан поверхности Poly Haven (CC0): https://polyhaven.com/a/rock_boulder_dry
export function create_StoneSurface() {
	const loader = new THREE.TextureLoader();
	const map = loader.load(new URL('./assets/rock-color.webp', import.meta.url).href);
	const normalMap = loader.load(new URL('./assets/rock-normal.webp', import.meta.url).href);
	for (const texture of [map, normalMap]) {
		texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
		texture.anisotropy = 4;
	}
	map.colorSpace = THREE.SRGBColorSpace;
	return new THREE.MeshStandardMaterial({ map, normalMap, vertexColors: true, roughness: .93, normalScale: new THREE.Vector2(.72, .72) });
}

export function add_StoneArch(scene, ground, collision, surface, x, z, yaw, shore) {
	const positions = [], colors = [], uvs = [], indices = [];
	const spans = 72, sides = 24;
	const tint = new THREE.Color();
	const phase = shore ? 1.4 : 4.1;
	const halfSpan = shore ? 4.0 : 4.3;
	// Замкнутая каменная оболочка: нижняя дуга скрыта в грунте, середина проёма пуста.
	for (let i = 0; i <= spans; i++) {
		const a = 2 * Math.PI * (i % spans) / spans;
		const ca = Math.cos(a), sa = Math.sin(a);
		const centerX = halfSpan * ca + .47 * sa * sa;
		const centerY = .1 + 4.4 * sa + .32 * Math.sin(3*a + phase);
		const centerZ = .47 * Math.sin(2*a + phase) + .34 * ca;
		const buttress = 1 - Math.max(0, sa);
		for (let j = 0; j <= sides; j++) {
			const b = 2 * Math.PI * (j % sides) / sides;
			const cb = Math.cos(b), sb = Math.sin(b);
			const ledge = Math.sin(5*a - 3*b + phase) * .19 + Math.cos(9*a + 2*b) * .10
				+ Math.sin(17*a - 5*b + phase) * .058;
			const thickness = 1.15 + buttress * .74 + .21 * ca + ledge;
			const ridge = Math.sign(cb) * Math.abs(cb) ** .70 * thickness;
			const px = centerX + ca * ridge;
			const py = centerY + sa * ridge;
			const pz = centerZ + Math.sign(sb) * Math.abs(sb) ** .74 * (1.52 + .57*buttress + .35*ca + ledge);
			positions.push(px, py, pz);
			uvs.push(i / spans * 6, j / sides * 2.7);
			const stain = .5 + .5 * Math.sin(py * 4.5 + px * .74 + pz * .44 + ledge);
			const light = .84 + .11 * stain + .11 * Math.max(0, cb);
			const tide = shore ? 1 - THREE.MathUtils.smoothstep(py + .16*stain, .58, 1.12) : 0;
			tint.setRGB(light * (1.1 - .53*tide), light * (1.02-.44*tide), light * (.92-.46*tide));
			colors.push(tint.r, tint.g, tint.b);
			if (i < spans && j < sides) {
				const n = i * (sides + 1) + j, next = n + sides + 1;
				indices.push(n, next, next+1, n, next+1, n+1);
			}
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	const arch = new THREE.Mesh(geometry, surface);
	arch.name = shore ? 'Tidal arch' : 'Limestone bridge';
	arch.position.set(x, ground(x,z), z);
	arch.rotation.y = yaw;
	arch.castShadow = arch.receiveShadow = true;
	scene.add(arch);
	collision.add(arch);
	return arch;
}
