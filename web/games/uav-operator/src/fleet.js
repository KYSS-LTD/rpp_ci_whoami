import * as THREE from 'three';
import { box, create_Propeller, cylinder, group, ring } from './models.js';

// Паспортные данные приведены в карточках. Тяга, сопротивление и реакция моторов подобраны для симулятора.
export const fleet = {
	cetus: {
		name: 'BETAFPV Cetus X', kind: 'Учебный микро-FPV',
		description: 'Маленький белый дрон с кольцами вокруг винтов. На нём удобно учиться пролетать в ворота и выравнивать дрон после поворота. На стики реагирует быстрее, чем камерный Mini, зато в тренажёре разгоняется мягче гоночного F5.',
		spec: '55 г по паспорту · база 95 мм · 2″ · до 5 мин',
		source: 'https://betafpv.com/products/cetus-x-brushless-quadcopter',
		mass: .079, maxSpeed: 13, maxThrust: 2.65, cells: 2, capacity: 450, peakCurrent: 15, cameraTilt: 12,
		agility: 1.05, motorResponse: 20, drag: .043, guards: true, width: .12, length: .13,
	},
	mini: {
		name: 'DJI Mini 4 Pro', kind: 'Компактный камерный дрон',
		description: 'Складные лучи, открытые винты и камера на подвесе. Выбирай его, если хочешь спокойно подлететь к цели, остановиться и сделать снимок. В стабилизации отпущенный стик тормозит дрон. Это хороший первый выбор для пляжа.',
		spec: '< 249 г со стандартной батареей · до 16 м/с · до 34 мин',
		source: 'https://dl.djicdn.com/downloads/DJI_Mini_4_Pro/20240627/DJI_Mini_4_Pro_User_Manual_EN.pdf',
		mass: .249, maxSpeed: 16, maxThrust: 5.6, cells: 2, capacity: 2590, peakCurrent: 16, cameraTilt: 2,
		agility: .72, motorResponse: 10, drag: .038, width: .373, length: .298,
	},
	avata: {
		name: 'DJI Avata 2', kind: 'Тяжёлый FPV с защитой',
		description: 'Широкий корпус и четыре тёмных кольца вокруг винтов. Он тяжелее Mini и дольше тормозит. Начни с широких поворотов и держи больше места перед препятствием. Защита винтов помогает пережить лёгкое касание.',
		spec: 'около 377 г · 185 × 212 × 64 мм · до 27 м/с в M · до 23 мин',
		source: 'https://dl.djicdn.com/downloads/DJI_Avata_2/UM/20250108/DJI_Avata_2_User_Manual_v1.0_en.pdf',
		mass: .377, maxSpeed: 27, maxThrust: 10.3, cells: 4, capacity: 2150, peakCurrent: 23, cameraTilt: 12,
		agility: .84, motorResponse: 9, drag: .021, guards: true, width: .212, length: .185,
	},
	nazgul: {
		name: 'iFlight Nazgul Evoque F5 V2', kind: 'Скоростной FPV для фристайла',
		description: 'Карбоновая рама, длинные открытые лучи и батарея сверху. Мощные моторы быстро подхватывают газ, а большой наклон сильно разгоняет дрон. На трассе заранее прицеливайся в ворота и тормози до поворота. ACRO пригодится, когда освоишь ANGLE.',
		spec: 'около 644 г с батареей 6S · база 225 мм (F5X) · 5″ · до 190 км/ч в ручном режиме',
		source: 'https://shop.iflight.com/index.php?product_id=2761&route=product%2Fproduct',
		mass: .644, maxSpeed: 190 / 3.6, maxThrust: 38, cells: 6, capacity: 1400, peakCurrent: 75, cameraTilt: 18,
		agility: 1.28, motorResponse: 19, drag: .012, width: .30, length: .29,
	},
	mach: {
		name: 'iFlight Mach R5 Sport 6S', kind: 'Гоночный FPV',
		description: 'У дрона тонкие лучи, компактный кожух и открытые винты. Он легче Nazgul и быстрее меняет направление. В узких воротах делай маленькие движения стиками, а полный газ оставляй для прямых участков трассы.',
		spec: 'около 525 г с батареей 6S (Canopy) · база 210 мм · 5″ · до 240 км/ч',
		source: 'https://shop.iflight.com/index.php?product_id=2919&route=product%2Fproduct',
		mass: .525, maxSpeed: 240 / 3.6, maxThrust: 46, cells: 6, capacity: 1400, peakCurrent: 82, cameraTilt: 23,
		agility: 1.46, motorResponse: 22, drag: .008, width: .276, length: .28,
	},
};

