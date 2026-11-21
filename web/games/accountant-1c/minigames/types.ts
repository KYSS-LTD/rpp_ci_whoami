// Общий интерфейс мини-игры (design.md, D3): данные мини-игры на вход, итог через onComplete.
import type { MistakeRecord } from "../logic/feedback";
import type { RandomSource } from "../logic/shuffle";

// Итог мини-игры: очки 0-10 до вычета подсказок, число подсказок и идентификаторы объяснений ошибок.
export interface MiniGameOutcome {
	score: number;
	hintsUsed: number;
	mistakes: string[];
}

// Промежуточная точность в очках: сколько набрано из возможного по уже пройденным проверкам.
export interface MiniGameProgress {
	earned: number;
	possible: number;
}

export interface MiniGameProps<TData> {
	data: TData;
	// Доступна ли подсказка (только уровень medium).
	hintsEnabled: boolean;
	tutorialEnabled?: boolean;
	// Генератор для перемешивания карточек. В тестах передаётся детерминированный.
	random?: RandomSource;
	onComplete: (outcome: MiniGameOutcome) => void;
	// Ошибка игрока: уровень показывает реплику главбуха и строку в "Сообщениях".
	onMistake: (mistake: MistakeRecord) => void;
	// Сообщение об успешном действии в "Сообщениях".
	onNotice?: (text: string) => void;
	onProgress?: (progress: MiniGameProgress) => void;
}
