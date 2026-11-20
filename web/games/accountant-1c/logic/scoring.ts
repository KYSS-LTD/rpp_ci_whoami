// Подсчёт очков мини-игр и уровня (design.md, D3). Чистые функции: только данные уровня и ответы игрока.
import type { LevelId } from "@/core/contract/types";
import {
	hintLevels,
	hintPenalty,
	miniGameMaxScore,
	type BalanceLineId,
	type BalanceSheetData,
	type BankReconciliationData,
	type CashDeskData,
	type CashDocumentType,
	type DiscrepancyReason,
	type DocumentSortingData,
	type PayrollData,
	type PostingsData,
	type SortingSectionId,
} from "../data/levels";
import { calculateChildDeduction, calculateNdfl } from "./money";

// Ограничивает итог мини-игры шкалой 0-10 и округляет до целого (0,5 округляется вверх).
export function clampMiniGameScore(rawScore: number): number {
	return Math.min(miniGameMaxScore, Math.max(0, Math.round(rawScore)));
}

// Очки по доле верных проверок: round(10 * верных / всего).
export function scoreByShare(correctCount: number, totalCount: number): number {
	if (totalCount <= 0) {
		return 0;
	}
	return clampMiniGameScore((miniGameMaxScore * correctCount) / totalCount);
}

// ---------- Разбор первичных документов ----------

// Ответы: раздел, куда игрок положил документ с первой попытки.
export function scoreDocumentSorting(data: DocumentSortingData, firstAttempts: Record<string, SortingSectionId | undefined>): number {
	const correctCount = data.documents.filter((document) => firstAttempts[document.id] === document.sectionId).length;
	return scoreByShare(correctCount, data.documents.length);
}

// ---------- Касса ----------

export interface CashVisitorAnswer {
	documentType: CashDocumentType | null;
	amount: number | null;
}

export interface CashDeskAnswers {
	visitors: Record<string, CashVisitorAnswer | undefined>;
	surplus: number | null;
}

// Остаток кассы после всех посетителей по данным уровня.
export function calculateCashClosingBalance(data: CashDeskData): number {
	return data.visitors.reduce(
		(balance, visitor) => balance + (visitor.documentType === "incomeOrder" ? visitor.amount : -visitor.amount),
		data.openingBalance,
	);
}

// Излишек сверх лимита, который сдаётся в банк.
export function calculateCashSurplus(data: CashDeskData): number {
	return Math.max(0, calculateCashClosingBalance(data) - data.cashLimit);
}

// Очки за сдачу излишка в банк.
export const cashSurplusPoints = 2;

// По 1 очку за документ и сумму каждого посетителя, 2 за сдачу излишка.
export function scoreCashDesk(data: CashDeskData, answers: CashDeskAnswers): number {
	let points = 0;
	for (const visitor of data.visitors) {
		const answer = answers.visitors[visitor.id];
		if (answer?.documentType === visitor.documentType) {
			points += 1;
		}
		if (answer?.amount === visitor.amount) {
			points += 1;
		}
	}
	if (answers.surplus === calculateCashSurplus(data)) {
		points += cashSurplusPoints;
	}
	return clampMiniGameScore(points);
}

// ---------- Проводки ----------

export interface PostingAnswer {
	debit: string;
	credit: string;
	amount: number | null;
}

// Результат проверки одной проводки: дебет, кредит и сумма отдельно.
export interface PostingCheck {
	debit: boolean;
	credit: boolean;
	amount: boolean;
}

export function checkPosting(data: PostingsData, operationId: string, answer: PostingAnswer | undefined): PostingCheck {
	const operation = data.operations.find((candidate) => candidate.id === operationId);
	return {
		debit: operation !== undefined && answer?.debit === operation.debit,
		credit: operation !== undefined && answer?.credit === operation.credit,
		amount: operation !== undefined && answer?.amount === operation.amount,
	};
}

// Три проверки на операцию: дебет, кредит, сумма. Очки round(10 * верных / всего).
export function scorePostings(data: PostingsData, answers: Record<string, PostingAnswer | undefined>): number {
	let correctCount = 0;
	for (const operation of data.operations) {
		const check = checkPosting(data, operation.id, answers[operation.id]);
		correctCount += Number(check.debit) + Number(check.credit) + Number(check.amount);
	}
	return scoreByShare(correctCount, data.operations.length * 3);
}

// ---------- Зарплата ----------

export interface PayrollAnswer {
	deduction: number | null;
	ndfl: number | null;
}

// Правильные значения строки сотрудника.
export function expectedPayrollRow(salary: number, childrenCount: number): { deduction: number; ndfl: number } {
	const deduction = calculateChildDeduction(childrenCount);
	return { deduction, ndfl: calculateNdfl(salary, deduction) };
}

