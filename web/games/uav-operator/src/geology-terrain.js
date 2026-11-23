import * as THREE from 'three';
import { add_Water } from './water.js';

const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;
// Неравномерная сетка сохраняет детали в зоне полёта и тянется до дальнего хребта.
function axis_Grid(first, last, distantStep) {
	const axis = [];
	const outer = [];
	for (let d = 4; d < 440; d += distantStep + Math.floor(d / 36)) outer.push(d);
	for (let k = outer.length - 1; k >= 0; k--) axis.push(first - outer[k]);
	for (let x = first; x <= last; x += 2) axis.push(x);
	for (const d of outer) axis.push(last + d);
	return axis;
}

function undulation(x, z) {
	return (
		0.5 * Math.sin(x * 0.063 + z * 0.035) +
		0.29 * Math.cos(x * 0.117 - z * 0.072) +
		0.14 * Math.sin(z * 0.24 + x * 0.093) +
		0.07 * Math.cos(x * 0.48 - z * 0.39)
	);
}

function canyon_Surface(x, z) {
	const wash = x - 10 * Math.sin((z + 15) * 0.034);
	const shelves =
		Math.abs(wash) +
		6 * Math.sin(z * 0.076 + wash * 0.033) +
		4 * undulation(x * 0.62, z * 0.62);
	const ridge = 0.5 + 0.5 * Math.sin(z * 0.036 + x * 0.018);
	const mesas = Math.max(0, Math.abs(wash) - 115, Math.abs(z + 64) - 160);
	const table = 0.5 + 0.5 * undulation(x * 0.48 + 18, z * 0.41);
	const bed =
		(Math.sin(x * 0.058 - z * 0.035) * 0.8 + undulation(x, z) * 0.52) *
		smooth(Math.hypot(x, z - 30), 5, 14);
	const drainage = Math.abs(
		Math.sin(z * 0.084 + 0.34 * Math.sin(x * 0.13) + undulation(x * 0.52, z * 0.49)),
	);
	const spur = smooth(shelves, 21, 64) * (1.8 * undulation(x * 1.2, z * 1.1) + 2.4 * drainage);
	return (
		bed +
		spur +
		smooth(shelves, 28, 43) * (3 + ridge * 4) +
		smooth(shelves, 44, 52) * (6 + ridge * 4) +
		smooth(shelves, 56, 61) * (4 + ridge * 7) +
		smooth(shelves, 68, 94) * (6 + ridge * 8) +
		smooth(mesas, 7, 38) *
			(9 +
				34 * smooth(table, 0.32, 0.54) +
				16 * smooth(table, 0.53, 0.6) +
				8 * drainage +
				3 * undulation(x, z))
	);
}

export const tarn = { x: -25, z: -51, level: -0.8 };
const basin_Radius = (x, z) =>
	Math.hypot((x - tarn.x + 2.2 * Math.sin(z * 0.12)) / 19, (z - tarn.z) / 36);
const peaks = [
	[-113, -177, 77, 0.62],
	[-88, -219, 94, 1.05],
	[-43, -270, 119, 0.87],
	[-3, -245, 82, 1.36],
	[37, -246, 109, 0.88],
	[86, -188, 86, 1.31],
	[134, -152, 81, 0.72],
	[177, -84, 73, 1.22],
	[-201, -48, 89, 0.82],
	[-185, 72, 102, 1.12],
];
function alpine_Surface(x, z) {
	const basin = basin_Radius(x, z);
	const glacialFloor =
		0.95 + undulation(x * 0.68, z * 0.68) * 1.05 - 4.9 * (1 - smooth(basin, 0.57, 1.18));
	const flank = smooth(Math.abs(x - 7 * Math.sin(z * 0.038)), 37, 116);
	const moraine = flank * (7.2 + 12 * (0.55 + 0.45 * undulation(x * 0.52, z * 0.48)));
	const headwall = Math.max((Math.abs(x) - 85) * 0.92, -z - 154, (z - 92) * 0.75);
	let peak = 0;
	for (const [px, pz, h, ratio] of peaks) {
		const dx = x - px,
			dz = z - pz;
		const ridge =
			Math.abs(dx * 0.75 + dz * 0.33) * ratio + Math.abs(dz * 0.68 - dx * 0.25) / ratio;
		peak = Math.max(peak, h - ridge * (1.03 + 0.15 * Math.sin(Math.atan2(dx, dz) * 5)));
	}
	const drainage =
		x * 0.063 + 0.034 * z + 1.4 * Math.sin(x * 0.017 + z * 0.021) + 0.48 * Math.sin(z * 0.068);
	const couloirs =
		7.5 * Math.abs(Math.sin(drainage)) + 3.2 * Math.abs(Math.cos(drainage * 2.3 + 0.036 * z));
	const scree = undulation(x * 0.91, z * 0.84) * 3.9 + undulation(x * 1.77, z * 1.77) * 1.5;
	const summits =
		smooth(headwall, 0, 73) *
		(14 + peak + 0.13 * peak * undulation(x * 0.64, z * 0.7) + couloirs + scree);
	return (glacialFloor + moraine + summits) * smooth(Math.hypot(x, z - 30), 5, 14);
}

