// Камера сцены (задача 6.3): без поворота, фиксированный наклон около 50 градусов, перспектива. Кадрирование подбирается так,
// чтобы весь прямоугольник LevelConfig.view (ресторан и очередь) попал в кадр при любом размере фрейма.
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { Rect, Vec2 } from "../contracts";

// Угол наклона камеры над горизонтом, градусы: 50 градусов "от горизонта" (взгляд вниз на ту же величину).
export const CAMERA_PITCH_DEG = 50;

// Вертикальный угол обзора камеры, градусы.
export const CAMERA_FOV_DEG = 32;

// Высота над полом, до которой точки прямоугольника view тоже должны попасть в кадр (верх стен и мебели).
export const CAMERA_FRAME_HEIGHT = 1.1;

// Доля кадра, оставляемая свободной по краям (запас под HUD и неточность).
export const CAMERA_FRAME_MARGIN = 0.04;

// Ближняя и дальняя плоскости отсечения.
const nearPlane = 0.5;
const farPlane = 120;

// Положение камеры: куда смотрит и с какого расстояния.
export interface CameraFrame {
	// Точка на полу, в центр кадра.
	target: Vec2;
	// Расстояние от камеры до точки взгляда.
	distance: number;
}

// Параметры кадрирования.
export interface CameraFrameOptions {
	pitchDeg?: number;
	fovDeg?: number;
	frameHeight?: number;
	margin?: number;
}

// Единичный вектор направления взгляда камеры: вниз и к северу (в -z).
export function getCameraDirection(pitchDeg: number = CAMERA_PITCH_DEG): Vector3 {
	const pitch = MathUtils.degToRad(pitchDeg);
	return new Vector3(0, -Math.sin(pitch), -Math.cos(pitch));
}

// Ставит камеру по кадру: смотрит на target (на полу) под заданным наклоном с заданного расстояния.
export function applyCameraFrame(camera: PerspectiveCamera, frame: CameraFrame, pitchDeg: number = CAMERA_PITCH_DEG): void {
	const direction = getCameraDirection(pitchDeg);
	const target = new Vector3(frame.target.x, 0, frame.target.z);
	camera.position.copy(target).addScaledVector(direction, -frame.distance);
	camera.lookAt(target);
	camera.updateMatrixWorld(true);
}

// Угловые точки области view: на полу и на высоте frameHeight.
function getViewPoints(view: Rect, frameHeight: number): Vector3[] {
	const points: Vector3[] = [];
	for (const height of [0, frameHeight]) {
		points.push(new Vector3(view.x, height, view.z));
		points.push(new Vector3(view.x + view.width, height, view.z));
		points.push(new Vector3(view.x, height, view.z + view.depth));
		points.push(new Vector3(view.x + view.width, height, view.z + view.depth));
	}
	return points;
}

// Границы проекции точек в нормализованных координатах экрана (-1..1). null, если точка позади камеры.
function projectBounds(camera: PerspectiveCamera, points: readonly Vector3[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	const projected = new Vector3();
	for (const point of points) {
		projected.copy(point).project(camera);
		if (!Number.isFinite(projected.x) || projected.z > 1 || projected.z < -1) {
			return null;
		}
		minX = Math.min(minX, projected.x);
		maxX = Math.max(maxX, projected.x);
		minY = Math.min(minY, projected.y);
		maxY = Math.max(maxY, projected.y);
	}
	return { minX, maxX, minY, maxY };
}

// Подбирает кадр: наименьшее расстояние, при котором область view целиком в кадре с запасом, и центрирует область на экране.
export function computeCameraFrame(view: Rect, aspect: number, options: CameraFrameOptions = {}): CameraFrame {
	const pitchDeg = options.pitchDeg ?? CAMERA_PITCH_DEG;
	const fovDeg = options.fovDeg ?? CAMERA_FOV_DEG;
	const margin = options.margin ?? CAMERA_FRAME_MARGIN;
	const points = getViewPoints(view, options.frameHeight ?? CAMERA_FRAME_HEIGHT);
	// Пробная камера с очень далёкой плоскостью: подбор расстояния не должен упираться в отсечение по дальности.
	const probe = new PerspectiveCamera(fovDeg, Math.max(aspect, 0.01), nearPlane, 5000);
	const limit = 1 - margin;
	const pitch = MathUtils.degToRad(pitchDeg);
	const halfFovTan = Math.tan(MathUtils.degToRad(fovDeg) / 2);

	const target: Vec2 = { x: view.x + view.width / 2, z: view.z + view.depth / 2 };
	let distance = 20;

	// Бинарный поиск наименьшего расстояния, при котором все точки внутри кадра.
	function findDistance(): number {
		let low = 1;
		let high = 400;
		for (let iteration = 0; iteration < 40; iteration += 1) {
			const middle = (low + high) / 2;
			applyCameraFrame(probe, { target, distance: middle }, pitchDeg);
			const bounds = projectBounds(probe, points);
			const fits = bounds !== null && Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minY), Math.abs(bounds.maxY)) <= limit;
			if (fits) {
				high = middle;
			} else {
				low = middle;
			}
		}
		return high;
	}

	// Две итерации: подобрать расстояние, сдвинуть цель так, чтобы область стояла по центру кадра, подобрать снова.
	for (let pass = 0; pass < 3; pass += 1) {
		distance = findDistance();
		applyCameraFrame(probe, { target, distance }, pitchDeg);
		const bounds = projectBounds(probe, points);
		if (bounds === null) {
			break;
		}
		const centerX = (bounds.minX + bounds.maxX) / 2;
		const centerY = (bounds.minY + bounds.maxY) / 2;
		const halfHeight = distance * halfFovTan;
		const halfWidth = halfHeight * probe.aspect;
		target.x += centerX * halfWidth;
		// Смещение по полу вдоль z даёт на экране sin(pitch) от своей длины. Содержимое ниже центра (centerY < 0) поднимается
		// сдвигом цели к югу (+z), поэтому знак обратный.
		target.z -= (centerY * halfHeight) / Math.sin(pitch);
	}
	distance = findDistance();
	return { target: { x: target.x, z: target.z }, distance };
}

// Создаёт камеру сцены для области view и пропорций кадра. Камера не вращается: меняется только расстояние и центр при resize.
export function createSceneCamera(view: Rect, aspect: number): PerspectiveCamera {
	const camera = new PerspectiveCamera(CAMERA_FOV_DEG, Math.max(aspect, 0.01), nearPlane, farPlane);
	applyCameraFrame(camera, computeCameraFrame(view, aspect));
	return camera;
}

// Подстраивает камеру под новые пропорции кадра с сохранением полного обзора области view.
export function resizeSceneCamera(camera: PerspectiveCamera, view: Rect, widthPx: number, heightPx: number): void {
	const aspect = widthPx / Math.max(heightPx, 1);
	camera.aspect = Math.max(aspect, 0.01);
	camera.updateProjectionMatrix();
	applyCameraFrame(camera, computeCameraFrame(view, camera.aspect));
}

// Проецирует точку мира в нормализованные координаты экрана (-1..1) для проверок и HUD-привязок.
export function projectWorldPoint(camera: PerspectiveCamera, point: Vec2, height = 0): { x: number; y: number; visible: boolean } {
	const projected = new Vector3(point.x, height, point.z).project(camera);
	return { x: projected.x, y: projected.y, visible: projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 };
}
