// Данные уровней игры "Закрытие квартала": числа, счета, идентификаторы и правильные ответы.
// Весь отображаемый текст лежит в texts/index.ts и связан с данными по идентификаторам (design.md, D4).
// Суммы хранятся в рублях целыми числами (design.md, D10).
import type { LevelId } from "@/core/contract/types";

// ---------- Нормативные значения ----------
// Источники сверены на 20.11.2026, перед релизом и при каждом обновлении игры сверить ещё раз.

// Ставка НДФЛ для дохода до 2,4 млн рублей в год: НК РФ, ст. 224, п. 1 (ред. Федерального закона от 12.07.2024 № 176-ФЗ).
export const ndflRatePercent = 13;

// Стандартные вычеты на детей в месяц: НК РФ, ст. 218, п. 1, пп. 4 (ред. Федерального закона от 12.07.2024 № 176-ФЗ).
export const childDeductionFirst = 1400;
export const childDeductionSecond = 2800;
export const childDeductionThirdAndNext = 6000;
// Вычет действует, пока доход с начала года не превысил этот порог (там же). В данных игры порог не достигается.
export const childDeductionIncomeLimit = 450000;

// Лимит остатка наличных в кассе устанавливает сама организация, излишек сдаётся в банк:
// Указание Банка России от 11.03.2014 № 3210-У, п. 2. Печать для ООО необязательна: Федеральный закон от 06.04.2015 № 82-ФЗ.

// ---------- Шкала очков (design.md, D3) ----------

export const miniGameMaxScore = 10;
export const miniGamesPerLevel = 2;
export const levelMaxScore = miniGameMaxScore * miniGamesPerLevel;
// Цена одной подсказки на уровне medium.
export const hintPenalty = 1;
// Уровни, на которых доступна подсказка.
export const hintLevels: LevelId[] = ["medium"];

// ---------- Разбор первичных документов (easy) ----------

export type SortingSectionId = "cash" | "bank" | "purchases" | "sales" | "payroll" | "trash";

export interface SortingDocument {
	id: string;
	sectionId: SortingSectionId;
}

export interface DocumentSortingData {
	kind: "documentSorting";
	sections: SortingSectionId[];
	documents: SortingDocument[];
}

const easyDocuments: DocumentSortingData = {
	kind: "documentSorting",
	sections: ["cash", "bank", "purchases", "sales", "payroll", "trash"],
	documents: [
		{ id: "cashIncomeOrder", sectionId: "cash" },
		{ id: "cashOutcomeOrder", sectionId: "cash" },
		{ id: "paymentOrder", sectionId: "bank" },
		{ id: "bankStatement", sectionId: "bank" },
		{ id: "supplierUpd", sectionId: "purchases" },
		{ id: "salesAct", sectionId: "sales" },
		{ id: "timesheet", sectionId: "payroll" },
		{ id: "pizzaFlyer", sectionId: "trash" },
	],
};

// ---------- Касса (easy) ----------

// ПКО - приходный кассовый ордер, РКО - расходный кассовый ордер.
export type CashDocumentType = "incomeOrder" | "outcomeOrder";

export interface CashVisitor {
	id: string;
	documentType: CashDocumentType;
	amount: number;
}

export interface CashDeskData {
	kind: "cashDesk";
	openingBalance: number;
	cashLimit: number;
	visitors: CashVisitor[];
}

const easyCash: CashDeskData = {
	kind: "cashDesk",
	openingBalance: 8000,
	cashLimit: 20000,
	visitors: [
		{ id: "buyerSmirnov", documentType: "incomeOrder", amount: 12500 },
		{ id: "employeeOrlov", documentType: "outcomeOrder", amount: 3000 },
		{ id: "courierReturn", documentType: "incomeOrder", amount: 700 },
		{ id: "buyerLebedeva", documentType: "incomeOrder", amount: 9300 },
	],
};

// ---------- Проводки Дт/Кт (medium) ----------

export interface PostingOperation {
	id: string;
	debit: string;
	credit: string;
	amount: number;
}

export interface PostingsData {
	kind: "postings";
	// Счета плана счетов (Приказ Минфина России от 31.10.2000 № 94н), из которых выбирает игрок.
	accounts: string[];
	operations: PostingOperation[];
}

const mediumOperations: PostingsData = {
	kind: "postings",
	accounts: ["10", "26", "41", "50", "51", "60", "62", "68", "70", "71", "90", "91"],
	operations: [
		{ id: "paySupplier", debit: "60", credit: "51", amount: 18000 },
		{ id: "buyerPaid", debit: "51", credit: "62", amount: 45600 },
		{ id: "accrueSalary", debit: "26", credit: "70", amount: 196850 },
		{ id: "advanceFromCash", debit: "71", credit: "50", amount: 15000 },
	],
};

// ---------- Зарплата с НДФЛ (medium) ----------

export interface PayrollEmployee {
	id: string;
	salary: number;
	childrenCount: number;
}

export interface PayrollData {
	kind: "payroll";
	employees: PayrollEmployee[];
}

