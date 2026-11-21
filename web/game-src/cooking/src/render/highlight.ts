// Подсветка цели взаимодействия (задача 6.6): рамка на полу вокруг станции и стрелка над ней. Рамка плавно переезжает к
// новой цели, при отказе действия кратко краснеет.
import { ConeGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { StationConfig, TargetSnapshot } from "../contracts";
import { rectCenter } from "../common/math";
import { getSmoothingFactor } from "./smoothing";
import { rejectHighlightColor, targetHighlightColor } from "./palette";

// Запас рамки вокруг прямоугольника станции (с каждой стороны).
const ringMargin = 0.22;

// Скорость переезда рамки к новой цели (1/сек) и скорость появления и исчезновения.
const moveRate = 28;
const fadeRate = 18;

// Длительность красной вспышки при отказе действия, секунды.
const rejectFlashSec = 0.35;

// Подсветка цели.
export interface TargetHighlight {
	readonly root: Group;
	// Применяет текущую цель из снимка. getHeight: высота поверхности станции для стрелки.
	update(target: TargetSnapshot | null, frameDtSec: number, timeSec: number): void;
	// Красная вспышка (событие actionRejected).
	flashReject(): void;
	// Позиция и размеры рамки сейчас (для тестов).
	getState(): { visible: boolean; x: number; z: number; width: number; depth: number; opacity: number };
	dispose(): void;
}

// Создаёт подсветку по станциям уровня. surfaceHeights: высота поверхности каждой станции.
export function createTargetHighlight(stations: readonly StationConfig[], surfaceHeights: ReadonlyMap<string, number>): TargetHighlight {
	const root = new Group();
	root.name = "target-highlight";
	root.visible = false;

	const ringGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
	const ringMaterial = new MeshBasicMaterial({ color: targetHighlightColor, transparent: true, opacity: 0, depthWrite: false });
	const ring = new Mesh(ringGeometry, ringMaterial);
	ring.position.y = 0.015;
	ring.renderOrder = 1;
	root.add(ring);

	const arrowGeometry = new ConeGeometry(0.1, 0.2, 12).rotateX(Math.PI);
	const arrowMaterial = new MeshBasicMaterial({ color: targetHighlightColor, transparent: true, opacity: 0 });
	const arrow = new Mesh(arrowGeometry, arrowMaterial);
	root.add(arrow);

	const stationById = new Map(stations.map((station) => [station.id, station]));
	let x = 0;
	let z = 0;
	let width = 1;
	let depth = 1;
	let opacity = 0;
	let hasPosition = false;
	let rejectLeftSec = 0;

	return {
		root,
		update(target, frameDtSec, timeSec) {
			const station = target ? stationById.get(target.stationId) : undefined;
			if (station) {
				const center = rectCenter(station.rect);
				const goalWidth = station.rect.width + ringMargin * 2;
				const goalDepth = station.rect.depth + ringMargin * 2;
				if (!hasPosition) {
					x = center.x;
					z = center.z;
					width = goalWidth;
					depth = goalDepth;
					hasPosition = true;
				} else {
					const factor = getSmoothingFactor(moveRate, frameDtSec);
					x += (center.x - x) * factor;
					z += (center.z - z) * factor;
					width += (goalWidth - width) * factor;
					depth += (goalDepth - depth) * factor;
				}
				opacity += (1 - opacity) * getSmoothingFactor(fadeRate, frameDtSec);
				const surface = surfaceHeights.get(station.id) ?? 0.5;
				arrow.position.set(x, surface + 0.95 + Math.sin(timeSec * 6) * 0.05, z);
			} else {
				opacity += (0 - opacity) * getSmoothingFactor(fadeRate, frameDtSec);
				if (opacity < 0.01) {
					opacity = 0;
					hasPosition = false;
				}
			}

			rejectLeftSec = Math.max(0, rejectLeftSec - frameDtSec);
			const color = rejectLeftSec > 0 ? rejectHighlightColor : targetHighlightColor;
			ringMaterial.color.setHex(color);
			arrowMaterial.color.setHex(color);
			// Мягкая пульсация: рамка дышит, чтобы её было видно на любом полу.
			const pulse = 0.78 + 0.18 * Math.sin(timeSec * 5);
			ringMaterial.opacity = opacity * pulse;
			arrowMaterial.opacity = opacity * 0.95;
			ring.position.set(x, 0.015, z);
			ring.scale.set(width, 1, depth);
			root.visible = opacity > 0.005;
		},
		flashReject() {
			rejectLeftSec = rejectFlashSec;
		},
		getState() {
			return { visible: root.visible, x, z, width, depth, opacity };
		},
		dispose() {
			ringGeometry.dispose();
			ringMaterial.dispose();
			arrowGeometry.dispose();
			arrowMaterial.dispose();
		},
	};
}
