// Эффекты частиц: пар над кастрюлей, сковородами, духовкой и горячими блюдами, искры от сковороды, пузыри в кипящей воде,
// крошки при нарезке, серый дым перед подгоранием и чёрный у сгоревшего, всплески на события (подача блюда, готовность,
// сгорание, урна, конец нарезки). Две системы точек на всю сцену: мягкие облачка с обычным смешиванием и светящиеся
// искры со сложением цветов, поэтому эффекты стоят две отрисовки. Частицы только украшают и не влияют на игру.
import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, NormalBlending, Points, ShaderMaterial, type Blending } from "three";
import type { GameSnapshot, IngredientKind, LevelConfig, SimEvent, StationSnapshot } from "../contracts";
import { rectCenter } from "../common/math";
import { tableTopHeight, windowSillHeight } from "./tableware";

// Слой эффектов.
export interface EffectsLayer {
	readonly root: Group;
	update(snapshot: GameSnapshot, frameDtSec: number): void;
	handleEvents(events: readonly SimEvent[]): void;
	// Высота кадра в пикселях буфера и угол обзора: размер частиц на экране считается от них.
	setViewport(heightPx: number, pixelRatio: number, fovDeg: number): void;
	// Сколько частиц сейчас живо (для отладки).
	getParticleCount(): number;
	dispose(): void;
}

// Параметры одной частицы при рождении.
interface ParticleSpec {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	lifeSec: number;
	startSize: number;
	endSize: number;
	// Цвет (0..1, уже в цветах экрана) и непрозрачность.
	r: number;
	g: number;
	b: number;
	alpha: number;
	// Ускорение по y (отрицательное тянет вниз) и затухание скорости (1/сек).
	gravity: number;
	drag: number;
}

// Шейдер точек: круглое мягкое пятно, размер в мировых единицах переводится в пиксели по расстоянию до камеры.
const vertexShader = `
attribute float particleSize;
attribute vec4 particleColor;
uniform float pixelScale;
varying vec4 vColor;
void main() {
	vColor = particleColor;
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	gl_PointSize = particleSize * pixelScale / max(0.001, -mvPosition.z);
	gl_Position = projectionMatrix * mvPosition;
}
`;
const fragmentShader = `
uniform float softness;
varying vec4 vColor;
void main() {
	float distanceToCenter = length(gl_PointCoord - vec2(0.5));
	float alpha = smoothstep(0.5, softness, distanceToCenter) * vColor.a;
	if (alpha < 0.01) discard;
	gl_FragColor = vec4(vColor.rgb, alpha);
}
`;

// Пул частиц одной системы: массивы фиксированного размера, мёртвые частицы заменяются последней живой.
class ParticlePool {
	readonly points: Points;
	private readonly geometry: BufferGeometry;
	private readonly material: ShaderMaterial;
	private readonly positions: Float32Array;
	private readonly colors: Float32Array;
	private readonly sizes: Float32Array;
	private readonly velocities: Float32Array;
	private readonly ages: Float32Array;
	private readonly specs: ParticleSpec[];
	private readonly capacity: number;
	count = 0;