export function create_FleetModel(scene, key) {
	const kit = fleet[key];
	const drone = group(scene);
	const propellers = [];
	const colors = { cetus: 0xeeeeea, mini: 0xb7b9b2, avata: 0x363e42, nazgul: 0x242526, mach: 0x25282d };
	const shell = colors[key];
	const body = group(drone);
	const { width, length } = kit;
	const bodyWidth = width * (kit.guards ? .34 : .26);
	const bodyLength = length * (kit.guards ? .91 : .55);
	const batteryHeight = key === 'nazgul' ? .034 : length * .13;
	const rotorRadius = key === 'nazgul' || key === 'mach' ? .062 : width * .211;
	const rotorX = width / 2 - rotorRadius;
	const shellMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10),
		new THREE.MeshStandardMaterial({ color: shell, roughness: .56 }));
	shellMesh.scale.set(bodyWidth * .57, batteryHeight * .5, bodyLength * .51);
	shellMesh.position.y = .012;
	body.add(shellMesh);
	if (key === 'nazgul') {
		box(body, 0x3e413f, bodyWidth, .025, bodyLength, 0, .039);
		box(body, 0x90572f, bodyWidth * 1.03, .027, .014, 0, .043);
		cylinder(body, 0x29282a, .0025, .0025, .056, .012, .057, bodyLength * .42).rotation.x = .45;
	}
	if (key === 'mach') {
		box(body, 0x242324, bodyWidth * 1.13, .023, bodyLength * .94, 0, -.009, .017);
		box(body, 0x42464e, .022, .043, .048, 0, .037, .025).rotation.x = -.41;
		cylinder(body, 0x252324, .002, .0025, .065, 0, .043, .069).rotation.x = .57;
	}
	for (const side of [-1, 1]) {
		for (const end of [-1, 1]) {
			const x = side * rotorX * (key === 'mini' && end > 0 ? .84 : 1);
			const z = end * length * (kit.guards ? .24 : .28);
			const joint = new THREE.Vector3(side * bodyWidth * .22, .009, end * bodyLength * .20);
			const motor = new THREE.Vector3(x, .012, z);
			const arm = box(body, shell, length * (key === 'mini' || key === 'mach' ? .048 : .07), .009, joint.distanceTo(motor));
			arm.position.copy(joint).lerp(motor, .5);
			arm.lookAt(motor);
			cylinder(body, 0x24292b, rotorRadius * .29, rotorRadius * .31, .014, x, .015, z);
			if (kit.guards) {
				ring(body, shell, rotorRadius * 1.11, rotorRadius * .12, x, .018, z);
				ring(body, shell, rotorRadius * 1.11, rotorRadius * .09, x, .006, z);
			}
			const prop = create_Propeller(drone, x, .026, z, rotorRadius * .87, side * end > 0);
			prop.scale.y = rotorRadius / .62;
			propellers.push(prop);
			box(body, end < 0 ? 0x68bd77 : 0xc75c42, .007, .004, .006, x, .006, z);
		}
	}
	const camera = group(body, 0, key === 'mini' ? -.009 : .016, -bodyLength * .46);
	camera.rotation.x = THREE.MathUtils.degToRad(kit.cameraTilt);
	const lensSize = key === 'cetus' ? .005 : .011;
	box(camera, 0x383c3e, lensSize * 3, lensSize * 2.6, lensSize * 1.9);
	cylinder(camera, 0x101a21, lensSize, lensSize, .005, 0, 0, -lensSize).rotation.x = Math.PI / 2;
	cylinder(camera, 0x46748a, lensSize * .65, lensSize * .65, .002, 0, 0, -lensSize - .003).rotation.x = Math.PI / 2;
	return { drone, propellers, body };
}
