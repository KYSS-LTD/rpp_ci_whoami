import { describe, expect, it, vi } from "vitest";
import { levelScenarios, type BalanceSheetData, type BankReconciliationData, type CashDeskData, type DocumentSortingData, type PostingsData } from "../data/levels";
import { buildChiefReply, fillTemplate } from "./feedback";
import { buildLevelResult, createResultSender, getNextPhase, levelPhases } from "./levelFlow";
import { calculateChildDeduction, calculateNdfl, formatRubles, parseAmountInput, roundTaxToRubles } from "./money";
import { calculateShare, getFicusState, getStampId } from "./mood";
import {
	applyHintPenalty,
	calculateCashSurplus,
	calculateComputedLine,
	calculateLevelScore,
	scoreBalanceSheet,
	scoreBankReconciliation,
	scoreByShare,
	scoreCashDesk,
	scoreDocumentSorting,
	scorePayroll,
	scorePostings,
} from "./scoring";
import { createSeededRandom, shuffle } from "./shuffle";

const [easyDocuments, easyCash] = levelScenarios.easy as [DocumentSortingData, CashDeskData];
const [mediumOperations] = levelScenarios.medium as [PostingsData, unknown];
const [hardStatement, hardBalance] = levelScenarios.hard as [BankReconciliationData, BalanceSheetData];

describe("перемешивание", () => {
	it("с одним зерном порядок воспроизводим, все элементы сохраняются", () => {
		const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
		const first = shuffle(items, createSeededRandom(42));
		const second = shuffle(items, createSeededRandom(42));
		expect(first).toEqual(second);
		expect([...first].sort()).toEqual(items);
		expect(items).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
	});

	it("по умолчанию использует Math.random", () => {
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
		expect(shuffle([1, 2, 3])).toEqual([2, 3, 1]);
		expect(randomSpy).toHaveBeenCalled();
		randomSpy.mockRestore();
	});
});

describe("НДФЛ и суммы", () => {
	it("1305,50 округляется до 1306, 1305,49 до 1305", () => {
		expect(roundTaxToRubles(1305.5)).toBe(1306);
		expect(roundTaxToRubles(1305.49)).toBe(1305);
	});

	it("НДФЛ 13% от дохода за минусом вычета, с округлением", () => {
		expect(calculateNdfl(45000)).toBe(5850);
		// (61 350 - 1 400) × 13% = 7 793,50 -> 7 794
		expect(calculateNdfl(61350, 1400)).toBe(7794);
		expect(calculateNdfl(1000, 5000)).toBe(0);
	});

	it("вычет на детей: 1400, 2800, 6000 на третьего и следующих", () => {
		expect(calculateChildDeduction(0)).toBe(0);
		expect(calculateChildDeduction(1)).toBe(1400);
		expect(calculateChildDeduction(2)).toBe(4200);
		expect(calculateChildDeduction(4)).toBe(16200);
		// Сотрудник со стандартным вычетом: (52 000 - 1 400) × 13% = 6 578
		expect(calculateNdfl(52000, calculateChildDeduction(1))).toBe(6578);
	});

	it("разбор ввода суммы", () => {
		expect(parseAmountInput("12 500,00")).toBe(12500);
		expect(parseAmountInput("12500")).toBe(12500);
		expect(parseAmountInput("7 500.5")).toBe(7501);
		expect(parseAmountInput("  ")).toBeNull();
		expect(parseAmountInput("")).toBeNull();
		expect(parseAmountInput("двенадцать")).toBeNull();
		expect(parseAmountInput("12a")).toBeNull();
		expect(parseAmountInput("-5")).toBeNull();
	});

	it("вывод суммы с разделителями тысяч", () => {
		expect(formatRubles(196850).replace(/\s/g, " ")).toBe("196 850");
	});
});

