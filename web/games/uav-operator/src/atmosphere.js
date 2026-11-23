import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Панорамы Poly Haven (CC0). Азимут и высота солнца измерены по исходным HDRI.
// Яркое солнечное пятно убрано из уменьшенной карты освещения: его даёт источник с тенями.
const daylight = {
	beach:  { capture: [.792, .825], azimuth: -2.65, haze: 0xabbfc9, density: .0028, sun: 0xffedce, power: 2.32, bounce: 0xb3a086 },
	field:  { capture: [.629, .736], azimuth: -1.10, haze: 0xb6c9ce, density: .0024, sun: 0xffefce, power: 2.4, bounce: 0x8d906b },
	race:   { capture: [.657, .037], azimuth: -2.25, haze: 0xc3b2b8, density: .0031, sun: 0xffc388, power: 2.3, bounce: 0x988578 },
	canyon: { capture: [.678, .813], azimuth: -2.87, haze: 0xceae96, density: .0021, sun: 0xffedce, power: 2.14, bounce: 0xcf8c65 },
	alpine: { capture: [.632, .930], azimuth: -.24, haze: 0xaabfcd, density: .0020, sun: 0xfff3de, power: 2.12, bounce: 0x919998 },
};

// Поперечные ложбины и несколько планов леса видны в просветах между ближними деревьями.
function add_Ridgelines(scene, map) {
	const beach = map === 'beach';
	const phase = beach ? 3.6 : map === 'race' ? 1.9 : .3;
	const positions = [], colors = [], indices = [];
	const tint = new THREE.Color();
	const steps = 384, bands = 19;
	for (let layer = 0; layer < 2; layer++) {
		const start = positions.length / 3;
		const base = new THREE.Color(layer ? 0x667783 : beach ? 0x4e6455 : 0x536547);
		for (let i = 0; i <= steps; i++) {
			const a = (i % steps) * Math.PI * 2 / steps;
			const dx = Math.cos(a), dz = Math.sin(a);
			const land = beach ? THREE.MathUtils.smoothstep(-dx, -.25, .55) : 1;
			const valley = beach ? 1 : .30 + .70 * THREE.MathUtils.smoothstep(1 - Math.cos(a-daylight[map].azimuth), .08, .74);
			for (let b = 0; b < bands; b++) {
				const u = b / (bands-1);
				const p = phase + layer*2.7;
				const ridge = .61 + .20*Math.cos(4*a + p) + .14*Math.sin(8*a-p) + .09*Math.cos(13*a+p);
				const spur = Math.sin(21*a + 3*u + Math.sin(a*6))*.62 + Math.cos(43*a + 6*u + p)*.25;
				const r = (layer ? 285 : 180) + u*(layer ? 146 : 92) + 16*Math.sin(3*a + p) + 4*spur;
				const profile = Math.sin(u*Math.PI) ** .76;
				const h = -10 + (layer ? 65 : 36)*ridge*land*valley*profile*(1+.25*spur);
				positions.push(dx*r, h, dz*r-47);
				tint.copy(base).multiplyScalar(.68 + .30*u + .17*spur + .06*Math.sin(113*a + 15*u));
				colors.push(tint.r, tint.g, tint.b);
				if (i && b) {
					const n = start+i*bands+b;
					indices.push(n-bands-1,n,n-bands,n-bands-1,n-1,n);
				}
			}
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	const hills = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
	hills.name = 'Wooded ridges';
	scene.add(hills);
}

export function create_FlightAtmosphere(scene, map) {
	const light = daylight[map];
	const sky = new THREE.TextureLoader().load(new URL(`./assets/sky-${map}.webp`, import.meta.url).href);
	sky.mapping = THREE.EquirectangularReflectionMapping;
	sky.colorSpace = THREE.SRGBColorSpace;
	scene.background = sky;
	new HDRLoader().load(new URL(`./assets/light-${map}.hdr`, import.meta.url).href, probe => {
		if (scene.background !== sky) {
			probe.dispose();
			return;
		}
		probe.mapping = THREE.EquirectangularReflectionMapping;
		scene.environment = probe;
	});
	scene.environmentIntensity = .58;
	scene.backgroundRotation.y = light.capture[0] - light.azimuth;
	scene.environmentRotation.copy(scene.backgroundRotation);
	scene.fog = new THREE.FogExp2(light.haze, light.density);
	if (map === 'beach' || map === 'race') add_Ridgelines(scene, map);
	scene.add(new THREE.HemisphereLight(0xd1e1f9, light.bounce, .89));
	const sun = new THREE.DirectionalLight(light.sun, light.power);
	sun.target.position.set(map === 'beach' ? -12 : 0, 0, -46);
	const altitude = light.capture[1];
	sun.position.set(Math.cos(light.azimuth), Math.tan(altitude), Math.sin(light.azimuth)).normalize().multiplyScalar(255).add(sun.target.position);
	const span = map === 'beach' ? 145 : 174;
	sun.castShadow = true;
	const resolution = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
	sun.shadow.mapSize.set(resolution, resolution);
	Object.assign(sun.shadow.camera, { left: -span, right: span, bottom: -span, top: span, near: 5, far: 535 });
	sun.shadow.normalBias = .045;
	sun.shadow.bias = -.00014;
	sun.shadow.intensity = .91;
	sun.shadow.autoUpdate = false;
	sun.shadow.needsUpdate = true;
	scene.add(sun, sun.target);
	return sun;
}
