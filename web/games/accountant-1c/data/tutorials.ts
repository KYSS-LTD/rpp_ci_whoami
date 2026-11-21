import type { LevelId } from "@/core/contract/types";
import type { tutorialTexts } from "../texts/tutorial";

type TutorialTextKey = keyof typeof tutorialTexts.steps;
type Action = "sort" | "cashPick" | "cashHand" | "post" | "deduction" | "tax" | "match" | "flag" | "reason" | "balance";

export interface TutorialStep {
	id: string;
	textKey: TutorialTextKey;
	targets: readonly string[];
	action: Action | "next";
	showArrow: boolean;
}

function step(textKey: TutorialTextKey, targets: string[], action: TutorialStep["action"] = "next", showArrow = false): TutorialStep {
	return { id: textKey, textKey, targets, action, showArrow };
}

const overview = [
	step("overviewWindow", ["booth", "monitor"]),
	step("overviewDesk", ["letter", "calculator", "rulebook"]),
];

export const levelTutorials: Record<LevelId, readonly TutorialStep[]> = { easy: overview, medium: overview, hard: overview };

export const miniGameTutorials = {
	documentSorting(item?: { id: string; sectionId: string }) {
		return item
			? [step("sortRead", [`item-${item.id}`]), step("sortPlace", [`item-${item.id}`, `target-${item.sectionId}`], "sort", true)]
			: [step("sortComplete", ["monitor"]), step("sortStamps", ["stamp-tray"])];
	},
	cashDesk(visitor?: { documentType: string } | null, formOpen = false) {
		if (!visitor) {
			return [step("cashCollection", ["booth"]), step("cashSurplus", ["cashBox", "collection"])];
		}
		return [
			step("cashRead", ["booth", "orderPads"]),
			...(!formOpen ? [step("cashPick", [`pad-${visitor.documentType}`], "cashPick")] : []),
			step("cashHand", ["cash-amount", "cash-hand"], "cashHand"),
		];
	},
	postings(operationId?: string) {
		return operationId
			? [
					step("postRead", [`primary-${operationId}`, "posting-fields"]),
					step("postSubmit", ["posting-fields", "posting-submit", "rulebook", `primary-${operationId}`], "post"),
				]
			: [step("postComplete", ["monitor"]), step("postAccounts", ["rulebook"])];
	},
	payroll(employeeId: string | undefined, hasApplication: boolean) {
		if (!employeeId) {
			return [step("payComplete", ["monitor"]), step("payRules", ["rulebook"])];
		}
		return [
			step("payRead", [hasApplication ? `application-${employeeId}` : "noApplications", `pay-row-${employeeId}`]),
			step("payDeduction", [`pay-deduction-${employeeId}`, "rulebook"], "deduction"),
			step("payTax", [`pay-tax-${employeeId}`, "calculator"], "tax"),
		];
	},
	bankReconciliation(pair?: [string, string], discrepancy?: { rowId: string; marked: boolean }) {
		return [
			step("bankRead", ["bankStatement", "ledgerCard"]),
			...(pair ? [step("bankMatch", [`item-${pair[0]}`, `target-${pair[1]}`], "match", true)] : []),
			...(discrepancy
				? [
						...(!discrepancy.marked ? [step("bankFlag", [`flag-${discrepancy.rowId}`], "flag")] : []),
						step("bankReason", [`reason-${discrepancy.rowId}`, "rulebook"], "reason"),
					]
				: [step("bankComplete", ["monitor"])]),
		];
	},
	balanceSheet(item?: { id: string; lineId: string }) {
		return item
			? [step("balanceRead", [`item-${item.id}`]), step("balancePlace", [`item-${item.id}`, `target-${item.lineId}`], "balance", true)]
			: [step("balanceRead", ["balanceForm"]), step("balanceProfit", ["balance-computed", "calculator"])];
	},
};