describe("очки мини-игр", () => {
	it("доля верных: 6 из 8 дают 8 очков", () => {
		expect(scoreByShare(6, 8)).toBe(8);
		expect(scoreByShare(0, 8)).toBe(0);
		expect(scoreByShare(8, 8)).toBe(10);
		expect(scoreByShare(1, 0)).toBe(0);
	});

	it("первичка: верные с первой попытки", () => {
		const attempts = Object.fromEntries(easyDocuments.documents.map((document) => [document.id, document.sectionId]));
		expect(scoreDocumentSorting(easyDocuments, attempts)).toBe(10);
		attempts.cashIncomeOrder = "bank";
		attempts.pizzaFlyer = "sales";
		expect(scoreDocumentSorting(easyDocuments, attempts)).toBe(8);
	});

	it("касса: по 1 за документ и сумму каждого посетителя и 2 за излишек", () => {
		const visitors = Object.fromEntries(easyCash.visitors.map((visitor) => [visitor.id, { documentType: visitor.documentType, amount: visitor.amount }]));
		expect(calculateCashSurplus(easyCash)).toBe(7500);
		expect(scoreCashDesk(easyCash, { visitors, surplus: 7500 })).toBe(10);
		expect(scoreCashDesk(easyCash, { visitors, surplus: 7000 })).toBe(8);
		expect(scoreCashDesk(easyCash, { visitors: {}, surplus: 7500 })).toBe(2);
	});

	it("проводки: дебет, кредит и сумма каждой операции", () => {
		const answers = Object.fromEntries(mediumOperations.operations.map((operation) => [operation.id, { ...operation }]));
		expect(scorePostings(mediumOperations, answers)).toBe(10);
		answers.paySupplier = { ...answers.paySupplier, debit: "51", credit: "60" };
		// 10 из 12 проверок: round(8,33) = 8
		expect(scorePostings(mediumOperations, answers)).toBe(8);
	});

	it("зарплата: 6 из 8 верных полей дают 8 очков", () => {
		const staff = levelScenarios.medium[1];
		if (staff.kind !== "payroll") {
			throw new Error("ожидалась зарплата");
		}
		const answers = {
			ivanova: { deduction: 0, ndfl: 5850 },
			petrov: { deduction: 1400, ndfl: 6578 },
			sidorova: { deduction: 10200, ndfl: 3679 },
			kuznetsov: { deduction: 0, ndfl: 7975 },
		};
		expect(scorePayroll(staff, answers)).toBe(8);
	});

	it("сверка: две найденные с верной причиной и одна ложная отметка дают 4", () => {
		expect(scoreBankReconciliation(hardStatement, { bankFee: "bankFee", ledgerPower: "inTransit", ledgerVector: null })).toBe(4);
	});

	it("сверка: одна только ложная отметка не уводит в минус", () => {
		expect(scoreBankReconciliation(hardStatement, { ledgerVector: null })).toBe(0);
	});

	it("сверка: все расхождения с причинами дают 10, отметка обеих строк группы засчитывается один раз", () => {
		const marks = {
			bankFee: "bankFee" as const,
			bankLebedeva: "amountError" as const,
			ledgerLebedeva: "amountError" as const,
			ledgerPower: "inTransit" as const,
			ledgerKancmirCopy: "duplicate" as const,
		};
		expect(scoreBankReconciliation(hardStatement, marks)).toBe(10);
		// Найдено без причины: 1,5 -> округление до 2
		expect(scoreBankReconciliation(hardStatement, { bankFee: null })).toBe(2);
	});

	it("баланс: 1 за каждую статью и 2 за нераспределённую прибыль", () => {
		expect(calculateComputedLine(hardBalance)).toBe(95000);
		const placements = Object.fromEntries(hardBalance.items.map((item) => [item.id, item.lineId]));
		expect(scoreBalanceSheet(hardBalance, placements, 95000)).toBe(10);
		expect(scoreBalanceSheet(hardBalance, placements, 90000)).toBe(8);
		expect(scoreBalanceSheet(hardBalance, { ...placements, machines: "inventories" }, 95000)).toBe(9);
	});
});

