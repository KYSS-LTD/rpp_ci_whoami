// Эталонный бот (задача 8.4, design D11): жадный планировщик с идеальным движением по A*, проходит смену в симуляции без
// рендера и даёт нижнюю оценку времени. Нужен для проверки выполнимости уровней и калибровки баланса (8.5, 8.6).
//
// Устройство:
// - Работы: на каждый открытый заказ (статус waiting) без работы создаётся работа (Job): "довести блюдо до окна".
// - Макрос: цепочка операций (взять, положить, резать, ждать готовности). Бот выполняет один макрос за раз, между
//   макросами выбирает следующий жадно: сначала отнести готовое (пока не подгорело), потом запустить новую готовку, пока
//   ждёт готовки, готовит тарелку с булочкой на прилавке.
// - Движение: рабочая точка у станции (где встать и куда смотреть), путь A* по сетке бота (chefNav.ts), ввод это
//   moveVector к ближайшей точке пути, взгляд задаётся движением к станции, действие это actionPressed на один шаг.
// Бот читает только публичный снимок симуляции и события, внутренности модулей не трогает. Владелец: Opus-агент.
import {
	FACING_VECTORS,
	SIM_STEP_SEC,
	type ActionRejectReason,
	type CookRecipeId,
	type DishId,
	type GameSnapshot,
	type InputState,
	type OrderSnapshot,
	type ShiftResult,
	type Simulation,
	type StationConfig,
	type StationId,
	type StationKind,
	type StationSnapshot,
	type Vec2,
} from "../contracts";
import { createChefNavigator, type ChefNavigator, type WorkSpot } from "./chefNav";

// Расстояние до точки пути, при котором она считается достигнутой.
const WAYPOINT_REACHED_DISTANCE = 0.03;

// Расстояние до рабочей точки, при котором повар считается пришедшим.
const SPOT_REACHED_DISTANCE = 0.04;

// Длина вектора "поворота на месте": выше мёртвой зоны взгляда (0.2), ниже заметного движения.
const FACE_NUDGE_LENGTH = 0.3;

// Сколько шагов бот ждёт без продвижения по пути, прежде чем перепланировать путь.
const STUCK_STEPS = 45;

// Сколько попыток повернуться к станции допускается, прежде чем взять другую рабочую точку.
const MAX_FACE_ATTEMPTS = 8;

// Запас по времени при проверке подгорания и во время ожидания готовности, секунды.
const SAFETY_MARGIN_SEC = 1;

// Если готовка закончится не позже чем через столько секунд, работу можно уже относить.
const DELIVER_LOOKAHEAD_SEC = 2.5;

// Грубая оценка длительности действия бота, секунды.
const INTERACT_ESTIMATE_SEC = 0.1;

// Множитель к расстоянию по прямой для оценки пути.
const PATH_DETOUR_FACTOR = 1.3;

// Параметры бота.
export interface BotOptions {
	// Сколько работ может быть запущено одновременно (по умолчанию число плит и духовок).
	maxInFlight?: number;
	// Вызывается на каждом шаге со снимком, который бот уже получил (для мониторов в тестах, без второго getSnapshot).
	onSnapshot?: (snapshot: GameSnapshot) => void;
	// Отладочный журнал решений бота (выбор макроса, начало операций). Без него журнал не ведётся.
	trace?: (message: string) => void;
}

// Статистика прохода (для тестов и калибровки).
export interface BotStats {
	steps: number;
	deliveries: number;
	burnt: number;
	macroFailures: number;
	// Отказы действий по причинам.
	rejections: Partial<Record<ActionRejectReason, number>>;
	// Наибольшее число групп в очереди на улице за проход.
	maxQueueGroups: number;
	// Шаги, в которые бот стоял без дела.
	idleSteps: number;
	// Причины последних отказов с контекстом (для диагностики).
	failureLog: string[];
	// Секунды работы бота (без ожидания готовности и простоя) по блюдам: основа для калибровки трудоёмкости.
	busySecByDish: Partial<Record<DishId, number>>;
	// Секунды работы без привязки к блюду (уборка, остатки в руке).
	busySecOther: number;
	// Сколько блюд каждого вида доставлено в окно.
	deliveriesByDish: Partial<Record<DishId, number>>;
	// Задержки от заказа до подачи по блюдам, секунды.
	serviceLatencySecByDish: Partial<Record<DishId, number[]>>;
	// Наименьшая доля терпения за проход среди заказов за столом и среди групп в очереди (1: ни разу не ждали, 0: ушли).
	minPatienceRatio: number;
	minQueueRatio: number;
}

// Бот: на каждом шаге выдаёт ввод.
export interface Bot {
	nextInput(): InputState;
	readonly stats: BotStats;
}

// Операция макроса.
type Op =
	| { type: "interact"; station: StationId; waitFor?: "ready" | "windowSpace" }
	// Резка: удерживать рабочее действие, пока предмет на доске не станет нарезанным.
	| { type: "cut"; station: StationId };

