// Персонажи сцены по снимку (задачи 6.4 и 6.6): повар (с предметом в руке и плавным доворотом), официанты (с блюдами) и клиенты.
// Позиции сглаживаются между кадрами, поворот идёт по кратчайшей дуге. Создание и удаление клиентов по появлению в снимке.
import { Group, type Object3D } from "three";
import type { CustomerSnapshot, DishId, GameSnapshot, WaiterSnapshot } from "../contracts";
import type { CharacterFactory, CharacterRig } from "./characters";
import { getItemSignature, type ItemVisualFactory } from "./items";
import { approachAngle, approachPosition } from "./smoothing";

// Скорости сглаживания (1/сек): позиция и поворот.
const positionRate = 38;
const chefYawRate = 16;
const npcYawRate = 12;

// Расстояние, дальше которого позиция переносится сразу (посадка клиента, появление).
const snapDistance = 1.2;

// Расстояние между блюдами, которые официант несёт стопкой (по высоте).
const carriedDishStep = 0.1;

// Персонаж в сцене с состоянием сглаживания.
interface ActorState {
	rig: CharacterRig;
	x: number;
	z: number;
	yaw: number;
	initialized: boolean;
	// Подпись предмета в руках: пересборка только при смене.
	heldSignature: string;
}

// Слой персонажей.
export interface ActorLayer {
	readonly root: Group;
	update(snapshot: GameSnapshot, frameDtSec: number): void;
	// Число клиентов на сцене (для тестов).
	getCustomerCount(): number;
	dispose(): void;
}

// Создаёт слой персонажей.
export function createActorLayer(characters: CharacterFactory, items: ItemVisualFactory): ActorLayer {
	const root = new Group();
	root.name = "actors";
	const waiterStates = new Map<string, ActorState>();
	const customerStates = new Map<string, ActorState>();
	let chefState: ActorState | null = null;

	function createState(rig: CharacterRig): ActorState {
		root.add(rig.root);
		return { rig, x: 0, z: 0, yaw: 0, initialized: false, heldSignature: "" };
	}

	// Сглаживает позицию и угол персонажа и применяет их к корню.
	function applyTransform(state: ActorState, position: { x: number; z: number }, yaw: number, frameDtSec: number, yawRate: number, snap: boolean): void {
		if (!state.initialized || snap) {
			state.x = position.x;
			state.z = position.z;
			state.yaw = yaw;
			state.initialized = true;
		} else {
			const next = approachPosition({ x: state.x, z: state.z }, position, frameDtSec, positionRate, snapDistance);
			state.x = next.x;
			state.z = next.z;
			state.yaw = approachAngle(state.yaw, yaw, frameDtSec, yawRate);
		}
		state.rig.root.position.set(state.x, 0, state.z);
		state.rig.root.rotation.y = state.yaw;
	}

	// Заменяет предмет в руках, если изменилась подпись.
	function setHeld(state: ActorState, signature: string, build: () => { object: Object3D; height: number } | null): void {
		if (state.heldSignature === signature) {
			return;
		}
		state.heldSignature = signature;
		for (const child of [...state.rig.handAnchor.children]) {
			state.rig.handAnchor.remove(child);
		}
		const visual = build();
		if (visual) {
			state.rig.handAnchor.add(visual.object);
		}
	}

	function updateChef(snapshot: GameSnapshot, frameDtSec: number): void {
		if (!chefState) {
			chefState = createState(characters.createCharacter("chef"));
		}
		const chef = snapshot.chef;
		applyTransform(chefState, chef.position, chef.yaw, frameDtSec, chefYawRate, false);
		const signature = getItemSignature(chef.hand);
		setHeld(chefState, signature, () => (chef.hand ? items.createItemVisual(chef.hand) : null));
		chefState.rig.update(frameDtSec, { moving: chef.moving, seated: false, carrying: chef.hand !== null, working: chef.working });
	}

	function buildCarried(carrying: readonly DishId[]): { object: Group; height: number } {
		const group = new Group();
		let height = 0;
		for (const dish of carrying) {
			const visual = items.createDishVisual(dish);
			visual.object.position.y = height;
			group.add(visual.object);
			height += carriedDishStep + 0.05;
		}
		return { object: group, height };
	}

	function updateWaiters(waiters: readonly WaiterSnapshot[], frameDtSec: number): void {
		const seen = new Set<string>();
		for (const waiter of waiters) {
			seen.add(waiter.id);
			let state = waiterStates.get(waiter.id);
			if (!state) {
				state = createState(characters.createCharacter("waiter"));
				waiterStates.set(waiter.id, state);
			}
			applyTransform(state, waiter.position, waiter.yaw, frameDtSec, npcYawRate, false);
			setHeld(state, waiter.carrying.join(","), () => (waiter.carrying.length > 0 ? buildCarried(waiter.carrying) : null));
			state.rig.update(frameDtSec, { moving: waiter.moving, seated: false, carrying: waiter.carrying.length > 0, working: false });
		}
		for (const [id, state] of waiterStates) {
			if (!seen.has(id)) {
				root.remove(state.rig.root);
				waiterStates.delete(id);
			}
		}
	}

	function updateCustomers(customers: readonly CustomerSnapshot[], frameDtSec: number): void {
		const seen = new Set<string>();
		for (const customer of customers) {
			seen.add(customer.id);
			let state = customerStates.get(customer.id);
			if (!state) {
				state = createState(characters.createCharacter("customer", customer.variant));
				customerStates.set(customer.id, state);
			}
			// Сидящий клиент переносится на стул мгновенно и без доворота: поза задаётся стулом.
			applyTransform(state, customer.position, customer.yaw, frameDtSec, npcYawRate, customer.isSeated);
			state.rig.update(frameDtSec, { moving: customer.moving, seated: customer.isSeated, carrying: false, working: false });
		}
		for (const [id, state] of customerStates) {
			if (!seen.has(id)) {
				root.remove(state.rig.root);
				customerStates.delete(id);
			}
		}
	}

	return {
		root,
		update(snapshot, frameDtSec) {
			updateChef(snapshot, frameDtSec);
			updateWaiters(snapshot.waiters, frameDtSec);
			updateCustomers(snapshot.customers, frameDtSec);
		},
		getCustomerCount() {
			return customerStates.size;
		},
		dispose() {
			root.clear();
			waiterStates.clear();
			customerStates.clear();
			chefState = null;
		},
	};
}
