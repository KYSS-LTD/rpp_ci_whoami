// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pickBestTable, planSeating, seatIndexForMember, type SeatingTable } from "./seating";

const free = (seats: number): SeatingTable => ({ seats, occupied: false });
const busy = (seats: number): SeatingTable => ({ seats, occupied: true });

describe("правило рассадки: выбор стола", () => {
	it("Лучший по размеру стол: минимальный запас мест", () => {
		expect(pickBestTable([free(4), free(2)], 2)).toBe(1);
		expect(pickBestTable([free(2), free(4)], 2)).toBe(0);
		expect(pickBestTable([free(2), free(4)], 3)).toBe(1);
	});

	it("при равном запасе выбирается первый по порядку", () => {
		expect(pickBestTable([free(2), free(2)], 1)).toBe(0);
	});

	it("занятые и маленькие столы не подходят", () => {
		expect(pickBestTable([busy(2), free(2)], 2)).toBe(1);
		expect(pickBestTable([free(2), free(2)], 3)).toBe(-1);
		expect(pickBestTable([busy(4)], 1)).toBe(-1);
		expect(pickBestTable([], 1)).toBe(-1);
	});
});

describe("правило рассадки: обход крупной группы", () => {
	it("первая группа садится, если стол есть", () => {
		expect(planSeating([{ size: 2, waitedSec: 0 }], [free(2)], 20)).toEqual({ waitingIndex: 0, tableIndex: 0 });
	});

	it("Крупная группа ждёт: группа из двух проходит вперёд крупной, пока та ждёт меньше порога", () => {
		const waiting = [
			{ size: 4, waitedSec: 5 },
			{ size: 2, waitedSec: 1 },
		];
		expect(planSeating(waiting, [busy(4), free(2)], 20)).toEqual({ waitingIndex: 1, tableIndex: 1 });
	});

	it("после порога ожидания крупной группы обгон запрещён", () => {
		const waiting = [
			{ size: 4, waitedSec: 20 },
			{ size: 2, waitedSec: 1 },
		];
		expect(planSeating(waiting, [busy(4), free(2)], 20)).toBeNull();
		// Освободился стол на четыре: садится крупная группа, а не вторая.
		expect(planSeating(waiting, [free(4), free(2)], 20)).toEqual({ waitingIndex: 0, tableIndex: 0 });
	});

	it("первой в очереди идёт та группа, для которой есть стол, раньше по порядку", () => {
		const waiting = [
			{ size: 2, waitedSec: 3 },
			{ size: 1, waitedSec: 2 },
		];
		expect(planSeating(waiting, [free(2), free(4)], 20)).toEqual({ waitingIndex: 0, tableIndex: 0 });
	});

	it("если сажать некого, план пуст", () => {
		expect(planSeating([], [free(2)], 20)).toBeNull();
		expect(planSeating([{ size: 4, waitedSec: 0 }], [free(2)], 20)).toBeNull();
	});
});

describe("места членов группы", () => {
	it("двое за столом на четыре садятся напротив, группы по размеру стола занимают места по порядку", () => {
		expect([0, 1].map((member) => seatIndexForMember(member, 2, 4))).toEqual([0, 2]);
		expect([0, 1, 2].map((member) => seatIndexForMember(member, 3, 4))).toEqual([0, 1, 2]);
		expect([0, 1, 2, 3].map((member) => seatIndexForMember(member, 4, 4))).toEqual([0, 1, 2, 3]);
		expect([0, 1].map((member) => seatIndexForMember(member, 2, 2))).toEqual([0, 1]);
		expect(seatIndexForMember(0, 1, 4)).toBe(0);
	});
});