	constructor(capacity: number, blending: Blending, softness: number) {
		this.capacity = capacity;
		this.positions = new Float32Array(capacity * 3);
		this.colors = new Float32Array(capacity * 4);
		this.sizes = new Float32Array(capacity);
		this.velocities = new Float32Array(capacity * 3);
		this.ages = new Float32Array(capacity);
		this.specs = new Array<ParticleSpec>(capacity);
		this.geometry = new BufferGeometry();
		this.geometry.setAttribute("position", new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
		this.geometry.setAttribute("particleColor", new BufferAttribute(this.colors, 4).setUsage(DynamicDrawUsage));
		this.geometry.setAttribute("particleSize", new BufferAttribute(this.sizes, 1).setUsage(DynamicDrawUsage));
		this.geometry.setDrawRange(0, 0);
		this.material = new ShaderMaterial({
			uniforms: { pixelScale: { value: 600 }, softness: { value: softness } },
			vertexShader,
			fragmentShader,
			transparent: true,
			depthWrite: false,
			blending,
		});
		this.points = new Points(this.geometry, this.material);
		// Частицы разбросаны по всей сцене: отсечение по рамке геометрии не нужно.
		this.points.frustumCulled = false;
		this.points.renderOrder = 9;
	}

	setPixelScale(value: number): void {
		this.material.uniforms.pixelScale.value = value;
	}

	spawn(spec: ParticleSpec): void {
		if (this.count >= this.capacity) {
			return;
		}
		const index = this.count;
		this.count += 1;
		this.specs[index] = spec;
		this.ages[index] = 0;
		this.positions[index * 3] = spec.x;
		this.positions[index * 3 + 1] = spec.y;
		this.positions[index * 3 + 2] = spec.z;
		this.velocities[index * 3] = spec.vx;
		this.velocities[index * 3 + 1] = spec.vy;
		this.velocities[index * 3 + 2] = spec.vz;
	}

	update(frameDtSec: number): void {
		let index = 0;
		while (index < this.count) {
			const spec = this.specs[index];
			const age = this.ages[index] + frameDtSec;
			if (age >= spec.lifeSec) {
				this.removeAt(index);
				continue;
			}
			this.ages[index] = age;
			const damping = Math.exp(-spec.drag * frameDtSec);
			this.velocities[index * 3] *= damping;
			this.velocities[index * 3 + 1] = this.velocities[index * 3 + 1] * damping + spec.gravity * frameDtSec;
			this.velocities[index * 3 + 2] *= damping;
			this.positions[index * 3] += this.velocities[index * 3] * frameDtSec;
			this.positions[index * 3 + 1] += this.velocities[index * 3 + 1] * frameDtSec;
			this.positions[index * 3 + 2] += this.velocities[index * 3 + 2] * frameDtSec;
			const progress = age / spec.lifeSec;
			// Быстро проявляется, медленно тает.
			const fade = Math.min(1, progress * 6) * (1 - progress * progress);
			this.colors[index * 4] = spec.r;
			this.colors[index * 4 + 1] = spec.g;
			this.colors[index * 4 + 2] = spec.b;
			this.colors[index * 4 + 3] = spec.alpha * fade;
			this.sizes[index] = spec.startSize + (spec.endSize - spec.startSize) * progress;
			index += 1;
		}
		this.geometry.setDrawRange(0, this.count);
		for (const name of ["position", "particleColor", "particleSize"]) {
			this.geometry.getAttribute(name).needsUpdate = true;
		}
	}

	private removeAt(index: number): void {
		const last = this.count - 1;
		if (index !== last) {
			this.specs[index] = this.specs[last];
			this.ages[index] = this.ages[last];
			this.positions.copyWithin(index * 3, last * 3, last * 3 + 3);
			this.velocities.copyWithin(index * 3, last * 3, last * 3 + 3);
		}
		this.count = last;
	}

	dispose(): void {
		this.geometry.dispose();
		this.material.dispose();
	}
}

// Цвета крошек при нарезке по ингредиенту.
const chopColors: Partial<Record<IngredientKind, [number, number, number]>> = {
	carrot: [1.0, 0.55, 0.16],
	potato: [0.91, 0.79, 0.54],
	onion: [0.95, 0.9, 0.94],
	steak: [0.85, 0.33, 0.31],
};

// Создаёт слой эффектов для станций уровня. surfaceHeights: высоты рабочих поверхностей станций (из stations.ts).
export function createEffectsLayer(level: LevelConfig, surfaceHeights: ReadonlyMap<string, number>): EffectsLayer {
	const root = new Group();
	root.name = "effects";
	const soft = new ParticlePool(700, NormalBlending, 0.12);
	const glow = new ParticlePool(300, AdditiveBlending, 0.05);
	root.add(soft.points, glow.points);
	const stationCenters = new Map(level.stations.map((station) => [station.id, rectCenter(station.rect)]));
	const dishPoints = new Map<string, { x: number; z: number }>();
	for (const table of level.tables) {
		table.seats.forEach((seat, seatIndex) => dishPoints.set(`${table.id}:${seatIndex}`, seat.dishPoint));
	}
	// Накопители дробного числа частиц на источник: частота рождения не зависит от частоты кадров.
	const accumulators = new Map<string, number>();
	let lastSnapshot: GameSnapshot | null = null;

	function jitter(amount: number): number {
		return (Math.random() - 0.5) * 2 * amount;
	}

	// Сколько частиц родить источнику за кадр при частоте rate в секунду.
	function emitCount(key: string, rate: number, frameDtSec: number): number {
		const value = (accumulators.get(key) ?? Math.random()) + rate * frameDtSec;
		const count = Math.floor(value);
		accumulators.set(key, value - count);
		return count;
	}

	// Облачко пара: белое, поднимается и расплывается.
	function steam(x: number, y: number, z: number, strength = 1): void {
		soft.spawn({ x: x + jitter(0.1), y, z: z + jitter(0.1), vx: jitter(0.06), vy: 0.35 + Math.random() * 0.2, vz: jitter(0.06), lifeSec: 1.4 + Math.random() * 0.6, startSize: 0.14, endSize: 0.46 * strength, r: 0.98, g: 0.98, b: 0.99, alpha: 0.42 * strength, gravity: 0.05, drag: 0.4 });
	}

	// Дым: dark = true для сгоревшего (почти чёрный, гуще).
	function smoke(x: number, y: number, z: number, dark: boolean): void {
		const tone = dark ? 0.16 + Math.random() * 0.06 : 0.5 + Math.random() * 0.1;
		soft.spawn({ x: x + jitter(0.1), y, z: z + jitter(0.1), vx: jitter(0.08), vy: 0.45 + Math.random() * 0.25, vz: jitter(0.08), lifeSec: 1.8 + Math.random() * 0.8, startSize: 0.16, endSize: dark ? 0.62 : 0.48, r: tone, g: tone * 0.98, b: tone * 0.96, alpha: dark ? 0.62 : 0.45, gravity: 0.06, drag: 0.35 });
	}

	// Искра от сковороды: подпрыгивает и падает.
	function spark(x: number, y: number, z: number): void {
		glow.spawn({ x: x + jitter(0.12), y, z: z + jitter(0.12), vx: jitter(0.5), vy: 0.9 + Math.random() * 0.7, vz: jitter(0.5), lifeSec: 0.35 + Math.random() * 0.2, startSize: 0.045, endSize: 0.015, r: 1, g: 0.7 + Math.random() * 0.2, b: 0.3, alpha: 0.95, gravity: -4.5, drag: 0.5 });
	}

	// Пузырёк на поверхности воды в кастрюле.
	function bubble(x: number, y: number, z: number): void {
		const angle = Math.random() * Math.PI * 2;
		const radius = Math.random() * 0.14;
		soft.spawn({ x: x + Math.cos(angle) * radius, y, z: z + Math.sin(angle) * radius, vx: 0, vy: 0.12, vz: 0, lifeSec: 0.3 + Math.random() * 0.2, startSize: 0.03, endSize: 0.07, r: 0.92, g: 0.97, b: 1, alpha: 0.9, gravity: 0, drag: 0 });
	}

	// Кусочек при нарезке.
	function chopBit(x: number, y: number, z: number, color: [number, number, number]): void {
		soft.spawn({ x: x + jitter(0.12), y, z: z + jitter(0.08), vx: jitter(0.45), vy: 0.8 + Math.random() * 0.6, vz: jitter(0.35), lifeSec: 0.45 + Math.random() * 0.15, startSize: 0.05, endSize: 0.04, r: color[0], g: color[1], b: color[2], alpha: 1, gravity: -5, drag: 0.3 });
	}

	// Золотая искорка всплеска (подача, готовность).
	function sparkle(x: number, y: number, z: number, speed: number): void {
		const angle = Math.random() * Math.PI * 2;
		glow.spawn({ x, y, z, vx: Math.cos(angle) * speed, vy: 0.6 + Math.random() * 0.8, vz: Math.sin(angle) * speed, lifeSec: 0.6 + Math.random() * 0.3, startSize: 0.09, endSize: 0.02, r: 1, g: 0.86, b: 0.35, alpha: 1, gravity: -1.5, drag: 1.2 });
	}

	// Постоянные источники станций по их состоянию.
	function emitStation(station: StationSnapshot, frameDtSec: number): void {
		const center = stationCenters.get(station.id);
		if (!center) {
			return;
		}
		const surfaceY = surfaceHeights.get(station.id) ?? 0.5;
		const key = station.id;
		const burnRisk = Math.max(0, station.burnProgress - 0.45) / 0.55;
		switch (station.kind) {
			case "pan": {
				const y = surfaceY + 0.05;
				if (station.phase === "processing") {
					for (let index = emitCount(`${key}:steam`, 4, frameDtSec); index > 0; index -= 1) steam(center.x, y, center.z, 0.8);
					for (let index = emitCount(`${key}:spark`, 10, frameDtSec); index > 0; index -= 1) spark(center.x, y, center.z);
				} else if (station.phase === "ready") {
					for (let index = emitCount(`${key}:steam`, 4, frameDtSec); index > 0; index -= 1) steam(center.x, y, center.z);
					for (let index = emitCount(`${key}:smoke`, burnRisk * 9, frameDtSec); index > 0; index -= 1) smoke(center.x, y, center.z, false);
				} else if (station.phase === "burnt") {
					for (let index = emitCount(`${key}:smoke`, 6, frameDtSec); index > 0; index -= 1) smoke(center.x, y, center.z, true);
				}
				break;
			}
			case "oven": {
				// Пар и дым выходят из вентиляции на крышке духовки.
				const y = surfaceY + 0.02;
				const ventZ = center.z - 0.15;
				if (station.phase === "processing") {
					for (let index = emitCount(`${key}:steam`, 2.5, frameDtSec); index > 0; index -= 1) steam(center.x, y, ventZ, 0.8);
				} else if (station.phase === "ready") {
					for (let index = emitCount(`${key}:steam`, 3, frameDtSec); index > 0; index -= 1) steam(center.x, y, ventZ);
					for (let index = emitCount(`${key}:smoke`, burnRisk * 9, frameDtSec); index > 0; index -= 1) smoke(center.x, y, ventZ, false);
				} else if (station.phase === "burnt") {
					for (let index = emitCount(`${key}:smoke`, 6, frameDtSec); index > 0; index -= 1) smoke(center.x, y, ventZ, true);
				}
				break;
			}
			case "stove": {
				const pot = station.items.find((item) => item.type === "pot");
				const y = surfaceY + 0.2;
				if (station.phase === "burnt") {
					for (let index = emitCount(`${key}:smoke`, 6, frameDtSec); index > 0; index -= 1) smoke(center.x, y, center.z, true);
				} else if (station.isHeating) {
					for (let index = emitCount(`${key}:steam`, 5, frameDtSec); index > 0; index -= 1) steam(center.x, y, center.z, 1.1);
					if (pot && pot.type === "pot" && pot.hasWater) {
						for (let index = emitCount(`${key}:bubble`, 12, frameDtSec); index > 0; index -= 1) bubble(center.x, y - 0.03, center.z);
					}
				} else if (station.portions > 0) {
					for (let index = emitCount(`${key}:steam`, 2.5, frameDtSec); index > 0; index -= 1) steam(center.x, y, center.z, 0.9);
				}
				break;
			}
			case "cuttingBoard": {
				const item = station.items[0];
				if (station.phase === "processing" && item && item.type === "ingredient") {
					const color = chopColors[item.kind] ?? [0.85, 0.85, 0.85];
					for (let index = emitCount(`${key}:chop`, 9, frameDtSec); index > 0; index -= 1) chopBit(center.x, surfaceY + 0.06, center.z, color);
				}
				break;
			}
			default:
				break;
		}
	}

	return {
		root,
		update(snapshot, frameDtSec) {
			lastSnapshot = snapshot;
			// Большой шаг (вкладка была скрыта) не должен выплёвывать сотни частиц разом.
			const dt = Math.min(frameDtSec, 0.1);
			for (const station of snapshot.stations) {
				emitStation(station, dt);
			}
			// Горячие блюда в окне выдачи и на столах слегка парят.
			const windowStation = level.stations.find((station) => station.id === level.window.stationId);
			const windowFront = ((windowStation?.rotationDeg ?? 0) * Math.PI) / 180;
			for (const windowDish of snapshot.windowDishes) {
				const point = level.window.dishPoints[windowDish.slotIndex];
				if (point) {
					for (let index = emitCount(`window:${windowDish.id}`, 1.2, dt); index > 0; index -= 1) {
						steam(point.x + Math.sin(windowFront) * 0.12, windowSillHeight + 0.18, point.z + Math.cos(windowFront) * 0.12, 0.6);
					}
				}
			}
			for (const customer of snapshot.customers) {
				if (!customer.dishOnTable || customer.tableId === null || customer.seatIndex === null) {
					continue;
				}
				const point = dishPoints.get(`${customer.tableId}:${customer.seatIndex}`);
				if (point) {
					for (let index = emitCount(`table:${customer.id}`, 0.9, dt); index > 0; index -= 1) {
						steam(point.x, tableTopHeight + 0.2, point.z, 0.55);
					}
				}
			}
			soft.update(dt);
			glow.update(dt);
		},
		handleEvents(events) {
			for (const event of events) {
				if (event.type === "dishServed") {
					const customer = lastSnapshot?.customers.find((candidate) => candidate.id === event.customerId);
					const point = customer && customer.seatIndex !== null ? dishPoints.get(`${event.tableId}:${customer.seatIndex}`) : undefined;
					if (point) {
						for (let index = 0; index < 16; index += 1) sparkle(point.x, tableTopHeight + 0.25, point.z, 0.9);
					}
					continue;
				}
				if (!("stationId" in event)) {
					continue;
				}
				const center = stationCenters.get(event.stationId);
				if (!center) {
					continue;
				}
				const y = (surfaceHeights.get(event.stationId) ?? 0.5) + 0.1;
				if (event.type === "cookingDone") {
					for (let index = 0; index < 8; index += 1) steam(center.x, y, center.z, 1.2);
					for (let index = 0; index < 6; index += 1) sparkle(center.x, y + 0.1, center.z, 0.6);
				} else if (event.type === "itemBurnt") {
					for (let index = 0; index < 12; index += 1) smoke(center.x, y, center.z, true);
				} else if (event.type === "cuttingDone") {
					for (let index = 0; index < 8; index += 1) sparkle(center.x, y, center.z, 0.7);
				}
			}
			// Предмет в урне: серое облачко над урной.
			for (const event of events) {
				if (event.type !== "itemTrashed") {
					continue;
				}
				const trash = level.stations.find((station) => station.kind === "trash");
				if (trash) {
					const center = rectCenter(trash.rect);
					for (let index = 0; index < 7; index += 1) {
						soft.spawn({ x: center.x + jitter(0.15), y: 0.75, z: center.z + jitter(0.15), vx: jitter(0.4), vy: 0.3 + Math.random() * 0.3, vz: jitter(0.4), lifeSec: 0.7, startSize: 0.12, endSize: 0.3, r: 0.75, g: 0.74, b: 0.72, alpha: 0.5, gravity: 0, drag: 1.5 });
					}
				}
			}
		},
		setViewport(heightPx, pixelRatio, fovDeg) {
			const scale = (heightPx * pixelRatio) / (2 * Math.tan((fovDeg * Math.PI) / 360));
			soft.setPixelScale(scale);
			glow.setPixelScale(scale);
		},
		getParticleCount() {
			return soft.count + glow.count;
		},
		dispose() {
			soft.dispose();
			glow.dispose();
			root.clear();
			accumulators.clear();
		},
	};
}
