// Персонажи из примитивов (задача 6.4): повар, официант и клиенты. У каждого лицо (глаза с бликами, нос, рот, уши, у части
// румянец и брови), причёска, одежда по роли и у клиентов случайные детали: головной убор, очки, рюкзак или сумка, борода,
// рост и комплекция. Детали одной подвижной части склеиваются в один меш с цветами в вершинах (batch.ts), поэтому персонаж
// рисуется восемью мешами: тень, корпус, голова, глаза, две руки, две ноги.
// Анимация: шаг, перенос предмета, резка, сидение, еда (руки по очереди подносят еду ко рту), нетерпение (руки в боки и
// притопывание в очереди, постукивание по столу и взгляд по сторонам за столом), дыхание, моргание, повороты головы.
// Единицы мира: рост около 1.0 (прилавок 0.5, стул 0.3 до сиденья), перед персонажа смотрит по +z (yaw = 0 к камере).
import {
	BoxGeometry,
	BufferGeometry,
	CircleGeometry,
	ConeGeometry,
	CylinderGeometry,
	Euler,
	Group,
	LatheGeometry,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Quaternion,
	SphereGeometry,
	TorusGeometry,
	Vector2,
	Vector3,
} from "three";
import type { Rng } from "../contracts";
import { createRng } from "../sim/core/rng";
import { mergeColoredParts, type ColoredPart, type Turn } from "./batch";
import { chefColors, customerShirtColors, hairColors, shadowColor, skinTones, waiterColors } from "./palette";

// Роль персонажа: от неё зависят одежда и головной убор.
export type CharacterRole = "chef" | "waiter" | "customer";

// Состояние для анимации одного кадра.
export interface CharacterPose {
	// Идёт ли персонаж (покачивание).
	moving: boolean;
	// Сидит ли (ноги вперёд, без ходьбы).
	seated: boolean;
	// Несёт ли предмет (руки вперёд).
	carrying: boolean;
	// Идёт ли рабочее действие (повар режет: рука с ножом ходит вверх и вниз).
	working: boolean;
	// Ест ли клиент: руки по очереди подносят еду ко рту.
	eating?: boolean;
	// Нетерпение 0..1: 0 спокоен, 1 вот-вот уйдёт (руки в боки, притопывание, взгляд по сторонам).
	impatience?: number;
}

// Персонаж: корневой объект для позиции и yaw, анимация и точка крепления предмета.
export interface CharacterRig {
	readonly root: Group;
	// Точка перед персонажем, к которой крепится переносимый предмет (в единицах мира).
	readonly handAnchor: Group;
	// Высота над полом, где над головой показывается значок эмоции.
	readonly emoteHeight: number;
	// Продвигает анимацию на время кадра.
	update(frameDtSec: number, pose: CharacterPose): void;
	// Освобождает собственную геометрию персонажа (материалы общие, их освобождает фабрика).
	dispose(): void;
}

// Фабрика персонажей с общими шаблонами геометрии и общими материалами.
export interface CharacterFactory {
	// appearanceSeed: стабильное число клиента (например, хэш идентификатора): вместе с variant задаёт внешность.
	createCharacter(role: CharacterRole, variant?: number, appearanceSeed?: number): CharacterRig;
	dispose(): void;
}

// Размеры тела (единицы мира).
const hipY = 0.28;
const legLength = 0.25;
const shoulderY = 0.57;
const shoulderX = 0.215;
const armLength = 0.25;
const headY = 0.75;
const headRadius = 0.16;

// Скорость фазы шага: полных циклов покачивания в секунду.
const walkCyclesPerSec = 2.2;

// Амплитуды: размах ног и рук (радианы), подскок тела, крен корпуса.
const legSwing = 0.65;
const armSwing = 0.5;
const bodyBob = 0.035;
const bodyRoll = 0.06;

// Скорость сглаживания перехода между позами (1/сек): чем больше, тем резче.
const poseBlendRate = 14;

// Поза рук с предметом: подъём вперёд (радианы по x, отрицательное значение поднимает руку вперёд).
const carryArmAngle = -1.15;

// Поза сидения: ноги вперёд, руки на столе.
const seatedLegAngle = -1.45;
const seatedArmAngle = -1.4;

// Цвета одежды и деталей клиентов (sRGB).
const trouserColors = [0x3d5a80, 0x2e3440, 0xb69f7a, 0x6b7280, 0x6f4e37, 0x23262b, 0x7393b3] as const;
const shoeColors = [0xf2f2f2, 0x1f2226, 0x7a4b2a, 0xc0392b, 0x2c3e66, 0x8d6e63] as const;
const accentColors = [0xf4f1ea, 0xe5e7eb, 0x2b2f36, 0xf2c14e, 0x9bc1bc, 0xe76f51] as const;
const hatColors = [0x2b4c7e, 0xc0392b, 0x2a9d8f, 0xf4a261, 0x3a3a3a, 0x8e5bb5] as const;
const glassesColors = [0x2b2b2b, 0x6b3e26, 0xb03a2e, 0x34495e] as const;
const bagColors = [0x6d4c41, 0x2f4a6d, 0xd9a441, 0x4a7c59, 0xa23b72] as const;

// Причёски клиентов.
type HairStyle = "short" | "bob" | "long" | "ponytail" | "bun" | "curly" | "spiky" | "bald";
// Верх одежды.
type TopStyle = "tee" | "sweater" | "jacket" | "hoodie" | "dress";
// Головные уборы.
type HatStyle = "none" | "cap" | "beanie" | "bowler";