// Число верных полей и всего полей: у каждого сотрудника вычет и НДФЛ.
export function countPayrollChecks(data: PayrollData, answers: Record<string, PayrollAnswer | undefined>): { correct: number; total: number } {
	let correct = 0;
	for (const employee of data.employees) {
		const expected = expectedPayrollRow(employee.salary, employee.childrenCount);
		const answer = answers[employee.id];
		correct += Number(answer?.deduction === expected.deduction) + Number(answer?.ndfl === expected.ndfl);
	}
	return { correct, total: data.employees.length * 2 };
}

export function scorePayroll(data: PayrollData, answers: Record<string, PayrollAnswer | undefined>): number {
	const checks = countPayrollChecks(data, answers);
	return scoreByShare(checks.correct, checks.total);
}

// ---------- Сверка с выпиской ----------

export const reconciliationFoundPoints = 1.5;
export const reconciliationReasonPoints = 1;
export const reconciliationFalseMarkPenalty = 1;

// Отметки игрока: строка отмечена как расхождение с выбранной причиной (или без неё).
export type ReconciliationMarks = Record<string, DiscrepancyReason | null | undefined>;

export interface ReconciliationCheck {
	foundIds: string[];
	correctReasonIds: string[];
	falseMarkRowIds: string[];
}

// Разбирает отметки: какие расхождения найдены, где верная причина, какие отметки ложные.
export function checkReconciliation(data: BankReconciliationData, marks: ReconciliationMarks): ReconciliationCheck {
	const markedRowIds = Object.keys(marks).filter((rowId) => marks[rowId] !== undefined);
	const foundIds: string[] = [];
	const correctReasonIds: string[] = [];
	for (const discrepancy of data.discrepancies) {
		const markedInGroup = discrepancy.rowIds.filter((rowId) => markedRowIds.includes(rowId));
		if (markedInGroup.length === 0) {
			continue;
		}
		foundIds.push(discrepancy.id);
		if (markedInGroup.some((rowId) => marks[rowId] === discrepancy.reason)) {
			correctReasonIds.push(discrepancy.id);
		}
	}
	const discrepancyRowIds = data.discrepancies.flatMap((discrepancy) => discrepancy.rowIds);
	const falseMarkRowIds = markedRowIds.filter((rowId) => !discrepancyRowIds.includes(rowId));
	return { foundIds, correctReasonIds, falseMarkRowIds };
}

// 1,5 за найденное расхождение, 1 за верную причину, минус 1 за ложную отметку, не ниже 0.
export function scoreBankReconciliation(data: BankReconciliationData, marks: ReconciliationMarks): number {
	const check = checkReconciliation(data, marks);
	const rawScore =
		check.foundIds.length * reconciliationFoundPoints +
		check.correctReasonIds.length * reconciliationReasonPoints -
		check.falseMarkRowIds.length * reconciliationFalseMarkPenalty;
	return clampMiniGameScore(rawScore);
}

// ---------- Баланс ----------

export const retainedEarningsPoints = 2;

// Сумма строки, которую игрок вычисляет сам: итог актива минус известные строки пассива.
export function calculateComputedLine(data: BalanceSheetData): number {
	const sumOfLines = (lineIds: BalanceLineId[]) =>
		data.items.filter((item) => lineIds.includes(item.lineId)).reduce((total, item) => total + item.amount, 0);
	const assetsTotal = sumOfLines(data.assetLines);
	const knownLiabilities = sumOfLines(data.liabilityLines.filter((lineId) => lineId !== data.computedLineId));
	return assetsTotal - knownLiabilities;
}

// 1 за каждую статью с известной суммой на своей строке, 2 за вычисленную нераспределённую прибыль.
export function scoreBalanceSheet(
	data: BalanceSheetData,
	placements: Record<string, BalanceLineId | undefined>,
	computedAmount: number | null,
): number {
	const placedCorrectly = data.items.filter((item) => placements[item.id] === item.lineId).length;
	const computedPoints = computedAmount === calculateComputedLine(data) ? retainedEarningsPoints : 0;
	return clampMiniGameScore(placedCorrectly + computedPoints);
}

// ---------- Уровень ----------

// Итог мини-игры для портала: на уровнях с подсказками каждая подсказка снимает очко, но не ниже 0.
export function applyHintPenalty(levelId: LevelId, rawScore: number, hintsUsed: number): number {
	if (!hintLevels.includes(levelId)) {
		return clampMiniGameScore(rawScore);
	}
	return clampMiniGameScore(rawScore - hintsUsed * hintPenalty);
}

export interface ScoredMiniGame {
	score: number;
	hintsUsed: number;
}

// Очки уровня: сумма двух мини-игр после вычета подсказок.
export function calculateLevelScore(levelId: LevelId, miniGames: ScoredMiniGame[]): number {
	return miniGames.reduce((total, miniGame) => total + applyHintPenalty(levelId, miniGame.score, miniGame.hintsUsed), 0);
}
