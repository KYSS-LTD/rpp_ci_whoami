// Персонажи сцены по снимку (задачи 6.4 и 6.6): повар (с предметом в руке и плавным доворотом), официанты (с блюдами) и клиенты.
// Позиции сглаживаются между кадрами, поворот идёт по кратчайшей дуге. Создание и удаление клиентов по появлению в снимке.
// Внешность клиента задаётся вариантом из снимка и стабильным хэшем его идентификатора. Над клиентами показываются значки:
// знак раздражения, когда терпение на исходе, и всплывающие сердечки, пока клиент ест.
import { Group, Sprite, SpriteMaterial, type Object3D, type Texture } from "three";
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

// Доля терпения, ниже которой над клиентом появляется знак раздражения.
const angryPatienceRatio = 0.3;

// Размер значков эмоций в мире.
const emoteSize = 0.27;

// Значки эмоций (текстуры с canvas; без них значков нет).
export interface EmoteTextures {
	heart: Texture | null;
	angry: Texture | null;
}

// Значок над персонажем: свой материал (прозрачность меняется независимо), общая текстура.
interface EmoteState {
	sprite: Sprite;
	material: SpriteMaterial;
	kind: "heart" | "angry";
	// Время жизни всплывающего сердечка (секунды, считается вниз) и пауза до следующего.
	lifeSec: number;
	cooldownSec: number;
}

// Персонаж в сцене с состоянием сглаживания.
interface ActorState {
	rig: CharacterRig;
	x: number;
	z: number;
	yaw: number;
	initialized: boolean;
	// Подпись предмета в руках: пересборка только при смене.
	heldSignature: string;
	emote: EmoteState | null;
}

// Слой персонажей.
export interface ActorLayer {
	readonly root: Group;
	update(snapshot: GameSnapshot, frameDtSec: number): void;
	// Число клиентов на сцене (для тестов).
	getCustomerCount(): number;
	dispose(): void;
}

