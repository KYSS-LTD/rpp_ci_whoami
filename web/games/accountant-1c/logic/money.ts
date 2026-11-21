// Суммы и расчёты в рублях (design.md, D10): НДФЛ, вычеты на детей, разбор и вывод сумм.
import {
	childDeductionFirst,
	childDeductionSecond,
	childDeductionThirdAndNext,
	ndflRatePercent,
} from "../data/levels";

// Округляет сумму налога до полного рубля: меньше 50 копеек отбрасывается, 50 и больше до рубля (НК РФ, ст. 52, п. 6).
// Сумма переводится в копейки целым числом, чтобы не ловить ошибки дробной арифметики.
export function roundTaxToRubles(amountRubles: number): number {
	const kopecks = Math.round(amountRubles * 100);
	return Math.floor((kopecks + 50) / 100);
}

// Стандартный вычет на детей за месяц: первый, второй, третий и следующие дети.
export function calculateChildDeduction(childrenCount: number): number {
	let deduction = 0;
	for (let childNumber = 1; childNumber <= childrenCount; childNumber += 1) {
		if (childNumber === 1) {
			deduction += childDeductionFirst;
		} else if (childNumber === 2) {
			deduction += childDeductionSecond;
		} else {
			deduction += childDeductionThirdAndNext;
		}
	}
	return deduction;
}

// НДФЛ за месяц: (доход - вычеты) × ставка, с округлением до рубля. База не бывает отрицательной.
export function calculateNdfl(incomeRubles: number, deductionRubles = 0): number {
	const taxBase = Math.max(0, incomeRubles - deductionRubles);
	// База в рублях × ставка в процентах = налог в копейках, целым числом.
	const taxKopecks = taxBase * ndflRatePercent;
	return Math.floor((taxKopecks + 50) / 100);
}

// Разбирает ввод суммы игрока: пробелы (в том числе неразрывные) как разделители тысяч, запятая или точка перед копейками.
// Возвращает рубли целым числом или null, если ввод пустой или не является суммой.
export function parseAmountInput(rawInput: string): number | null {
	const compact = rawInput.replace(/[\s  ]/g, "").replace(/₽$/, "");
	if (compact === "") {
		return null;
	}
	const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(compact);
	if (!match) {
		return null;
	}
	const rubles = Number(match[1]);
	const kopecks = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
	// В игре нет копеек: дробная часть учитывается по правилу округления до рубля.
	return roundTaxToRubles(rubles + kopecks / 100);
}

const rublesFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

// Выводит сумму в рублях с разделителями тысяч, например "12 500".
export function formatRubles(amountRubles: number): string {
	return rublesFormatter.format(amountRubles);
}
