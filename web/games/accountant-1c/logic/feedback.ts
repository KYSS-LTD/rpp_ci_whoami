// Реплики главбуха об ошибках: сначала правильный ответ, затем причина, шутка всегда последней (design.md, риск "Юмор мешает обучению").

// Ошибка игрока: идентификатор объяснения из texts и значения для подстановки в шаблон.
export interface MistakeRecord {
	explanationId: string;
	values?: Record<string, string>;
}

// Объяснение ошибки в файле текстов.
export interface Explanation {
	correct: string;
	reason: string;
	joke: string;
}

export interface ChiefReply {
	correct: string;
	reason: string;
	joke: string;
	// Реплика целиком: правильный ответ, причина, шутка.
	text: string;
}

// Подставляет значения в шаблон вида "Дт {debit} Кт {credit}". Неизвестный ключ остаётся как есть.
export function fillTemplate(template: string, values: Record<string, string> = {}): string {
	return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}

// Собирает реплику главбуха по ошибке. Без объяснения возвращает null: такую ошибку молча пропускаем.
export function buildChiefReply(mistake: MistakeRecord, explanations: Record<string, Explanation>): ChiefReply | null {
	const explanation = explanations[mistake.explanationId];
	if (!explanation) {
		return null;
	}
	const correct = fillTemplate(explanation.correct, mistake.values);
	const reason = fillTemplate(explanation.reason, mistake.values);
	const joke = fillTemplate(explanation.joke, mistake.values);
	return { correct, reason, joke, text: `${correct} ${reason} ${joke}` };
}
