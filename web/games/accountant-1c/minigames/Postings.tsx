"use client";

// Мини-игра "Проводки Дт/Кт" (medium): первичные документы лежат на столе, проводка вводится в программе.
// "Провести" записывает документ в журнал с отметкой проведения и ставит штамп на бумагу,
// "Дт/Кт" показывает движения проведённых документов, подсказка стоит одно очко.
import { useState } from "react";
import { miniGameTutorials } from "../data/tutorials";
import { useTutorial } from "../hooks/useTutorial";
import { type PostingsData } from "../data/levels";
import { fillTemplate } from "../logic/feedback";
import { formatRubles, parseAmountInput } from "../logic/money";
import { checkPosting, scorePostings, type PostingAnswer } from "../logic/scoring";
import { accountantTexts } from "../texts";
import { AmountInput } from "../desk/AmountInput";
import { Paper, StampMark } from "../desk/Paper";
import { Workplace } from "../desk/Workplace";
import { FormToolbar } from "../ui/parts";
import type { MiniGameProps } from "./types";
import styles from "./MiniGames.module.css";

const texts = accountantTexts.miniGames.postings;
const tilts = [-2, 1.5, -1, 2.5];

export function Postings({ data, tutorialEnabled = false, hintsEnabled, onComplete, onMistake, onNotice, onProgress }: MiniGameProps<PostingsData>) {
	const [answers, setAnswers] = useState<Record<string, PostingAnswer>>({});
	const [currentId, setCurrentId] = useState(data.operations[0]?.id ?? "");
	const [debit, setDebit] = useState("");
	const [credit, setCredit] = useState("");
	const [amountInput, setAmountInput] = useState("");
	const [isMovementsOpen, setIsMovementsOpen] = useState(false);
	const [hintedIds, setHintedIds] = useState<string[]>([]);
	const [mistakeIds, setMistakeIds] = useState<string[]>([]);

	const currentOperation = data.operations.find((operation) => operation.id === currentId) ?? null;
	const isCurrentPosted = currentOperation !== null && answers[currentOperation.id] !== undefined;
	const isAllPosted = data.operations.every((operation) => answers[operation.id] !== undefined);
	const teachingOperation = isCurrentPosted ? data.operations.find((operation) => answers[operation.id] === undefined) : currentOperation;
	const tutorial = useTutorial(tutorialEnabled, miniGameTutorials.postings(teachingOperation?.id));
	const parsedAmount = parseAmountInput(amountInput);

	function openOperation(operationId: string) {
		setCurrentId(operationId);
		setDebit("");
		setCredit("");
		setAmountInput("");
	}

	function replayTutorial() {
		if (isCurrentPosted && teachingOperation) {
			openOperation(teachingOperation.id);
		}
		tutorial.replay();
	}

	function handlePost() {
		if (!currentOperation || isCurrentPosted || debit === "" || credit === "" || parsedAmount === null) {
			return;
		}
		const answer: PostingAnswer = { debit, credit, amount: parsedAmount };
		const check = checkPosting(data, currentOperation.id, answer);
		if (!tutorial.accept("post", check.debit && check.credit && check.amount)) {
			return;
		}
		const nextAnswers = { ...answers, [currentOperation.id]: answer };
		setAnswers(nextAnswers);
		if (!check.debit || !check.credit || !check.amount) {
			const explanationId = `postings.${currentOperation.id}`;
			setMistakeIds((previous) => [...previous, explanationId]);
			onMistake({
				explanationId,
				values: { debit: currentOperation.debit, credit: currentOperation.credit, amount: formatRubles(currentOperation.amount) },
			});
		} else {
			onNotice?.(`${texts.posted}: ${fillTemplate(texts.postingLine, { debit, credit })}`);
		}

		// Точность по проведённым операциям: три проверки на операцию.
		let correctChecks = 0;
		let doneChecks = 0;
		for (const operation of data.operations) {
			const posted = nextAnswers[operation.id];
			if (!posted) {
				continue;
			}
			const operationCheck = checkPosting(data, operation.id, posted);
			correctChecks += Number(operationCheck.debit) + Number(operationCheck.credit) + Number(operationCheck.amount);
			doneChecks += 3;
		}
		const totalChecks = data.operations.length * 3;
		onProgress?.({ earned: (10 * correctChecks) / totalChecks, possible: (10 * doneChecks) / totalChecks });

		// Следующая непроведённая операция открывается сама.
		const nextOperation = data.operations.find((operation) => nextAnswers[operation.id] === undefined);
		if (nextOperation) {
			openOperation(nextOperation.id);
		}
	}

	function handleHint() {
		if (!currentOperation || hintedIds.includes(currentOperation.id)) {
			return;
		}
		setHintedIds((previous) => [...previous, currentOperation.id]);
	}

	function handleFinish() {
		onComplete({ score: scorePostings(data, answers), hintsUsed: hintedIds.length, mistakes: mistakeIds });
	}

	const accountOptions = data.accounts.map((account) => (
		<option key={account} value={account}>
			{accountantTexts.accounts[account]}
		</option>
	));

	const monitor = (
		<div className={styles.monitorForm}>
			<p className={styles.instruction}>{texts.instruction}</p>
			<div className={styles.postingsLayout}>
				<section aria-label={texts.journalTitle}>
					<h3 className={styles.areaTitle}>{texts.journalTitle}</h3>
					<table className={styles.table}>
						<tbody>
							{data.operations.map((operation, index) => {
								const isPosted = answers[operation.id] !== undefined;
								return (
									<tr key={operation.id} data-current={operation.id === currentId ? "true" : "false"}>
										<td className={styles.postedCell}>
											<span className={styles.postedMark} data-posted={isPosted ? "true" : "false"} aria-label={isPosted ? texts.posted : texts.notPosted} role="img" />
										</td>
										<td>
											<button type="button" className={styles.linkButton} onClick={() => openOperation(operation.id)} aria-current={operation.id === currentId ? "true" : undefined}>
												{index + 1}. {accountantTexts.operations[operation.id]}
											</button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</section>

				{currentOperation ? (
					<form
						className={styles.programForm}
						aria-label={accountantTexts.operations[currentOperation.id]}
						onSubmit={(event) => {
							event.preventDefault();
							handlePost();
						}}
					>
						<p className={styles.operationText} data-testid="current-operation">
							{accountantTexts.operations[currentOperation.id]}
						</p>
						<div className={styles.postingFields} data-tutorial-id="posting-fields">
							<label className={styles.field}>
								<span>{texts.debitLabel}</span>
								<select value={debit} onChange={(event) => setDebit(event.target.value)} disabled={isCurrentPosted}>
									<option value="">{texts.chooseAccount}</option>
									{accountOptions}
								</select>
							</label>
							<label className={styles.field}>
								<span>{texts.creditLabel}</span>
								<select value={credit} onChange={(event) => setCredit(event.target.value)} disabled={isCurrentPosted}>
									<option value="">{texts.chooseAccount}</option>
									{accountOptions}
								</select>
							</label>
							<label className={styles.field}>
								<span>{texts.amountLabel}</span>
								<AmountInput label={texts.amountLabel} value={amountInput} onValueChange={setAmountInput} disabled={isCurrentPosted} />
							</label>
						</div>
						{hintedIds.includes(currentOperation.id) ? (
							<p className={styles.hint} role="status">
								{fillTemplate(texts.hintText, { debit: currentOperation.debit, credit: currentOperation.credit })}
							</p>
						) : null}
						<FormToolbar
							onPostAndClose={handleFinish}
							isPostAndCloseDisabled={!isAllPosted}
							onPost={handlePost}
							postTutorialId="posting-submit"
							isPostDisabled={isCurrentPosted || debit === "" || credit === "" || parsedAmount === null}
							onMovements={() => setIsMovementsOpen((open) => !open)}
							isMovementsPressed={isMovementsOpen}
						>
							{hintsEnabled ? (
								<button type="button" onClick={handleHint} disabled={isCurrentPosted || hintedIds.includes(currentOperation.id)}>
									{accountantTexts.buttons.hint}
								</button>
							) : null}
						</FormToolbar>
					</form>
				) : null}
			</div>

			{isMovementsOpen ? (
				<section className={styles.movements} aria-label={texts.movementsTitle}>
					<h3 className={styles.areaTitle}>{texts.movementsTitle}</h3>
					{Object.keys(answers).length === 0 ? <p className={styles.emptyCell}>{texts.movementsEmpty}</p> : null}
					<table className={styles.table}>
						<tbody>
							{data.operations
								.filter((operation) => answers[operation.id] !== undefined)
								.map((operation) => {
									const answer = answers[operation.id];
									return (
										<tr key={operation.id}>
											<td>{accountantTexts.operations[operation.id]}</td>
											<td className={styles.mono}>
												{texts.debitShort} {answer.debit}
											</td>
											<td className={styles.mono}>
												{texts.creditShort} {answer.credit}
											</td>
											<td className={styles.amountCell}>{formatRubles(answer.amount ?? 0)}</td>
										</tr>
									);
								})}
						</tbody>
					</table>
				</section>
			) : null}
		</div>
	);

	const desk = data.operations.map((operation, index) => {
		const paper = accountantTexts.operationPapers[operation.id];
		const isPosted = answers[operation.id] !== undefined;
		const isCurrent = operation.id === currentId;
		return (
			<Paper
				key={operation.id}
				id={`primary-${operation.id}`}
				variant="paper"
				defaultPosition={{ x: 20 + index * 196, y: 24 + (index % 2) * 40 }}
				width={210}
				tilt={tilts[index % tilts.length]}
				title={paper.title}
				className={isCurrent ? styles.currentPaper : undefined}
			>
				<div className={styles.paperBody}>
					<ul className={styles.paperLines}>
						{paper.lines.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
					{isPosted ? (
						<StampMark label={accountantTexts.stamps.posted} />
					) : (
						<button type="button" className={styles.paperButton} onClick={() => openOperation(operation.id)} aria-pressed={isCurrent}>
							{index + 1}. {accountantTexts.window.sections.operations}
						</button>
					)}
				</div>
			</Paper>
		);
	});

	return (
		<Workplace
			tutorial={{ ...tutorial, replay: replayTutorial }}
			booth={{ character: "director", name: accountantTexts.boothCharacters.director, speech: accountantTexts.boothSpeech.postings }}
			monitorSection="operations"
			monitorTitle={texts.tab}
			rulebookTab="accounts"
			monitor={monitor}
			desk={desk}
		/>
	);
}
