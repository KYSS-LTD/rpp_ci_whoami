// Проверка выполнимости seed эталонным ботом (задачи 8.5 и 8.6, design D11): бот проходит смену на seed, а затем проверяются
// условия спецификации cooking-levels и cooking-waiter: все клиенты обслужены до конца смены, терпение не истекало (с запасом),
// очередь не переполнялась, никто из персонажей не застревал надолго. Невыполнимый seed не попадает в список проверенных.
// Владелец: Opus-агент. Используется тестами и скриптом подбора seed.
import { SIM_STEP_SEC, type GameSnapshot, type LevelConfig } from "../contracts";
import { buildDaySchedule } from "../sim/customers/schedule";
import { createSimulation } from "../sim/simulation";
import { createBot, type BotStats } from "./bot";

// Запас терпения: бот ни разу не опускает долю терпения клиента ниже этого значения (иначе seed слишком "на пределе").
export const MIN_PATIENCE_MARGIN = 0.25;

// Запас по времени: смена бота заканчивается не позже чем за столько секунд до конца таймера.
export const MIN_TIME_MARGIN_SEC = 10;

// Порог застревания: движущийся персонаж не сдвигается дольше этого времени, секунды (навигация перестраивает путь раньше).
export const STUCK_THRESHOLD_SEC = 4;

// Скорость персонажа, меньше которой "движущийся" персонаж считается стоящим на месте, единиц мира в секунду.
const STUCK_MIN_SPEED = 0.1;

// Отчёт о проверке seed.
export interface SeedVerification {
	seed: number;
	ok: boolean;
	// Причины отказа (пусто, если seed подходит).
	problems: string[];
	completed: boolean;
	elapsedSec: number;
	served: number;
	total: number;
	maxQueueGroups: number;
	queueSlots: number;
	minPatienceRatio: number;
	// Наибольшее время, которое движущийся персонаж провёл без сдвига.
	maxStuckSec: number;
	stats: BotStats;
}

// Фазы клиента, в которых он обязан идти (стоять без движения в них значит застрять, даже если навигация уже сбросила путь).
const CUSTOMER_WALKING_PHASES: ReadonlySet<string> = new Set(["arriving", "walkingToTable", "leaving"]);

// Монитор застревания: следит по снимкам за официантами, которые движутся, и за клиентами, которые должны идти.
function createStuckMonitor(): { observe(snapshot: GameSnapshot): void; readonly maxStuckSec: number } {
	const records = new Map<string, { x: number; z: number; stuckSec: number }>();
	let maxStuckSec = 0;
	return {
		observe(snapshot: GameSnapshot): void {
			// shouldMove: персонаж обязан сейчас двигаться (официант с путём, клиент в фазе ходьбы).
			const characters = [
				...snapshot.waiters.map((waiter) => ({ id: waiter.id, position: waiter.position, shouldMove: waiter.moving })),
				...snapshot.customers.map((customer) => ({ id: customer.id, position: customer.position, shouldMove: customer.moving || CUSTOMER_WALKING_PHASES.has(customer.phase) })),
			];
			for (const character of characters) {
				const record = records.get(character.id);
				if (!record) {
					records.set(character.id, { x: character.position.x, z: character.position.z, stuckSec: 0 });
					continue;
				}
				const displacement = Math.hypot(character.position.x - record.x, character.position.z - record.z);
				if (character.shouldMove && displacement < STUCK_MIN_SPEED * SIM_STEP_SEC) {
					// Сдвиг за шаг меньше порога скорости: накапливаем время.
					record.stuckSec += SIM_STEP_SEC;
					maxStuckSec = Math.max(maxStuckSec, record.stuckSec);
				} else {
					record.stuckSec = 0;
				}
				record.x = character.position.x;
				record.z = character.position.z;
			}
		},
		get maxStuckSec(): number {
			return maxStuckSec;
		},
	};
}

