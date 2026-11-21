// Настольный калькулятор (design.md, D11): чистая функция состояния, как у обычного бухгалтерского калькулятора.
// Нажатие клавиши -> новое состояние. Лента хранит историю операций. Результаты округляются до копеек.

export type CalculatorOperator = "+" | "-" | "*" | "/";
export type CalculatorKey =
	| "0"
	| "1"
	| "2"
	| "3"
	| "4"
	| "5"
	| "6"
	| "7"
	| "8"
	| "9"
	| "00"
	| ","
	| CalculatorOperator
	| "="
	| "%"
	| "C"
	| "back"
	| "sign";

// Строка ленты: число и знак операции после него ("=" для итога).
export interface TapeLine {
	value: number;
	mark: CalculatorOperator | "=" | "%";
}

export interface CalculatorState {
	// Набираемое число: цифры и запятая, без пробелов.
	entry: string;
	accumulator: number | null;
	operator: CalculatorOperator | null;
	// После операции следующая цифра начинает новое число.
	isWaitingForOperand: boolean;
	isError: boolean;
	tape: TapeLine[];
}

// Сколько знаков помещается на индикаторе.
const maxDigits = 12;
// Сколько строк ленты хранится.
const maxTapeLines = 40;

export const initialCalculatorState: CalculatorState = {
	entry: "0",
	accumulator: null,
	operator: null,
	isWaitingForOperand: false,
	isError: false,
	tape: [],
};

// Округление до копеек без хвостов дробной арифметики (0,1 + 0,2 = 0,3).
export function roundToKopecks(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Число из набранной строки.
export function entryToNumber(entry: string): number {
	return Number(entry.replace(",", "."));
}

// Число в строку набора: запятая вместо точки, без экспоненты.
export function numberToEntry(value: number): string {
	const rounded = roundToKopecks(value);
	return String(rounded).replace(".", ",");
}

function applyOperator(left: number, operator: CalculatorOperator, right: number): number | null {
	switch (operator) {
		case "+":
			return roundToKopecks(left + right);
		case "-":
			return roundToKopecks(left - right);
		case "*":
			return roundToKopecks(left * right);
		case "/":
			return right === 0 ? null : roundToKopecks(left / right);
	}
}

const operatorKeys: CalculatorOperator[] = ["+", "-", "*", "/"];

function isOperatorKey(key: CalculatorKey): key is CalculatorOperator {
	return (operatorKeys as string[]).includes(key);
}

function pushTape(tape: TapeLine[], line: TapeLine): TapeLine[] {
	return [...tape, line].slice(-maxTapeLines);
}

function errorState(state: CalculatorState): CalculatorState {
	return { ...initialCalculatorState, isError: true, entry: "0", tape: state.tape };
}

// Текущее значение на индикаторе как число.
export function getCalculatorValue(state: CalculatorState): number {
	return entryToNumber(state.entry);
}

// Обработка одной клавиши.
export function pressCalculatorKey(state: CalculatorState, key: CalculatorKey): CalculatorState {
	// После ошибки работает только сброс; цифра начинает заново.
	const base = state.isError ? { ...initialCalculatorState, tape: state.tape } : state;

	if (key === "C") {
		return { ...initialCalculatorState, tape: base.tape };
	}

	if (/^\d+$/.test(key)) {
		const startsNew = base.isWaitingForOperand || base.entry === "0";
		const nextEntry = startsNew ? (key === "00" ? "0" : key) : base.entry + key;
		if (nextEntry.replace(/\D/g, "").length > maxDigits) {
			return base;
		}
		return { ...base, entry: nextEntry, isWaitingForOperand: false };
	}

	if (key === ",") {
		if (base.isWaitingForOperand) {
			return { ...base, entry: "0,", isWaitingForOperand: false };
		}
		return base.entry.includes(",") ? base : { ...base, entry: `${base.entry},` };
	}

	if (key === "back") {
		if (base.isWaitingForOperand) {
			return base;
		}
		const shortened = base.entry.slice(0, -1);
		return { ...base, entry: shortened === "" || shortened === "-" ? "0" : shortened };
	}

	if (key === "sign") {
		const value = entryToNumber(base.entry);
		return { ...base, entry: numberToEntry(-value) };
	}

	if (key === "%") {
		// Процент как на настольном калькуляторе: при + и - процент от первого числа, при × и ÷ просто доля.
		const value = entryToNumber(base.entry);
		const percent =
			base.accumulator !== null && (base.operator === "+" || base.operator === "-")
				? roundToKopecks((base.accumulator * value) / 100)
				: value / 100;
		return { ...base, entry: numberToEntry(percent), isWaitingForOperand: false, tape: pushTape(base.tape, { value, mark: "%" }) };
	}

	if (key === "=") {
		if (base.operator === null || base.accumulator === null) {
			return base;
		}
		const right = entryToNumber(base.entry);
		const result = applyOperator(base.accumulator, base.operator, right);
		if (result === null) {
			return errorState(base);
		}
		return {
			...base,
			entry: numberToEntry(result),
			accumulator: null,
			operator: null,
			isWaitingForOperand: true,
			tape: pushTape(pushTape(base.tape, { value: right, mark: base.operator }), { value: result, mark: "=" }),
		};
	}

	if (!isOperatorKey(key)) {
		return base;
	}
	// Знак операции: если уже есть незавершённая операция, сначала считаем её (цепочка 2 + 3 + 4).
	const value = entryToNumber(base.entry);
	if (base.operator !== null && base.accumulator !== null && !base.isWaitingForOperand) {
		const result = applyOperator(base.accumulator, base.operator, value);
		if (result === null) {
			return errorState(base);
		}
		return {
			...base,
			entry: numberToEntry(result),
			accumulator: result,
			operator: key,
			isWaitingForOperand: true,
			tape: pushTape(base.tape, { value, mark: base.operator }),
		};
	}
	// Первая операция или смена знака сразу после другого знака.
	return { ...base, accumulator: value, operator: key, isWaitingForOperand: true };
}

// Клавиша клавиатуры компьютера -> клавиша калькулятора. Неизвестная клавиша -> null.
export function keyboardToCalculatorKey(key: string): CalculatorKey | null {
	if (/^\d$/.test(key)) {
		return key as CalculatorKey;
	}
	const mapping: Record<string, CalculatorKey> = {
		"+": "+",
		"-": "-",
		"*": "*",
		x: "*",
		"/": "/",
		"=": "=",
		Enter: "=",
		"%": "%",
		",": ",",
		".": ",",
		Backspace: "back",
		Escape: "C",
		Delete: "C",
	};
	return mapping[key] ?? null;
}

// Индикатор: разделители тысяч пробелом, запятая перед копейками.
export function formatCalculatorEntry(entry: string): string {
	const isNegative = entry.startsWith("-");
	const [integerPart, fractionPart] = entry.replace("-", "").split(",");
	const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
	return `${isNegative ? "-" : ""}${grouped}${fractionPart !== undefined ? `,${fractionPart}` : ""}`;
}