// Снимки и карты высот Poly Haven, CC0. Высота упакована в альфа-канал WebP.
// https://polyhaven.com/a/red_sand | https://polyhaven.com/a/sandstone_cracks
// https://polyhaven.com/a/rocky_terrain_02 | https://polyhaven.com/a/marble_cliff_04
const plates = {
	sand: new URL('./assets/geology-red_sand.webp', import.meta.url).href,
	sandstone: new URL('./assets/geology-sandstone_cracks.webp', import.meta.url).href,
	meadow: new URL('./assets/geology-rocky_terrain_02.webp', import.meta.url).href,
	marble: new URL('./assets/geology-marble_cliff_04.webp', import.meta.url).href,
};
export function create_StrataMaterial(plate, stone, alpine, cliffMap = null) {
	const texture = new THREE.TextureLoader().load(plates[plate]);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	const material = new THREE.MeshStandardMaterial({
		map: texture,
		roughness: 0.89,
		vertexColors: true,
	});
	const cracks = stone && !alpine ? new THREE.TextureLoader().load(plates.marble) : null;
	if (stone) material.userData.cliffPhoto = cracks ?? texture;
	const gravel =
		plate === 'sand'
			? new THREE.TextureLoader().load(
					new URL('./assets/gravel-color.webp', import.meta.url).href,
				)
			: null;
	for (const detail of [cracks, gravel]) {
		if (!detail) continue;
		detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
		detail.colorSpace = THREE.SRGBColorSpace;
		detail.anisotropy = 4;
		material.addEventListener('dispose', () => detail.dispose());
	}
	// UV-проекция по доминирующей грани сохраняет масштаб и внутри свода.
	material.onBeforeCompile = (shader) => {
		if (cliffMap) shader.uniforms.cliffPhoto = { value: cliffMap };
		if (cracks) shader.uniforms.fracturePhoto = { value: cracks };
		if (gravel) shader.uniforms.gravelPhoto = { value: gravel };
		shader.vertexShader =
			'varying vec3 rockPoint; varying vec3 rockNormal;\n' +
			shader.vertexShader.replace(
				'#include <project_vertex>',
				`
			#include <project_vertex>
			vec4 localRock = vec4(transformed, 1.);
			vec3 localRockNormal = objectNormal;
			#ifdef USE_INSTANCING
				localRock = instanceMatrix * localRock;
				localRockNormal = mat3(instanceMatrix) * (localRockNormal / vec3(dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz),dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz),dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz)));
			#endif
			rockPoint = (modelMatrix * localRock).xyz;
			rockNormal = normalize(mat3(modelMatrix) * localRockNormal);
		`,
			);
		shader.fragmentShader =
			'varying vec3 rockPoint; varying vec3 rockNormal; uniform sampler2D cliffPhoto, fracturePhoto, gravelPhoto;\n' +
			shader.fragmentShader
				.replace(
					'#include <map_fragment>',
					`
			vec3 axes = pow(abs(normalize(rockNormal)),vec3(5.));
			axes /= max(.001,axes.x+axes.y+axes.z);
			vec3 p = rockPoint * ${stone ? '.22' : '.34'};
			vec4 grain = texture2D(map, p.zy) * axes.x + texture2D(map,p.xz)*axes.y + texture2D(map,p.xy)*axes.z;
			${
				cliffMap
					? `
				vec3 terrainNormal = normalize(rockNormal);
				float planeTilt = 1.-abs(terrainNormal.y);
				float exposed = smoothstep(.08,.43,planeTilt + smoothstep(15.,41.,rockPoint.y)*.22);
				vec3 stoneP = rockPoint*.072;
				stoneP.xz += vec2(sin(rockPoint.z*.047 + .034*rockPoint.y),cos(rockPoint.x*.031+.04*rockPoint.z))*.20;
				vec4 cliff = texture2D(cliffPhoto,stoneP.zy)*axes.x + texture2D(cliffPhoto,stoneP.xz)*axes.y + texture2D(cliffPhoto,stoneP.xy)*axes.z;
				vec2 macroUV = vec2(dot(rockPoint,vec3(.012,.009,.003)),dot(rockPoint,vec3(-.005,.016,.012)));
				vec4 macro = texture2D(cliffPhoto,macroUV);
				cliff.rgb = (cliff.rgb*.64 + macro.rgb*.36) * ${alpine ? '.29' : '.42'};
				grain = mix(grain,cliff,exposed);
			`
					: ''
			}
			float grey = dot(grain.rgb,vec3(.26,.57,.17));
			float exposure = ${stone ? '3.5' : alpine ? '6.2' : '4.1'};
			vec3 mineral = mix(vec3(grey),grain.rgb,${stone ? '.29' : alpine ? '.70' : '.52'});
			diffuseColor.rgb *= .075 + exposure * mineral;
			${
				stone && !alpine
					? `
				// Неровные трещины крупнее песчинок и сохраняются на дальнем плане.
				vec3 seam = rockPoint * vec3(.072,.126,.075);
				vec4 fracture = texture2D(fracturePhoto,seam.zy)*axes.x + texture2D(fracturePhoto,seam.xz)*axes.y + texture2D(fracturePhoto,seam.xy)*axes.z;
				float crust = dot(fracture.rgb,vec3(.26,.57,.17));
				diffuseColor.rgb *= clamp(.10+1.72*crust,.22,1.18);
				grain.a = grain.a*.48 + fracture.a*.78;
				float lamina = rockPoint.y * 3.1 + sin(rockPoint.x*.23+rockPoint.z*.18)*1.16 + sin(rockPoint.x*.071)*1.4;
				float band = smoothstep(.75,.99,sin(lamina + .92*sin(lamina*.44) + grain.a*.65));
				diffuseColor.rgb *= mix(vec3(1.),vec3(.82,.78,.74),band*.52);
			`
					: ''
			}
			${
				!stone
					? `
				float alluvium = sin(rockPoint.x*.28+sin(rockPoint.z*.13)*2.9) * cos(rockPoint.z*.23-rockPoint.x*.15);
				diffuseColor.rgb *= .95 + .075*alluvium + .10*(grain.a-.5);
				${
					!alpine
						? `
					float braid=abs(rockPoint.x-9.*sin(.041*rockPoint.z)-3.2*sin(.090*rockPoint.z+1.2)+1.4*sin(.17*rockPoint.z));
					vec3 sediment = texture2D(gravelPhoto,rockPoint.xz*.42+vec2(.05*alluvium)).rgb;
					float dryBed = 1.-smoothstep(1.1,8.5,braid+alluvium*2.9+grain.a*1.6);
					diffuseColor.rgb *= mix(vec3(.87), .19+1.65*sediment, .18+.78*dryBed);
					grain.a += .18*dryBed*dot(sediment,vec3(.3,.55,.15));
				`
						: ''
				}
			`
					: ''
			}
		`,
				)
				.replace(
					'#include <color_fragment>',
					`
			#include <color_fragment>
			${
				!stone && alpine
					? `
				float ny=normalize(rockNormal).y;
				float rift = .47*sin(rockPoint.x*.063+rockPoint.z*.082)+.25*cos(rockPoint.z*.31-.19*rockPoint.x) + .17*sin(rockPoint.z*.59+rockPoint.x*.74) +.11*cos(rockPoint.x*1.4);
				float frost = smoothstep(.15,.31,ny-.49+rift*.21 + (grain.a-.5)*.52 + (rockPoint.y-61.)*.004 + normalize(rockNormal).x*.14);
				frost *= smoothstep(20.,42.,rockPoint.y+rift*9.);
				diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.72,.78,.84)*(.85+.15*grain.a),frost*.95);
			`
					: ''
			}
		`,
				)
				.replace(
					'#include <normal_fragment_maps>',
					`
			#include <normal_fragment_maps>
			vec3 surfaceX = dFdx(-vViewPosition), surfaceY = dFdy(-vViewPosition);
			vec3 crossY = cross(surfaceY, normal), crossX = cross(normal, surfaceX);
			float orient = dot(surfaceX,crossY);
			normal = normalize(abs(orient)*normal - sign(orient) * (dFdx(grain.a)*crossY + dFdy(grain.a)*crossX)*${stone ? '.15' : '.07'});
		`,
				);
	};
	material.customProgramCacheKey = () => 'geology-' + plate;
	return material;
}

