import * as THREE from 'three';

const daylight = {
	beach: { haze: 0xa2b4c5, density: .0029, sun: 0xffe3b5, sky: 0xe3eff8, bounce: 0x958674, direction: [-.83, .95, -.45] },
	field: { haze: 0xaab7c6, density: .0025, sun: 0xffefcc, sky: 0xe0f0ff, bounce: 0x84946c, direction: [-.9, 1.25, .48] },
	race: { haze: 0xbcaeb0, density: .0028, sun: 0xffce92, sky: 0xdce7ff, bounce: 0x94816e, direction: [.88, .72, .50] },
};

// Два склона с разными гребнями дают параллакс за границей доступного поля.
function add_Ridgelines(scene, map) {
	const beach = map === 'beach';
	const shift = map === 'race' ? 1.9 : beach ? 3.6 : .3;
	const nearColor = new THREE.Color(beach ? 0x4b6a5b : 0x465f55);
	const farColor = new THREE.Color(map === 'race' ? 0x797c83 : 0x607687);
	const colors = [], positions = [], indices = [];
	const tint = new THREE.Color();
	const bands = [-31, -8, 13, 35];
	const steps = 420;
	const forestEdge = [], forestColors = [];
	for (let layer = 0; layer < 2; layer++) {
		const start = positions.length / 3;
		const phase = shift + layer * 2.1;
		for (let i = 0; i <= steps; i++) {
			const a = (i % steps) / steps * Math.PI * 2;
			const dx = Math.cos(a), dz = Math.sin(a);
			const swell = Math.sin(a * 5 + phase) * .48 + Math.sin(a * 9 - phase) * .23 + Math.sin(a * 21 + phase) * .12;
			const teeth = Math.abs(Math.sin(a * 15 + phase + Math.cos(a * 7))) * .21
				+ .058 * Math.sin(a * 43 + phase) + .025 * Math.sin(a * 93);
			const land = beach ? THREE.MathUtils.smoothstep(-dx, -.23, .53) : 1;
			const ridge = (layer ? 63 : 32) * (.72 + swell * .78 + teeth) * land;
			const radius = (layer ? 352 : 250) + 17 * Math.sin(3 * a + phase) + 9 * Math.cos(8 * a);
			for (let band = 0; band < 4; band++) {
				const r = radius + bands[band] + (band === 1 ? 5 * Math.sin(a * 12) : 0);
				const y = [-5, ridge * (.38 + .09 * Math.cos(a * 14)), ridge, -6][band] - (1 - land) * 7;
				positions.push(r * dx, y, -48 + r * dz);
				tint.copy(layer ? farColor : nearColor).multiplyScalar(.64 + band * .13 + .18 * Math.sin(a * 7 + phase) + .09 * Math.cos(a * 34));
				colors.push(tint.r, tint.g, tint.b);
				if (i && band) {
					const n = start + i * 4 + band;
					indices.push(n - 5, n, n - 4, n - 5, n - 1, n);
				}
			}
			if (layer === 0 && land > .6) {
				for (let j = 0; j < 3; j++) {
					const angle = a + j * .004, r = radius + 12 - j*.55;
					const x = Math.cos(angle)*r, z = Math.sin(angle)*r-48, w = .76 + .21*Math.sin(i*2.3);
					const y = ridge - 1 - j*.52;
					forestEdge.push(x-w*dz,y,z+w*dx, x,y+2.2+Math.cos(i*1.8+j),z, x+w*dz,y,z-w*dx);
					for (let corner=0;corner<3;corner++) forestColors.push(tint.r*.56,tint.g*.65,tint.b*.60);
				}
			}
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	const hills = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
	hills.name = 'Distant hills';
	scene.add(hills);
	const woods = new THREE.BufferGeometry();
	woods.setAttribute('position', new THREE.Float32BufferAttribute(forestEdge, 3));
	woods.setAttribute('color', new THREE.Float32BufferAttribute(forestColors, 3));
	scene.add(new THREE.Mesh(woods, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
}

export function create_FlightAtmosphere(scene, map) {
	const light = daylight[map];
	const sky = new THREE.TextureLoader().load(new URL('./assets/clouds.jpg', import.meta.url).href);
	sky.mapping = THREE.EquirectangularReflectionMapping;
	sky.colorSpace = THREE.SRGBColorSpace;
	scene.background = sky;
	// Солнце на исходной панораме находится примерно на 60% её ширины.
	scene.backgroundRotation.y = .63 - Math.atan2(light.direction[2], light.direction[0]);
	scene.backgroundIntensity = map === 'race' ? .86 : .96;
	scene.fog = new THREE.FogExp2(light.haze, light.density);
	add_Ridgelines(scene, map);
	scene.add(new THREE.HemisphereLight(light.sky, light.bounce, 1.45));
	const sun = new THREE.DirectionalLight(light.sun, 2.35);
	sun.target.position.set(map === 'beach' ? -12 : 0, 0, -46);
	sun.position.fromArray(light.direction).normalize().multiplyScalar(230).add(sun.target.position);
	const span = map === 'beach' ? 145 : 174;
	sun.castShadow = true;
	const resolution = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
	sun.shadow.mapSize.set(resolution, resolution);
	Object.assign(sun.shadow.camera, { left: -span, right: span, bottom: -span, top: span, near: 10, far: 460 });
	sun.shadow.normalBias = .055;
	sun.shadow.bias = -.00018;
	sun.shadow.intensity = .87;
	sun.shadow.autoUpdate = false;
	sun.shadow.needsUpdate = true;
	scene.add(sun, sun.target);
	return sun;
}