// Макрос: имя, работа и цепочка операций.
interface Macro {
	name: "start" | "deliver" | "deliverWindowOnly" | "trash" | "clearCooker";
	jobId: number | null;
	ops: Op[];
}

// Работа: довести одно блюдо до окна.
interface Job {
	id: number;
	dish: DishId;
	component: CookRecipeId;
	started: boolean;
	cooker: StationId | null;
	// Прилавок, на котором стоит заготовленная тарелка с булочкой (для бургеров).
	counter: StationId | null;
}

// Какая готовка нужна блюду.
const COMPONENT_OF_DISH: Record<DishId, CookRecipeId> = { burger: "patty", steak: "friedSteak", ham: "ham", veggieBurger: "veggiePatty", stew: "stew" };

// Вид станции, где идёт готовка компонента.
const COOKER_KIND_OF_COMPONENT: Record<CookRecipeId, StationKind> = { patty: "stove", veggiePatty: "stove", friedSteak: "stove", ham: "oven", stew: "stove" };

// Нужно ли блюду добавлять булочку (бургеры собираются на прилавке с булочкой).
function needsBun(component: CookRecipeId): boolean {
	return component === "patty" || component === "veggiePatty";
}

// Создаёт бота для симуляции. Симуляция должна быть уже создана; start() вызывает runBot или вызывающий.
export function createBot(simulation: Simulation, options: BotOptions = {}): Bot {
	const level = simulation.level;
	const navigator: ChefNavigator = createChefNavigator(level, simulation.geometry);
	const playerParams = level.params.player;
	const kitchenParams = level.params.kitchen;
	const stationConfigs = new Map<StationId, StationConfig>(level.stations.map((station) => [station.id, station]));
	const stationsOfKind = (kind: StationKind): StationConfig[] => level.stations.filter((station) => station.kind === kind);
	const windowStation = stationsOfKind("servingWindow")[0];
	const plateStation = stationsOfKind("plateStack")[0];
	const trashStation = stationsOfKind("trash")[0];
	const cookerCount = stationsOfKind("oven").length + stationsOfKind("stove").length;
	const maxInFlight = options.maxInFlight ?? cookerCount;
	const windowCapacity = level.window.dishPoints.length;

	const stats: BotStats = {
		steps: 0,
		deliveries: 0,
		burnt: 0,
		macroFailures: 0,
		rejections: {},
		maxQueueGroups: 0,
		idleSteps: 0,
		failureLog: [],
		busySecByDish: {},
		busySecOther: 0,
		deliveriesByDish: {},
		serviceLatencySecByDish: {},
		minPatienceRatio: 1,
		minQueueRatio: 1,
	};
	// Время создания заказов для расчёта задержки подачи.
	const orderPlacedAtSec = new Map<string, number>();
	// Ожидание готовности или места в окне на этом шаге: не считается работой.
	let waitingThisStep = false;

	// Последний отказ действия, пришедший от кухни (проверяется на шаге после нажатия).
	let lastRejection: ActionRejectReason | null = null;
	simulation.subscribe((event) => {
		if (event.type === "actionRejected") {
			lastRejection = event.reason;
			stats.rejections[event.reason] = (stats.rejections[event.reason] ?? 0) + 1;
		} else if (event.type === "itemBurnt") {
			stats.burnt += 1;
		} else if (event.type === "orderPlaced") {
			orderPlacedAtSec.set(event.orderId, event.t);
		} else if (event.type === "dishServed") {
			const placedAt = orderPlacedAtSec.get(event.orderId);
			if (placedAt !== undefined) {
				(stats.serviceLatencySecByDish[event.dish] ??= []).push(event.t - placedAt);
			}
		}
	});

	// ------------------------------------------------------------------------
	// Состояние планировщика и исполнителя
	// ------------------------------------------------------------------------

	let nextJobId = 1;
	const jobs: Job[] = [];
	let current: Macro | null = null;
	let opIndex = 0;
	// Состояние выполнения операции: route (идёт к точке), face (поворачивается), act (действует), verify (проверка результата).
	let opPhase: "route" | "face" | "act" | "verify" = "route";
	let spot: WorkSpot | null = null;
	let path: Vec2[] = [];
	let faceAttempts = 0;
	let triedSpots = new Set<number>();
	// Для обнаружения застревания.
	let stuckSteps = 0;
	let lastPosition: Vec2 = { x: 0, z: 0 };

	const centerOf = (stationId: StationId): Vec2 => {
		const rect = (stationConfigs.get(stationId) as StationConfig).rect;
		return { x: rect.x + rect.width / 2, z: rect.z + rect.depth / 2 };
	};

	const idleInput = (): InputState => ({ moveVector: { x: 0, z: 0 }, actionPressed: false, actionHeld: false, workPressed: false, workHeld: false });

	// ------------------------------------------------------------------------
	// Планировщик
	// ------------------------------------------------------------------------

	// Станция по идентификатору из снимка.
	const stationIndex = (snapshot: GameSnapshot): Map<StationId, StationSnapshot> => new Map(snapshot.stations.map((station) => [station.id, station]));

	// Все открытые заказы в статусе waiting, самые срочные первыми.
	function listWaitingOrders(snapshot: GameSnapshot): OrderSnapshot[] {
		const waiting: OrderSnapshot[] = [];
		snapshot.tables.forEach((table) => table.orders.forEach((order) => order.status === "waiting" && waiting.push(order)));
		return waiting.sort((first, second) => first.patienceLeftSec - second.patienceLeftSec);
	}

	// Оценка длительности цепочки операций от точки from, секунды.
	function estimateSec(ops: readonly Op[], from: Vec2): number {
		let total = 0;
		let position = from;
		for (const op of ops) {
			const center = centerOf(op.station);
			total += (Math.hypot(center.x - position.x, center.z - position.z) * PATH_DETOUR_FACTOR) / playerParams.speed;
			total += op.type === "cut" ? kitchenParams.cutSec : INTERACT_ESTIMATE_SEC;
			position = center;
		}
		return total;
	}

	// Свободная станция вида: пустая в снимке и не зарезервированная работой. nearTo: выбрать ближайшую к точке.
	function findFreeStation(kind: StationKind, stations: Map<StationId, StationSnapshot>, nearTo: Vec2, reserved: ReadonlySet<StationId>): StationConfig | null {
		let best: StationConfig | null = null;
		let bestDistance = Infinity;
		for (const config of stationsOfKind(kind)) {
			const snapshot = stations.get(config.id);
			if (!snapshot || snapshot.phase !== "idle" || reserved.has(config.id)) {
				continue;
			}
			const center = centerOf(config.id);
			const distance = Math.hypot(center.x - nearTo.x, center.z - nearTo.z);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = config;
			}
		}
		return best;
	}

	// Ящик ингредиента.
	function findCrate(ingredient: string): StationConfig {
		const crate = level.stations.find((station) => station.kind === "crate" && station.ingredient === ingredient);
		if (!crate) {
			throw new Error(`у уровня ${level.id} нет ящика ${ingredient}`);
		}
		return crate;
	}

	// Цепочка "ящик, доска, резка, плита" для одного ингредиента.
	function chainOps(ingredient: string, boardId: StationId, cookerId: StationId): Op[] {
		return [
			{ type: "interact", station: findCrate(ingredient).id },
			{ type: "interact", station: boardId },
			{ type: "cut", station: boardId },
			{ type: "interact", station: boardId },
			{ type: "interact", station: cookerId },
		];
	}

	// Ингредиенты, которые нужно нарезать и положить в плиту для компонента.
	function ingredientsOf(component: CookRecipeId): string[] {
		switch (component) {
			case "patty":
				return ["steak"];
			case "veggiePatty":
				return ["potato", "carrot"];
			case "stew":
				return ["carrot", "potato", "onion"];
			case "ham":
			case "friedSteak":
				return [];
		}
	}

	// Макрос запуска готовки (и подготовки тарелки с булочкой для бургеров).
	function buildStartMacro(job: Job, snapshot: GameSnapshot, cooker: StationConfig, counter: StationConfig | null): Macro {
		const stations = stationIndex(snapshot);
		const ops: Op[] = [];
		const cookerCenter = centerOf(cooker.id);
		if (job.component === "stew") {
			// Кастрюля стоит на своей плите: снять, налить воду в раковине, вернуть на плиту и класть овощи прямо в неё.
			const tap = stationsOfKind("tap")[0];
			if (!tap) throw new Error("для рагу нужна раковина");
			ops.push({ type: "interact", station: cooker.id }, { type: "interact", station: tap.id }, { type: "interact", station: cooker.id });
			for (const ingredient of ingredientsOf(job.component)) {
				const board = findFreeStation("cuttingBoard", stations, cookerCenter, new Set());
				if (!board) throw new Error("нет свободной разделочной доски для рагу");
				ops.push(
					{ type: "interact", station: findCrate(ingredient).id },
					{ type: "interact", station: board.id },
					{ type: "cut", station: board.id },
					{ type: "interact", station: board.id },
					{ type: "interact", station: cooker.id },
				);
			}
		} else if (job.component === "ham" || job.component === "friedSteak") {
			// Окорок и жареный стейк не режутся: из ящика сразу на плиту.
			ops.push({ type: "interact", station: findCrate(job.component === "ham" ? "ham" : "steak").id }, { type: "interact", station: cooker.id });
		} else {
			for (const ingredient of ingredientsOf(job.component)) {
				const board = findFreeStation("cuttingBoard", stations, cookerCenter, new Set());
				if (!board) {
					throw new Error("нет свободной разделочной доски для запуска готовки");
				}
				ops.push(...chainOps(ingredient, board.id, cooker.id));
			}
		}
		if (counter && needsBun(job.component)) {
			ops.push(
				{ type: "interact", station: plateStation.id },
				{ type: "interact", station: counter.id },
				{ type: "interact", station: findCrate("bun").id },
				{ type: "interact", station: counter.id },
			);
		}
		return { name: "start", jobId: job.id, ops };
	}

	// Макрос доставки готового блюда в окно.
	function buildDeliverMacro(job: Job): Macro {
		const cooker = job.cooker as StationId;
		if (job.component === "stew") {
			return {
				name: "deliver",
				jobId: job.id,
				ops: [
					{ type: "interact", station: plateStation.id },
					{ type: "interact", station: cooker, waitFor: "ready" },
					{ type: "interact", station: windowStation.id, waitFor: "windowSpace" },
				],
			};
		}
		if (needsBun(job.component) && job.counter) {
			return {
				name: "deliver",
				jobId: job.id,
				ops: [
					{ type: "interact", station: job.counter },
					{ type: "interact", station: cooker, waitFor: "ready" },
					{ type: "interact", station: windowStation.id, waitFor: "windowSpace" },
				],
			};
		}
		if (needsBun(job.component)) {
			// Тарелка с булочкой не готовилась заранее: собираем на ходу (нужен свободный прилавок, выбирается при исполнении).
			const counter = stationsOfKind("counter")[0];
			return {
				name: "deliver",
				jobId: job.id,
				ops: [
					{ type: "interact", station: plateStation.id },
					{ type: "interact", station: cooker, waitFor: "ready" },
					{ type: "interact", station: counter.id },
					{ type: "interact", station: findCrate("bun").id },
					{ type: "interact", station: counter.id },
					{ type: "interact", station: counter.id },
					{ type: "interact", station: windowStation.id, waitFor: "windowSpace" },
				],
			};
		}
		return {
			name: "deliver",
			jobId: job.id,
			ops: [
				{ type: "interact", station: plateStation.id },
				{ type: "interact", station: cooker, waitFor: "ready" },
				{ type: "interact", station: windowStation.id, waitFor: "windowSpace" },
			],
		};
	}

	// Сколько секунд осталось до подгорания (Infinity, если готовка ещё не идёт).
	function secondsUntilBurn(cooker: StationSnapshot | undefined, component: CookRecipeId): number {
		if (!cooker) {
			return Infinity;
		}
		const timing = kitchenParams.cooking[component];
		if (cooker.phase === "ready") {
			return timing.burnSec === null ? Infinity : (1 - cooker.burnProgress) * timing.burnSec;
		}
		if (cooker.phase === "processing") {
			return timing.burnSec === null ? Infinity : (1 - cooker.progress) * timing.cookSec * kitchenParams.cookDurationFactor + timing.burnSec;
		}
		return Infinity;
	}

	// Сколько секунд осталось до готовности (0, если готово).
	function secondsUntilReady(cooker: StationSnapshot | undefined, component: CookRecipeId): number {
		if (!cooker) {
			return Infinity;
		}
		if (cooker.phase === "ready") {
			return 0;
		}
		if (cooker.phase === "processing") {
			return (1 - cooker.progress) * kitchenParams.cooking[component].cookSec * kitchenParams.cookDurationFactor;
		}
		return Infinity;
	}

	// Синхронизирует список работ со списком заказов: на каждый ожидающий заказ блюда должна быть работа.
	function syncJobs(snapshot: GameSnapshot): void {
		const waiting = listWaitingOrders(snapshot);
		for (const dish of level.params.menu) {
			const demand = waiting.filter((order) => order.dish === dish).length;
			const mine = jobs.filter((job) => job.dish === dish);
			for (let index = mine.length; index < demand; index += 1) {
				jobs.push({ id: nextJobId++, dish, component: COMPONENT_OF_DISH[dish], started: false, cooker: null, counter: null });
			}
			// Лишние незапущенные работы убираем (заказ ушёл из ожидающих: например, блюдо уже в окне).
			for (let index = mine.length - 1; index >= demand; index -= 1) {
				if (!mine[index].started) {
					jobs.splice(jobs.indexOf(mine[index]), 1);
				}
			}
		}
	}

	// Срочность работы: остаток терпения заказа, который она закроет (k-й по срочности заказ своего блюда).
	function urgencyOf(job: Job, snapshot: GameSnapshot): number {
		const orders = listWaitingOrders(snapshot).filter((order) => order.dish === job.dish);
		const position = jobs.filter((other) => other.dish === job.dish).indexOf(job);
		return (orders[Math.min(position, orders.length - 1)] ?? orders[0])?.patienceLeftSec ?? Infinity;
	}

	// Сколько порций рагу свободно для новых работ: порции готового или варящегося рагу минус уже занятые работами.
	function freePotPortions(pot: StationConfig, stations: Map<StationId, StationSnapshot>): number {
		const snapshot = stations.get(pot.id);
		// Плита без кастрюли жарит продукты: её готовка к рагу не относится.
		if (!snapshot || !snapshot.items.some((item) => item.type === "pot")) {
			return 0;
		}
		const claimed = jobs.filter((job) => job.cooker === pot.id).length;
		if (snapshot.phase === "processing") {
			return kitchenParams.stewPortionsPerBatch - claimed;
		}
		if (snapshot.phase === "ready") {
			return snapshot.portions - claimed;
		}
		return 0;
	}

	// Выбор следующего макроса.
	function planMacro(snapshot: GameSnapshot): Macro | null {
		const stations = stationIndex(snapshot);
		const chefPosition = snapshot.chef.position;

		// 1. В руке что-то осталось (после отказа или лишнее блюдо): блюдо несём в окно, остальное в урну.
		const hand = snapshot.chef.hand;
		if (hand) {
			if (hand.type === "assembly" && hand.plated && hand.dish !== null) {
				return { name: "deliverWindowOnly", jobId: null, ops: [{ type: "interact", station: windowStation.id, waitFor: "windowSpace" }] };
			}
			return { name: "trash", jobId: null, ops: [{ type: "interact", station: trashStation.id }] };
		}

		// 2. Работы, чья плита сгорела или опустела, возвращаются в начало (сгоревшее уберём, когда плита понадобится).
		for (const job of jobs) {
			if (job.started && job.cooker) {
				const cooker = stations.get(job.cooker);
				if (cooker && (cooker.phase === "burnt" || cooker.phase === "idle")) {
					job.started = false;
					job.cooker = null;
					job.counter = job.counter && stations.get(job.counter)?.phase === "holding" ? job.counter : null;
				}
			}
		}
		const owned = new Set(jobs.filter((job) => job.cooker).map((job) => job.cooker as StationId));
		const reservedCounters = new Set(jobs.filter((job) => job.counter).map((job) => job.counter as StationId));
		syncJobs(snapshot);

		// 3. Отнести готовое: работа запущена, плита готова или будет готова совсем скоро. Первой несём то, что раньше подгорит.
		let deliverJob: Job | null = null;
		let deliverSlack = Infinity;
		for (const job of jobs) {
			if (!job.started || !job.cooker) {
				continue;
			}
			const cooker = stations.get(job.cooker);
			if (secondsUntilReady(cooker, job.component) > DELIVER_LOOKAHEAD_SEC) {
				continue;
			}
			const slack = secondsUntilBurn(cooker, job.component);
			if (deliverJob === null || slack < deliverSlack) {
				deliverSlack = slack;
				deliverJob = job;
			}
		}
		if (deliverJob) {
			return buildDeliverMacro(deliverJob);
		}

		// Безопасно ли потратить время на макрос: пока он идёт, а потом бот разносит готовое по очереди срочности, ничего не подгорит.
		function isSafeToSpend(ops: readonly Op[], excludeJob: Job | null): boolean {
			const startedJobs = jobs
				.filter((other) => other !== excludeJob && other.started && other.cooker)
				.map((other) => ({ other, burnIn: secondsUntilBurn(stations.get(other.cooker as StationId), other.component) }))
				.filter((entry) => Number.isFinite(entry.burnIn))
				.sort((first, second) => first.burnIn - second.burnIn);
			let elapsedSec = estimateSec(ops, chefPosition);
			let from = ops.length > 0 ? centerOf(ops[ops.length - 1].station) : chefPosition;
			for (const entry of startedJobs) {
				elapsedSec += estimateSec(buildDeliverMacro(entry.other).ops, from);
				from = centerOf(windowStation.id);
				if (entry.burnIn < elapsedSec + SAFETY_MARGIN_SEC) {
					return false;
				}
			}
			return true;
		}

		// Занятая, но никому не нужная станция вида (остатки после сбоя, сгоревшее): макрос уборки или null.
		function planClearing(kind: StationKind): Macro | null {
			for (const config of stationsOfKind(kind)) {
				const station = stations.get(config.id);
				if (!station || owned.has(config.id) || reservedCounters.has(config.id)) {
					continue;
				}
				const hasPot = station.items.some((item) => item.type === "pot");
				const isLeftover = station.phase === "burnt" || (!hasPot && ((station.phase === "holding" && station.items.length > 0) || station.phase === "ready"));
				if (isLeftover) {
					const ops: Op[] = [{ type: "interact", station: config.id }, { type: "interact", station: trashStation.id }];
					return isSafeToSpend(ops, null) ? { name: "clearCooker", jobId: null, ops } : null;
				}
			}
			return null;
		}

		// Прилавок для заготовки тарелки: минимум пути "тарелки, прилавок, булочки, прилавок, плита, окно".
		function pickAssemblyCounter(cookerId: StationId, reserved: ReadonlySet<StationId>): StationConfig | null {
			const plates = centerOf(plateStation.id);
			const buns = centerOf(findCrate("bun").id);
			const cookerCenter = centerOf(cookerId);
			const windowCenter = centerOf(windowStation.id);
			const distance = (first: Vec2, second: Vec2): number => Math.hypot(first.x - second.x, first.z - second.z);
			let best: StationConfig | null = null;
			let bestCost = Infinity;
			for (const config of stationsOfKind("counter")) {
				const counter = stations.get(config.id);
				if (!counter || counter.phase !== "idle" || reserved.has(config.id)) {
					continue;
				}
				const center = centerOf(config.id);
				const cost = distance(plates, center) + 2 * distance(center, buns) + distance(center, cookerCenter) + distance(cookerCenter, windowCenter);
				if (cost < bestCost) {
					bestCost = cost;
					best = config;
				}
			}
			return best;
		}

		// 4. Запустить новую готовку для самой срочной работы, если хватает плит и ничего не подгорит за время запуска.
		const inFlight = jobs.filter((job) => job.started).length;
		if (inFlight >= maxInFlight) {
			return null;
		}
		const candidates = jobs.filter((job) => !job.started).sort((first, second) => urgencyOf(first, snapshot) - urgencyOf(second, snapshot));
		for (const job of candidates) {
			const reservedStations = new Set<StationId>([...owned, ...reservedCounters]);
			let macro: Macro | null = null;
			if (job.component === "stew") {
				const pot = stationsOfKind("stove").find((config) => freePotPortions(config, stations) > 0);
				if (pot) {
					// Порция уже варится или готова: работа занимает её без запуска.
					job.started = true;
					job.cooker = pot.id;
					return planMacro(snapshot);
				}
				const idlePot = stationsOfKind("stove").find((config) => {
					const station = stations.get(config.id);
					const pot = station?.items.find((item) => item.type === "pot");
					return pot?.type === "pot" && pot.portions === 0 && pot.contents.length === 0 && station?.phase === "holding" && !reservedStations.has(config.id);
				});
				if (!idlePot) {
					continue;
				}
				macro = buildStartMacro(job, snapshot, idlePot, null);
				job.cooker = idlePot.id;
			} else {
				const firstCrate = job.component === "ham" ? findCrate("ham") : job.component === "friedSteak" ? findCrate("steak") : findCrate(ingredientsOf(job.component)[0]);
				const cookerKind = COOKER_KIND_OF_COMPONENT[job.component];
				const cooker = findFreeStation(cookerKind, stations, centerOf(firstCrate.id), reservedStations);
				if (!cooker) {
					const clearing = planClearing(cookerKind);
					if (clearing) {
						return clearing;
					}
					continue;
				}
				let counter: StationConfig | null = null;
				if (needsBun(job.component)) {
					counter = pickAssemblyCounter(cooker.id, reservedStations);
					if (!counter) {
						const clearing = planClearing("counter");
						if (clearing) {
							return clearing;
						}
						continue;
					}
				}
				macro = buildStartMacro(job, snapshot, cooker, counter);
				job.cooker = cooker.id;
				job.counter = counter ? counter.id : null;
			}
			if (!isSafeToSpend(macro.ops, job)) {
				job.cooker = null;
				job.counter = null;
				return null;
			}
			macro.jobId = job.id;
			return macro;
		}
		return null;
	}

	// ------------------------------------------------------------------------
	// Исполнитель
	// ------------------------------------------------------------------------

	function trace(snapshot: GameSnapshot, message: string): void {
		options.trace?.(`t=${snapshot.elapsedSec.toFixed(1)} ${message}`);
	}

	function resetOpState(): void {
		opPhase = "route";
		spot = null;
		path = [];
		faceAttempts = 0;
		triedSpots = new Set<number>();
		stuckSteps = 0;
	}

	// Завершает макрос успехом: работа переходит в следующее состояние.
	function completeMacro(macro: Macro): void {
		const job = macro.jobId === null ? undefined : jobs.find((candidate) => candidate.id === macro.jobId);
		if (job && macro.name === "start") {
			job.started = true;
		} else if (job && macro.name === "deliver") {
			jobs.splice(jobs.indexOf(job), 1);
			stats.deliveries += 1;
			stats.deliveriesByDish[job.dish] = (stats.deliveriesByDish[job.dish] ?? 0) + 1;
		}
		current = null;
		opIndex = 0;
		resetOpState();
	}

	// Макрос сорвался: работа возвращается в начало, рука освобождается при следующем планировании.
	function failMacro(macro: Macro, reason: string, snapshot: GameSnapshot): void {
		stats.macroFailures += 1;
		const op = macro.ops[opIndex];
		if (stats.failureLog.length < 30) {
			stats.failureLog.push(`t=${snapshot.elapsedSec.toFixed(1)} макрос ${macro.name} операция ${opIndex} (${op?.type} ${op?.station}): ${reason}`);
		}
		const job = macro.jobId === null ? undefined : jobs.find((candidate) => candidate.id === macro.jobId);
		if (job) {
			job.started = false;
			job.cooker = null;
			job.counter = null;
		}
		current = null;
		opIndex = 0;
		resetOpState();
	}

	// Выбирает рабочую точку для операции: ближайшая по пути из ещё не пробованных.
	function chooseSpot(station: StationId, from: Vec2): WorkSpot | null {
		const spots = navigator.getWorkSpots(station);
		let best: WorkSpot | null = null;
		let bestIndex = -1;
		let bestLength = Infinity;
		spots.forEach((candidate, index) => {
			if (triedSpots.has(index)) {
				return;
			}
			const length = navigator.pathLength(from, candidate.position);
			if (length !== null && length < bestLength) {
				bestLength = length;
				best = candidate;
				bestIndex = index;
			}
		});
		if (best) {
			triedSpots.add(bestIndex);
		}
		return best;
	}

	// Ввод для движения к точке пути.
	function steerTowards(position: Vec2, waypoint: Vec2): InputState {
		const dx = waypoint.x - position.x;
		const dz = waypoint.z - position.z;
		const distance = Math.hypot(dx, dz);
		const maxStep = playerParams.speed * SIM_STEP_SEC;
		const scale = Math.min(1, distance / maxStep);
		return { moveVector: { x: (dx / distance) * scale, z: (dz / distance) * scale }, actionPressed: false, actionHeld: false, workPressed: false, workHeld: false };
	}

	// Исполняет текущую операцию макроса на одном шаге и возвращает ввод.
	function executeStep(macro: Macro, snapshot: GameSnapshot): InputState {
		const op = macro.ops[opIndex];
		const chef = snapshot.chef;
		const stations = stationIndex(snapshot);
		const station = stations.get(op.station);
		if (opPhase === "route" && spot === null) {
			trace(snapshot, `  операция ${opIndex} ${op.type} ${op.station} из (${chef.position.x.toFixed(1)}, ${chef.position.z.toFixed(1)})`);
		}

		// Проверка результата нажатия на предыдущем шаге.
		if (opPhase === "verify") {
			const rejection = lastRejection;
			lastRejection = null;
			if (rejection) {
				const hopeful = op.type === "interact" && op.waitFor !== undefined && (rejection === "nothingToTake" || rejection === "windowFull");
				if (hopeful) {
					opPhase = "act";
					waitingThisStep = true;
					return idleInput();
				}
				failMacro(macro, `отказ ${rejection}`, snapshot);
				return idleInput();
			}
			opIndex += 1;
			resetOpState();
			if (opIndex >= macro.ops.length) {
				completeMacro(macro);
			}
			return idleInput();
		}

		// Уже смотрим на нужную станцию: сразу действуем (например, несколько операций подряд на одной доске).
		if (opPhase === "route" && chef.target?.stationId === op.station && (op.type === "cut" || spot === null)) {
			opPhase = "act";
		}

		if (opPhase === "route") {
			if (!spot) {
				spot = chooseSpot(op.station, chef.position);
				if (!spot) {
					failMacro(macro, `нет рабочей точки, повар (${chef.position.x.toFixed(2)}, ${chef.position.z.toFixed(2)}), точек ${navigator.getWorkSpots(op.station).length}`, snapshot);
					return idleInput();
				}
				path = navigator.findPath(chef.position, spot.position) ?? [];
				stuckSteps = 0;
				lastPosition = chef.position;
			}
			// Дошли до точки?
			const toSpot = Math.hypot(spot.position.x - chef.position.x, spot.position.z - chef.position.z);
			if (toSpot <= SPOT_REACHED_DISTANCE) {
				opPhase = "face";
				faceAttempts = 0;
				return idleInput();
			}
			// Застряли: путь перестраивается.
			if (Math.hypot(chef.position.x - lastPosition.x, chef.position.z - lastPosition.z) < 0.002) {
				stuckSteps += 1;
				if (stuckSteps > STUCK_STEPS) {
					path = navigator.findPath(chef.position, spot.position) ?? [];
					stuckSteps = 0;
					if (path.length === 0) {
						spot = null;
					}
				}
			} else {
				stuckSteps = 0;
			}
			lastPosition = chef.position;
			while (path.length > 1 && Math.hypot(path[0].x - chef.position.x, path[0].z - chef.position.z) < WAYPOINT_REACHED_DISTANCE) {
				path.shift();
			}
			const targetSpot: WorkSpot | null = spot;
			if (!targetSpot) {
				return idleInput();
			}
			const waypoint = path.length > 0 ? path[0] : targetSpot.position;
			return steerTowards(chef.position, waypoint);
		}

		if (opPhase === "face") {
			const wanted = spot as WorkSpot;
			if (chef.facing === wanted.facing && chef.target?.stationId === op.station) {
				opPhase = "act";
				return idleInput();
			}
			faceAttempts += 1;
			if (faceAttempts > MAX_FACE_ATTEMPTS) {
				// Эта точка не даёт нужной цели: пробуем другую.
				spot = null;
				opPhase = "route";
				path = [];
				return idleInput();
			}
			const direction = FACING_VECTORS[wanted.facing];
			return { moveVector: { x: direction.x * FACE_NUDGE_LENGTH, z: direction.z * FACE_NUDGE_LENGTH }, actionPressed: false, actionHeld: false, workPressed: false, workHeld: false };
		}

		// Действие.
		if (op.type === "cut") {
			const board = station;
			const onBoard = board?.items[0];
			if (!board || !onBoard || onBoard.type !== "ingredient") {
				failMacro(macro, "на доске нет предмета для резки", snapshot);
				return idleInput();
			}
			if (onBoard.state === "chopped") {
				opIndex += 1;
				resetOpState();
				if (opIndex >= macro.ops.length) {
					completeMacro(macro);
				}
				return idleInput();
			}
			return { moveVector: { x: 0, z: 0 }, actionPressed: false, actionHeld: false, workPressed: false, workHeld: true };
		}
		// Ожидание условий перед нажатием.
		if (op.waitFor === "ready") {
			if (station?.phase === "burnt") {
				failMacro(macro, "сгорело до того, как забрали", snapshot);
				return idleInput();
			}
			if (station?.phase !== "ready") {
				waitingThisStep = true;
				return idleInput();
			}
		}
		if (op.waitFor === "windowSpace" && snapshot.windowDishes.length >= windowCapacity) {
			waitingThisStep = true;
			return idleInput();
		}
		lastRejection = null;
		opPhase = "verify";
		return { moveVector: { x: 0, z: 0 }, actionPressed: true, actionHeld: true, workPressed: false, workHeld: false };
	}

	return {
		stats,
		nextInput(): InputState {
			const snapshot = simulation.getSnapshot();
			options.onSnapshot?.(snapshot);
			stats.steps += 1;
			if (snapshot.phase !== "running") {
				return idleInput();
			}
			stats.maxQueueGroups = Math.max(stats.maxQueueGroups, snapshot.queue.length);
			snapshot.tables.forEach((table) => table.orders.forEach((order) => order.status !== "served" && (stats.minPatienceRatio = Math.min(stats.minPatienceRatio, order.patienceRatio))));
			snapshot.queue.forEach((group) => (stats.minQueueRatio = Math.min(stats.minQueueRatio, group.patienceRatio)));
			waitingThisStep = false;
			if (!current) {
				current = planMacro(snapshot);
				if (current) {
					trace(snapshot, `макрос ${current.name} работа ${current.jobId}: ${current.ops.map((op) => `${op.type}:${op.station}`).join(" ")}`);
				}
				opIndex = 0;
				resetOpState();
				if (!current) {
					stats.idleSteps += 1;
					return idleInput();
				}
			}
			const activeJobId = current.jobId;
			const activeJob = activeJobId === null ? undefined : jobs.find((candidate) => candidate.id === activeJobId);
			const input = executeStep(current, snapshot);
			if (!waitingThisStep) {
				const job = activeJob;
				if (job) {
					stats.busySecByDish[job.dish] = (stats.busySecByDish[job.dish] ?? 0) + SIM_STEP_SEC;
				} else {
					stats.busySecOther += SIM_STEP_SEC;
				}
			}
			return input;
		},
	};
}

// Результат прохода бота.
export interface BotRunResult {
	result: ShiftResult | null;
	snapshot: GameSnapshot;
	stats: BotStats;
	steps: number;
}

// Параметры прохода.
export interface BotRunOptions extends BotOptions {
	// Потолок числа шагов (по умолчанию с запасом на длительность смены).
	maxSteps?: number;
}

// Запускает смену и ведёт бота до конца (успех, провал или таймер). Симуляция должна быть в фазе ready.
export function runBot(simulation: Simulation, options: BotRunOptions = {}): BotRunResult {
	const bot = createBot(simulation, options);
	simulation.start();
	const maxSteps = options.maxSteps ?? Math.ceil((simulation.level.params.durationSec + 10) / SIM_STEP_SEC);
	let steps = 0;
	while (steps < maxSteps && simulation.getResult() === null) {
		simulation.step(bot.nextInput());
		steps += 1;
		// Накопитель событий для потребителей бот не использует: очищаем, чтобы он не рос.
		if (steps % 600 === 0) {
			simulation.drainEvents();
		}
	}
	return { result: simulation.getResult(), snapshot: simulation.getSnapshot(), stats: bot.stats, steps };
}
