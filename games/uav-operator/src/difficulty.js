// Параметры уровней сложности. Ключи совпадают с text.difficulty, тексты описаний лежат там же.
export const difficultyIds = ['easy', 'normal', 'hard'];
export const defaultDifficulty = 'normal';

// Портал платформы передаёт уровни как easy / medium / hard, поэтому medium приравниваем к normal.
const portalAliases = { easy: 'easy', medium: 'normal', normal: 'normal', hard: 'hard' };

export const difficultySettings = {
	easy: {
		// GPS и видеопередатчик на лёгком уровне уже стоят в корпусе, игрок ставит только четыре модуля.
		assembly: { parts: ['speed', 'camera', 'receiver', 'battery'], preinstalled: ['gps', 'transmitter'] },
		// Полёт со стабилизацией: автоматический взлёт, удержание высоты и посадка по кнопке.
		flight: { mode: 'assisted', scanRadius: 8, landRadius: 5.6, padRadius: 5.6, drain: .55, videoRange: [70, 280], markers: true, landHeight: 30 },
		// Один снимок и три категории, как в исходной версии.
		survey: { photos: ['bay'], kinds: ['bottle', 'bag', 'can'], decoys: false },
	},
	normal: {
		assembly: { parts: ['speed', 'camera', 'receiver', 'transmitter', 'gps', 'battery'], preinstalled: [] },
		// Режим ANGLE: стики задают наклон, при отпускании дрон сам выравнивается. Газ компенсирует наклон.
		flight: { mode: 'angle', scanRadius: 7.2, landRadius: 5, padRadius: 5, drain: .8, videoRange: [45, 240], markers: true, landHeight: 4 },
		// Две фотографии по очереди и четвёртая категория (покрышки).
		survey: { photos: ['bay', 'pier'], kinds: ['bottle', 'bag', 'can', 'tire'], decoys: false },
	},
	hard: {
		assembly: { parts: ['speed', 'camera', 'receiver', 'transmitter', 'gps', 'battery'], preinstalled: [] },
		// ACRO без помощников, как в исходной версии. Площадка H остаётся безопасной зоной посадки.
		flight: { mode: 'acro', scanRadius: 6.5, landRadius: 4.4, padRadius: 4.4, drain: 1, videoRange: [30, 205], markers: false, landHeight: 4 },
		// Две фотографии и предметы-обманки, похожие на мусор по цвету или форме.
		survey: { photos: ['bay', 'pier'], kinds: ['bottle', 'bag', 'can', 'tire'], decoys: true },
	},
};

export function normalize_Difficulty(value) {
	return portalAliases[value] ?? null;
}

// Уровень из адреса (?level=easy или ?difficulty=hard) выбирает сложность при запуске из портала.
export function read_UrlDifficulty() {
	const parameters = new URLSearchParams(location.search);
	return normalize_Difficulty(parameters.get('difficulty') ?? parameters.get('level'));
}
