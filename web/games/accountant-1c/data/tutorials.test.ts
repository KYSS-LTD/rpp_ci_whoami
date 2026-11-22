import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTutorial } from "../hooks/useTutorial";
import { tutorialTexts } from "../texts/tutorial";
import { levelTutorials, miniGameTutorials } from "./tutorials";

const scenarios = {
	...levelTutorials,
	documentSorting: miniGameTutorials.documentSorting({ id: "doc", sectionId: "purchases" }),
	cashDesk: miniGameTutorials.cashDesk({ documentType: "incomeOrder" }),
	postings: miniGameTutorials.postings("operation"),
	payroll: miniGameTutorials.payroll("employee", true),
	bankReconciliation: miniGameTutorials.bankReconciliation(["bank", "ledger"], { rowId: "fee", marked: false }),
	balanceSheet: miniGameTutorials.balanceSheet({ id: "card", lineId: "inventories" }),
};

describe("сценарии обучения", () => {
	it.each(Object.entries(scenarios))("%s: шаги имеют текст, цели и уникальные идентификаторы", (_id, steps) => {
		expect(steps.length).toBeGreaterThanOrEqual(2);
		expect(steps.length).toBeLessThanOrEqual(4);
		expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
		for (const step of steps) {
			expect(tutorialTexts.steps[step.textKey]).toBeTruthy();
			expect(step.targets.length).toBeGreaterThanOrEqual(step.showArrow ? 2 : 1);
		}
	});

	it("неверное учебное действие не проходит в игру, а пропуск возвращает обычные правила", () => {
		const onClose = vi.fn();
		const { result, rerender } = renderHook(
			({ steps }) => useTutorial("test", true, steps, onClose),
			{ initialProps: { steps: scenarios.documentSorting } },
		);
		act(() => result.current.next());
		expect(result.current.current?.action).toBe("sort");
		act(() => expect(result.current.accept("sort", false)).toBe(false));
		expect(result.current.failed).toBe(true);
		expect(result.current.index).toBe(1);
		act(() => expect(result.current.accept("sort", true)).toBe(true));
		expect(result.current.current).toBeUndefined();
		expect(onClose).toHaveBeenCalledOnce();
		rerender({ steps: miniGameTutorials.documentSorting({ id: "remaining", sectionId: "sales" }) });
		act(() => result.current.replay());
		expect(result.current.current?.targets).toEqual(["item-remaining"]);
		expect(result.current.failed).toBe(false);
		act(() => result.current.skip());
		expect(result.current.accept("sort", false)).toBe(true);
	});
});
