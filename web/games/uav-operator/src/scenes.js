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
