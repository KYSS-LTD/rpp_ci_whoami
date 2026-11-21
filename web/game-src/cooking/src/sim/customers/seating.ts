// Правило рассадки (задача 5.3, spec cooking-customers): чистые функции без состояния, чтобы правило проверялось отдельно.
// Освободившийся или свободный стол достаётся ожидающей группе, которой хватает мест, с минимальным запасом мест.
// Группа меньшего размера может пройти раньше группы, которой стола ещё нет, но только пока та ждёт меньше порога
// (CustomerParams.seatingBypassSec): после порога крупная группа получает первый подходящий стол без обгона. Владелец: SONNET-1.

// Допуск при сравнении времени ожидания с порогом.
const WAIT_EPSILON_SEC = 1e-9;

// Стол для расчёта рассадки.
export interface SeatingTable {
	// Число мест.
	seats: number;
	// Занят ли стол группой (назначенной, сидящей или едящей).
	occupied: boolean;
}

// Ожидающая группа для расчёта рассадки (порядок в массиве: порядок очереди, первая ждёт дольше всех).
export interface SeatingGroup {
	size: number;
	// Сколько секунд группа уже ждёт стол (с прихода).
	waitedSec: number;
}

// Решение: какую группу за какой стол посадить.
export interface SeatingPlan {
	waitingIndex: number;
	tableIndex: number;
}

// Лучший свободный стол для группы: минимальный запас мест (мест не меньше размера группы), при равенстве первый по порядку.
// Возвращает индекс стола или -1, если подходящего свободного стола нет.
export function pickBestTable(tables: readonly SeatingTable[], groupSize: number): number {
	let bestIndex = -1;
	tables.forEach((table, index) => {
		if (table.occupied || table.seats < groupSize) {
			return;
		}
		if (bestIndex < 0 || table.seats < tables[bestIndex].seats) {
			bestIndex = index;
		}
	});
	return bestIndex;
}

// Следующая рассадка по правилу или null, если посадить некого. Вызывающий повторяет вызов, пока приходят решения.
// Группы просматриваются по порядку очереди. Группа, для которой стол есть, садится, если ей не мешает ожидающая впереди
// группа без стола, которая ждёт уже не меньше bypassSec. Группа без стола, ждущая меньше порога, не мешает остальным.
export function planSeating(waiting: readonly SeatingGroup[], tables: readonly SeatingTable[], bypassSec: number): SeatingPlan | null {
	let blocked = false;
	for (let waitingIndex = 0; waitingIndex < waiting.length; waitingIndex += 1) {
		const group = waiting[waitingIndex];
		const tableIndex = pickBestTable(tables, group.size);
		if (tableIndex >= 0) {
			if (!blocked) {
				return { waitingIndex, tableIndex };
			}
		} else if (group.waitedSec + WAIT_EPSILON_SEC >= bypassSec) {
			blocked = true;
		}
	}
	return null;
}

// Какое место за столом занимает член группы: места разносятся равномерно (двое за столом на четыре садятся напротив).
export function seatIndexForMember(memberIndex: number, groupSize: number, seatCount: number): number {
	return Math.min(seatCount - 1, Math.floor((memberIndex * seatCount) / groupSize));
}
