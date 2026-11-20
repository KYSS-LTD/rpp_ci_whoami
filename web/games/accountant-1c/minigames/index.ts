// Компоненты мини-игр по виду данных (design.md, D2). Уровень выбирает компонент по полю kind из data/levels.ts.
import type { ComponentType } from "react";
import type { MiniGameData, MiniGameKind } from "../data/levels";
import { BalanceSheet } from "./BalanceSheet";
import { BankReconciliation } from "./BankReconciliation";
import { CashDesk } from "./CashDesk";
import { DocumentSorting } from "./DocumentSorting";
import { Payroll } from "./Payroll";
import { Postings } from "./Postings";
import type { MiniGameProps } from "./types";

type MiniGameComponents = {
	[Kind in MiniGameKind]: ComponentType<MiniGameProps<Extract<MiniGameData, { kind: Kind }>>>;
};

export const miniGameComponents: MiniGameComponents = {
	documentSorting: DocumentSorting,
	cashDesk: CashDesk,
	postings: Postings,
	payroll: Payroll,
	bankReconciliation: BankReconciliation,
	balanceSheet: BalanceSheet,
};

// Раздел окна программы, который подсвечивается во время мини-игры.
export const miniGameSections = {
	documentSorting: "home",
	cashDesk: "cash",
	postings: "operations",
	payroll: "payroll",
	bankReconciliation: "bank",
	balanceSheet: "reports",
} as const satisfies Record<MiniGameKind, string>;

export type { MiniGameOutcome, MiniGameProgress, MiniGameProps } from "./types";
