// Персонажи из примитивов (задача 6.4): повар, официант и клиенты собираются из простых форм в цветах пака.
// Покачивание при ходьбе считается по синусу, предмет в руках крепится к точке перед персонажем.
// Единицы мира: рост персонажа около 1.0 (прилавок 0.5, стул 0.3 до сиденья), перед персонажа смотрит по +z (yaw = 0 к камере).
import {
	CircleGeometry,
	CylinderGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	SphereGeometry,
	BoxGeometry,
	type BufferGeometry,
	type Material,
	type Object3D,
} from "three";
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
	// Идёт ли рабочее действие (повар режет: руки двигаются вверх и вниз).
	working: boolean;
}

// Персонаж: корневой объект для позиции и yaw, анимация и точка крепления предмета.
export interface CharacterRig {
	readonly root: Group;
	// Точка перед персонажем, к которой крепится переносимый предмет (в единицах мира).
	readonly handAnchor: Group;
	// Продвигает анимацию на время кадра.
	update(frameDtSec: number, pose: CharacterPose): void;
}

// Фабрика персонажей с общими геометриями и материалами.
export interface CharacterFactory {
	createCharacter(role: CharacterRole, variant?: number): CharacterRig;
	dispose(): void;
}

// Размеры частей тела (единицы мира).
const legHeight = 0.26;
const legWidth = 0.1;
const torsoHeight = 0.36;
const headRadius = 0.15;
const armLength = 0.26;

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

// Поза сидения: ноги вперёд.
const seatedLegAngle = -1.45;

// Округляет число по модулю: общий помощник для фазы шага.
function wrapPhase(phase: number): number {
	return phase % (Math.PI * 2);
}

// Плавное приближение значения к цели за кадр (не зависит от частоты кадров).
function approachValue(current: number, target: number, frameDtSec: number): number {
	return current + (target - current) * (1 - Math.exp(-poseBlendRate * frameDtSec));
}

