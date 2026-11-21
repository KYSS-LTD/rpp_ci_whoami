"use client";

// Мини-игра "Сверка банковской выписки" (hard). На столе два листа: выписка банка и карточка счёта 51.
// Строку выписки сопоставляют со строкой учёта: перетащить на неё, выбрать её и затем пару, или клавиатурой.
// То, что не сходится, отмечают на бумаге кнопкой «Расхождение», причину выбирают в программе.
import { useState } from "react";
import { miniGameTutorials } from "../data/tutorials";
import { useTutorial } from "../hooks/useTutorial";
import { type BankReconciliationData, type DiscrepancyReason, type StatementRow } from "../data/levels";
import { fillTemplate } from "../logic/feedback";
import { formatRubles } from "../logic/money";
import { checkReconciliation, scoreBankReconciliation, type ReconciliationMarks } from "../logic/scoring";
import { shuffle } from "../logic/shuffle";
import { accountantTexts } from "../texts";
import { Paper } from "../desk/Paper";
import { Workplace } from "../desk/Workplace";
import { FormToolbar } from "../ui/parts";
import { usePickAndDrop } from "../ui/usePickAndDrop";
import type { MiniGameProps } from "./types";
import styles from "./MiniGames.module.css";

const texts = accountantTexts.miniGames.bankReconciliation;
const paperTexts = accountantTexts.statementPapers;

function RowSummary({ row }: { row: StatementRow }) {
	return (
		<>
			<span className={styles.rowText}>{accountantTexts.statementRows[row.id]}</span>
			<span className={styles.rowAmount} data-direction={row.direction}>
				{row.direction === "in" ? "+" : "-"}
				{formatRubles(row.amount)}
			</span>
		</>
	);
}

interface StatementDeskProps {
	bankRows: StatementRow[];
	ledgerRows: StatementRow[];
	matches: Record<string, string>;
	marks: ReconciliationMarks;
	isFinished: boolean;
	tutorialTarget?: string;
	onMatch: (bankId: string, ledgerId: string) => boolean;
	onToggleMark: (rowId: string) => void;
}

// Стол сверки: два листа. Внутри рабочего места, потому что выбор строки и цели общий для обоих листов.
function StatementDesk({ bankRows, ledgerRows, matches, marks, isFinished, tutorialTarget, onMatch, onToggleMark }: StatementDeskProps) {
	const matchedLedgerIds = Object.values(matches);
	const isMatched = (row: StatementRow) => (row.side === "bank" ? matches[row.id] !== undefined : matchedLedgerIds.includes(row.id));
	const isMarked = (rowId: string) => marks[rowId] !== undefined;
	const openLedgerIds = ledgerRows.filter((row) => !isMatched(row) && !isMarked(row.id)).map((row) => row.id);
	const { selectedItemId, getItemProps, getTargetProps, cancelSelection } = usePickAndDrop({ targetIds: openLedgerIds, tutorialTarget, onPlace: onMatch });

	function renderFlag(row: StatementRow) {
		if (isMatched(row)) {
			return <span className={styles.matchedBadge}>{texts.matched}</span>;
		}
		const marked = isMarked(row.id);
		const rowText = accountantTexts.statementRows[row.id];
		return (
			<button
				type="button"
				className={styles.flagButton}
				data-tutorial-id={`flag-${row.id}`}
				aria-pressed={marked}
				aria-label={`${marked ? texts.unmark : texts.markDiscrepancy}: ${rowText}`}
				disabled={isFinished}
				onClick={() => onToggleMark(row.id)}
			>
				{marked ? paperTexts.unflag : paperTexts.flag}
			</button>
		);
	}

	return (
		<>
			<Paper id="bankStatement" variant="paper" defaultPosition={{ x: 20, y: 16 }} width={380} tilt={-1} title={paperTexts.bankTitle}>
				<ul className={styles.statementList} aria-label={texts.bankColumn}>
					{bankRows.map((row) => {
						const state = isMatched(row) ? "matched" : isMarked(row.id) ? "marked" : "open";
						return (
							<li key={row.id} className={styles.statementRow} data-state={state}>
								{state === "open" && !isFinished ? (
									<button {...getItemProps(row.id)} className={`${styles.rowBody} ${styles.rowDraggable}`}>
										<RowSummary row={row} />
									</button>
								) : (
									<div className={styles.rowBody}>
										<RowSummary row={row} />
									</div>
								)}
								{renderFlag(row)}
							</li>
						);
					})}
				</ul>
				{selectedItemId ? (
					<button type="button" className={styles.paperButton} onClick={cancelSelection}>
						{accountantTexts.buttons.cancelSelection}
					</button>
				) : null}
			</Paper>

			<Paper id="ledgerCard" variant="form" defaultPosition={{ x: 420, y: 30 }} width={380} tilt={1} title={paperTexts.ledgerTitle}>
				<ul className={styles.statementList} aria-label={texts.ledgerColumn}>
					{ledgerRows.map((row) => {
						const state = isMatched(row) ? "matched" : isMarked(row.id) ? "marked" : "open";
						return (
							<li key={row.id} className={styles.statementRow} data-state={state}>
								{state === "open" && !isFinished ? (
									<div {...getTargetProps(row.id)} className={`${styles.rowBody} ${styles.rowTarget}`}>
										<RowSummary row={row} />
									</div>
								) : (
									<div className={styles.rowBody} data-placed-id={state === "matched" ? row.id : undefined}>
										<RowSummary row={row} />
									</div>
								)}
								{renderFlag(row)}
							</li>
						);
					})}
				</ul>
			</Paper>
		</>
	);
}

