import { describe, expect, it } from "vitest";
import { requiredLevelIds } from "@/core/contract/types";
import { calculateCashSurplus } from "../logic/scoring";
import { accountantTexts } from "../texts";
import {
	childDeductionFirst,
	childDeductionSecond,
	childDeductionThirdAndNext,
	levelMaxScore,
	levelScenarios,
	ndflRatePercent,
} from "./levels";

describe("данные уровней", () => {
	it("нормативные значения", () => {
		expect(ndflRatePercent).toBe(13);
		expect([childDeductionFirst, childDeductionSecond, childDeductionThirdAndNext]).toEqual([1400, 2800, 6000]);
		expect(levelMaxScore).toBe(20);
	});

	it("у каждого уровня ровно две мини-игры в порядке схемы D2", () => {
		expect(Object.keys(levelScenarios)).toEqual([...requiredLevelIds]);
		expect(levelScenarios.easy.map((miniGame) => miniGame.kind)).toEqual(["documentSorting", "cashDesk"]);
		expect(levelScenarios.medium.map((miniGame) => miniGame.kind)).toEqual(["postings", "payroll"]);
		expect(levelScenarios.hard.map((miniGame) => miniGame.kind)).toEqual(["bankReconciliation", "balanceSheet"]);
	});

	it("суммы хранятся целыми рублями", () => {
		const amounts = JSON.stringify(levelScenarios).match(/"(amount|salary|openingBalance|cashLimit)":(-?[\d.]+)/g) ?? [];
		expect(amounts.length).toBeGreaterThan(0);
		for (const entry of amounts) {
			expect(Number.isInteger(Number(entry.split(":")[1]))).toBe(true);
		}
	});

	it("у каждого идентификатора данных есть текст", () => {
		const [documents, cash] = levelScenarios.easy;
		const [operations, staff] = levelScenarios.medium;
		const [statement, balance] = levelScenarios.hard;
		if (
			documents.kind !== "documentSorting" ||
			cash.kind !== "cashDesk" ||
			operations.kind !== "postings" ||
			staff.kind !== "payroll" ||
			statement.kind !== "bankReconciliation" ||
			balance.kind !== "balanceSheet"
		) {
			throw new Error("неожиданный порядок мини-игр");
		}
		for (const document of documents.documents) {
			expect(accountantTexts.documents[document.id]).toBeDefined();
			expect(accountantTexts.explanations[`sorting.${document.id}`]).toBeDefined();
		}
		for (const visitor of cash.visitors) {
			expect(accountantTexts.cashVisitors[visitor.id]).toBeDefined();
			expect(accountantTexts.explanations[`cash.document.${visitor.id}`]).toBeDefined();
		}
		for (const operation of operations.operations) {
			expect(accountantTexts.operations[operation.id]).toBeDefined();
			expect(accountantTexts.explanations[`postings.${operation.id}`]).toBeDefined();
		}
		for (const account of operations.accounts) {
			expect(accountantTexts.accounts[account]?.startsWith(account)).toBe(true);
		}
		for (const employee of staff.employees) {
			expect(accountantTexts.employees[employee.id]).toBeDefined();
		}
		for (const row of statement.rows) {
			expect(accountantTexts.statementRows[row.id]).toBeDefined();
		}
		for (const item of balance.items) {
			expect(accountantTexts.balanceItems[item.id]).toBeDefined();
			expect(accountantTexts.balanceItemReasons[item.id]).toBeDefined();
		}
		for (const lineId of [...balance.assetLines, ...balance.liabilityLines]) {
			expect(accountantTexts.balanceLines[lineId]).toBeDefined();
		}
		expect(calculateCashSurplus(cash)).toBeGreaterThan(0);
	});

	it("пары сопоставления сверки ведут из выписки в учёт и не задевают расхождения выписки", () => {
		const statement = levelScenarios.hard[0];
		if (statement.kind !== "bankReconciliation") {
			throw new Error("ожидалась сверка");
		}
		const rowSide = Object.fromEntries(statement.rows.map((row) => [row.id, row.side]));
		for (const [bankId, ledgerId] of statement.matchingPairs) {
			expect(rowSide[bankId]).toBe("bank");
			expect(rowSide[ledgerId]).toBe("ledger");
		}
	});
});
