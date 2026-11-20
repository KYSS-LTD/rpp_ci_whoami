// Сертификат о прохождении уровня: автономный HTML-файл для печати (решение D7 в design.md).
// Функции чистые: принимают диплом и тексты, возвращают строку разметки и имя файла. Скачивание делает интерфейс.
import type { Diploma, DiplomaRating } from "./index";

// Тексты сертификата. Передаются снаружи, чтобы ядро не зависело от файлов текстов сайта.
export interface CertificateTexts {
	documentTitle: string;
	heading: string;
	intro: string;
	gameLabel: string;
	levelLabel: string;
	scoreLabel: string;
	ratingLabel: string;
	issuedLabel: string;
	ratings: Record<DiplomaRating, string>;
	localNotice: string;
	printHint: string;
}

// Человекочитаемые названия игры и уровня. Берутся из манифеста игры.
export interface CertificateDetails {
	gameTitle: string;
	levelTitle: string;
}

// Цвет акцента сертификата по рейтингу.
const ratingColors: Record<DiplomaRating, string> = {
	bronze: "#a0612b",
	silver: "#6b7280",
	gold: "#b8860b",
};

// Экранирует значение для вставки в HTML. Имя вводит пользователь, поэтому экранируется всё.
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// Дата выдачи в формате ДД.ММ.ГГГГ. Берётся из ISO-строки без учёта часового пояса браузера.
export function formatIssueDate(issuedAt: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(issuedAt);
	if (!match) {
		return issuedAt;
	}
	return `${match[3]}.${match[2]}.${match[1]}`;
}

// Имя файла сертификата: только латиница, цифры и дефисы, чтобы файл сохранялся в любой системе.
export function buildCertificateFileName(diploma: Diploma): string {
	const safeGameId = diploma.gameId.replace(/[^a-zA-Z0-9-]+/g, "-");
	const issueDay = diploma.issuedAt.slice(0, 10).replace(/[^0-9-]/g, "");
	return `certificate-${safeGameId}-${diploma.levelId}-${issueDay}.html`;
}

// Строит полный HTML-документ сертификата со встроенными стилями и без внешних ресурсов.
export function buildCertificateHtml(diploma: Diploma, details: CertificateDetails, texts: CertificateTexts): string {
	const accentColor = ratingColors[diploma.rating];
	const rows: [string, string][] = [
		[texts.gameLabel, details.gameTitle],
		[texts.levelLabel, details.levelTitle],
		[texts.scoreLabel, `${diploma.score} / ${diploma.maxScore}`],
		[texts.ratingLabel, texts.ratings[diploma.rating]],
		[texts.issuedLabel, formatIssueDate(diploma.issuedAt)],
	];
	const rowsHtml = rows
		.map(([label, value]) => `\t\t\t<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
		.join("\n");

	return `<!DOCTYPE html>
<html lang="ru">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escapeHtml(texts.documentTitle)}: ${escapeHtml(diploma.playerName)}</title>
	<style>
		@page { size: A4 landscape; margin: 12mm; }
		* { box-sizing: border-box; }
		body { margin: 0; padding: 24px; background: #f4f1ea; color: #1f2933; font-family: Georgia, "Times New Roman", serif; }
		.certificate { max-width: 960px; margin: 0 auto; padding: 48px 56px; background: #fffdf8; border: 3px double ${accentColor}; text-align: center; }
		h1 { margin: 0 0 12px; font-size: 40px; letter-spacing: 2px; color: ${accentColor}; }
		.intro { margin: 0 0 8px; font-size: 18px; }
		.name { margin: 8px 0 28px; font-size: 34px; font-weight: bold; }
		table { margin: 0 auto 28px; border-collapse: collapse; font-size: 18px; }
		th { padding: 6px 16px; text-align: right; font-weight: normal; color: #52606d; }
		td { padding: 6px 16px; text-align: left; font-weight: bold; }
		.notice { margin: 0; font-size: 13px; color: #52606d; }
		.print-hint { max-width: 960px; margin: 16px auto 0; font-family: Arial, sans-serif; font-size: 14px; color: #52606d; text-align: center; }
		@media print { body { padding: 0; background: #fff; } .print-hint { display: none; } }
	</style>
</head>
<body>
	<main class="certificate">
		<h1>${escapeHtml(texts.heading)}</h1>
		<p class="intro">${escapeHtml(texts.intro)}</p>
		<p class="name">${escapeHtml(diploma.playerName)}</p>
		<table>
${rowsHtml}
		</table>
		<p class="notice">${escapeHtml(texts.localNotice)}</p>
	</main>
	<p class="print-hint">${escapeHtml(texts.printHint)}</p>
</body>
</html>
`;
}
