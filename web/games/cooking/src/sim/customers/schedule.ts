// Расписание дня (задачи 5.1 и 5.2, design D7): по seed строится полный список групп клиентов: время прихода, размер группы
// от 1 до 4 и блюдо каждого члена из меню уровня. Расписание известно до начала смены и не меняется. Нагрузка ограничена
// "бюджетом работы": в любом окне WorkWindowSec суммарная трудоёмкость заказов не больше доли пропускной способности бота.
// Контракт: DaySchedule и DayScheduleFactory в contracts.ts. Все числа баланса лежат в LevelParams. Владелец: SONNET-1.
import type { DaySchedule, DishId, LevelConfig, ScheduledCustomer, ScheduledGroup } from "../../contracts";
import { createRng } from "../core/rng";

// Сколько вариантов внешности клиента выдаёт расписание (индекс 0..N-1). Рендер берёт индекс по модулю своей палитры.
export const CUSTOMER_VARIANT_COUNT = 8;

// Технический зазор в секундах: группа, отложенная из-за бюджета, приходит строго после выхода раннего прихода из окна,
// без зависимости от погрешности вещественных чисел.
const WINDOW_EDGE_MARGIN_SEC = 0.001;

// Допуск при сравнении нагрузки с бюджетом.
const LOAD_EPSILON = 1e-9;

// Приход в расписании в виде, удобном для расчёта нагрузки.
export interface ScheduleArrival {
	timeSec: number;
	// Суммарная трудоёмкость заказов, пришедших в этот момент (одной группы).
	effort: number;
}

// Наибольшая нагрузка в скользящем окне: максимум по окнам [s, s + windowSec), начинающимся в момент одного из приходов
// (так окно захватывает наибольшее число приходов), сумма трудоёмкости всех приходов внутри окна.
export function computeMaxWindowLoad(arrivals: readonly ScheduleArrival[], windowSec: number): number {
	let maxLoad = 0;
	arrivals.forEach((start) => {
		let load = 0;
		arrivals.forEach((arrival) => {
			if (arrival.timeSec >= start.timeSec && arrival.timeSec < start.timeSec + windowSec) {
				load += arrival.effort;
			}
		});
		maxLoad = Math.max(maxLoad, load);
	});
	return maxLoad;
}

// Трудоёмкость группы блюд.
function sumEffort(dishes: readonly DishId[], effortOf: (dish: DishId) => number): number {
	return dishes.reduce((total, dish) => total + effortOf(dish), 0);
}

// Строит расписание дня по seed. Одинаковые уровень и seed дают одинаковое расписание.
export function buildDaySchedule(level: LevelConfig, seed: number): DaySchedule {
	const { params } = level;
	const scheduleParams = params.schedule;
	if (params.menu.length === 0) {
		throw new RangeError("buildDaySchedule: меню уровня пусто");
	}
	const rng = createRng(seed);
	const effortOf = (dish: DishId): number => params.dishes[dish].effort;
	const lastArrivalSec = params.durationSec - scheduleParams.flowCloseBeforeEndSec;

	// Размер группы не больше числа мест самого большого стола и не больше длины таблицы весов.
	const largestTableSeats = level.tables.reduce((largest, table) => Math.max(largest, table.seats.length), 0);
	const maxGroupSize = largestTableSeats > 0 ? Math.min(scheduleParams.groupSizeWeights.length, largestTableSeats) : scheduleParams.groupSizeWeights.length;
	const sizeWeights = scheduleParams.groupSizeWeights.slice(0, maxGroupSize);

	// Бюджет работы в окне, секунды трудоёмкости.
	const budget = scheduleParams.workBudgetShare * scheduleParams.botCapacity * scheduleParams.workWindowSec;

	const groups: ScheduledGroup[] = [];
	const arrivals: ScheduleArrival[] = [];
	let totalCustomers = 0;
	let maxScore = 0;
	let candidateSec = scheduleParams.firstArrivalSec;

	while (candidateSec <= lastArrivalSec) {
		const size = rng.weightedIndex(sizeWeights) + 1;
		// Состав и внешность бросаются на полный размер группы, затем группа урезается под бюджет: так число
		// обращений к генератору не зависит от бюджета и расписания разных настроек остаются сопоставимыми.
		const rolledDishes: DishId[] = Array.from({ length: size }, () => rng.pick(params.menu));
		const rolledVariants: number[] = Array.from({ length: size }, () => rng.nextInt(0, CUSTOMER_VARIANT_COUNT - 1));

		// Одна группа сама по себе не должна превышать бюджет окна: лишние члены не приходят.
		let memberCount = size;
		while (memberCount > 0 && sumEffort(rolledDishes.slice(0, memberCount), effortOf) > budget + LOAD_EPSILON) {
			memberCount -= 1;
		}
		if (memberCount === 0) {
			throw new RangeError("buildDaySchedule: бюджет работы меньше трудоёмкости одного блюда, расписание построить нельзя");
		}
		const dishes = rolledDishes.slice(0, memberCount);
		const groupEffort = sumEffort(dishes, effortOf);

		// Откладываем приход, пока в любом окне, захватывающем его, нагрузка превышает бюджет.
		let arrivalSec = candidateSec;
		let suffixEffort = arrivals.reduce((total, arrival) => total + arrival.effort, 0);
		for (const earlier of arrivals) {
			if (arrivalSec < earlier.timeSec + scheduleParams.workWindowSec && suffixEffort + groupEffort > budget + LOAD_EPSILON) {
				arrivalSec = earlier.timeSec + scheduleParams.workWindowSec + WINDOW_EDGE_MARGIN_SEC;
			}
			suffixEffort -= earlier.effort;
		}
		if (arrivalSec > lastArrivalSec) {
			break;
		}

		const groupNumber = groups.length + 1;
		const members: ScheduledCustomer[] = dishes.map((dish, memberIndex) => ({
			customerId: `c-${groupNumber}-${memberIndex + 1}`,
			dish,
			variant: rolledVariants[memberIndex],
		}));
		groups.push({ groupId: `g-${groupNumber}`, arrivalSec, members });
		arrivals.push({ timeSec: arrivalSec, effort: groupEffort });
		totalCustomers += members.length;
		dishes.forEach((dish) => {
			maxScore += params.dishes[dish].price + params.dishes[dish].maxTip;
		});

		// Промежуток до следующего прихода: равномерно в [minGap, 2 * meanGap - minGap], среднее равно meanGapSec.
		const gapHigh = Math.max(scheduleParams.minGapSec, 2 * scheduleParams.meanGapSec - scheduleParams.minGapSec);
		candidateSec = arrivalSec + rng.nextRange(scheduleParams.minGapSec, gapHigh);
	}

	if (groups.length === 0) {
		throw new RangeError("buildDaySchedule: расписание дня пусто, проверьте firstArrivalSec, durationSec и flowCloseBeforeEndSec");
	}
	return { seed, levelId: level.id, groups, totalCustomers, maxScore };
}
