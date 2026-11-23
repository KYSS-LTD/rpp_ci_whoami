import * as THREE from 'three';
import { add_Water } from './water.js';
import { box, cylinder, group, ring, palette, create_Drone } from './models.js';
import { create_FlightAtmosphere } from './atmosphere.js';
import { create_Landscape, ground_Plane } from './landscape.js';
import { compactGraphics } from './graphics-quality.js';
import { batch_Scenery } from './scenery-batches.js';
import { create_SceneryCollision } from './scenery-collision.js';

export const base = { x: -15, z: 37, label: 'H' };
export const padRadius = 4.4;
const stationSite = { x: -25, z: 42 };
const terraceHeight = 3.2;
const padThickness = .16;

function site_Distance(x, z) {
	// Запас в один шаг сетки удерживает края фундамента на плоских треугольниках.
	return Math.min(Math.hypot(x - base.x, z - base.z) - padRadius,
		Math.max(Math.abs(x - stationSite.x) - 4, Math.abs(z - stationSite.z) - 3.2));
}

export function on_Pad(x, z) {
	return Math.hypot(x - base.x, z - base.z) <= padRadius;
}

export function flight_Ground(x, z) {
	return on_Pad(x, z) ? terraceHeight + padThickness : Math.max(0, terrain_Height(x, z));
}
export const sectors = [
	{ x: 4, z: 76, label: 'A' }, { x: -4, z: -27, label: 'B' }, { x: 2, z: -139, label: 'C' },
];
export const limits = { minX: -47, maxX: 32, minZ: -162, maxZ: 104 };

export function seeded_Random(seed) {
	return () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 4294967296;
	};
}

export function shore(z) {
	return 13 + 6 * Math.cos(z * .044) - 6 * Math.sin(z * .069);
}

export function terrain_Height(x, z) {
	const inland = shore(z) - x;
	const natural = Math.min(10, inland * .045 + Math.max(0, inland - 23) * .105) + THREE.MathUtils.smoothstep(inland, 22, 40) * (2.5 + Math.sin(x * .13 + z * .08) * 2.2 + Math.cos(z * .15) * 1.4);
	return THREE.MathUtils.lerp(terraceHeight, natural, THREE.MathUtils.smoothstep(site_Distance(x, z), 4, 12));
}

export function beach_Texture(repeatX, repeatY) {
	const texture = new THREE.TextureLoader().load(new URL('./assets/coast-sand.jpg', import.meta.url).href);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(repeatX, repeatY);
	texture.anisotropy = 4;
	return texture;
}

