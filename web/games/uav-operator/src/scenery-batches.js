import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Собираем доски, стойки и разметку по участкам. Камера отсекает целые участки за спиной.
export function batch_Scenery(scene) {
	scene.updateMatrixWorld(true);
	const cells = new Map();
	const center = new THREE.Vector3();
	scene.traverse(mesh => {
		if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.material.userData?.sceneryPalette) return;
		center.setFromMatrixPosition(mesh.matrixWorld);
		const key = [Math.floor(center.x / 42), Math.floor(center.z / 42), mesh.castShadow, mesh.receiveShadow].join('/');
		if (!cells.has(key)) cells.set(key, []);
		cells.get(key).push(mesh);
	});
	const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78 });
	for (const meshes of cells.values()) {
		if (meshes.length < 2) continue;
		const pieces = meshes.map(mesh => {
			const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
			geometry.deleteAttribute('uv');
			const count = geometry.attributes.position.count;
			const colors = new Float32Array(count * 3);
			for (let i = 0; i < count; i++) mesh.material.color.toArray(colors, i * 3);
			geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
			return geometry;
		});
		const geometry = mergeGeometries(pieces);
		pieces.forEach(piece => piece.dispose());
		if (!geometry) continue;
		const batch = new THREE.Mesh(geometry, surface);
		batch.castShadow = meshes[0].castShadow;
		batch.receiveShadow = meshes[0].receiveShadow;
		batch.name = 'Scenery';
		for (const mesh of meshes) mesh.removeFromParent();
		scene.add(batch);
	}
}