// Стабильный хэш строки (FNV-1a, 32 бита): из идентификатора клиента получается seed внешности.
export function hashString(text: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

// Создаёт слой персонажей.
export function createActorLayer(characters: CharacterFactory, items: ItemVisualFactory, emotes: EmoteTextures = { heart: null, angry: null }): ActorLayer {
	const root = new Group();
	root.name = "actors";
	const waiterStates = new Map<string, ActorState>();
	const customerStates = new Map<string, ActorState>();
	let chefState: ActorState | null = null;
	let timeSec = 0;

	function createState(rig: CharacterRig): ActorState {
		root.add(rig.root);
		return { rig, x: 0, z: 0, yaw: 0, initialized: false, heldSignature: "", emote: null };
	}

	// Убирает персонажа со сцены и освобождает его геометрию и значок.
	function removeState(state: ActorState): void {
		root.remove(state.rig.root);
		state.rig.dispose();
		state.emote?.material.dispose();
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

	// Тарелку в руках приподнимаем на половину её высоты, иначе у стола она утопает в столешнице.
	function liftPlate(visual: { object: Object3D; height: number }): { object: Object3D; height: number } {
		visual.object.position.y += items.getPlateHeight() * 0.5;
		return visual;
	}

	// Значок нужного вида над персонажем (создаётся при первой нужде). null, если текстуры нет.
	function ensureEmote(state: ActorState, kind: "heart" | "angry"): EmoteState | null {
		const texture = kind === "heart" ? emotes.heart : emotes.angry;
		if (!texture) {
			return null;
		}
		if (state.emote && state.emote.kind === kind) {
			return state.emote;
		}
		if (state.emote) {
			state.rig.root.remove(state.emote.sprite);
			state.emote.material.dispose();
		}
		const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
		const sprite = new Sprite(material);
		sprite.scale.setScalar(emoteSize);
		sprite.renderOrder = 12;
		sprite.visible = false;
		state.rig.root.add(sprite);
		state.emote = { sprite, material, kind, lifeSec: 0, cooldownSec: 0.6 + Math.random() * 2 };
		return state.emote;
	}

	// Значки клиента: раздражение при малом терпении, сердечки во время еды. Сидящий клиент повёрнут, но значок висит над головой.
	function updateEmote(state: ActorState, customer: CustomerSnapshot, patienceRatio: number | null, frameDtSec: number): void {
		const baseY = state.rig.emoteHeight - (customer.isSeated ? 0.12 : 0);
		if (customer.phase === "eating") {
			const emote = ensureEmote(state, "heart");
			if (!emote) {
				return;
			}
			if (emote.lifeSec > 0) {
				emote.lifeSec -= frameDtSec;
				const progress = 1 - Math.max(0, emote.lifeSec) / 1.3;
				emote.sprite.visible = true;
				emote.sprite.position.set(Math.sin(progress * 6) * 0.04, baseY + progress * 0.35, 0);
				emote.sprite.scale.setScalar(emoteSize * (0.6 + 0.4 * Math.min(1, progress * 4)));
				emote.material.opacity = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
			} else {
				emote.sprite.visible = false;
				emote.cooldownSec -= frameDtSec;
				if (emote.cooldownSec <= 0) {
					emote.lifeSec = 1.3;
					emote.cooldownSec = 2.2 + Math.random() * 2.5;
				}
			}
			return;
		}
		if (patienceRatio !== null && patienceRatio < angryPatienceRatio && customer.phase !== "leaving") {
			const emote = ensureEmote(state, "angry");
			if (!emote) {
				return;
			}
			// Пульсирует тем чаще, чем меньше терпения.
			const urgency = 1 - patienceRatio / angryPatienceRatio;
			emote.sprite.visible = true;
			emote.material.opacity = 1;
			emote.sprite.position.set(0, baseY + Math.abs(Math.sin(timeSec * (5 + urgency * 5))) * 0.04, 0);
			emote.sprite.scale.setScalar(emoteSize * (0.9 + 0.12 * Math.sin(timeSec * (8 + urgency * 6))));
			return;
		}
		if (state.emote) {
			state.emote.sprite.visible = false;
		}
	}

	function updateChef(snapshot: GameSnapshot, frameDtSec: number): void {
		if (!chefState) {
			chefState = createState(characters.createCharacter("chef"));
		}
		const chef = snapshot.chef;
		applyTransform(chefState, chef.position, chef.yaw, frameDtSec, chefYawRate, false);
		const signature = getItemSignature(chef.hand);
		setHeld(chefState, signature, () => {
			const hand = chef.hand;
			if (!hand) {
				return null;
			}
			const visual = items.createItemVisual(hand);
			return hand.type === "assembly" && hand.plated ? liftPlate(visual) : visual;
		});
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
		waiters.forEach((waiter, index) => {
			seen.add(waiter.id);
			let state = waiterStates.get(waiter.id);
			if (!state) {
				state = createState(characters.createCharacter("waiter", index));
				waiterStates.set(waiter.id, state);
			}
			applyTransform(state, waiter.position, waiter.yaw, frameDtSec, npcYawRate, false);
			setHeld(state, waiter.carrying.join(","), () => (waiter.carrying.length > 0 ? liftPlate(buildCarried(waiter.carrying)) : null));
			state.rig.update(frameDtSec, { moving: waiter.moving, seated: false, carrying: waiter.carrying.length > 0, working: false });
		});
		for (const [id, state] of waiterStates) {
			if (!seen.has(id)) {
				removeState(state);
				waiterStates.delete(id);
			}
		}
	}

	// Терпение каждого клиента: за столом из его заказа (пока блюдо не подано), в очереди из терпения группы.
	function collectPatience(snapshot: GameSnapshot): Map<string, number> {
		const patience = new Map<string, number>();
		for (const table of snapshot.tables) {
			for (const order of table.orders) {
				if (order.status !== "served") {
					patience.set(order.customerId, order.patienceRatio);
				}
			}
		}
		const queueByGroup = new Map(snapshot.queue.map((group) => [group.groupId, group.patienceRatio]));
		for (const customer of snapshot.customers) {
			if (customer.phase === "queued" && queueByGroup.has(customer.groupId)) {
				patience.set(customer.id, queueByGroup.get(customer.groupId) ?? 1);
			}
		}
		return patience;
	}

	function updateCustomers(snapshot: GameSnapshot, frameDtSec: number): void {
		const seen = new Set<string>();
		const patience = collectPatience(snapshot);
		for (const customer of snapshot.customers) {
			seen.add(customer.id);
			let state = customerStates.get(customer.id);
			if (!state) {
				state = createState(characters.createCharacter("customer", customer.variant, hashString(customer.id)));
				customerStates.set(customer.id, state);
			}
			// Сидящий клиент переносится на стул мгновенно и без доворота: поза задаётся стулом.
			applyTransform(state, customer.position, customer.yaw, frameDtSec, npcYawRate, customer.isSeated);
			const patienceRatio = patience.get(customer.id) ?? null;
			const eating = customer.phase === "eating";
			state.rig.update(frameDtSec, {
				moving: customer.moving,
				seated: customer.isSeated,
				carrying: false,
				working: false,
				eating,
				impatience: patienceRatio === null || eating ? 0 : 1 - patienceRatio,
			});
			updateEmote(state, customer, patienceRatio, frameDtSec);
		}
		for (const [id, state] of customerStates) {
			if (!seen.has(id)) {
				removeState(state);
				customerStates.delete(id);
			}
		}
	}

	return {
		root,
		update(snapshot, frameDtSec) {
			timeSec += frameDtSec;
			updateChef(snapshot, frameDtSec);
			updateWaiters(snapshot.waiters, frameDtSec);
			updateCustomers(snapshot, frameDtSec);
		},
		getCustomerCount() {
			return customerStates.size;
		},
		dispose() {
			customerStates.forEach((state) => removeState(state));
			waiterStates.forEach((state) => removeState(state));
			if (chefState) {
				removeState(chefState);
			}
			root.clear();
			waiterStates.clear();
			customerStates.clear();
			chefState = null;
		},
	};
}
