"use client";

// Части интерфейса: панель кнопок формы в программе, лист «Итоги дня» и анимированный счётчик сумм.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { levelMaxScore, miniGameMaxScore } from "../data/levels";
import { fillTemplate } from "../logic/feedback";
import { formatRubles } from "../logic/money";
import { calculateShare, getStampId } from "../logic/mood";
import { accountantTexts } from "../texts";
import { Stamp } from "./art";
import { prefersReducedMotion } from "./motion";
import styles from "./parts.module.css";

// ---------- Кнопки формы ----------

interface FormToolbarProps {
	onPostAndClose?: () => void;
	onSave?: () => void;
	onPost?: () => void;
	postTutorialId?: string;
	onMovements?: () => void;
	isPostAndCloseDisabled?: boolean;
	isPostDisabled?: boolean;
	isMovementsPressed?: boolean;
	children?: ReactNode;
}

// Панель кнопок формы документа. Показываются только кнопки с обработчиком. Подписи из texts.
// «Провести и закрыть» - основная жёлтая кнопка, как в учётных программах.
export function FormToolbar({
	onPostAndClose,
	onSave,
	onPost,
	postTutorialId,
	onMovements,
	isPostAndCloseDisabled = false,
	isPostDisabled = false,
	isMovementsPressed = false,
	children,
}: FormToolbarProps) {
	const buttonTexts = accountantTexts.buttons;
	return (
		<div className={styles.toolbar} role="toolbar">
			{onPostAndClose ? (
				<button type="button" className={styles.primaryButton} onClick={onPostAndClose} disabled={isPostAndCloseDisabled}>
					{buttonTexts.postAndClose}
				</button>
			) : null}
			{onSave ? (
				<button type="button" onClick={onSave}>
					{buttonTexts.save}
				</button>
			) : null}
			{onPost ? (
				<button type="button" onClick={onPost} disabled={isPostDisabled} data-tutorial-id={postTutorialId}>
					{buttonTexts.post}
				</button>
			) : null}
			{onMovements ? (
				<button type="button" className={styles.movementsButton} onClick={onMovements} aria-pressed={isMovementsPressed}>
					{buttonTexts.movements}
				</button>
			) : null}
			{children}
		</div>
	);
}

// ---------- Итоги дня ----------

interface MonthCloseProps {
	levelScore: number;
	isSent: boolean;
	onSubmit: () => void;
	// Строки по заданиям дня: название и очки после подсказок.
	taskLines?: Array<{ title: string; score: number }>;
	hintsUsed?: number;
	mistakesCount?: number;
	epilogue?: string;
}

// Лист «Итоги дня» (закрытие месяца): строки заданий, подсказки, замечания, итог, штамп по порогам и кнопка «Сдать отчёт».
export function MonthClose({ levelScore, isSent, onSubmit, taskLines = [], hintsUsed = 0, mistakesCount = 0, epilogue }: MonthCloseProps) {
	const [interest, setInterest] = useState<number | null>(null);
	const texts = accountantTexts.monthClose;
	const summaryTexts = accountantTexts.daySummary;
	const share = calculateShare(levelScore, levelMaxScore) ?? 0;
	const stampId = getStampId(share);
	const report = accountantTexts.professionReport;
	const match = interest === null ? null : Math.round((share * 100 + interest * 50) / 2);
	return (
		<section className={styles.monthClose} aria-labelledby="month-close-title">
			<h2 id="month-close-title" className={styles.formTitle}>
				{texts.title}
			</h2>
			<div className={styles.shiftSummary}>
				<table className={styles.ledger}>
					<tbody>
						{taskLines.map((line, index) => (
							<tr key={line.title}>
								<th scope="row">{fillTemplate(summaryTexts.taskLine, { number: String(index + 1), title: line.title })}</th>
								<td>
									{line.score} / {miniGameMaxScore}
								</td>
							</tr>
						))}
						{taskLines.length > 0 ? (
							<>
								<tr>
									<th scope="row">{summaryTexts.hintsLine}</th>
									<td>{hintsUsed}</td>
								</tr>
								<tr>
									<th scope="row">{summaryTexts.mistakesLine}</th>
									<td>{mistakesCount}</td>
								</tr>
							</>
						) : null}
						<tr className={styles.totalRow}>
							<th scope="row">{texts.totalLabel}</th>
							<td>
								<strong>
									{levelScore} / {levelMaxScore}
								</strong>
							</td>
						</tr>
					</tbody>
				</table>
				<Stamp stampId={stampId} label={texts.stamps[stampId]} className={styles.stampPress} />
				{epilogue ? <p>{epilogue}</p> : null}
			</div>
			{taskLines.length > 0 ? (
				<section className={styles.professionReport} aria-labelledby="accountant-profession-report">
					<h3 id="accountant-profession-report">{report.title}</h3>
					<p>{report.accuracy} · {Math.round(share * 100)}%</p>
					<fieldset>
						<legend>{report.interest}</legend>
						{report.choices.map((choice, index) => (
							<label key={choice}><input type="radio" name="accountant-career-interest" checked={interest === index} onChange={() => setInterest(index)} />{choice}</label>
						))}
					</fieldset>
					<div role="status">
						{match === null ? <p>{report.prompt}</p> : <>
							<p><strong>{report.match} · {match}%</strong></p>
							<p>{report.advice[match >= 75 ? 2 : match >= 40 ? 1 : 0]}</p>
							<p>{report.scale}</p>
						</>}
					</div>
				</section>
			) : null}
			<button type="button" className={styles.submitButton} onClick={onSubmit} disabled={isSent}>
				{accountantTexts.buttons.submitReport}
			</button>
			{isSent ? <p role="status">{texts.sent}</p> : null}
		</section>
	);
}

// ---------- Счётчик сумм ----------

const countDurationMs = 700;

// Анимированный счётчик суммы в рублях: число плавно доходит до нового значения. При сниженном движении меняется сразу.
export function CountUp({ value, className }: { value: number; className?: string }) {
	const [shownValue, setShownValue] = useState(value);
	const shownValueRef = useRef(value);

	useEffect(() => {
		const fromValue = shownValueRef.current;
		if (fromValue === value) {
			return;
		}
		const isInstant = prefersReducedMotion();
		let frameId = 0;
		const startedAt = performance.now();
		const step = (now: number) => {
			const progress = isInstant ? 1 : Math.min(1, (now - startedAt) / countDurationMs);
			// Плавное замедление к концу.
			const eased = 1 - (1 - progress) ** 3;
			const current = progress >= 1 ? value : Math.round(fromValue + (value - fromValue) * eased);
			shownValueRef.current = current;
			setShownValue(current);
			if (progress < 1) {
				frameId = window.requestAnimationFrame(step);
			}
		};
		frameId = window.requestAnimationFrame(step);
		return () => window.cancelAnimationFrame(frameId);
	}, [value]);

	return (
		<span className={className} data-value={value} data-shown={shownValue}>
			{formatRubles(shownValue)}
		</span>
	);
}
