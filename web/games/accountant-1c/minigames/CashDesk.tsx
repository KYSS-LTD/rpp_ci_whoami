"use client";

// Мини-игра "Касса" (easy) на столе: посетитель в окошке говорит, что ему нужно; бухгалтер отрывает бланк ПКО или РКО
// от блока, пишет сумму (можно посчитать на калькуляторе), проводит и отдаёт ордер в окошко со штампом «Проведено».
// В конце смены приходит инкассатор: излишек сверх лимита сдаётся в банк.
import { useState } from "react";
import { type CashDeskData, type CashDocumentType } from "../data/levels";
import { formatRubles, parseAmountInput } from "../logic/money";
import { cashSurplusPoints, calculateCashSurplus, scoreCashDesk, type CashVisitorAnswer } from "../logic/scoring";
import { accountantTexts } from "../texts";
import { AmountInput } from "../desk/AmountInput";
import { Paper, StampMark } from "../desk/Paper";
import { Workplace, type BoothScene } from "../desk/Workplace";
import { Banknotes } from "../ui/art";
import { CountUp, FormToolbar } from "../ui/parts";
import type { MiniGameProps } from "./types";
import styles from "./MiniGames.module.css";

const texts = accountantTexts.miniGames.cashDesk;
const paperTexts = accountantTexts.cashPapers;
const documentTypes: CashDocumentType[] = ["incomeOrder", "outcomeOrder"];

// Последний отданный в окошко ордер: лежит на подоконнике со штампом.
interface HandedOrder {
	visitorId: string;
	documentType: CashDocumentType;
	amount: number;
}