// Проверяет seed: создаёт симуляцию на свежем уровне, ведёт бота до конца и оценивает итог.
export function verifySeed(createLevel: () => LevelConfig, seed: number): SeedVerification {
	const level = createLevel();
	const simulation = createSimulation({ level, seed });
	const monitor = createStuckMonitor();
	const bot = createBot(simulation, { onSnapshot: (snapshot) => monitor.observe(snapshot) });
	simulation.start();
	const maxSteps = Math.ceil((level.params.durationSec + 10) / SIM_STEP_SEC);
	for (let step = 0; step < maxSteps && simulation.getResult() === null; step += 1) {
		simulation.step(bot.nextInput());
		if (step % 600 === 0) {
			simulation.drainEvents();
		}
	}
	const snapshot = simulation.getSnapshot();
	const result = simulation.getResult();
	const problems: string[] = [];
	if (!result || !result.completed) {
		const reason = snapshot.failure ? `клиент ушёл (${snapshot.failure.place}, ${snapshot.failure.dish ?? "без блюда"})` : "не все клиенты обслужены к концу смены";
		problems.push(`смена не пройдена: ${reason}`);
	}
	if (snapshot.elapsedSec > level.params.durationSec - MIN_TIME_MARGIN_SEC) {
		problems.push(`смена закончилась слишком поздно: ${snapshot.elapsedSec.toFixed(1)} с из ${level.params.durationSec}`);
	}
	if (bot.stats.maxQueueGroups > level.queue.slots.length) {
		problems.push(`очередь переполнилась: ${bot.stats.maxQueueGroups} групп на ${level.queue.slots.length} слотов`);
	}
	if (bot.stats.minPatienceRatio < MIN_PATIENCE_MARGIN || bot.stats.minQueueRatio < MIN_PATIENCE_MARGIN) {
		problems.push(`терпение опускалось ниже запаса: за столом ${bot.stats.minPatienceRatio.toFixed(2)}, в очереди ${bot.stats.minQueueRatio.toFixed(2)}`);
	}
	if (monitor.maxStuckSec > STUCK_THRESHOLD_SEC) {
		problems.push(`персонаж стоял без движения ${monitor.maxStuckSec.toFixed(1)} с`);
	}
	return {
		seed,
		ok: problems.length === 0,
		problems,
		completed: result?.completed === true,
		elapsedSec: snapshot.elapsedSec,
		served: snapshot.servedCustomers,
		total: snapshot.totalCustomers,
		maxQueueGroups: bot.stats.maxQueueGroups,
		queueSlots: level.queue.slots.length,
		minPatienceRatio: Math.min(bot.stats.minPatienceRatio, bot.stats.minQueueRatio),
		maxStuckSec: monitor.maxStuckSec,
		stats: bot.stats,
	};
}

// Наименьшее число клиентов в расписании, чтобы seed годился для списка (иначе смена слишком пустая), по уровням.
export const MIN_SCHEDULE_CUSTOMERS: Record<LevelConfig["id"], number> = { easy: 6, medium: 9, hard: 14 };

// Отбирает seed для списка проверенных: бот проходит смену с запасом (verifySeed), расписание содержит все блюда меню и не
// короче MIN_SCHEDULE_CUSTOMERS. Перебор идёт по кандидатам, пока не наберётся wanted штук.
export function selectRepresentativeSeeds(createLevel: () => LevelConfig, candidates: readonly number[], wanted: number): number[] {
	const selected: number[] = [];
	for (const seed of candidates) {
		if (selected.length >= wanted) {
			break;
		}
		const level = createLevel();
		const schedule = buildDaySchedule(level, seed);
		const dishes = new Set(schedule.groups.flatMap((group) => group.members.map((member) => member.dish)));
		if (!level.params.menu.every((dish) => dishes.has(dish)) || schedule.totalCustomers < MIN_SCHEDULE_CUSTOMERS[level.id]) {
			continue;
		}
		if (verifySeed(createLevel, seed).ok) {
			selected.push(seed);
		}
	}
	return selected;
}

// Отбирает из кандидатов seed, которые проходят проверку, пока не наберётся wanted штук. Остальные отбрасываются.
export function findVerifiedSeeds(createLevel: () => LevelConfig, candidates: readonly number[], wanted: number): number[] {
	const verified: number[] = [];
	for (const seed of candidates) {
		if (verified.length >= wanted) {
			break;
		}
		if (verifySeed(createLevel, seed).ok) {
			verified.push(seed);
		}
	}
	return verified;
}
