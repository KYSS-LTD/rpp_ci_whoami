// Тексты HUD, экранов и подсказок игры (задача 7.7). Владелец: SONNET-3 (scene-hud). Весь отображаемый текст HUD лежит здесь,
// в коде hud/ строк для игрока нет. Только дефис, длинное и среднее тире запрещены. Строки управления берутся из controls.ts.
import type { ActionRejectReason, DishId, PatiencePlace } from "../contracts";

// Названия блюд по идентификатору.
const dishNames: Record<DishId, string> = {
	burger: "Бургер",
	ham: "Окорок",
	steak: "Стейк",
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
	dishNotPlated: "Сначала положите блюдо на тарелку",
	needsWater: "Сначала налейте воду в кастрюлю",
};

export const hudTexts = {
	dishNames,
	rejectReasons,

	// Заказы по столам.
	orders: {
		panelLabel: "Заказы по столам",
		// Слово "Стол" отдельно: компактная карточка показывает только номер, слово читают вспомогательные технологии.
		tableWord: "Стол",
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
		prologue: "Вы нашли работу поваром в небольшом ресторане. Начальник будет знакомить вас с новым рецептом каждый рабочий день.",
		dayLabel: (day: number): string => `Рабочий день ${day} из 5`,
		dayGoal: "Ваша задача на неделю: обслужить всех гостей ресторана.",
		goal: "Накормите всех гостей смены, пока они не потеряли терпение.",
		rules: [
			"Заказы по столам видны сверху справа, самые срочные идут первыми.",
			"Готовьте блюда на кухне и сдавайте тарелку в окно выдачи.",
			"Официант сам отнесёт блюдо к нужному столу.",
			"Если гость уйдёт, не дождавшись, смена закончится.",
		],
		pauseHintKeyboard: "Клавиша P ставит игру на паузу.",
		pauseHintTouch: "Кнопка паузы находится вверху слева.",
		startButton: "Начать",
		tutorialButton: "Посмотреть рецепт",
	},

	tutorial: {
		title: (dishName: string): string => `Рецепт: ${dishName}`,
		next: "Дальше",
		done: "К смене",
		skip: "Пропустить подсказки",
		stepLabel: (step: number, count: number): string => `Шаг ${step} из ${count}`,
		steps: {
			hamTake: "Возьмите окорок из ящика.", hamCook: "Положите окорок в духовку и дождитесь готовности.",
			hamPlate: "Возьмите тарелку и переложите на неё готовый окорок.", hamServe: "Отнесите тарелку к окну выдачи.",
			steakTake: "Возьмите стейк из ящика. Резать его не нужно.",
			steakCook: "Положите целый стейк на сковороду и дождитесь готовности.", steakPlate: "Возьмите тарелку и переложите на неё готовый стейк.",
			steakServe: "Передайте заказ через окно выдачи.",
			burgerPrepare: "Возьмите стейк и нарежьте его на столе.", burgerCook: "Пожарьте нарезанный стейк на сковороде.",
			burgerAssemble: "Держите котлету в руке, возьмите булочку из ящика и соедините их.",
			burgerServe: "Возьмите тарелку и сдайте бургер в окно выдачи.",
			veggiePrepare: "Нарежьте картофель и морковь на любой поверхности.", veggieCook: "Пожарьте овощи на сковороде.",
			veggieAssemble: "Соедините овощную котлету с булочкой в руках.", veggieServe: "Положите бургер на тарелку и сдайте заказ.",
			stewPot: "Возьмите пустую кастрюлю со стола.", stewWater: "Наполните кастрюлю водой у крана.",
			stewChop: "Нарежьте картофель, морковь и лук.", stewFill: "Добавьте все овощи в кастрюлю на столе или на плите.",
			stewCook: "Поставьте полную кастрюлю на конфорку. Она выключится сама после варки.",
			stewServe: "Возьмите тарелку, наберите порцию и сдайте рагу.",
		},
	},

	// Пауза.
	pause: {
		buttonLabel: "Пауза",
		title: "Пауза",
		resume: "Продолжить",
		exit: "Выйти",
		exitHint: "Выход закроет уровень без результата.",
	},

	// Конец рабочего дня (не последнего): итог дня и переход к следующему.
	dayComplete: {
		title: (day: number): string => `Рабочий день ${day} завершён`,
		lead: "Все гости обслужены. Завтра в меню появится новое блюдо.",
		nextButton: "Следующий день",
	},

	// Провал смены.
	failure: {
		title: "Гость ушёл",
		continueButton: "Продолжить",
		scoreSummary: (score: number, maxScore: number): string => `Набрано очков: ${score} из ${maxScore}`,
		// Причина по месту: очередь на улице или стол в зале. Номер стола игроку не показывается: только блюдо, которого гость не дождался.
		reason: (place: PatiencePlace, dishName: string | null): string => {
			if (place === "queue") {
				return "Группа гостей не дождалась свободного стола и ушла с улицы.";
			}
			if (dishName !== null) {
				return `Гость не дождался блюда «${dishName}» и ушёл.`;
			}
			return "Гость не дождался заказа и ушёл.";
		},
	},

};