// Внешность персонажа.
interface Appearance {
	skin: number;
	hair: number;
	hairStyle: HairStyle;
	top: TopStyle;
	topColor: number;
	accent: number;
	trousers: number;
	shoes: number;
	hat: HatStyle;
	hatColor: number;
	glasses: number | null;
	bag: "none" | "backpack" | "shoulder";
	bagColor: number;
	beard: boolean;
	cheeks: boolean;
	eyebrows: boolean;
	shortSleeves: boolean;
	height: number;
	width: number;
}

// Округляет число по модулю: общий помощник для фазы шага.
function wrapPhase(phase: number): number {
	return phase % (Math.PI * 2);
}

// Плавное приближение значения к цели за кадр (не зависит от частоты кадров).
function approachValue(current: number, target: number, frameDtSec: number, rate = poseBlendRate): number {
	return current + (target - current) * (1 - Math.exp(-rate * frameDtSec));
}

// Цвет, умноженный на коэффициент яркости (тень на носу, тёмная кайма).
function shade(color: number, factor: number): number {
	const red = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
	const green = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
	const blue = Math.min(255, Math.round((color & 0xff) * factor));
	return (red << 16) | (green << 8) | blue;
}

// Смесь двух цветов (румянец на коже).
function mix(first: number, second: number, ratio: number): number {
	const channel = (shift: number) => Math.round(((first >> shift) & 0xff) * (1 - ratio) + ((second >> shift) & 0xff) * ratio);
	return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

// Случайный элемент списка.
function pick<T>(rng: Rng, list: readonly T[]): T {
	return list[Math.floor(rng.next() * list.length) % list.length];
}

// Внешность клиента по варианту (цвет верха) и seed (всё остальное).
function createCustomerAppearance(variant: number, seed: number): Appearance {
	const rng = createRng((seed ^ Math.imul(variant + 1, 0x9e3779b1)) >>> 0);
	const hairStyle = pick<HairStyle>(rng, ["short", "short", "bob", "long", "ponytail", "bun", "curly", "spiky", "bald"]);
	const longHair = hairStyle === "long" || hairStyle === "bob" || hairStyle === "ponytail" || hairStyle === "bun";
	const top = longHair && rng.next() < 0.35 ? "dress" : pick<TopStyle>(rng, ["tee", "tee", "sweater", "jacket", "hoodie"]);
	const hatRoll = rng.next();
	const hat: HatStyle = hairStyle === "bun" || hairStyle === "ponytail" || hairStyle === "curly" ? "none" : hatRoll < 0.16 ? "cap" : hatRoll < 0.26 ? "beanie" : hatRoll < 0.32 ? "bowler" : "none";
	const bagRoll = rng.next();
	const beardAllowed = !longHair && top !== "dress";
	return {
		skin: skinTones[Math.floor(rng.next() * skinTones.length)],
		hair: hairStyle === "bald" ? pick(rng, hairColors) : hairColors[Math.floor(rng.next() * hairColors.length)],
		hairStyle,
		top,
		topColor: customerShirtColors[Math.abs(Math.round(variant)) % customerShirtColors.length],
		accent: pick(rng, accentColors),
		trousers: pick(rng, trouserColors),
		shoes: pick(rng, shoeColors),
		hat,
		hatColor: pick(rng, hatColors),
		glasses: rng.next() < 0.26 ? pick(rng, glassesColors) : null,
		bag: bagRoll < 0.2 ? "backpack" : bagRoll < 0.32 ? "shoulder" : "none",
		bagColor: pick(rng, bagColors),
		beard: beardAllowed && rng.next() < 0.35,
		cheeks: rng.next() < 0.45,
		eyebrows: rng.next() < 0.6,
		shortSleeves: top === "tee" || top === "dress",
		height: 0.93 + rng.next() * 0.13,
		width: 0.94 + rng.next() * 0.14,
	};
}

// Сборщик деталей одной подвижной части: детали в локальных координатах части, затем склейка в одну геометрию.
interface PartBuilder {
	add(geometry: BufferGeometry, color: number, x: number, y: number, z: number, turn?: Turn, scale?: number | { x?: number; y?: number; z?: number }): void;
	build(): BufferGeometry;
}

function createPartBuilder(): PartBuilder {
	const parts: ColoredPart[] = [];
	const euler = new Euler();
	const quaternion = new Quaternion();
	const position = new Vector3();
	const scaleVector = new Vector3();
	return {
		add(geometry, color, x, y, z, turn, scale) {
			euler.set(turn?.x ?? 0, turn?.y ?? 0, turn?.z ?? 0, "XYZ");
			quaternion.setFromEuler(euler);
			if (typeof scale === "number") {
				scaleVector.set(scale, scale, scale);
			} else {
				scaleVector.set(scale?.x ?? 1, scale?.y ?? 1, scale?.z ?? 1);
			}
			parts.push({ geometry, color, matrix: new Matrix4().compose(position.set(x, y, z), quaternion, scaleVector) });
		},
		build() {
			return mergeColoredParts(parts);
		},
	};
}

// Общие шаблоны геометрии: единичные формы, которые масштабируются матрицей детали.
interface CharacterTemplates {
	sphere: BufferGeometry;
	sphereMid: BufferGeometry;
	sphereLow: BufferGeometry;
	cylinder: BufferGeometry;
	box: BufferGeometry;
	cone: BufferGeometry;
	torso: BufferGeometry;
	skirt: BufferGeometry;
	hairCap: BufferGeometry;
	hairShell: BufferGeometry;
	hairLong: BufferGeometry;
	hatCrown: BufferGeometry;
	collar: BufferGeometry;
	smile: BufferGeometry;
	ring: BufferGeometry;
	all: BufferGeometry[];
}

function createTemplates(): CharacterTemplates {
	// Корпус: профиль вращения от бёдер до шеи (y от 0 до 0.37), чуть приплюснут спереди-сзади при укладке.
	const torsoProfile = [
		[0.0, 0],
		[0.17, 0],
		[0.185, 0.05],
		[0.19, 0.14],
		[0.183, 0.24],
		[0.165, 0.3],
		[0.12, 0.345],
		[0.06, 0.368],
		[0.0, 0.372],
	].map(([radius, height]) => new Vector2(radius, height));
	// Юбка: расширяется от талии вниз.
	const skirtProfile = [
		[0.0, 0.0],
		[0.19, 0.0],
		[0.21, -0.06],
		[0.24, -0.15],
		[0.25, -0.18],
		[0.0, -0.18],
	].map(([radius, height]) => new Vector2(radius, height));
	// Оболочка волос открыта спереди (лицо): вырез по углу phi вокруг направления +z.
	const faceOpening = 1.0;
	const templates = {
		sphere: new SphereGeometry(1, 16, 12),
		sphereMid: new SphereGeometry(1, 10, 8),
		sphereLow: new SphereGeometry(1, 8, 6),
		cylinder: new CylinderGeometry(1, 1, 1, 12),
		box: new BoxGeometry(1, 1, 1),
		cone: new ConeGeometry(1, 1, 8),
		torso: new LatheGeometry(torsoProfile, 16),
		skirt: new LatheGeometry(skirtProfile, 16),
		hairCap: new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
		hairShell: new SphereGeometry(1, 16, 10, Math.PI / 2 + faceOpening, Math.PI * 2 - faceOpening * 2, 0, Math.PI * 0.62),
		hairLong: new SphereGeometry(1, 16, 12, Math.PI / 2 + faceOpening, Math.PI * 2 - faceOpening * 2, 0, Math.PI * 0.8),
		hatCrown: new SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.46),
		collar: new TorusGeometry(1, 0.22, 6, 16),
		smile: new TorusGeometry(1, 0.24, 4, 10, Math.PI),
		ring: new TorusGeometry(1, 0.2, 4, 12),
	};
	return { ...templates, all: Object.values(templates) };
}

