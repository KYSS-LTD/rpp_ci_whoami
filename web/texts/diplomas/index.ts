// Тексты страницы дипломов.

export const diplomasTexts = {
	result: {
		heading: "Диплом за прохождение",
		name: "Фамилия, имя и отчество",
		recipient: "Имя в дипломе",
		nameRequired: "Введите имя для диплома.",
		preparing: "Готовим PDF",
		download: "Скачать диплом PDF",
		error: "Не удалось подготовить диплом. Попробуйте ещё раз.",
		pdf: {
			heading: "Диплом",
			intro: "За прохождение тренажёра",
			difficulty: "Сложность",
			score: "Очки",
			rating: "Рейтинг",
			duration: "Время",
			issued: "Дата выдачи",
		},
	},
	title: "Дипломы",
	empty: "Дипломов пока нет. Они появятся после завершения уровня.",
	levelLabel: "Уровень",
	nameLabel: "Имя",
	ratingLabel: "Рейтинг",
	ratings: {
		bronze: "Бронза",
		silver: "Серебро",
		gold: "Золото",
	},
	certificateButton: "Скачать сертификат",
	// Тексты внутри файла сертификата (HTML для печати).
	certificate: {
		documentTitle: "Сертификат",
		heading: "Сертификат",
		intro: "Настоящим подтверждается, что уровень игры прошёл(а)",
		gameLabel: "Игра",
		levelLabel: "Сложность",
		scoreLabel: "Очки",
		ratingLabel: "Рейтинг",
		issuedLabel: "Дата выдачи",
		ratings: {
			bronze: "Бронза",
			silver: "Серебро",
			gold: "Золото",
		},
		localNotice: "Сертификат сформирован в браузере по данным этого устройства и не проверялся сервером.",
		printHint: "Чтобы распечатать сертификат или сохранить его в PDF, откройте печать браузера (Ctrl+P).",
	},
};
