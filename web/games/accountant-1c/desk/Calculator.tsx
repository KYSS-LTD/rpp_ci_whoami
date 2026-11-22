"use client";

// Настольный калькулятор (design.md, D11): кнопки мышью и касанием, ввод с клавиатуры, лента с историей,
// «%» как у бухгалтерского калькулятора и «В поле» для вставки результата в последнее выбранное поле суммы.
import { useState, type KeyboardEvent } from "react";
import {
	formatCalculatorEntry,
	getCalculatorValue,
	initialCalculatorState,
	keyboardToCalculatorKey,
	numberToEntry,
	pressCalculatorKey,
	type CalculatorKey,
	type CalculatorState,
} from "../logic/calculator";
import { fillTemplate } from "../logic/feedback";
import { accountantTexts } from "../texts";
import { useAmountTarget, type PaperPosition } from "./contexts";
import { Paper } from "./Paper";
import styles from "./desk.module.css";

const texts = accountantTexts.calculator;

// Раскладка кнопок по рядам. Подписи цифр и знаков не текст, а символы клавиш.
const keyRows: Array<Array<{ key: CalculatorKey; face: string; tone?: "operator" | "danger" | "equals" }>> = [
	[
		{ key: "C", face: "C", tone: "danger" },
		{ key: "back", face: "←" },
		{ key: "sign", face: "±" },
		{ key: "/", face: "÷", tone: "operator" },
	],
	[
		{ key: "7", face: "7" },
		{ key: "8", face: "8" },
		{ key: "9", face: "9" },
		{ key: "*", face: "×", tone: "operator" },
	],
	[
		{ key: "4", face: "4" },
		{ key: "5", face: "5" },
		{ key: "6", face: "6" },
		{ key: "-", face: "−", tone: "operator" },
	],
	[
		{ key: "1", face: "1" },
		{ key: "2", face: "2" },
		{ key: "3", face: "3" },
		{ key: "+", face: "+", tone: "operator" },
	],
	[
		{ key: "0", face: "0" },
		{ key: "00", face: "00" },
		{ key: ",", face: "," },
		{ key: "=", face: "=", tone: "equals" },
	],
];

const markFaces: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷", "=": "=", "%": "%" };

interface CalculatorProps {
	defaultPosition: PaperPosition;
}

export function Calculator({ defaultPosition }: CalculatorProps) {
	const [state, setState] = useState<CalculatorState>(initialCalculatorState);
	const [pressedKey, setPressedKey] = useState<CalculatorKey | null>(null);
	const { target } = useAmountTarget();

	function press(key: CalculatorKey) {
		setState((current) => pressCalculatorKey(current, key));
		setPressedKey(key);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		// Enter и пробел на сфокусированной кнопке нажимают саму кнопку.
		if ((event.key === "Enter" || event.key === " ") && event.target instanceof HTMLButtonElement) {
			return;
		}
		const key = keyboardToCalculatorKey(event.key);
		if (key) {
			event.preventDefault();
			press(key);
		}
	}

	function handleToField() {
		if (!target) {
			return;
		}
		target.apply(numberToEntry(getCalculatorValue(state)));
	}

	const recentTape = state.tape.slice(-8);

	return (
		<Paper id="calculator" defaultPosition={defaultPosition} variant="device" title={texts.title} width={196} ariaLabel={texts.title} anchorRight>
			<div className={styles.calculator} tabIndex={0} onKeyDown={handleKeyDown} data-testid="calculator">
				<output className={styles.calculatorDisplay} aria-label={texts.display} aria-live="polite">
					<span className={styles.calculatorOperator}>{state.operator ? markFaces[state.operator] : ""}</span>
					{state.isError ? texts.error : formatCalculatorEntry(state.entry)}
				</output>
				<div className={styles.calculatorKeys}>
					{keyRows.flat().map((button) => (
						<button
							key={button.key}
							type="button"
							className={styles.calculatorKey}
							data-tone={button.tone}
							data-pressed={pressedKey === button.key ? "true" : undefined}
							aria-label={texts.keyLabels[button.key] ?? button.face}
							onClick={() => press(button.key)}
							onAnimationEnd={() => setPressedKey(null)}
						>
							{button.face}
						</button>
					))}
					<button type="button" className={styles.calculatorKey} aria-label={texts.keyLabels["%"]} onClick={() => press("%")}>
						%
					</button>
					<button
						type="button"
						className={`${styles.calculatorKey} ${styles.calculatorToField}`}
						disabled={!target}
						title={target ? undefined : texts.noField}
						onClick={handleToField}
					>
						{target ? fillTemplate(texts.toFieldTarget, { label: target.label }) : texts.toField}
					</button>
				</div>
				<div className={styles.calculatorTape} aria-label={texts.tapeTitle}>
					{recentTape.length === 0 ? <p className={styles.tapeEmpty}>{texts.tapeEmpty}</p> : null}
					<ol>
						{recentTape.map((line, index) => (
							<li key={`${state.tape.length - recentTape.length + index}`} data-mark={line.mark}>
								<span>{formatCalculatorEntry(numberToEntry(line.value))}</span>
								<span>{markFaces[line.mark]}</span>
							</li>
						))}
					</ol>
				</div>
			</div>
		</Paper>
	);
}