export function create_Valley(scene, alpine, cliffMap) {
	const distantStep = matchMedia('(pointer: coarse)').matches ? 9 : 4;
	const xs = axis_Grid(-122, 122, distantStep),
		zs = axis_Grid(-184, 90, distantStep);
	const cols = xs.length,
		rows = zs.length;
	const heights = new Float32Array(cols * rows);
	const positions = [],
		colors = [],
		indices = [];
	const color = new THREE.Color(),
		sand = new THREE.Color(0xd8a478),
		stone = new THREE.Color(0xb56d4d);
	const turf = new THREE.Color(0x949359),
		slate = new THREE.Color(0x85858a),
		snow = new THREE.Color(0xf0f5f6);
	const surface = alpine ? alpine_Surface : canyon_Surface;
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++) {
			const x = xs[col],
				z = zs[row],
				h = surface(x, z),
				index = row * cols + col;
			positions.push(x, h, z);
			heights[index] = h;
			const nx = (surface(x + 1, z) - surface(x - 1, z)) * 0.5,
				nz = (surface(x, z + 1) - surface(x, z - 1)) * 0.5;
			const slope = Math.hypot(nx, nz);
			const noise = undulation(x * 0.82, z * 0.82);
			if (alpine) {
				color
					.copy(turf)
					.lerp(
						slate,
						clamp(0.09 + slope * 0.75 + smooth(h, 10, 26) * 0.64 + 0.15 * noise, 0, 1),
					);
				const drifts = h - 28 - 25 * slope - 14 * undulation(x * 0.47, z * 0.47) - 6 * nx;
				color.lerp(snow, smooth(drifts, -1.7, 2.5) * 0.38);
				color.multiplyScalar(0.89 + noise * 0.17);
			} else {
				const shelf = smooth(slope, 0.085, 0.64);
				color
					.copy(sand)
					.lerp(stone, 0.16 + shelf * 0.8)
					.multiplyScalar(
						0.94 + noise * 0.23 + shelf * 0.14 * Math.cos(h * 2.2 + x * 0.08),
					);
			}
			colors.push(color.r, color.g, color.b);
			if (row > 0 && col > 0)
				indices.push(
					index - cols - 1,
					index - 1,
					index - cols,
					index - cols,
					index - 1,
					index,
				);
		}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	const terrain = new THREE.Mesh(
		geometry,
		create_StrataMaterial(alpine ? 'meadow' : 'sand', false, alpine, cliffMap),
	);
	terrain.material.shadowSide = THREE.FrontSide;
	terrain.castShadow = terrain.receiveShadow = true;
	terrain.name = alpine ? 'Moraine and cirque headwall' : 'Wash and sandstone mesas';
	scene.add(terrain);
	// Выбираем тот же треугольник, который видит пилот, даже на крутой бровке террасы.
	function interval(axis, value) {
		let low = 0,
			high = axis.length - 1;
		while (high - low > 1) {
			const mid = (low + high) >> 1;
			if (value < axis[mid]) high = mid;
			else low = mid;
		}
		return low;
	}
	return (x, z) => {
		const col = interval(xs, x),
			row = interval(zs, z);
		const u = clamp((x - xs[col]) / (xs[col + 1] - xs[col]), 0, 1),
			v = clamp((z - zs[row]) / (zs[row + 1] - zs[row]), 0, 1);
		const i = row * cols + col;
		if (u + v < 1) return heights[i] * (1 - u - v) + heights[i + 1] * u + heights[i + cols] * v;
		return (
			heights[i + cols + 1] * (u + v - 1) +
			heights[i + 1] * (1 - v) +
			heights[i + cols] * (1 - u)
		);
	};
}

export function add_Tarn(scene, groundAt, sun) {
	return add_Water(
		scene,
		sun,
		new THREE.PlaneGeometry(50, 89, 44, 65),
		new THREE.Vector3(tarn.x, tarn.level, tarn.z),
		groundAt,
		false,
	);
}