function create_Terrain(scene) {
	const geometry = ground_Plane(320, 690, 128, 244, limits);
	const position = geometry.attributes.position;
	const colors = [];
	const sand = new THREE.Color(0xfff1d7);
	const wet = new THREE.Color(0xe2d5c0);
	const scrub = new THREE.Color(0x88a27b);
	const forest = new THREE.Color(0x4f815d);
	const color = new THREE.Color();
	const random = seeded_Random(21);
	for (let index = 0; index < position.count; index++) {
		const x = position.getX(index);
		const z = position.getZ(index);
		const inland = shore(z) - x;
		position.setY(index, terrain_Height(x, z));
		color.copy(wet).lerp(sand, THREE.MathUtils.smoothstep(inland, 0, 8));
		color.lerp(scrub, THREE.MathUtils.smoothstep(inland + 3 * Math.sin(.24 * z + .44 * x), 17, 32));
		color.lerp(forest, THREE.MathUtils.smoothstep(inland, 33, 80));
		color.multiplyScalar(.89 + random() * .20);
		colors.push(color.r, color.g, color.b);
	}
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.computeVertexNormals();
	const normalMap = compactGraphics ? null : new THREE.TextureLoader().load(new URL('./assets/coast-sand-normal.webp', import.meta.url).href);
	if (normalMap) {
		normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
		normalMap.repeat.set(65, 144);
		normalMap.anisotropy = 4;
	}
	const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
		vertexColors: true, roughness: .87, map: beach_Texture(65, 144), normalMap, normalScale: new THREE.Vector2(.65, .65),
	}));
	terrain.material.onBeforeCompile = shader => {
		shader.vertexShader = 'varying vec2 sandPoint;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n sandPoint = position.xz;');
		shader.fragmentShader = 'varying vec2 sandPoint;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
			#include <map_fragment>
			float strand = 13.0 + 6.0*cos(sandPoint.y*.044) - 6.0*sin(sandPoint.y*.069) - sandPoint.x;
			float plume = sin(sandPoint.y*.36 + sin(sandPoint.x*.64));
			float wet = 1.0-smoothstep(1.1,5.8,strand + plume*.7);
			float grains = dot(diffuseColor.rgb,vec3(.28,.59,.13));
			diffuseColor.rgb = mix(diffuseColor.rgb,grains*vec3(1.15,1.03,.85),.59);
			diffuseColor.rgb *= mix(vec3(1.92,1.86,1.64), vec3(.92,.98,1.02), wet);
		`).replace('#include <roughnessmap_fragment>', `
			#include <roughnessmap_fragment>
			roughnessFactor = mix(.91,.31,wet);
		`);
	};
	terrain.receiveShadow = true;
	scene.add(terrain);
}

function create_Sea(scene, sun) {
	return add_Water(scene, sun, new THREE.PlaneGeometry(740, 800, compactGraphics ? 72 : 128, compactGraphics ? 96 : 152),
		new THREE.Vector3(200, -.012, 0), terrain_Height, true);
}

// Фотография хвои Fir Tree 01 (Poly Haven, CC0) используется и для ближних веток, и для силуэтов.
export function pine_Material(spray = false) {
	const url = spray ? new URL('./assets/fir-spray.webp', import.meta.url) : new URL('./assets/fir-crown.webp', import.meta.url);
	const map = new THREE.TextureLoader().load(url.href);
	map.colorSpace = THREE.SRGBColorSpace;
	map.anisotropy = 4;
	return new THREE.MeshStandardMaterial({ map, alphaTest: .30, alphaToCoverage: true, side: THREE.DoubleSide, roughness: .93 });
}

// Группы ветвей образуют ярусы вокруг ствола, чтобы крона сохраняла объём при облёте.
export function create_BoughGeometry(seed) {
	const random = seeded_Random(seed);
	const vertices = [];
	const texcoords = [];
	const indices = [];
	for (let tier = 0; tier < 10; tier++) {
		const fraction = tier / 10;
		for (let limb = 0; limb < 7; limb++) {
			const angle = limb * Math.PI * 2 / 7 + tier * .83 + random() * .34;
			const reach = (.30 + 1.78 * (1 - fraction) ** .8) * (.78 + random() * .38);
			const y = .95 + fraction * 4.72;
			const dx = Math.cos(angle), dz = Math.sin(angle);
			const first = vertices.length / 3;
			for (const [distance, side, height] of [[0, 0, .08], [.48, -.45, -.05], [.50, .43, .15], [1, 0, .26]]) {
				vertices.push((distance * dx - side * dz) * reach, y + height * reach, (distance * dz + side * dx) * reach);
			}
			texcoords.push(.5, 0, 0, .49, 1, .49, .5, 1);
			indices.push(first, first+1, first+2, first+1, first+3, first+2);
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(texcoords, 2));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

function create_Vegetation(scene, collision) {
	const random = seeded_Random(197);
	const stock = new THREE.Object3D();
	const cells = new Map();
	const cellSize = 23;
	const cellId = (x, z) => Math.floor(x / cellSize) + ':' + Math.floor(z / cellSize);
	for (let index = 0; index < 3400; index++) {
		const z = random() * 368 - 184;
		const margin = 43 + Math.cos(z * .071) * 10 + Math.sin(z * .031) * 7;
		const x = shore(z) - margin - random() ** 1.28 * 138;
		const launchPath = x > base.x - 2 && Math.abs(z - base.z + (x - base.x) * .55) < 7;
		if (x < -157 || launchPath || Math.hypot(x - base.x, z - base.z) < 8 || site_Distance(x, z) < 5 ||
			sectors.some(point => Math.hypot(x - point.x, z - point.z) < 9)) continue;
		const key = cellId(x, z);
		if (!cells.has(key)) cells.set(key, []);
		cells.get(key).push({
			x, y: terrain_Height(x, z), z,
			scale: 1.05 + random() ** 1.4 * 2.28,
			width: .66 + random() * .57, angle: random() * Math.PI,
			lean: (random() - .5) * .11, hue: random(),
		});
	}
	const trunkGeometry = new THREE.CylinderGeometry(.025, .14, 5.4, 6);
	const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x574332, roughness: 1 });
	const needles = compactGraphics ? null : pine_Material(true);
	const silhouette = pine_Material();
	const variants = compactGraphics ? [] : [create_BoughGeometry(586), create_BoughGeometry(643), create_BoughGeometry(787)];
	const crownGeometry = new THREE.PlaneGeometry(3.8, 6.1);
	const green = new THREE.Color();
	const drawCells = new Map();
	for (const occupants of cells.values()) {
		const cell = occupants[0];
		const detailed = cell.x > limits.minX - 16;
		const variant = detailed ? Math.floor(random() * 3) : 0;
		if (!compactGraphics) {
			drawCells.set(cell, { trees: occupants, detailed, variant });
			continue;
		}
		// За границами полёта деревья видны только издали. Сетка столкновений остаётся полной.
		const key = Math.floor(cell.x / 69) + '/' + Math.floor(cell.z / 69) + '/' + detailed;
		if (!drawCells.has(key)) drawCells.set(key, { trees: [], detailed });
		const batch = drawCells.get(key);
		for (const [i, tree] of occupants.entries()) {
			if (tree.x >= limits.minX - 10 || i % 3 === 0) batch.trees.push(tree);
		}
	}
	for (const { trees, detailed, variant } of drawCells.values()) {
		const crowns = new THREE.InstancedMesh(crownGeometry, silhouette, trees.length * 2);
		const bark = detailed ? new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length) : null;
		const branches = detailed && !compactGraphics ? new THREE.InstancedMesh(variants[variant], needles, trees.length) : null;
		for (const [index, tree] of trees.entries()) {
			const { x, y, z, scale, width, angle, lean, hue } = tree;
			stock.scale.set(scale * width, scale, scale * width);
			stock.rotation.set(0, angle, lean);
			green.setRGB(.63 + hue * .27, .72 + hue * .25, .43 + hue * .39);
			if (detailed) {
				stock.position.set(x, y, z);
				stock.updateMatrix();
				branches?.setMatrixAt(index, stock.matrix);
				branches?.setColorAt(index, green);
				stock.position.y += 2.68 * scale;
				stock.updateMatrix();
				bark.setMatrixAt(index, stock.matrix);
			}
			for (let plane = 0; plane < 2; plane++) {
				stock.position.set(x, y + 2.94 * scale, z);
				stock.rotation.y = angle + plane * Math.PI / 2;
				stock.updateMatrix();
				crowns.setMatrixAt(index * 2 + plane, stock.matrix);
				crowns.setColorAt(index * 2 + plane, green);
			}
		}
		crowns.receiveShadow = detailed;
		crowns.castShadow = detailed;
		scene.add(crowns);
		if (detailed) {
			bark.castShadow = true;
			bark.receiveShadow = true;
			scene.add(bark);
			if (branches) {
				branches.receiveShadow = true;
				scene.add(branches);
			}
		}
	}
	const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x9d9b87, flatShading: true }), 66);
	for (let index = 0; index < rocks.count; index++) {
		let x, z;
		do {
			z = random() * 166 - 86;
			x = shore(z) - random() * 38;
		} while (site_Distance(x, z) < 2);
		const radius = .18 + random() * .96;
		stock.rotation.set(.3, random() * Math.PI, .24);
		stock.position.set(x, terrain_Height(x, z) + .03, z);
		stock.scale.set(radius * 1.4, radius * .48, radius);
		stock.updateMatrix();
		rocks.setMatrixAt(index, stock.matrix);
	}
	rocks.castShadow = rocks.receiveShadow = true;
	scene.add(rocks);
	collision.add(rocks);
	return (x, y, z) => {
		// Радиус самой широкой сосны с запасом для корпуса меньше шести метров.
		const maxX = Math.floor((x + 6) / cellSize), maxZ = Math.floor((z + 6) / cellSize);
		for (let ix = Math.floor((x - 6) / cellSize); ix <= maxX; ix++) {
			for (let iz = Math.floor((z - 6) / cellSize); iz <= maxZ; iz++) {
				const trees = cells.get(ix + ':' + iz);
				if (!trees) continue;
				for (const tree of trees) {
					const dx = x - tree.x, dz = z - tree.z;
					if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
					const above = (y - tree.y) / tree.scale;
					if (above < 0 || above > 5.8) continue;
					const radius = above < .9 ? .22 : Math.max(.2, 1.34 * (5.8 - above) / 4.9);
					if (dx * dx + dz * dz < (radius * tree.scale * tree.width + .16) ** 2) return true;
				}
			}
		}
		return false;
	};
}

function add_Dunes(scene, collision) {
	const land = create_Landscape(scene, terrain_Height, 1459, collision);
	const random = seeded_Random(837);
	const safe = (x,z,r) => site_Distance(x,z)>4+r && sectors.every(p=>Math.hypot(x-p.x,z-p.z)>10+r)
		&& Math.hypot(x-5,z+54)>3+r
		&& !(x>base.x-1 && Math.abs(z-base.z+(x-base.x)*.55)<4+r)
		&& !(Math.abs(z-25)<3+r && x>shore(25)-1);
	const trees = [];
	for (const [cx,cz,spread] of [[-35,78,12],[-26,59,8],[-35,17,13],[-15,4,10],[-37,-24,12],
		[-25,-50,10],[-12,-70,10],[-24,-94,12],[-29,-124,12],[-19,-156,10],[-27,99,8]]) {
		for (let i=0;i<25;i++) {
			const a=random()*Math.PI*2, d=Math.sqrt(random())*spread;
			const x=cx+Math.cos(a)*d, z=cz+Math.sin(a)*d;
			const h=4.8+random()*4.8, r=h*.29;
			if (!safe(x,z,r) || shore(z)-x<12 || trees.some(t=>Math.hypot(t.x-x,t.z-z)<r+t.r)) continue;
			land.tree(x,z,h,random()<.52?'birch':'oak');
			trees.push({x,z,r:r*.7});
		}
	}
	// Изгороди повторяют край дюн. Между секциями есть сквозные проходы с песка в рощи.
	for (const [start,end,inset] of [[-159,-148,18],[-127,-114,18],[-107,-93,17],[-88,-70,17],
		[-66,-56,20],[-48,-38,18],[-15,2,18],[7,16,18],[45,58,17],[88,101,18]]) {
		for (let z=start;z<end;z+=6) {
			const next=Math.min(z+6,end), x=shore(z)-inset, xx=shore(next)-inset;
			if (safe(x,z,.5)&&safe(xx,next,.5)&&safe((x+xx)/2,(z+next)/2,.5)) land.fence(x,z,xx,next,1.32);
		}
	}
	for (const [z,inset] of [[-149,1],[-113,6],[-83,-1],[-60,7],[-11,3],[3,0],[54,6],[93,4]]) {
		const cx=shore(z)-inset;
		for (let i=0;i<13;i++) {
			const x=cx+(random()-.5)*10, zz=z+(random()-.5)*13;
			const w=.6+random()**1.55*3.1;
			if (safe(x,zz,w*.5)) land.rock(x,zz,w,w*(.21+random()*.34),w*(.63+random()*.5),random()*6);
		}
	}
	for (const z of [-153,-119,-85,-42,-13,12,56,94]) {
		const x=shore(z)-7.5;
		if (safe(x,z,2.9)) land.log(x-1.6,z-2.2,x+1.4,z+2.6,.27+random()*.18);
	}
	const archX=shore(8)+1;
	land.arch(archX,8,Math.PI/2,true);
	for (let i=0;i<1850;i++) {
		const z=-172+283*random(), x=shore(z)-7-31*random();
		if (!safe(x,z,.2)) continue;
		for (let clump=0;clump<3;clump++) land.grass(x+random()*.9,z+random(),.59+random()*1.07);
	}
	land.finish();
	return land;
}

function create_Lighthouse(scene, collision) {
	const x = 5;
	const z = -54;
	const lighthouse = group(scene, x, terrain_Height(x, z), z);
	cylinder(lighthouse, 0x9b927c, 3.08, 3.67, .67, 0, .22, 0);
	const plaster = document.createElement('canvas');
	plaster.width = 640;
	plaster.height = 768;
	const brush = plaster.getContext('2d'), random = seeded_Random(2046);
	for (let band=0; band<6; band++) {
		brush.fillStyle = band%2 ? '#a94e37' : '#d8ceba';
		brush.fillRect(0,band*128,640,128);
	}
	for (let streak=0; streak<6500; streak++) {
		const x=random()*640, y=random()*768;
		brush.fillStyle = streak%5 ? 'rgba(60,47,34,.054)' : 'rgba(239,223,193,.24)';
		brush.fillRect(x,y,.7+random()**3*5,1+random()**4*45);
	}
	for (let row=1; row<44; row++) {
		brush.fillStyle = 'rgba(73,60,48,.16)';
		brush.fillRect(0,row*17.5,640,.85);
		for(let i=0;i<22;i++) brush.fillRect((i+row%2*.5)*31,row*17.5,.8,17.5);
	}
	const wallTexture = new THREE.CanvasTexture(plaster);
	wallTexture.colorSpace = THREE.SRGBColorSpace;
	wallTexture.anisotropy = 4;
	const tower = new THREE.Mesh(new THREE.CylinderGeometry(.99,1.36,7.86,48),
		new THREE.MeshStandardMaterial({ map: wallTexture, roughness: .92 }));
	tower.position.y = 4.285;
	tower.castShadow = tower.receiveShadow = true;
	lighthouse.add(tower);
	cylinder(lighthouse, 0x3e4648, 1.51, 1.29, .35, 0, 8.32, 0, 24);
	const lantern = new THREE.Mesh(new THREE.CylinderGeometry(.82,.85,1.26,12),
		new THREE.MeshStandardMaterial({ color: 0x31505c, metalness: .54, roughness: .17 }));
	lantern.position.y = 9.05;
	lighthouse.add(lantern);
	for (let index = 0; index < 6; index++) {
		const angle = index * Math.PI / 3;
		box(lighthouse, 0x2b3434, .06, 1.26, .06, .83 * Math.cos(angle), 9.05, .83 * Math.sin(angle));
	}
	cylinder(lighthouse, 0xbf5843, .09, 1.18, .76, 0, 10.03, 0, 16);
	cylinder(lighthouse, palette.ink, .055, .055, .39, 0, 10.53, 0);
	box(lighthouse, 0x574538, .66, 1.19, .14, 0, 1.07, 1.28);
	for (const [height,angle] of [[3.1,.50],[5.63,2.14],[6.81,-.45]]) {
		const radius = 1.36 - (height-.36)*.047;
		const casement = group(lighthouse, radius*Math.sin(angle),height,radius*Math.cos(angle));
		casement.rotation.y=angle;
		box(casement,0xd8c9b1,.47,.71,.13);
		box(casement,0x334246,.32,.52,.06,0,0,.073);
		box(casement,0x948b76,.35,.033,.06,0,0,.10);
	}
	for (let post = 0; post < 16; post++) {
		const angle = post * Math.PI / 8;
		cylinder(lighthouse, 0x434b48, .035, .045, .78, 1.44*Math.cos(angle), 8.84, 1.44*Math.sin(angle), 6);
	}
	for (const level of [8.64, 9.20]) ring(lighthouse, 0x515653, 1.44, .038, 0, level, 0);
	collision.add(lighthouse);
}

function add_Workboat(scene, x, z, heading, color, collision) {
	const boat = group(scene,x,.12,z);
	boat.rotation.y = heading;
	const vertices = [], colors = [], indices = [];
	const paint = new THREE.Color();
	// Поперечные сечения корпуса сужаются к форштевню и сходятся под ватерлинией.
	const sections = [[-2.06,.026,.49],[-1.66,.41,.37],[-1.05,.66,.32],[-.18,.76,.30],[.98,.71,.29],[1.68,.60,.28]];
	for (let section=0; section<sections.length; section++) {
		const [depth,beam,sheer] = sections[section];
		for (const [span,y,finish] of [[-.88,sheer-.18,0x849294],[-1,sheer,color],[-.89,sheer+.035,0xcbbda0],[-.82,.14,0x887e69],[.82,.14,0x887e69],[.89,sheer+.035,0xcbbda0],[1,sheer,color],[.88,sheer-.18,0x849294],[.46,-.20,0x3d5556],[-.46,-.20,0x3d5556]]) {
			vertices.push(beam*span,y,depth);
			paint.set(finish);
			colors.push(paint.r,paint.g,paint.b);
		}
		for (let j=0; section>0 && j<10; j++) {
			const a=(section-1)*10+j, b=(section-1)*10+(j+1)%10;
			indices.push(a,b,b+10,a,b+10,a+10);
		}
	}
	for (let j=1; j<9; j++) indices.push(50,50+j+1,50+j,0,j,j+1);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
	geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	const hull = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.57}));
	hull.castShadow = hull.receiveShadow = true;
	boat.add(hull);
	box(boat,0xcfc7b5,1.03,.57,.96,0,.45,.29);
	for (const side of [-1,1]) {
		box(boat,0x314a51,.045,.30,.68,side*.52,.64,.26);
		for (const post of [-.5,1.15]) cylinder(boat,0xc2bca7,.08,.09,.34,side*.71,.20,post,8);
	}
	box(boat,0x33525b,.84,.29,.05,0,.64,-.205);
	box(boat,0xa1a092,.045,.30,.06,0,.64,-.221);
	box(boat,color,1.14,.07,1.10,0,.795,.28);
	box(boat,0x876d51,1,.08,.29,0,.31,-.90);
	box(boat,0x3a4143,.28,.4,.32,.08,.32,1.7);
	collision.add(boat);
}

function create_Station(scene, collision) {
	const station = group(scene, stationSite.x, terraceHeight, stationSite.z);
	box(station, 0xd7b189, 7.8, .54, 6.2, 0, .2, 0);
	// Weathered Plank Siding, скан Poly Haven (CC0): https://polyhaven.com/a/weathered_plank_siding
	const timber = new THREE.TextureLoader().load(new URL('./assets/weathered-wood.webp', import.meta.url).href);
	timber.wrapS = timber.wrapT = THREE.RepeatWrapping;
	timber.repeat.set(2,1);
	timber.colorSpace = THREE.SRGBColorSpace;
	timber.anisotropy = 4;
	const siding = box(station, 0xf2d9a6, 6.6, 2.65, 4.8, 0, 1.6);
	siding.material = new THREE.MeshStandardMaterial({map:timber,roughness:.94});
	// Нижняя грань цельной двускатной крыши лежит на верхней плоскости стен.
	const roofProfile = new THREE.Shape();
	roofProfile.moveTo(-3.68, 0);
	roofProfile.lineTo(3.68, 0);
	roofProfile.lineTo(3.68, .14);
	roofProfile.lineTo(0, 1.02);
	roofProfile.lineTo(-3.68, .14);
	roofProfile.closePath();
	const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofProfile, { depth: 5.6, bevelEnabled: false }),
		new THREE.MeshStandardMaterial({ color: 0x426a64, roughness: .84 }));
	roof.position.set(0, 1.6 + 2.65 / 2, -2.8);
	roof.castShadow = roof.receiveShadow = true;
	station.add(roof);
	box(station, 0x736052, .86, 2.19, .14, 1.9, 1.29, -2.41);
	box(station, 0x48757c, 2.4, .98, .13, -.91, 1.81, -2.43);
	box(station, 0xf0e7ca, .09, 1.08, .15, -.91, 1.81, -2.45);
	for (const side of [-1,1]) {
		for (let i=0; i<7; i++) {
			box(station, 0xbfa784, .09,.065,4.83, side*3.31,.65+i*.34,0);
		}
	}
	collision.add(station);
	const pier = group(scene, shore(25) + 6.9, .65, 25);
	const deck = new THREE.Mesh(new THREE.BoxGeometry(15.62,.20,3.4), siding.material);
	// Разворачиваем доски поперёк настила.
	const uv = deck.geometry.attributes.uv;
	for (let i=0; i<uv.count; i++) uv.setXY(i,uv.getY(i),uv.getX(i)*3.4);
	deck.position.x = .355;
	deck.castShadow = deck.receiveShadow = true;
	pier.add(deck);
	for (let index = -1; index < 3; index++) {
		for (const side of [-1, 1]) cylinder(pier, 0x715b49, .17, .2, 1.8, index * 4.4 - 2, -.46, side * 1.35, 8);
	}
	collision.add(pier);
	add_Workboat(scene,23,29,.49,0x9b523e,collision);
	add_Workboat(scene,29,21,-.15,0x41656a,collision);
	const landing = group(scene, base.x, terraceHeight + padThickness - .08, base.z);
	cylinder(landing, 0x728274, padRadius, padRadius + .19, 1.22, 0, -.56, 0, 32);
	cylinder(landing, 0x39494a, padRadius, padRadius + .12, .16, 0, 0, 0, 32);
	ring(landing, 0xb5baae, padRadius - .33, .035, 0, .081, 0).scale.z = .05;
	for (const side of [-1, 1]) box(landing, palette.shell, .22, .002, 1.73, side * .53, .081, 0);
	box(landing, palette.shell, 1.04, .002, .22, 0, .081, 0);
}

function create_SectorDetails(scene) {
	const random = seeded_Random(101);
	const colors = [0xd16643, 0x55a1a2, 0xe8dfbb];
	const shapes = [[.32, .28, .56], [.25, .29, .76], [.58, .06, .45]];
	for (const point of sectors) {
		for (let index = 0; index < 7; index++) {
			const x = point.x + (random() - .5) * 8.3;
			const z = point.z + (random() - .5) * 8.3;
			const y = Math.max(.01, terrain_Height(x, z));
			const type = index % shapes.length;
			const [width, height, depth] = shapes[type];
			const item = group(scene, x, y, z);
			item.rotation.y = random() * Math.PI;
			if (type === 2) box(item, colors[type], width, height, depth, 0, height / 2);
			else {
				cylinder(item, colors[type], width / 2, width / 2, depth, 0, height / 2, 0).rotation.x = Math.PI / 2;
				cylinder(item, type === 1 ? 0x325888 : 0xb9b9a9, width * .38, width * .38, .11,
					0, height / 2, depth / 2 + .04).rotation.x = Math.PI / 2;
			}
		}
	}
}

export function create_Lighting(scene, span = 42) {
	scene.add(new THREE.HemisphereLight(0xfff8e2, 0x698197, 2.05));
	const sun = new THREE.DirectionalLight(0xffedd1, 2.45);
	sun.position.set(-38, 52, -27);
	sun.castShadow = true;
	const shadowSize = compactGraphics ? 512 : 2048;
	sun.shadow.mapSize.set(shadowSize, shadowSize);
	Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: .5, far: 180 });
	sun.shadow.normalBias = span * .0013;
	sun.shadow.intensity = .76;
	scene.add(sun, sun.target);
	return sun;
}

export function create_Coast() {
	const scene = new THREE.Scene();
	const collision = create_SceneryCollision();
	const sun = create_FlightAtmosphere(scene, 'beach');
	create_Terrain(scene);
	const seaTime = create_Sea(scene, sun);
	const pines = create_Vegetation(scene, collision);
	const dunes = add_Dunes(scene, collision);
	const touchesTree = (x,y,z) => dunes.touches(x,y,z) || pines(x,y,z);
	create_Lighthouse(scene, collision);
	create_Station(scene, collision);
	create_SectorDetails(scene);
	batch_Scenery(scene);
	const fieldDrone = create_Drone(scene);
	fieldDrone.drone.traverse(object => { object.castShadow = false; });
	return { scene, fieldDrone, seaTime, touchesTree, sun, collision };
}