// Создаёт фабрику персонажей. Геометрии общие, материалы кэшируются по цвету. dispose освобождает всё.
export function createCharacterFactory(): CharacterFactory {
	const geometries: BufferGeometry[] = [];
	const materials = new Map<number, MeshStandardMaterial>();
	let shadowMaterial: MeshBasicMaterial | null = null;

	function track<T extends BufferGeometry>(geometry: T): T {
		geometries.push(geometry);
		return geometry;
	}

	function getMaterial(color: number): MeshStandardMaterial {
		let material = materials.get(color);
		if (!material) {
			material = new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 });
			materials.set(color, material);
		}
		return material;
	}

	// Общие геометрии. Ноги и руки смещены так, что точка вращения лежит в начале координат (бедро, плечо).
	const legGeometry = track(new BoxGeometry(legWidth, legHeight, 0.12).translate(0, -legHeight / 2, 0));
	const armGeometry = track(new CylinderGeometry(0.042, 0.042, armLength, 8).translate(0, -armLength / 2, 0));
	const handGeometry = track(new SphereGeometry(0.056, 10, 8));
	const torsoGeometry = track(new CylinderGeometry(0.17, 0.2, torsoHeight, 14));
	const headGeometry = track(new SphereGeometry(headRadius, 16, 12));
	const eyeGeometry = track(new SphereGeometry(0.024, 8, 6));
	const hatBandGeometry = track(new CylinderGeometry(0.125, 0.13, 0.1, 14));
	const hatPuffGeometry = track(new SphereGeometry(0.16, 14, 10));
	const hairCapGeometry = track(new SphereGeometry(headRadius * 1.08, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56));
	const hairBackGeometry = track(new SphereGeometry(headRadius * 1.1, 12, 8));
	const capGeometry = track(new CylinderGeometry(0.15, 0.16, 0.06, 14));
	const scarfGeometry = track(new CylinderGeometry(0.13, 0.15, 0.07, 12));
	const bowtieGeometry = track(new BoxGeometry(0.1, 0.045, 0.03));
	const shirtFrontGeometry = track(new BoxGeometry(0.14, 0.3, 0.02));
	const shadowGeometry = track(new CircleGeometry(0.3, 20).rotateX(-Math.PI / 2));

	function getShadowMaterial(): MeshBasicMaterial {
		if (!shadowMaterial) {
			shadowMaterial = new MeshBasicMaterial({ color: shadowColor, transparent: true, opacity: 0.22, depthWrite: false });
		}
		return shadowMaterial;
	}

	function addMesh(parent: Object3D, geometry: BufferGeometry, material: Material, x: number, y: number, z: number): Mesh {
		const mesh = new Mesh(geometry, material);
		mesh.position.set(x, y, z);
		parent.add(mesh);
		return mesh;
	}

	function createCharacter(role: CharacterRole, variant = 0): CharacterRig {
		const safeVariant = Math.abs(Math.round(variant));
		const skin = getMaterial(skinTones[(safeVariant * 3 + 1) % skinTones.length]);
		let shirtColor: number;
		let trousersColor: number;
		let shoesColor: number;
		if (role === "chef") {
			shirtColor = chefColors.coat;
			trousersColor = chefColors.trousers;
			shoesColor = chefColors.shoes;
		} else if (role === "waiter") {
			shirtColor = waiterColors.vest;
			trousersColor = waiterColors.trousers;
			shoesColor = waiterColors.shoes;
		} else {
			shirtColor = customerShirtColors[safeVariant % customerShirtColors.length];
			trousersColor = 0x3b4a5a;
			shoesColor = 0x2b3138;
		}

		const root = new Group();
		root.name = `character-${role}`;
		const shadow = new Mesh(shadowGeometry, getShadowMaterial());
		shadow.position.y = 0.012;
		root.add(shadow);

		// Тело поднимается на подскок и кренится при ходьбе.
		const body = new Group();
		root.add(body);

		// Ноги: пивот в бедре.
		const hipY = legHeight + 0.02;
		const legLeft = new Group();
		legLeft.position.set(-0.07, hipY, 0);
		const legRight = new Group();
		legRight.position.set(0.07, hipY, 0);
		for (const leg of [legLeft, legRight]) {
			addMesh(leg, legGeometry, getMaterial(trousersColor), 0, 0, 0);
			// Ботинок чуть выдаётся вперёд: ногу видно и в профиль.
			addMesh(leg, legGeometry, getMaterial(shoesColor), 0, 0, 0).scale.set(1.05, 0.22, 1.35);
			(leg.children[1] as Mesh).position.set(0, -legHeight + 0.03, 0.02);
			body.add(leg);
		}

		// Корпус.
		const torsoY = hipY + torsoHeight / 2 - 0.02;
		addMesh(body, torsoGeometry, getMaterial(shirtColor), 0, torsoY, 0);
		const shoulderY = hipY + torsoHeight - 0.06;

		// Руки: пивот в плече.
		const armLeft = new Group();
		armLeft.position.set(-0.22, shoulderY, 0);
		const armRight = new Group();
		armRight.position.set(0.22, shoulderY, 0);
		for (const arm of [armLeft, armRight]) {
			addMesh(arm, armGeometry, getMaterial(role === "chef" ? chefColors.coat : shirtColor), 0, 0, 0);
			addMesh(arm, handGeometry, skin, 0, -armLength, 0);
			body.add(arm);
		}

		// Голова и глаза (по ним видно, куда смотрит персонаж).
		const headY = hipY + torsoHeight + headRadius - 0.04;
		addMesh(body, headGeometry, skin, 0, headY, 0);
		const eyeMaterial = getMaterial(0x1b1b1b);
		addMesh(body, eyeGeometry, eyeMaterial, -0.055, headY + 0.015, headRadius * 0.9);
		addMesh(body, eyeGeometry, eyeMaterial, 0.055, headY + 0.015, headRadius * 0.9);

		// Особые детали по роли.
		if (role === "chef") {
			addMesh(body, scarfGeometry, getMaterial(chefColors.scarf), 0, hipY + torsoHeight - 0.03, 0);
			addMesh(body, hatBandGeometry, getMaterial(chefColors.hat), 0, headY + headRadius + 0.02, 0);
			addMesh(body, hatPuffGeometry, getMaterial(chefColors.hat), 0, headY + headRadius + 0.14, 0);
		} else if (role === "waiter") {
			addMesh(body, shirtFrontGeometry, getMaterial(waiterColors.shirt), 0, torsoY + 0.01, 0.18);
			addMesh(body, bowtieGeometry, getMaterial(waiterColors.bowtie), 0, hipY + torsoHeight - 0.06, 0.2);
			addMesh(body, hairCapGeometry, getMaterial(waiterColors.hair), 0, headY, 0);
		} else {
			const hairMaterial = getMaterial(hairColors[(safeVariant * 5 + 2) % hairColors.length]);
			const style = safeVariant % 3;
			if (style === 0) {
				addMesh(body, hairCapGeometry, hairMaterial, 0, headY, 0);
			} else if (style === 1) {
				addMesh(body, hairCapGeometry, hairMaterial, 0, headY, 0);
				addMesh(body, hairBackGeometry, hairMaterial, 0, headY - 0.02, -0.07);
			} else {
				addMesh(body, hairCapGeometry, getMaterial(customerShirtColors[(safeVariant + 3) % customerShirtColors.length]), 0, headY + 0.01, 0);
				addMesh(body, capGeometry, getMaterial(customerShirtColors[(safeVariant + 3) % customerShirtColors.length]), 0, headY + 0.05, 0.08).scale.set(0.9, 0.5, 0.6);
			}
		}

		// Точка крепления предмета: перед грудью.
		const handAnchor = new Group();
		handAnchor.name = "hand-anchor";
		handAnchor.position.set(0, hipY + torsoHeight * 0.55, 0.36);
		body.add(handAnchor);

		// Состояние анимации.
		let walkPhase = 0;
		let moveBlend = 0;
		let seatBlend = 0;
		let carryBlend = 0;
		let workPhase = 0;

		return {
			root,
			handAnchor,
			update(frameDtSec, pose) {
				moveBlend = approachValue(moveBlend, pose.moving && !pose.seated ? 1 : 0, frameDtSec);
				seatBlend = approachValue(seatBlend, pose.seated ? 1 : 0, frameDtSec);
				carryBlend = approachValue(carryBlend, pose.carrying ? 1 : 0, frameDtSec);
				walkPhase = wrapPhase(walkPhase + frameDtSec * walkCyclesPerSec * Math.PI * 2 * (0.3 + 0.7 * moveBlend));
				const swing = Math.sin(walkPhase) * moveBlend;

				// Ноги: качаются при ходьбе, при сидении выдвинуты вперёд.
				legLeft.rotation.x = swing * legSwing * (1 - seatBlend) + seatedLegAngle * seatBlend;
				legRight.rotation.x = -swing * legSwing * (1 - seatBlend) + seatedLegAngle * seatBlend;

				// Руки: качаются, с предметом подняты вперёд, при работе двигаются вверх и вниз.
				workPhase = pose.working ? workPhase + frameDtSec * 16 : 0;
				const workSwing = pose.working ? Math.sin(workPhase) * 0.35 : 0;
				const carryAngle = carryArmAngle * carryBlend;
				armLeft.rotation.x = (-swing * armSwing) * (1 - carryBlend) + carryAngle + workSwing;
				armRight.rotation.x = (swing * armSwing) * (1 - carryBlend) + carryAngle - workSwing;

				// Тело: подскок на каждом шаге, крен, лёгкое опускание при сидении.
				body.position.y = Math.abs(Math.sin(walkPhase)) * bodyBob * moveBlend - 0.03 * seatBlend;
				body.rotation.z = Math.sin(walkPhase) * bodyRoll * moveBlend;
			},
		};
	}

	return {
		createCharacter,
		dispose() {
			geometries.forEach((geometry) => geometry.dispose());
			materials.forEach((material) => material.dispose());
			shadowMaterial?.dispose();
			materials.clear();
		},
	};
}