export function CashDesk({ data, onComplete, onMistake, onNotice, onProgress }: MiniGameProps<CashDeskData>) {
	const [visitorIndex, setVisitorIndex] = useState(0);
	// Бланк, оторванный от блока, или null, пока бланка на столе нет.
	const [documentType, setDocumentType] = useState<CashDocumentType | null>(null);
	const [amountInput, setAmountInput] = useState("");
	const [surplusInput, setSurplusInput] = useState("");
	const [isAmountInvalid, setIsAmountInvalid] = useState(false);
	const [answers, setAnswers] = useState<Record<string, CashVisitorAnswer>>({});
	const [handedOrder, setHandedOrder] = useState<HandedOrder | null>(null);
	const [surplusAnswer, setSurplusAnswer] = useState<number | null>(null);
	const [isSurplusPosted, setIsSurplusPosted] = useState(false);
	const [mistakeIds, setMistakeIds] = useState<string[]>([]);
	// Остаток в кассе по верным суммам: ошибки главбух исправляет сразу.
	const [balance, setBalance] = useState(data.openingBalance);

	const visitor = data.visitors[visitorIndex] ?? null;
	const isSurplusStage = visitor === null;

	function reportProgress(nextAnswers: Record<string, CashVisitorAnswer>, surplus: number | null, surplusDone: boolean) {
		let earned = 0;
		let possible = 0;
		for (const candidate of data.visitors) {
			const answer = nextAnswers[candidate.id];
			if (!answer) {
				continue;
			}
			possible += 2;
			earned += Number(answer.documentType === candidate.documentType) + Number(answer.amount === candidate.amount);
		}
		if (surplusDone) {
			possible += cashSurplusPoints;
			earned += surplus === calculateCashSurplus(data) ? cashSurplusPoints : 0;
		}
		onProgress?.({ earned, possible });
	}

	function recordMistake(explanationId: string, values: Record<string, string>) {
		setMistakeIds((previous) => [...previous, explanationId]);
		onMistake({ explanationId, values });
	}

	function handleHandOver() {
		if (!visitor || documentType === null) {
			return;
		}
		const amount = parseAmountInput(amountInput);
		if (amount === null) {
			setIsAmountInvalid(true);
			return;
		}
		setIsAmountInvalid(false);
		const nextAnswers = { ...answers, [visitor.id]: { documentType, amount } };
		setAnswers(nextAnswers);
		if (documentType !== visitor.documentType) {
			recordMistake(`cash.document.${visitor.id}`, { document: accountantTexts.cashDocumentTypes[visitor.documentType] });
		}
		if (amount !== visitor.amount) {
			recordMistake("cash.amount", { amount: formatRubles(visitor.amount) });
		}
		if (documentType === visitor.documentType && amount === visitor.amount) {
			onNotice?.(`${accountantTexts.cashDocumentTypes[visitor.documentType]}: ${formatRubles(visitor.amount)} ₽`);
		}
		setHandedOrder({ visitorId: visitor.id, documentType, amount });
		setBalance((current) => current + (visitor.documentType === "incomeOrder" ? visitor.amount : -visitor.amount));
		setVisitorIndex((index) => index + 1);
		setDocumentType(null);
		setAmountInput("");
		reportProgress(nextAnswers, null, false);
	}

	function handlePostSurplus() {
		if (isSurplusPosted) {
			return;
		}
		const amount = parseAmountInput(surplusInput);
		if (amount === null) {
			setIsAmountInvalid(true);
			return;
		}
		setIsAmountInvalid(false);
		const expected = calculateCashSurplus(data);
		setSurplusAnswer(amount);
		setIsSurplusPosted(true);
		if (amount !== expected) {
			recordMistake("cash.surplus", {
				amount: formatRubles(expected),
				balance: formatRubles(balance),
				limit: formatRubles(data.cashLimit),
			});
		} else {
			onNotice?.(`${texts.surplusTitle}: ${formatRubles(amount)} ₽`);
		}
		// В кассе остаётся лимит: излишек уехал в банк.
		setBalance((current) => current - expected);
		reportProgress(answers, amount, true);
	}

	function handleFinish() {
		onComplete({ score: scoreCashDesk(data, { visitors: answers, surplus: surplusAnswer }), hintsUsed: 0, mistakes: mistakeIds });
	}

	const booth: BoothScene = visitor
		? {
				character: "visitor",
				variant: visitorIndex,
				name: accountantTexts.cashVisitors[visitor.id].name,
				speech: accountantTexts.cashVisitors[visitor.id].speech,
			}
		: {
				character: "collector",
				name: accountantTexts.boothCharacters.collector,
				speech: isSurplusPosted ? accountantTexts.boothSpeech.cashDone : accountantTexts.boothSpeech.collector,
			};

	const handedCounter = handedOrder ? (
		<div className={styles.handedOrder} data-testid="handed-order" key={handedOrder.visitorId}>
			<span>
				{handedOrder.documentType === "incomeOrder" ? paperTexts.incomeTitle : paperTexts.outcomeTitle}: {formatRubles(handedOrder.amount)} ₽
			</span>
			<StampMark label={accountantTexts.stamps.posted} />
		</div>
	) : null;

	const bookEntries = data.visitors.filter((candidate) => answers[candidate.id] !== undefined);

	return (
		<Workplace
			booth={{ ...booth, counter: handedCounter }}
			monitorSection="cash"
			monitorTitle={texts.tab}
			rulebookTab="cash"
			monitor={
				<div className={styles.monitorForm}>
					<h2 className={styles.formTitle}>{paperTexts.bookTitle}</h2>
					<p className={styles.instruction}>{texts.instruction}</p>
					<table className={styles.table}>
						<tbody>
							<tr>
								<td>{paperTexts.openingLine}</td>
								<td className={styles.amountCell}>{formatRubles(data.openingBalance)}</td>
							</tr>
							{bookEntries.length === 0 ? (
								<tr>
									<td colSpan={2} className={styles.emptyCell}>
										{paperTexts.bookEmpty}
									</td>
								</tr>
							) : null}
							{bookEntries.map((candidate) => {
								const answer = answers[candidate.id];
								return (
									<tr key={candidate.id}>
										<td>
											{accountantTexts.cashDocumentTypes[answer.documentType ?? "incomeOrder"]}: {accountantTexts.cashVisitors[candidate.id].name}
										</td>
										<td className={styles.amountCell}>{formatRubles(answer.amount ?? 0)}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					<FormToolbar onPostAndClose={handleFinish} isPostAndCloseDisabled={!isSurplusPosted} />
				</div>
			}
			desk={
				<>
					<Paper id="cashBox" variant="card" defaultPosition={{ x: 20, y: 20 }} width={230} tilt={-1} title={paperTexts.boxTitle}>
						<div className={styles.cashBox}>
							<Banknotes />
							<p>
								{texts.balanceLabel}: <CountUp value={balance} className={styles.cashCounter} /> ₽
							</p>
							<p>
								{texts.limitLabel}: <strong>{formatRubles(data.cashLimit)}</strong> ₽
							</p>
						</div>
					</Paper>

					{visitor ? (
						<Paper id="orderPads" variant="pad" defaultPosition={{ x: 20, y: 210 }} width={230} title={paperTexts.tearHint}>
							<div className={styles.pads} role="radiogroup" aria-label={texts.documentLabel}>
								{documentTypes.map((type) => (
									<button
										key={type}
										type="button"
										role="radio"
										aria-checked={documentType === type}
										className={styles.pad}
										data-type={type}
										onClick={() => {
											setDocumentType(type);
											setIsAmountInvalid(false);
										}}
									>
										{type === "incomeOrder" ? paperTexts.incomePad : paperTexts.outcomePad}
										<span className={styles.padSheets} aria-hidden="true" />
									</button>
								))}
							</div>
						</Paper>
					) : null}

					{visitor && documentType ? (
						<Paper
							key={`${visitor.id}-${documentType}`}
							id={`order-${visitor.id}`}
							variant="form"
							defaultPosition={{ x: 290, y: 40 }}
							width={340}
							tilt={1}
							title={documentType === "incomeOrder" ? paperTexts.incomeTitle : paperTexts.outcomeTitle}
							className={styles.tornForm}
						>
							<form
								className={styles.paperForm}
								onSubmit={(event) => {
									event.preventDefault();
									handleHandOver();
								}}
							>
								<p>
									{paperTexts.personLabel}: <strong>{accountantTexts.cashVisitors[visitor.id].name}</strong>
								</p>
								<label className={styles.paperField}>
									<span>{paperTexts.amountLabel}</span>
									<AmountInput
										label={texts.amountLabel}
										value={amountInput}
										placeholder={texts.amountPlaceholder}
										aria-invalid={isAmountInvalid}
										onValueChange={setAmountInput}
									/>
								</label>
								{isAmountInvalid ? (
									<p className={styles.fieldError} role="alert">
										{texts.amountInvalid}
									</p>
								) : null}
								<button type="submit" className={styles.paperButton} disabled={amountInput.trim() === ""}>
									{paperTexts.handOver}
								</button>
							</form>
						</Paper>
					) : null}

					{isSurplusStage ? (
						<Paper id="collection" variant="form" defaultPosition={{ x: 290, y: 40 }} width={340} tilt={-1} title={paperTexts.collectionTitle}>
							<form
								className={styles.paperForm}
								onSubmit={(event) => {
									event.preventDefault();
									handlePostSurplus();
								}}
							>
								<h3 className={styles.paperHeading}>{texts.surplusTitle}</h3>
								<label className={styles.paperField}>
									<span>{paperTexts.collectionAmount}</span>
									<AmountInput
										label={texts.surplusLabel}
										value={surplusInput}
										disabled={isSurplusPosted}
										aria-invalid={isAmountInvalid}
										onValueChange={setSurplusInput}
									/>
								</label>
								{isAmountInvalid ? (
									<p className={styles.fieldError} role="alert">
										{texts.amountInvalid}
									</p>
								) : null}
								{isSurplusPosted ? (
									<StampMark label={accountantTexts.stamps.posted} />
								) : (
									<button type="submit" className={styles.paperButton} disabled={surplusInput.trim() === ""}>
										{accountantTexts.buttons.post}
									</button>
								)}
							</form>
						</Paper>
					) : null}
				</>
			}
		/>
	);
}
