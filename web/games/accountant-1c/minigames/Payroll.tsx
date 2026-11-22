"use client";

// Мини-игра "Расчёт зарплаты с НДФЛ" (medium). Число детей видно только в заявлениях на вычет на столе:
// у кого заявления нет, вычета нет. Ведомость заполняется в программе, весы на столе выравниваются при верных полях.
import { useSavedState } from "../hooks/checkpoint";
import { miniGameTutorials, type TutorialStep } from "../data/tutorials";
import { useTutorial } from "../hooks/useTutorial";
import { type PayrollData } from "../data/levels";
import { fillTemplate } from "../logic/feedback";
import { formatRubles, parseAmountInput } from "../logic/money";
import { countPayrollChecks, expectedPayrollRow, scorePayroll, type PayrollAnswer } from "../logic/scoring";
import { accountantTexts } from "../texts";
import { AmountInput } from "../desk/AmountInput";
import { Paper, StampMark } from "../desk/Paper";
import { Workplace } from "../desk/Workplace";
import { Scales } from "../ui/art";
import { FormToolbar } from "../ui/parts";
import type { MiniGameProps } from "./types";
import styles from "./MiniGames.module.css";

const texts = accountantTexts.miniGames.payroll;
const applicationTexts = accountantTexts.deductionApplications;

// Наибольший наклон весов, когда ни одно поле не верно, в градусах.
const maxTiltDeg = 16;

// Наклон весов по доле верных полей: 0 градусов при полной точности.
export function calculateScalesTilt(correctCount: number, totalCount: number): number {
	if (totalCount <= 0) {
		return maxTiltDeg;
	}
	return Math.round(maxTiltDeg * (1 - correctCount / totalCount) * 10) / 10;
}

type PayrollInputs = Record<string, { deduction: string; ndfl: string }>;

// Переводит ввод игрока в числа для проверки.
function parsePayrollInputs(inputs: PayrollInputs): Record<string, PayrollAnswer> {
	const answers: Record<string, PayrollAnswer> = {};
	for (const [employeeId, row] of Object.entries(inputs)) {
		answers[employeeId] = { deduction: parseAmountInput(row.deduction), ndfl: parseAmountInput(row.ndfl) };
	}
	return answers;
}

const tilts = [-2.5, 1.5, -1];