// Создаёт фабрику персонажей. Шаблоны и материал общие; склеенная геометрия у каждого персонажа своя (dispose персонажа).
export function createCharacterFactory(): CharacterFactory {
	const templates = createTemplates();
	const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
	const shadowMaterial = new MeshBasicMaterial({ color: shadowColor, transparent: true, opacity: 0.22, depthWrite: false });
	const shadowGeometry = new CircleGeometry(0.3, 20).rotateX(-Math.PI / 2);
	const { sphere, sphereMid, sphereLow, cylinder, box, cone } = templates;

	// Ноги: штанина или голая нога под юбкой и ботинок с подошвой. Пивот в бедре.
	function buildLeg(appearance: Appearance, legColor: number): BufferGeometry {
		const leg = createPartBuilder();
		leg.add(cylinder, legColor, 0, -legLength / 2 + 0.01, 0, undefined, { x: 0.058, y: legLength - 0.02, z: 0.058 });
		leg.add(sphereMid, legColor, 0, 0, 0, undefined, 0.062);
		leg.add(sphereMid, appearance.shoes, 0, -legLength + 0.03, 0.03, undefined, { x: 0.066, y: 0.048, z: 0.1 });
		leg.add(box, shade(appearance.shoes, 0.55), 0, -legLength + 0.0, 0.03, undefined, { x: 0.12, y: 0.02, z: 0.18 });
		return leg.build();
	}

	// Рука: плечо, рукав (короткий с голым предплечьем или длинный), кисть. Пивот в плече.
	function buildArm(appearance: Appearance, sleeveColor: number, extra?: (arm: PartBuilder) => void): BufferGeometry {
		const arm = createPartBuilder();
		arm.add(sphereMid, sleeveColor, 0, 0, 0, undefined, 0.058);
		if (appearance.shortSleeves) {
			arm.add(cylinder, sleeveColor, 0, -0.055, 0, undefined, { x: 0.056, y: 0.11, z: 0.056 });
			arm.add(cylinder, appearance.skin, 0, -0.16, 0, undefined, { x: 0.042, y: 0.13, z: 0.042 });
		} else {
			arm.add(cylinder, sleeveColor, 0, -0.11, 0, undefined, { x: 0.05, y: 0.22, z: 0.05 });
			arm.add(cylinder, shade(sleeveColor, 0.85), 0, -0.215, 0, undefined, { x: 0.052, y: 0.025, z: 0.052 });
		}
		arm.add(sphereMid, appearance.skin, 0, -armLength, 0.005, undefined, 0.052);
		extra?.(arm);
		return arm.build();
	}

	// Корпус с одеждой по стилю верха и сумки. Начало координат на уровне бёдер (y = hipY - 0.03 в теле).
	function buildTorso(appearance: Appearance, role: CharacterRole): BufferGeometry {
		const torso = createPartBuilder();
		const width = appearance.width;
		const front = 0.185 * 0.86 * width;
		const base = -0.03;
		torso.add(templates.torso, appearance.topColor, 0, base, 0, undefined, { x: width, y: 1, z: 0.86 * width });
		if (role === "chef") {
			// Двубортный китель: два ряда пуговиц, воротник-стойка, шейный платок, фартук на поясе.
			for (let row = 0; row < 3; row += 1) {
				for (const side of [-0.05, 0.05]) {
					torso.add(sphereLow, 0x9aa5b1, side, 0.12 + row * 0.07, front + 0.002, undefined, 0.014);
				}
			}
			torso.add(templates.collar, chefColors.coat, 0, 0.36, 0, { x: Math.PI / 2 }, { x: 0.075, y: 0.068, z: 0.14 });
			torso.add(templates.collar, chefColors.scarf, 0, 0.33, 0.005, { x: Math.PI / 2 }, { x: 0.112, y: 0.1, z: 0.16 });
			torso.add(sphereLow, chefColors.scarf, 0, 0.3, 0.128, undefined, { x: 0.04, y: 0.045, z: 0.028 });
			torso.add(cylinder, chefColors.apron, 0, 0.035, 0, undefined, { x: 0.19 * width, y: 0.025, z: 0.165 * width });
			torso.add(box, chefColors.apron, 0, -0.1, front + 0.01, { x: -0.12 }, { x: 0.3, y: 0.27, z: 0.02 });
			torso.add(box, shade(chefColors.apron, 1.35), 0, -0.02, front + 0.025, { x: -0.12 }, { x: 0.12, y: 0.07, z: 0.008 });
			return torso.build();
		}
		if (role === "waiter") {
			// Жилет поверх белой рубашки: полоса рубашки спереди, воротник, бабочка, длинный фартук.
			torso.add(box, waiterColors.shirt, 0, 0.24, front - 0.004, { x: -0.18 }, { x: 0.085, y: 0.22, z: 0.02 });
			torso.add(templates.collar, waiterColors.shirt, 0, 0.36, 0, { x: Math.PI / 2 }, { x: 0.075, y: 0.068, z: 0.12 });
			torso.add(box, waiterColors.bowtie, -0.028, 0.32, 0.105, { z: 0.35 }, { x: 0.05, y: 0.035, z: 0.025 });
			torso.add(box, waiterColors.bowtie, 0.028, 0.32, 0.105, { z: -0.35 }, { x: 0.05, y: 0.035, z: 0.025 });
			torso.add(sphereLow, shade(waiterColors.bowtie, 0.8), 0, 0.32, 0.112, undefined, 0.016);
			torso.add(sphereLow, 0xd9d9d9, 0, 0.17, front + 0.004, undefined, 0.012);
			torso.add(sphereLow, 0xd9d9d9, 0, 0.1, front + 0.004, undefined, 0.012);
			torso.add(cylinder, waiterColors.apron, 0, 0.02, 0, undefined, { x: 0.192 * width, y: 0.03, z: 0.167 * width });
			torso.add(box, waiterColors.apron, 0, -0.12, front + 0.012, { x: -0.1 }, { x: 0.3, y: 0.28, z: 0.018 });
			return torso.build();
		}
		// Клиенты: детали по стилю верха.
		switch (appearance.top) {
			case "tee":
				torso.add(templates.collar, shade(appearance.topColor, 0.8), 0, 0.355, 0, { x: Math.PI / 2 }, { x: 0.072, y: 0.066, z: 0.12 });
				torso.add(cylinder, 0x3b2f2f, 0, 0.0, 0, undefined, { x: 0.192 * width, y: 0.025, z: 0.167 * width });
				break;
			case "sweater":
				torso.add(templates.collar, shade(appearance.topColor, 0.82), 0, 0.355, 0, { x: Math.PI / 2 }, { x: 0.075, y: 0.075, z: 0.14 });
				torso.add(cylinder, shade(appearance.topColor, 0.82), 0, 0.0, 0, undefined, { x: 0.193 * width, y: 0.05, z: 0.168 * width });
				torso.add(box, shade(appearance.topColor, 1.18), 0, 0.17, front + 0.002, undefined, { x: 0.2, y: 0.03, z: 0.01 });
				break;
			case "jacket":
				// Расстёгнутая куртка: полоса рубашки цвета акцента спереди и отвороты.
				torso.add(box, appearance.accent, 0, 0.18, front - 0.002, { x: -0.1 }, { x: 0.09, y: 0.3, z: 0.02 });
				torso.add(box, shade(appearance.topColor, 0.75), -0.055, 0.26, front + 0.004, { z: -0.35, x: -0.2 }, { x: 0.03, y: 0.14, z: 0.012 });
				torso.add(box, shade(appearance.topColor, 0.75), 0.055, 0.26, front + 0.004, { z: 0.35, x: -0.2 }, { x: 0.03, y: 0.14, z: 0.012 });
				torso.add(cylinder, shade(appearance.topColor, 0.8), 0, 0.0, 0, undefined, { x: 0.193 * width, y: 0.03, z: 0.168 * width });
				break;
			case "hoodie":
				// Капюшон за шеей, карман и шнурки.
				torso.add(templates.collar, shade(appearance.topColor, 0.88), 0, 0.33, -0.04, { x: Math.PI / 2 + 0.35 }, { x: 0.1, y: 0.09, z: 0.2 });
				torso.add(box, shade(appearance.topColor, 0.85), 0, 0.07, front + 0.002, undefined, { x: 0.18, y: 0.08, z: 0.015 });
				torso.add(box, 0xf4f1ea, -0.03, 0.27, front + 0.004, undefined, { x: 0.01, y: 0.08, z: 0.01 });
				torso.add(box, 0xf4f1ea, 0.03, 0.27, front + 0.004, undefined, { x: 0.01, y: 0.08, z: 0.01 });
				break;
			case "dress":
				torso.add(templates.skirt, appearance.topColor, 0, 0.02, 0, undefined, { x: width, y: 1, z: 0.9 * width });
				torso.add(cylinder, appearance.accent, 0, 0.03, 0, undefined, { x: 0.192 * width, y: 0.03, z: 0.167 * width });
				torso.add(templates.collar, shade(appearance.topColor, 1.15), 0, 0.355, 0, { x: Math.PI / 2 }, { x: 0.065, y: 0.065, z: 0.08 });
				break;
		}
		if (appearance.bag === "backpack") {
			torso.add(box, appearance.bagColor, 0, 0.17, -0.2, undefined, { x: 0.22, y: 0.25, z: 0.1 });
			torso.add(box, shade(appearance.bagColor, 0.8), 0, 0.27, -0.21, { x: 0.2 }, { x: 0.23, y: 0.07, z: 0.11 });
			torso.add(box, shade(appearance.bagColor, 0.85), 0, 0.1, -0.255, undefined, { x: 0.15, y: 0.08, z: 0.03 });
			for (const side of [-0.085, 0.085]) {
				torso.add(box, shade(appearance.bagColor, 0.7), side, 0.24, front - 0.012, { x: -0.25 }, { x: 0.03, y: 0.16, z: 0.012 });
			}
		} else if (appearance.bag === "shoulder") {
			torso.add(box, appearance.bagColor, 0.2, 0.0, 0.03, undefined, { x: 0.05, y: 0.12, z: 0.15 });
			torso.add(box, shade(appearance.bagColor, 0.7), 0.0, 0.2, front + 0.006, { z: -0.75, x: -0.1 }, { x: 0.022, y: 0.42, z: 0.01 });
		}
		return torso.build();
	}

	// Причёска: детали в системе головы (центр головы в начале координат). underHat: под шляпой или колпаком рисуется только
	// то, что из-под них видно (затылок, длинные пряди).
	function addHair(head: PartBuilder, appearance: Appearance, underHat: boolean): void {
		const color = appearance.hair;
		const r = headRadius;
		const style = appearance.hairStyle;
		const cap = (lift = 0) => head.add(templates.hairCap, color, 0, lift + 0.005, -0.01, { x: -0.32 }, { x: r * 1.07, y: r * 1.05, z: r * 1.08 });
		if (style === "bald") {
			// Венчик волос на висках и затылке.
			head.add(templates.hairShell, color, 0, -0.04, -0.012, undefined, { x: r * 1.04, y: r * 0.6, z: r * 1.04 });
			return;
		}
		cap();
		switch (style) {
			case "bob":
				head.add(templates.hairShell, color, 0, 0.0, -0.005, undefined, { x: r * 1.15, y: r * 1.08, z: r * 1.12 });
				break;
			case "long":
				head.add(templates.hairLong, color, 0, 0.02, -0.01, undefined, { x: r * 1.14, y: r * 1.45, z: r * 1.1 });
				head.add(box, color, 0, -0.17, -0.1, { x: 0.15 }, { x: 0.25, y: 0.16, z: 0.06 });
				break;
			case "ponytail":
				head.add(sphereLow, accentColors[(appearance.shoes >> 3) % accentColors.length], 0, 0.02, -0.165, undefined, 0.032);
				head.add(sphereMid, color, 0, -0.07, -0.205, { x: 0.35 }, { x: 0.055, y: 0.12, z: 0.05 });
				break;
			case "bun":
				if (!underHat) {
					head.add(sphereMid, color, 0, 0.16, -0.06, undefined, 0.072);
				}
				break;
			case "curly":
				if (!underHat) {
					for (let curl = 0; curl < 9; curl += 1) {
						const angle = (curl / 9) * Math.PI * 2;
						const tilt = curl % 2 === 0 ? 0.55 : 0.95;
						const curlZ = Math.sin(angle) * Math.sin(tilt) * r;
						if (curlZ > r * 0.55) {
							continue;
						}
						head.add(sphereLow, color, Math.cos(angle) * Math.sin(tilt) * r, Math.cos(tilt) * r + 0.02, curlZ - 0.01, undefined, 0.07);
					}
					head.add(sphereLow, color, 0, r + 0.03, -0.02, undefined, 0.075);
				}
				break;
			case "spiky":
				if (!underHat) {
					for (let spike = 0; spike < 6; spike += 1) {
						const angle = (spike / 6) * Math.PI * 2;
						head.add(cone, color, Math.cos(angle) * 0.07, 0.15, Math.sin(angle) * 0.06 - 0.03, { x: Math.sin(angle) * 0.5 - 0.3, z: -Math.cos(angle) * 0.5 }, { x: 0.04, y: 0.1, z: 0.04 });
					}
				}
				break;
			case "short":
				break;
		}
	}

	// Головной убор клиента.
	function addHat(head: PartBuilder, appearance: Appearance): void {
		const r = headRadius;
		if (appearance.hat === "cap") {
			head.add(templates.hatCrown, appearance.hatColor, 0, 0.02, -0.005, { x: -0.12 }, { x: r * 1.12, y: r * 1.05, z: r * 1.12 });
			head.add(box, appearance.hatColor, 0, 0.055, 0.17, { x: 0.18 }, { x: 0.17, y: 0.016, z: 0.13 });
			head.add(sphereLow, shade(appearance.hatColor, 0.8), 0, r + 0.025, -0.02, undefined, 0.018);
		} else if (appearance.hat === "beanie") {
			head.add(templates.hatCrown, appearance.hatColor, 0, 0.025, -0.01, { x: -0.15 }, { x: r * 1.13, y: r * 1.18, z: r * 1.13 });
			head.add(cylinder, shade(appearance.hatColor, 0.82), 0, 0.03, -0.01, { x: -0.15 }, { x: r * 1.13, y: 0.05, z: r * 1.13 });
			head.add(sphereLow, 0xf4f1ea, 0, r + 0.075, -0.035, undefined, 0.045);
		} else if (appearance.hat === "bowler") {
			head.add(cylinder, appearance.hatColor, 0, 0.07, 0, { x: -0.08 }, { x: 0.23, y: 0.016, z: 0.23 });
			head.add(sphereMid, appearance.hatColor, 0, 0.1, -0.005, undefined, { x: 0.15, y: 0.11, z: 0.15 });
			head.add(cylinder, 0x2b2b2b, 0, 0.09, -0.005, undefined, { x: 0.152, y: 0.025, z: 0.152 });
		}
	}

	// Голова: кожа, уши, нос, рот, румянец, брови, причёска, головной убор, очки, борода, усы повара.
	function buildHead(appearance: Appearance, role: CharacterRole): BufferGeometry {
		const head = createPartBuilder();
		const skin = appearance.skin;
		const r = headRadius;
		head.add(sphere, skin, 0, 0, 0, undefined, { x: r, y: r * 0.97, z: r * 0.98 });
		for (const side of [-1, 1]) {
			head.add(sphereLow, shade(skin, 0.95), side * r * 0.98, -0.012, -0.005, undefined, { x: 0.02, y: 0.036, z: 0.03 });
		}
		head.add(sphereLow, shade(skin, 0.9), 0, -0.018, r * 0.97, undefined, { x: 0.026, y: 0.024, z: 0.022 });
		if (appearance.cheeks || role === "chef") {
			const blush = mix(skin, 0xff6f7d, 0.45);
			for (const side of [-1, 1]) {
				head.add(sphereLow, blush, side * 0.088, -0.035, r * 0.86, { y: side * 0.5 }, { x: 0.03, y: 0.022, z: 0.012 });
			}
		}
		const mouthColor = 0x7a3a2a;
		if (role === "chef") {
			// Пышные усы вместо рта.
			for (const side of [-1, 1]) {
				head.add(sphereLow, 0x5b3a22, side * 0.032, -0.052, r * 0.93, { z: side * 0.35 }, { x: 0.042, y: 0.02, z: 0.02 });
			}
		} else if (appearance.beard) {
			head.add(sphereMid, appearance.hair, 0, -0.085, 0.07, undefined, { x: 0.12, y: 0.085, z: 0.1 });
			for (const side of [-1, 1]) {
				head.add(sphereLow, appearance.hair, side * 0.028, -0.05, r * 0.93, { z: side * 0.3 }, { x: 0.035, y: 0.016, z: 0.016 });
			}
		} else {
			head.add(templates.smile, mouthColor, 0, -0.05, r * 0.935, { z: Math.PI, x: -0.25 }, { x: 0.03, y: 0.022, z: 0.03 });
		}
		if (appearance.eyebrows || role !== "customer") {
			for (const side of [-1, 1]) {
				head.add(box, shade(appearance.hair, 0.9), side * 0.056, 0.068, r * 0.9, { z: side * -0.15, x: -0.3 }, { x: 0.045, y: 0.012, z: 0.012 });
			}
		}
		if (role === "chef") {
			addHair(head, { ...appearance, hairStyle: "short" }, true);
			// Поварской колпак: околыш и пышный верх из трёх шаров.
			head.add(cylinder, chefColors.hat, 0, r * 0.82, -0.01, { x: -0.1 }, { x: 0.142, y: 0.1, z: 0.142 });
			head.add(sphere, chefColors.hat, 0, r + 0.12, -0.03, undefined, { x: 0.17, y: 0.12, z: 0.16 });
			head.add(sphereMid, shade(chefColors.hat, 0.97), -0.07, r + 0.1, -0.02, undefined, 0.1);
			head.add(sphereMid, shade(chefColors.hat, 0.97), 0.07, r + 0.1, -0.04, undefined, 0.1);
		} else if (role === "waiter") {
			addHair(head, { ...appearance, hairStyle: "short" }, false);
			head.add(box, shade(appearance.hair, 1.6), -0.045, r * 0.98, 0.03, { x: 0.3 }, { x: 0.012, y: 0.012, z: 0.12 });
		} else {
			addHair(head, appearance, appearance.hat !== "none");
			addHat(head, appearance);
		}
		if (appearance.glasses !== null) {
			for (const side of [-1, 1]) {
				head.add(templates.ring, appearance.glasses, side * 0.056, 0.022, r * 1.06, undefined, { x: 0.036, y: 0.034, z: 0.036 });
				head.add(box, appearance.glasses, side * r * 0.93, 0.028, 0.075, { y: side * 0.15 }, { x: 0.008, y: 0.008, z: 0.17 });
			}
			head.add(box, appearance.glasses, 0, 0.03, r * 1.08, undefined, { x: 0.04, y: 0.008, z: 0.008 });
		}
		return head.build();
	}

	// Глаза отдельным мешем (для моргания): тёмные овалы с бликами.
	function buildEyes(): BufferGeometry {
		const eyes = createPartBuilder();
		for (const side of [-1, 1]) {
			eyes.add(sphereLow, 0x1d1d22, side * 0.056, 0, 0, undefined, { x: 0.022, y: 0.03, z: 0.014 });
			eyes.add(sphereLow, 0xffffff, side * 0.056 - 0.007, 0.011, 0.011, undefined, 0.0075);
		}
		return eyes.build();
	}

	// Внешность по роли: у повара и официанта фиксированная форма, у клиентов из варианта и seed.
	function getAppearance(role: CharacterRole, variant: number, seed: number): Appearance {
		if (role === "customer") {
			return createCustomerAppearance(variant, seed);
		}
		const base: Appearance = {
			skin: skinTones[(variant * 3 + 1) % skinTones.length],
			hair: role === "chef" ? 0x4a2f1d : waiterColors.hair,
			hairStyle: "short",
			top: "tee",
			topColor: role === "chef" ? chefColors.coat : waiterColors.vest,
			accent: 0xffffff,
			trousers: role === "chef" ? chefColors.trousers : waiterColors.trousers,
			shoes: role === "chef" ? chefColors.shoes : waiterColors.shoes,
			hat: "none",
			hatColor: 0xffffff,
			glasses: null,
			bag: "none",
			bagColor: 0,
			beard: false,
			cheeks: role === "chef",
			eyebrows: true,
			shortSleeves: false,
			height: 1,
			width: role === "chef" ? 1.05 : 1,
		};
		return base;
	}

	function createCharacter(role: CharacterRole, variant = 0, appearanceSeed = 0): CharacterRig {
		const safeVariant = Math.abs(Math.round(variant));
		const appearance = getAppearance(role, safeVariant, appearanceSeed >>> 0);
		const ownGeometries: BufferGeometry[] = [];
		const makeMesh = (geometry: BufferGeometry): Mesh => {
			ownGeometries.push(geometry);
			const mesh = new Mesh(geometry, material);
			mesh.receiveShadow = true;
			return mesh;
		};

		const root = new Group();
		root.name = `character-${role}`;
		const shadow = new Mesh(shadowGeometry, shadowMaterial);
		shadow.position.y = 0.012;
		root.add(shadow);

		// Фигура масштабируется ростом клиента; тело внутри неё подскакивает и кренится при ходьбе.
		const figure = new Group();
		figure.scale.setScalar(appearance.height);
		root.add(figure);
		const body = new Group();
		figure.add(body);

		// Ноги: пивот в бедре. Под юбкой видна кожа.
		const legColor = appearance.top === "dress" ? shade(appearance.skin, 0.96) : appearance.trousers;
		const legGeometry = buildLeg(appearance, legColor);
		const legLeft = new Group();
		legLeft.position.set(-0.075 * appearance.width, hipY, 0);
		const legRight = new Group();
		legRight.position.set(0.075 * appearance.width, hipY, 0);
		legLeft.add(makeMesh(legGeometry));
		legRight.add(new Mesh(legGeometry, material));
		(legRight.children[0] as Mesh).receiveShadow = true;
		body.add(legLeft, legRight);

		// Корпус.
		const torso = makeMesh(buildTorso(appearance, role));
		torso.position.y = hipY;
		body.add(torso);

		// Руки: пивот в плече. У официанта белые рукава рубашки и полотенце на левой руке.
		const sleeveColor = role === "chef" ? chefColors.coat : role === "waiter" ? waiterColors.shirt : appearance.topColor;
		const armLeftGeometry = buildArm(appearance, sleeveColor, role === "waiter" ? (arm) => arm.add(box, 0xf4f6f8, 0, -0.17, 0.06, undefined, { x: 0.075, y: 0.12, z: 0.025 }) : undefined);
		const armRightGeometry = buildArm(appearance, sleeveColor);
		const armLeft = new Group();
		armLeft.position.set(-shoulderX * appearance.width, shoulderY, 0);
		const armRight = new Group();
		armRight.position.set(shoulderX * appearance.width, shoulderY, 0);
		armLeft.add(makeMesh(armLeftGeometry));
		armRight.add(makeMesh(armRightGeometry));
		body.add(armLeft, armRight);

		// Голова на шее: поворачивается и кивает; глаза моргают.
		const head = new Group();
		head.position.y = headY;
		head.add(makeMesh(buildHead(appearance, role)));
		const eyes = makeMesh(buildEyes());
		eyes.position.set(0, 0.022, headRadius * 0.92);
		head.add(eyes);
		body.add(head);

		// Точка крепления предмета: перед грудью (в мировых единицах, без масштаба роста).
		const handAnchor = new Group();
		handAnchor.name = "hand-anchor";
		handAnchor.position.set(0, (hipY + 0.36 * 0.55) / appearance.height, 0.36 / appearance.height);
		handAnchor.scale.setScalar(1 / appearance.height);
		body.add(handAnchor);

		// Состояние анимации. Фазы смещены случайно, чтобы толпа не двигалась в такт.
		const phaseRng = createRng((appearanceSeed ^ 0x5bd1e995) + safeVariant * 7919 + (role === "chef" ? 11 : role === "waiter" ? 23 : 0));
		const idleOffset = phaseRng.next() * Math.PI * 2;
		let walkPhase = 0;
		let moveBlend = 0;
		let seatBlend = 0;
		let carryBlend = 0;
		let eatBlend = 0;
		let impatienceBlend = 0;
		let workPhase = 0;
		let eatPhase = phaseRng.next() * Math.PI * 2;
		let idleTime = phaseRng.next() * 10;
		let blinkTimer = 1 + phaseRng.next() * 3;
		let blinkLeft = 0;

		return {
			root,
			handAnchor,
			emoteHeight: (headY + headRadius + (role === "chef" ? 0.3 : 0.2)) * appearance.height + 0.12,
			update(frameDtSec, pose) {
				idleTime += frameDtSec;
				moveBlend = approachValue(moveBlend, pose.moving && !pose.seated ? 1 : 0, frameDtSec);
				seatBlend = approachValue(seatBlend, pose.seated ? 1 : 0, frameDtSec);
				carryBlend = approachValue(carryBlend, pose.carrying ? 1 : 0, frameDtSec);
				eatBlend = approachValue(eatBlend, pose.eating ? 1 : 0, frameDtSec, 6);
				impatienceBlend = approachValue(impatienceBlend, Math.min(1, Math.max(0, pose.impatience ?? 0)), frameDtSec, 3);
				walkPhase = wrapPhase(walkPhase + frameDtSec * walkCyclesPerSec * Math.PI * 2 * (0.3 + 0.7 * moveBlend));
				const swing = Math.sin(walkPhase) * moveBlend;
				const standingStill = (1 - moveBlend) * (1 - seatBlend);
				// Нетерпение заметно только сильнее половины: спокойные клиенты стоят и сидят ровно.
				const fret = Math.max(0, impatienceBlend - 0.45) / 0.55;

				// Ноги: качаются при ходьбе, при сидении выдвинуты вперёд, нетерпеливый стоящий притопывает правой.
				const tap = -0.22 * Math.max(0, Math.sin(idleTime * 9)) * fret * standingStill;
				legLeft.rotation.x = swing * legSwing * (1 - seatBlend) + seatedLegAngle * seatBlend;
				legRight.rotation.x = -swing * legSwing * (1 - seatBlend) + seatedLegAngle * seatBlend + tap;

				// Руки: качаются при ходьбе, с предметом подняты вперёд, сидя лежат на столе, при еде по очереди тянутся ко рту,
				// у нетерпеливого стоящего упёрты в бока, у нетерпеливого сидящего правая постукивает по столу.
				workPhase = pose.working ? workPhase + frameDtSec * 16 : 0;
				const workBlend = pose.working ? 1 : 0;
				eatPhase = wrapPhase(eatPhase + frameDtSec * 3.4);
				const carryAngle = carryArmAngle * carryBlend;
				const restAngle = seatedArmAngle * seatBlend * (1 - carryBlend);
				const eatLeft = Math.max(0, Math.sin(eatPhase)) * eatBlend;
				const eatRight = Math.max(0, Math.sin(eatPhase + Math.PI)) * eatBlend;
				const akimbo = fret * standingStill * (1 - carryBlend);
				const drum = Math.sin(idleTime * 15) * 0.1 * fret * seatBlend * (1 - eatBlend);
				const walkLeft = -swing * armSwing * (1 - carryBlend);
				const walkRight = swing * armSwing * (1 - carryBlend);
				armLeft.rotation.x = walkLeft + carryAngle + restAngle - 0.75 * eatLeft * seatBlend + (workBlend ? -0.9 - carryAngle : 0) + 0.15 * akimbo;
				armRight.rotation.x = walkRight + carryAngle + restAngle - 0.75 * eatRight * seatBlend + drum + (workBlend ? -1.05 + Math.sin(workPhase) * 0.45 - carryAngle : 0) + 0.15 * akimbo;
				armLeft.rotation.z = 0.45 * eatLeft * seatBlend - 0.62 * akimbo + (workBlend ? 0.25 : 0);
				armRight.rotation.z = -0.45 * eatRight * seatBlend + 0.62 * akimbo - (workBlend ? 0.2 : 0);

				// Голова: спокойно оглядывается, нетерпеливый вертит головой чаще, при еде кивает к руке.
				const look = Math.sin(idleTime * 0.45 + idleOffset) * 0.3 * (1 - moveBlend) * (1 - workBlend);
				const fretLook = Math.sin(idleTime * 2.1 + idleOffset) * 0.45 * fret;
				head.rotation.y = look * (1 - eatBlend) + fretLook;
				head.rotation.x = 0.12 * (eatLeft + eatRight) + 0.1 * workBlend;
				head.rotation.z = Math.sin(idleTime * 0.7 + idleOffset) * 0.04 * (1 - moveBlend);

				// Тело: подскок на каждом шаге, крен, лёгкое опускание при сидении, дыхание.
				body.position.y = Math.abs(Math.sin(walkPhase)) * bodyBob * moveBlend - 0.03 * seatBlend;
				body.rotation.z = Math.sin(walkPhase) * bodyRoll * moveBlend + Math.sin(idleTime * 1.3 + idleOffset) * 0.025 * akimbo;
				torso.scale.y = 1 + Math.sin(idleTime * 2.3 + idleOffset) * 0.014;

				// Моргание: раз в 2-5 секунд глаза закрываются на десятую долю секунды.
				blinkTimer -= frameDtSec;
				if (blinkTimer <= 0) {
					blinkTimer = 2 + phaseRng.next() * 3;
					blinkLeft = 0.11;
				}
				blinkLeft = Math.max(0, blinkLeft - frameDtSec);
				eyes.scale.y = blinkLeft > 0 ? 0.12 : 1;
			},
			dispose() {
				ownGeometries.forEach((geometry) => geometry.dispose());
				ownGeometries.length = 0;
			},
		};
	}

	return {
		createCharacter,
		dispose() {
			templates.all.forEach((geometry) => geometry.dispose());
			shadowGeometry.dispose();
			material.dispose();
			shadowMaterial.dispose();
		},
	};
}