export function BankReconciliation({ data, random, tutorialEnabled = false, onComplete, onMistake, onNotice }: MiniGameProps<BankReconciliationData>) {
	const [rowOrder] = useState(() => ({
		bank: shuffle(
			data.rows.filter((row) => row.side === "bank"),
			random,
		),
		ledger: shuffle(
			data.rows.filter((row) => row.side === "ledger"),
			random,
		),
	}));
	// Сопоставленные пары: строка выписки -> строка учёта.
	const [matches, setMatches] = useState<Record<string, string>>({});
	const [marks, setMarks] = useState<ReconciliationMarks>({});
	const [isFinished, setIsFinished] = useState(false);

	const matchedLedgerIds = Object.values(matches);
	const openPair = data.matchingPairs.find(([bankId, ledgerId]) =>
		matches[bankId] === undefined && !matchedLedgerIds.includes(ledgerId) && marks[bankId] === undefined && marks[ledgerId] === undefined,
	);
	const practiceDiscrepancy = data.discrepancies
		.flatMap(({ rowIds, reason }) => rowIds.map((rowId) => ({ rowId, reason, marked: marks[rowId] !== undefined })))
		.find(({ rowId, reason }) => matches[rowId] === undefined && !matchedLedgerIds.includes(rowId) && marks[rowId] !== reason);
	const tutorial = useTutorial(tutorialEnabled, miniGameTutorials.bankReconciliation(openPair, practiceDiscrepancy));
	const tutorialTarget = tutorial.current?.action === "match" ? tutorial.current.targets[1].slice("target-".length) : undefined;

	function handleMatch(bankId: string, ledgerId: string): boolean {
		const isValidPair = data.matchingPairs.some(([pairBankId, pairLedgerId]) => pairBankId === bankId && pairLedgerId === ledgerId);
		if (!tutorial.accept("match", bankId === openPair?.[0] && ledgerId === openPair?.[1] && isValidPair)) {
			return false;
		}
		if (!isValidPair || matches[bankId] !== undefined || Object.values(matches).includes(ledgerId)) {
			onMistake({ explanationId: "reconciliation.badMatch" });
			return false;
		}
		setMatches((previous) => ({ ...previous, [bankId]: ledgerId }));
		onNotice?.(texts.matchedMessage);
		return true;
	}

	function toggleMark(rowId: string) {
		if (!tutorial.accept("flag", rowId === practiceDiscrepancy?.rowId && marks[rowId] === undefined)) {
			return;
		}
		setMarks((previous) => {
			const next = { ...previous };
			if (next[rowId] !== undefined) {
				delete next[rowId];
			} else {
				next[rowId] = null;
			}
			return next;
		});
	}

	function setReason(rowId: string, reason: DiscrepancyReason | null) {
		if (!tutorial.accept("reason", rowId === practiceDiscrepancy?.rowId && reason === practiceDiscrepancy.reason)) {
			return;
		}
		setMarks((previous) => ({ ...previous, [rowId]: reason }));
	}

	function handleFinish() {
		if (isFinished) {
			return;
		}
		setIsFinished(true);
		const check = checkReconciliation(data, marks);
		const mistakeIds: string[] = [];
		for (const discrepancy of data.discrepancies) {
			const values = {
				row: accountantTexts.statementRows[discrepancy.rowIds[0]],
				reason: accountantTexts.discrepancyReasons[discrepancy.reason],
			};
			if (!check.foundIds.includes(discrepancy.id)) {
				mistakeIds.push("reconciliation.missed");
				onMistake({ explanationId: "reconciliation.missed", values });
			} else if (!check.correctReasonIds.includes(discrepancy.id)) {
				mistakeIds.push("reconciliation.wrongReason");
				onMistake({ explanationId: "reconciliation.wrongReason", values });
			}
		}
		for (const rowId of check.falseMarkRowIds) {
			mistakeIds.push("reconciliation.falseMark");
			onMistake({ explanationId: "reconciliation.falseMark", values: { row: accountantTexts.statementRows[rowId] } });
		}
		onComplete({ score: scoreBankReconciliation(data, marks), hintsUsed: 0, mistakes: mistakeIds });
	}

	const markedRowIds = [...rowOrder.bank, ...rowOrder.ledger].map((row) => row.id).filter((rowId) => marks[rowId] !== undefined);

	const monitor = (
		<div className={styles.monitorForm}>
			<p className={styles.instruction}>{texts.instruction}</p>
			<p className={styles.counterLine}>{fillTemplate(paperTexts.matchedCount, { count: String(Object.keys(matches).length) })}</p>
			<h3 className={styles.areaTitle}>{paperTexts.monitorTitle}</h3>
			<table className={styles.table}>
				<tbody>
					{markedRowIds.length === 0 ? (
						<tr>
							<td className={styles.emptyCell}>{paperTexts.monitorEmpty}</td>
						</tr>
					) : null}
					{markedRowIds.map((rowId) => {
						const rowText = accountantTexts.statementRows[rowId];
						return (
							<tr key={rowId}>
								<td>{rowText}</td>
								<td>
									<select
										aria-label={`${texts.reasonLabel}: ${rowText}`}
										data-tutorial-id={`reason-${rowId}`}
										value={marks[rowId] ?? ""}
										disabled={isFinished}
										onChange={(event) => setReason(rowId, event.target.value === "" ? null : (event.target.value as DiscrepancyReason))}
									>
										<option value="">{texts.chooseReason}</option>
										{data.reasons.map((reason) => (
											<option key={reason} value={reason}>
												{accountantTexts.discrepancyReasons[reason]}
											</option>
										))}
									</select>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			<FormToolbar onPostAndClose={handleFinish} isPostAndCloseDisabled={isFinished} />
		</div>
	);

	return (
		<Workplace
			tutorial={tutorial}
			booth={{ character: "inspector", name: accountantTexts.boothCharacters.inspector, speech: accountantTexts.boothSpeech.bankReconciliation }}
			monitorSection="bank"
			monitorTitle={texts.tab}
			rulebookTab="reconciliation"
			monitor={monitor}
			desk={
				<StatementDesk
					bankRows={rowOrder.bank}
					ledgerRows={rowOrder.ledger}
					matches={matches}
					marks={marks}
					isFinished={isFinished}
					tutorialTarget={tutorialTarget}
					onMatch={handleMatch}
					onToggleMark={toggleMark}
				/>
			}
		/>
	);
}