const mediumStaff: PayrollData = {
	kind: "payroll",
	employees: [
		{ id: "ivanova", salary: 45000, childrenCount: 0 },
		{ id: "petrov", salary: 52000, childrenCount: 1 },
		{ id: "sidorova", salary: 38500, childrenCount: 3 },
		// НДФЛ здесь 7 793,50 ₽: проверка округления 50 копеек вверх.
		{ id: "kuznetsov", salary: 61350, childrenCount: 1 },
	],
};

// ---------- Сверка с банковской выпиской (hard) ----------

export type StatementSide = "bank" | "ledger";
export type DiscrepancyReason = "bankFee" | "amountError" | "inTransit" | "duplicate";

export interface StatementRow {
	id: string;
	side: StatementSide;
	// Поступление на счёт или списание со счёта.
	direction: "in" | "out";
	amount: number;
}

export interface Discrepancy {
	id: string;
	// Строки, отметка любой из которых засчитывается как найденное расхождение.
	rowIds: string[];
	reason: DiscrepancyReason;
}

export interface BankReconciliationData {
	kind: "bankReconciliation";
	rows: StatementRow[];
	// Пары "строка выписки - строка учёта", которые можно сопоставить как совпавшие.
	matchingPairs: Array<[string, string]>;
	discrepancies: Discrepancy[];
	reasons: DiscrepancyReason[];
}

const hardStatement: BankReconciliationData = {
	kind: "bankReconciliation",
	rows: [
		{ id: "bankVector", side: "bank", direction: "in", amount: 45600 },
		{ id: "bankKancmir", side: "bank", direction: "out", amount: 18000 },
		{ id: "bankFee", side: "bank", direction: "out", amount: 1200 },
		{ id: "bankLebedeva", side: "bank", direction: "in", amount: 23400 },
		{ id: "bankNdfl", side: "bank", direction: "out", amount: 23901 },
		{ id: "ledgerVector", side: "ledger", direction: "in", amount: 45600 },
		{ id: "ledgerKancmir", side: "ledger", direction: "out", amount: 18000 },
		{ id: "ledgerLebedeva", side: "ledger", direction: "in", amount: 32400 },
		{ id: "ledgerNdfl", side: "ledger", direction: "out", amount: 23901 },
		{ id: "ledgerPower", side: "ledger", direction: "out", amount: 7800 },
		{ id: "ledgerKancmirCopy", side: "ledger", direction: "out", amount: 18000 },
	],
	matchingPairs: [
		["bankVector", "ledgerVector"],
		["bankKancmir", "ledgerKancmir"],
		["bankKancmir", "ledgerKancmirCopy"],
		["bankNdfl", "ledgerNdfl"],
	],
	discrepancies: [
		{ id: "fee", rowIds: ["bankFee"], reason: "bankFee" },
		{ id: "lebedeva", rowIds: ["bankLebedeva", "ledgerLebedeva"], reason: "amountError" },
		{ id: "power", rowIds: ["ledgerPower"], reason: "inTransit" },
		{ id: "copy", rowIds: ["ledgerKancmir", "ledgerKancmirCopy"], reason: "duplicate" },
	],
	reasons: ["bankFee", "amountError", "inTransit", "duplicate"],
};

// ---------- Бухгалтерский баланс (hard) ----------

export type BalanceLineId =
	| "fixedAssets"
	| "inventories"
	| "receivables"
	| "cashAssets"
	| "authorizedCapital"
	| "retainedEarnings"
	| "borrowings"
	| "payables"
	| "provisions";

export interface BalanceItem {
	id: string;
	lineId: BalanceLineId;
	amount: number;
}

export interface BalanceSheetData {
	kind: "balanceSheet";
	assetLines: BalanceLineId[];
	liabilityLines: BalanceLineId[];
	items: BalanceItem[];
	// Строка, сумму которой игрок вычисляет сам: актив минус остальные строки пассива.
	computedLineId: BalanceLineId;
}

const hardBalance: BalanceSheetData = {
	kind: "balanceSheet",
	assetLines: ["fixedAssets", "inventories", "receivables", "cashAssets"],
	liabilityLines: ["authorizedCapital", "retainedEarnings", "borrowings", "payables", "provisions"],
	items: [
		{ id: "machines", lineId: "fixedAssets", amount: 120000 },
		{ id: "warehouse", lineId: "inventories", amount: 85000 },
		{ id: "vectorDebt", lineId: "receivables", amount: 64000 },
		{ id: "money", lineId: "cashAssets", amount: 46000 },
		{ id: "foundersContribution", lineId: "authorizedCapital", amount: 10000 },
		{ id: "bankLoan", lineId: "borrowings", amount: 100000 },
		{ id: "supplierDebts", lineId: "payables", amount: 92000 },
		{ id: "vacationReserve", lineId: "provisions", amount: 18000 },
	],
	computedLineId: "retainedEarnings",
};

// ---------- Сценарии уровней (design.md, D2) ----------

export type MiniGameData =
	| DocumentSortingData
	| CashDeskData
	| PostingsData
	| PayrollData
	| BankReconciliationData
	| BalanceSheetData;

export type MiniGameKind = MiniGameData["kind"];

// Две мини-игры каждого уровня в порядке прохождения.
export const levelScenarios: Record<LevelId, [MiniGameData, MiniGameData]> = {
	easy: [easyDocuments, easyCash],
	medium: [mediumOperations, mediumStaff],
	hard: [hardStatement, hardBalance],
};