export function Payroll({ data, tutorialEnabled = false, hintsEnabled, onComplete, onMistake, onNotice, onProgress }: MiniGameProps<PayrollData>) {
	const [inputs, setInputs] = useSavedState<PayrollInputs>("payroll.inputs", () =>
		Object.fromEntries(data.employees.map((employee) => [employee.id, { deduction: "", ndfl: "" }])),
	);
	const [draft, setDraft] = useSavedState<{ step: TutorialStep; value: string } | undefined>("payroll.draft", undefined);
	const [hintedIds, setHintedIds] = useSavedState<string[]>("payroll.hintedIds", []);
	const [isFinished, setIsFinished] = useSavedState("payroll.isFinished", false);

	const answers = parsePayrollInputs(inputs);
	const checks = countPayrollChecks(data, answers);
	const tiltDeg = calculateScalesTilt(checks.correct, checks.total);
	const isBalanced = checks.correct === checks.total;
	const applicants = data.employees.filter((employee) => applicationTexts.employees[employee.id] !== undefined);
	const employee = applicants[0] ?? data.employees[0];
	const tutorial = useTutorial("payroll.tutorial", tutorialEnabled, miniGameTutorials.payroll(employee?.id, applicants.length > 0));

	function fieldValue(employeeId: string, field: "deduction" | "ndfl") {
		const id = `pay-${field === "ndfl" ? "tax" : field}-${employeeId}`;
		return draft && draft.step.id === tutorial.current?.id && tutorial.current.targets.includes(id) ? draft.value : inputs[employeeId][field];
	}

	function handleChange(employeeId: string, field: "deduction" | "ndfl", value: string) {
		// Калькулятор вызывает этот обработчик через свежую ссылку (AmountInput), поэтому inputs здесь актуальны.
		if (tutorial.current) {
			const action = field === "ndfl" ? "tax" : "deduction";
			if (tutorial.current.action !== action || employeeId !== employee?.id) {
				return;
			}
			const expected = expectedPayrollRow(employee.salary, employee.childrenCount);
			if (parseAmountInput(value) !== expected[field]) {
				setDraft({ step: tutorial.current, value });
				return;
			}
			if (!tutorial.accept(action, true)) {
				return;
			}
			setDraft(undefined);
		}
		const nextInputs = { ...inputs, [employeeId]: { ...inputs[employeeId], [field]: value } };
		setInputs(nextInputs);
		const nextAnswers = parsePayrollInputs(nextInputs);
		const nextChecks = countPayrollChecks(data, nextAnswers);
		const filledCount = Object.values(nextAnswers).reduce(
			(count, answer) => count + Number(answer.deduction !== null) + Number(answer.ndfl !== null),
			0,
		);
		onProgress?.({ earned: (10 * nextChecks.correct) / nextChecks.total, possible: (10 * filledCount) / nextChecks.total });
	}

	// Подсказка раскрывает первого сотрудника с ошибкой.
	function handleHint() {
		const employee = data.employees.find((candidate) => {
			const expected = expectedPayrollRow(candidate.salary, candidate.childrenCount);
			const answer = answers[candidate.id];
			return !hintedIds.includes(candidate.id) && (answer?.deduction !== expected.deduction || answer?.ndfl !== expected.ndfl);
		});
		if (employee) {
			setHintedIds((previous) => [...previous, employee.id]);
		}
	}

	function handleFinish() {
		if (isFinished) {
			return;
		}
		setIsFinished(true);
		const mistakeIds: string[] = [];
		for (const employee of data.employees) {
			const expected = expectedPayrollRow(employee.salary, employee.childrenCount);
			const answer = answers[employee.id];
			const name = accountantTexts.employees[employee.id];
			if (answer?.deduction !== expected.deduction) {
				mistakeIds.push("payroll.deduction");
				onMistake({ explanationId: "payroll.deduction", values: { name, expected: formatRubles(expected.deduction) } });
			}
			if (answer?.ndfl !== expected.ndfl) {
				mistakeIds.push("payroll.ndfl");
				onMistake({ explanationId: "payroll.ndfl", values: { name, expected: formatRubles(expected.ndfl) } });
			}
		}
		onComplete({ score: scorePayroll(data, answers), hintsUsed: hintedIds.length, mistakes: mistakeIds });
	}

	const monitor = (
		<div className={styles.monitorForm}>
			<p className={styles.instruction}>{texts.instruction}</p>
			<div className={styles.tableScroll}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th scope="col">{texts.employeeColumn}</th>
							<th scope="col">{texts.salaryColumn}</th>
							<th scope="col">{texts.deductionColumn}</th>
							<th scope="col">{texts.ndflColumn}</th>
							<th scope="col">{texts.payoutColumn}</th>
						</tr>
					</thead>
					<tbody>
						{data.employees.map((employee) => {
							const name = accountantTexts.employees[employee.id];
							const ndfl = answers[employee.id]?.ndfl ?? null;
							return (
								<tr key={employee.id} data-tutorial-id={`pay-row-${employee.id}`}>
									<th scope="row">{name}</th>
									<td className={styles.amountCell}>{formatRubles(employee.salary)}</td>
									<td>
										<AmountInput
											className={styles.cellInput}
											label={`${texts.deductionColumn}: ${name}`}
											value={fieldValue(employee.id, "deduction")}
											data-tutorial-id={`pay-deduction-${employee.id}`}
											disabled={isFinished}
											onValueChange={(value) => handleChange(employee.id, "deduction", value)}
										/>
									</td>
									<td>
										<AmountInput
											className={styles.cellInput}
											label={`${texts.ndflColumn}: ${name}`}
											value={fieldValue(employee.id, "ndfl")}
											data-tutorial-id={`pay-tax-${employee.id}`}
											disabled={isFinished}
											onValueChange={(value) => handleChange(employee.id, "ndfl", value)}
										/>
									</td>
									<td className={styles.amountCell}>{ndfl === null ? "-" : formatRubles(employee.salary - ndfl)}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{hintedIds.map((employeeId) => {
				const employee = data.employees.find((candidate) => candidate.id === employeeId);
				if (!employee) {
					return null;
				}
				const expected = expectedPayrollRow(employee.salary, employee.childrenCount);
				return (
					<p key={employeeId} className={styles.hint} role="status">
						{fillTemplate(texts.hintText, {
							name: accountantTexts.employees[employeeId],
							deduction: formatRubles(expected.deduction),
							ndfl: formatRubles(expected.ndfl),
						})}
					</p>
				);
			})}

			<FormToolbar onPostAndClose={handleFinish} isPostAndCloseDisabled={isFinished} onSave={() => onNotice?.(texts.savedMessage)}>
				{hintsEnabled ? (
					<button type="button" onClick={handleHint} disabled={isFinished || isBalanced}>
						{accountantTexts.buttons.hint}
					</button>
				) : null}
			</FormToolbar>
		</div>
	);

	const desk = (
		<>
			{applicants.map((employee, index) => (
				<Paper
					key={employee.id}
					id={`application-${employee.id}`}
					variant="form"
					defaultPosition={{ x: 20 + index * 230, y: 24 + (index % 2) * 36 }}
					width={220}
					tilt={tilts[index % tilts.length]}
					title={applicationTexts.title}
				>
					<div className={styles.paperBody}>
						<p>
							<strong>{accountantTexts.employees[employee.id]}</strong>
						</p>
						<p>{applicationTexts.intro}</p>
						<ol className={styles.childrenList}>
							{applicationTexts.employees[employee.id].map((child) => (
								<li key={child}>{child}</li>
							))}
						</ol>
						{isFinished ? <StampMark label={accountantTexts.stamps.posted} tone="green" /> : null}
					</div>
				</Paper>
			))}
			<Paper id="noApplications" variant="note" defaultPosition={{ x: 40, y: 270 }} width={220} tilt={2}>
				<p className={styles.paperBody}>{applicationTexts.noApplication}</p>
			</Paper>
			<Paper id="payrollScales" variant="card" defaultPosition={{ x: 470, y: 250 }} width={220} tilt={-1} title={texts.scalesLabel}>
				<figure className={styles.scalesFigure}>
					<Scales tiltDeg={tiltDeg} label={isBalanced ? texts.scalesBalanced : texts.scalesTilted} />
					<figcaption data-testid="payroll-scales" data-tilt={tiltDeg}>
						{isBalanced ? texts.scalesBalanced : texts.scalesTilted}
					</figcaption>
				</figure>
			</Paper>
		</>
	);

	return (
		<Workplace
			tutorial={tutorial}
			booth={{ character: "chief", name: accountantTexts.boothCharacters.chief, speech: accountantTexts.boothSpeech.payroll }}
			monitorSection="payroll"
			monitorTitle={texts.tab}
			rulebookTab="ndfl"
			monitor={monitor}
			desk={desk}
		/>
	);
}
