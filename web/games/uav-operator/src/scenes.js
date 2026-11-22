import * as THREE from 'three';
import { terrain_Height } from './coast.js';
import { group, ring } from './models.js';

export function create_Renderer(canvas) {
	const touch = matchMedia('(pointer: coarse)').matches;
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: touch ? 'default' : 'high-performance' });
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.10;
	return renderer;
}

const renderSize = new THREE.Vector2();

export function resize_Frame(renderer, stage) {
	const { clientWidth: width, clientHeight: height } = renderer.domElement;
	if (!width || !height) return;
	const touch = matchMedia('(pointer: coarse)').matches;
	const pixelBudget = touch ? 800000 : 2000000;
	const ratio = Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 1.65, Math.sqrt(pixelBudget / (width * height)));
	const currentSize = renderer.getSize(renderSize);
	if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
	if (currentSize.x !== width || currentSize.y !== height) renderer.setSize(width, height, false);
	stage.resize?.(width / height);
}

export function create_GroundShadow(scene, sun, width, groundAt) {
	const paper = document.createElement('canvas');
	paper.width = paper.height = 64;
	const ctx = paper.getContext('2d');
	const falloff = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
	falloff.addColorStop(0, 'rgba(255,255,255,.96)');
	falloff.addColorStop(.42, 'rgba(255,255,255,.65)');
	falloff.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = falloff;
	ctx.fillRect(0, 0, 64, 64);
	const material = new THREE.MeshBasicMaterial({
		color: 0x242825, map: new THREE.CanvasTexture(paper), transparent: true,
		depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
	});
	const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
	const normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
	const direction = sun.position.clone().sub(sun.target.position);
	scene.add(shadow);
	return {
		mesh: shadow,
		update(x, y, z, visible) {
			const clearance = Math.max(0, y - groundAt(x, z));
			const reach = 2 + width * 3;
			shadow.visible = visible && clearance < reach;
			if (!shadow.visible) return;
			const sx = x - clearance * direction.x / direction.y;
			const sz = z - clearance * direction.z / direction.y;
			shadow.position.set(sx, groundAt(sx, sz) + .025, sz);
			normal.set(groundAt(sx - .25, sz) - groundAt(sx + .25, sz), .5, groundAt(sx, sz - .25) - groundAt(sx, sz + .25)).normalize();
			shadow.quaternion.setFromUnitVectors(up, normal);
			shadow.scale.setScalar(width * 1.25 + clearance * .18);
			material.opacity = .52 * (1 - clearance / reach);
		},
	};
}

export function create_Home(coast) {
	const { scene, fieldDrone, seaTime } = coast;
	const camera = new THREE.PerspectiveCamera(41, 1, .13, 680);
	camera.position.set(46, 31, 50);
	camera.lookAt(-9, 2, -7);
	camera.updateMatrixWorld();
	return {
		scene, camera,
		resize(aspect) {
			camera.aspect = aspect;
			camera.updateProjectionMatrix();
		},
		update(delta, time) {
			fieldDrone.drone.scale.setScalar(1.5);
			fieldDrone.drone.position.set(camera.aspect > 1.2 ? .49 : .10, camera.aspect > 1.2 ? .04 : .35, 0).unproject(camera);
			fieldDrone.drone.position.sub(camera.position).normalize().multiplyScalar(13).add(camera.position);
			fieldDrone.drone.position.y += Math.sin(time * 1.6) * .16;
			fieldDrone.drone.rotation.set(.15 + Math.sin(time) * .035, Math.PI * .96 + Math.sin(time * .58) * .20, -.16);
			for (const [index, propeller] of fieldDrone.propellers.entries()) propeller.rotation.y += delta * (index % 2 ? -9 : 9);
			seaTime.value = time;
		},
	};
}

export function add_Beacon(scene, point, color, radius) {
	const y = Math.max(0, terrain_Height(point.x, point.z));
	const beacon = group(scene, point.x, y, point.z);
	const marker = ring(beacon, color, radius, .08, 0, .22, 0);
	const points = marker.geometry.attributes.position;
	for (let index = 0; index < points.count; index++) {
		const ground = Math.max(0, terrain_Height(point.x + points.getX(index), point.z - points.getY(index)));
		points.setZ(index, points.getZ(index) + ground - y);
	}
	marker.geometry.computeVertexNormals();
	marker.castShadow = false;
	return beacon;
}
