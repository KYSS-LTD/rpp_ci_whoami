// Тексты HUD, экранов и подсказок игры (задача 7.7). Владелец: SONNET-3 (scene-hud). Весь отображаемый текст HUD лежит здесь,
// в коде hud/ строк для игрока нет. Только дефис, длинное и среднее тире запрещены. Строки управления берутся из controls.ts.
import type { ActionRejectReason, DishId, PatiencePlace } from "../contracts";

// Названия блюд по идентификатору.
const dishNames: Record<DishId, string> = {
	burger: "Бургер",
	ham: "Окорок",
	veggieBurger: "Овощной бургер",
	stew: "Рагу",
};

// Причины отказа действия повара: короткие подсказки, что не так.
const rejectReasons: Record<ActionRejectReason, string> = {
	handBusy: "Рука занята",
	handEmpty: "В руке ничего нет",
	nothingToTake: "Здесь нечего брать",
	stationOccupied: "Здесь уже занято",
	itemNotAccepted: "Сюда это не положить",
	burntItem: "Сгоревшее можно только выбросить",
	plateRequired: "Нужна тарелка в руке",
	plateNotAccepted: "Это не подходит ни к одному блюду меню",
	dishNotReady: "Блюдо ещё не готово",
	noOpenOrder: "Такое блюдо сейчас никто не ждёт",
	windowFull: "В окне выдачи нет места",
};

export const hudTexts = {
	dishNames,
	rejectReasons,

	// Заказы по столам.
	orders: {
		panelLabel: "Заказы по столам",
		tableTitle: (tableNumber: number): string => `Стол ${tableNumber}`,
		tableServed: "Стол обслужен",
		status: {
			waiting: "Ждёт",
			delivering: "В доставке",
			served: "Подано",
		},
		// Имя индикатора терпения для вспомогательных технологий: блюдо и процент оставшегося терпения.
		patienceLabel: (dishName: string, percent: number): string => `Терпение, ${dishName}: ${percent} процентов`,
	},

	// Верхняя панель.
	stats: {
		timerLabel: "Осталось времени",
		servedLabel: "Обслужено",
		servedValue: (served: number, total: number): string => `${served} из ${total}`,
		scoreLabel: "Очки",
		queueLabel: "Очередь",
		queuePatienceLabel: (percent: number): string => `Терпение очереди: ${percent} процентов`,
		queueValue: (groups: number): string => `${groups}`,
		queueAria: (groups: number): string => `Групп в очереди: ${groups}`,
	},

	// Баннер закрытия потока клиентов.
	flowClosedBanner: "Новые гости сегодня не придут",

	// Всплывающие подсказки.
	hints: {
		dishServed: (points: number): string => `Подано: +${points}`,
	},

	// Стартовый экран.
	start: {
		title: "Повар",
		goal: "Накормите всех гостей смены, пока они не потеряли терпение.",
		rules: [
			"Заказы по столам видны сверху слева, самые срочные идут первыми.",
			"Готовьте блюда на кухне и сдавайте тарелку в окно выдачи.",
			"Официант сам отнесёт блюдо к нужному столу.",
			"Если гость уйдёт, не дождавшись, смена закончится.",
		],
		pauseHintKeyboard: "Клавиша Esc ставит игру на паузу.",
		pauseHintTouch: "Кнопка паузы находится вверху справа.",
		startButton: "Начать",
		rotateHint: "Чтобы начать, поверните устройство.",
	},

	// Пауза.
	pause: {
		buttonLabel: "Пауза",
		title: "Пауза",
		resume: "Продолжить",
		exit: "Выйти",
		exitHint: "Выход закроет уровень без результата.",
	},

	// Провал смены.
	failure: {
		title: "Гость ушёл",
		continueButton: "Продолжить",
		scoreSummary: (score: number, maxScore: number): string => `Набрано очков: ${score} из ${maxScore}`,
		// Причина по месту: очередь на улице или стол в зале (с номером стола и блюдом).
		reason: (place: PatiencePlace, tableNumber: number | null, dishName: string | null): string => {
			if (place === "queue") {
				return "Группа гостей не дождалась свободного стола и ушла с улицы.";
			}
			if (tableNumber !== null && dishName !== null) {
				return `Гость за столом ${tableNumber} не дождался блюда «${dishName}» и ушёл.`;
			}
			if (tableNumber !== null) {
				return `Гость за столом ${tableNumber} не дождался заказа и ушёл.`;
			}
			return "Гость не дождался заказа и ушёл.";
		},
	},

	// Просьба повернуть устройство (телефон в портретной ориентации).
	orientation: {
		title: "Поверните устройство",
		text: "Игра рассчитана на альбомную ориентацию экрана. Поверните телефон горизонтально.",
	},
};
