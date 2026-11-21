// Смена (задача 5.6, design D12): фазы ready -> running -> failed или finished, закрытие потока за flowCloseBeforeEndSec до
// конца, провал при уходе клиента, досрочное и обычное завершение, правило completed, очки и максимум.
// Смена подписана на шину: dishServed (очки и счётчик обслуженных), patienceExpired (провал). Часы двигает Simulation:
// смена только читает clock.nowSec, который с начала смены равен прошедшему времени (в фазе ready часы стоят на нуле).
// Реализует Shift и ShiftFactory из contracts.ts. Владелец: SONNET-1.
import type { FailureInfo, OrderId, Shift, ShiftDeps, ShiftEndReason, ShiftPhase, ShiftResult, ShiftSnapshot } from "../../contracts";

// Допуск при сравнении времени (накопленная погрешность вещественных чисел).
const TIME_EPSILON_SEC = 1e-9;

// Создаёт смену в фазе ready. maxScore известен сразу из расписания дня и не меняется.
export function createShift(deps: ShiftDeps): Shift {
	const { level, schedule, clock, bus } = deps;
	const durationSec = level.params.durationSec;
	// Момент закрытия потока: с него новые гости не приходят и показывается баннер.
	const flowCloseAtSec = durationSec - level.params.schedule.flowCloseBeforeEndSec;
	const maxScore = schedule.maxScore;
	if (!(maxScore > 0)) {
		throw new RangeError("createShift: maxScore расписания должен быть больше 0");
	}

	let phase: ShiftPhase = "ready";
	let flowClosed = false;
	let score = 0;
	let servedCustomers = 0;
	let failure: FailureInfo | null = null;
	let result: ShiftResult | null = null;
	// Время, на котором смена остановилась (завершение или провал): после него таймер в снимке не идёт.
	let frozenElapsedSec: number | null = null;
	// Подачи, уже учтённые в очках: повторное событие по тому же заказу игнорируется.
	const countedOrders = new Set<OrderId>();

	// Прошедшее время смены, секунды, не больше длительности.
	function getElapsedSec(): number {
		const elapsedSec = frozenElapsedSec ?? clock.nowSec;
		return Math.min(durationSec, Math.max(0, elapsedSec));
	}

	// Очки в допустимых границах итога: 0 <= score <= maxScore.
	function getClampedScore(): number {
		return Math.min(maxScore, Math.max(0, score));
	}

	// Завершает смену успешно или по времени. Событие итога и смена фазы уходят в шину.
	function finish(reason: ShiftEndReason, completed: boolean): void {
		// По таймеру время замораживается ровно на длительности смены: накопленные шагами часы могут не дойти до неё на 1e-12,
		// и тогда HUD показал бы лишнюю секунду. В остальных случаях это момент события.
		frozenElapsedSec = reason === "timeUp" ? durationSec : clock.nowSec;
		result = { completed, score: getClampedScore(), maxScore, reason };
		phase = "finished";
		bus.emit({ type: "shiftFinished", result });
		bus.emit({ type: "phaseChanged", phase });
	}

	// Проваливает смену: клиент ушёл. Симуляция после этого замирает (это делает Simulation по фазе).
	function fail(info: FailureInfo): void {
		frozenElapsedSec = clock.nowSec;
		failure = info;
		result = { completed: false, score: getClampedScore(), maxScore, reason: "failed" };
		phase = "failed";
		bus.emit({ type: "shiftFailed", failure: info, result });
		bus.emit({ type: "phaseChanged", phase });
	}

	// Подписка на шину: очки и провал. События вне фазы running (до старта, после конца) не учитываются.
	bus.subscribe((event) => {
		if (phase !== "running") {
			return;
		}
		if (event.type === "dishServed") {
			if (countedOrders.has(event.orderId)) {
				return;
			}
			countedOrders.add(event.orderId);
			servedCustomers += 1;
			score += event.price + event.tip;
		} else if (event.type === "patienceExpired") {
			fail(event.failure);
		}
	});

	return {
		start(): void {
			if (phase !== "ready") {
				return;
			}
			phase = "running";
			bus.emit({ type: "phaseChanged", phase });
		},

		step(): void {
			if (phase !== "running") {
				return;
			}
			const elapsedSec = clock.nowSec;
			// Закрытие потока: один раз, за flowCloseBeforeEndSec до конца.
			if (!flowClosed && elapsedSec + TIME_EPSILON_SEC >= flowCloseAtSec) {
				flowClosed = true;
				bus.emit({ type: "flowClosed" });
			}
			// Все клиенты дня обслужены: досрочный конец с completed = true. Доедать не обязательно.
			if (servedCustomers >= schedule.totalCustomers) {
				finish("allServed", true);
				return;
			}
			// Таймер дошёл до нуля, а кто-то из клиентов дня не получил блюдо.
			if (elapsedSec + TIME_EPSILON_SEC >= durationSec) {
				finish("timeUp", false);
			}
		},

		getSnapshot(): ShiftSnapshot {
			const elapsedSec = getElapsedSec();
			return {
				phase,
				durationSec,
				elapsedSec,
				timeLeftSec: Math.max(0, durationSec - elapsedSec),
				flowClosed,
				score: getClampedScore(),
				maxScore,
				servedCustomers,
				totalCustomers: schedule.totalCustomers,
				failure,
				result,
			};
		},

		getResult(): ShiftResult | null {
			return result;
		},
	};
}