describe("очки уровня", () => {
	it("medium: 9 + 7 и одна подсказка = 15", () => {
		expect(
			calculateLevelScore("medium", [
				{ score: 9, hintsUsed: 1 },
				{ score: 7, hintsUsed: 0 },
			]),
		).toBe(15);
	});

	it("подсказка при 0 очков не уводит итог мини-игры в минус", () => {
		expect(applyHintPenalty("medium", 0, 1)).toBe(0);
		expect(calculateLevelScore("medium", [{ score: 0, hintsUsed: 1 }])).toBe(0);
	});

	it("на easy и hard подсказки не снимают очки", () => {
		expect(applyHintPenalty("easy", 6, 2)).toBe(6);
		expect(applyHintPenalty("hard", 6, 2)).toBe(6);
	});
});

describe("фикус и штамп", () => {
	it("границы порогов фикуса", () => {
		expect(getFicusState(0.85)).toBe("blooming");
		expect(getFicusState(0.8)).toBe("blooming");
		expect(getFicusState(0.79)).toBe("growing");
		expect(getFicusState(0.5)).toBe("growing");
		expect(getFicusState(0.49)).toBe("wilting");
		expect(getFicusState(0.25)).toBe("wilting");
		expect(getFicusState(0.24)).toBe("dry");
		expect(getFicusState(null)).toBe("growing");
	});

	it("штамп по тем же порогам", () => {
		expect(getStampId(0.85)).toBe("approved");
		expect(getStampId(0.8)).toBe("approved");
		expect(getStampId(0.6)).toBe("remarks");
		expect(getStampId(0.5)).toBe("remarks");
		expect(getStampId(0.4)).toBe("taxDemand");
	});

	it("доли без проверок нет", () => {
		expect(calculateShare(0, 0)).toBeNull();
		expect(calculateShare(17, 20)).toBe(0.85);
	});
});

describe("реплика главбуха", () => {
	it("правильный ответ, затем причина, шутка последней", () => {
		const reply = buildChiefReply(
			{ explanationId: "test", values: { debit: "60" } },
			{ test: { correct: "Правильно: Дт {debit}.", reason: "Потому что так.", joke: "Шутка." } },
		);
		expect(reply?.text).toBe("Правильно: Дт 60. Потому что так. Шутка.");
	});

	it("без объяснения реплики нет, неизвестный ключ шаблона остаётся", () => {
		expect(buildChiefReply({ explanationId: "missing" }, {})).toBeNull();
		expect(fillTemplate("{a} и {b}", { a: "1" })).toBe("1 и {b}");
	});
});

describe("сценарий уровня и результат", () => {
	it("фазы идут по порядку", () => {
		expect(levelPhases).toEqual(["intro", "gameA", "summaryA", "gameB", "monthClose"]);
		expect(getNextPhase("intro")).toBe("gameA");
		expect(getNextPhase("gameB")).toBe("monthClose");
		expect(getNextPhase("monthClose")).toBe("monthClose");
	});

	it("результат по контракту с maxScore 20", () => {
		const result = buildLevelResult({ gameId: "accountant-1c", levelId: "easy", score: 17, completed: true, startedAtMs: 1000, finishedAtMs: 62_400 });
		expect(result).toEqual({ gameId: "accountant-1c", levelId: "easy", score: 17, maxScore: 20, completed: true, durationSec: 61 });
	});

	it("повторная отправка не вызывает onFinish", () => {
		const onFinish = vi.fn();
		const sender = createResultSender(onFinish);
		const result = buildLevelResult({ gameId: "accountant-1c", levelId: "hard", score: 5, completed: false, startedAtMs: 0, finishedAtMs: 0 });
		expect(sender.send(result)).toBe(true);
		expect(sender.send(result)).toBe(false);
		expect(onFinish).toHaveBeenCalledTimes(1);
		expect(sender.isSent()).toBe(true);
	});
});
