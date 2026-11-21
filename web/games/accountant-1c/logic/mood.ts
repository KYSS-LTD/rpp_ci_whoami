// Состояние фикуса и штамп "Закрытия месяца" по доле набранных очков (design.md, D8). На очки не влияют.

export type FicusState = "blooming" | "growing" | "wilting" | "dry";
export type StampId = "approved" | "remarks" | "taxDemand";

// Пороги в долях от максимума.
export const bloomingThreshold = 0.8;
export const growingThreshold = 0.5;
export const wiltingThreshold = 0.25;

// Доля набранных очков от возможных. Пока проверок не было, доли нет.
export function calculateShare(earned: number, possible: number): number | null {
	if (possible <= 0) {
		return null;
	}
	return Math.min(1, Math.max(0, earned / possible));
}

// Фикус: от 80% цветёт, от 50% растёт, от 25% поник, ниже засох. Без проверок фикус просто растёт.
export function getFicusState(share: number | null): FicusState {
	if (share === null) {
		return "growing";
	}
	if (share >= bloomingThreshold) {
		return "blooming";
	}
	if (share >= growingThreshold) {
		return "growing";
	}
	if (share >= wiltingThreshold) {
		return "wilting";
	}
	return "dry";
}

// Штамп: от 80% "Проверено. Замечаний нет", от 50% "Принято с замечаниями", ниже "Требование ФНС".
export function getStampId(share: number): StampId {
	if (share >= bloomingThreshold) {
		return "approved";
	}
	if (share >= growingThreshold) {
		return "remarks";
	}
	return "taxDemand";
}
