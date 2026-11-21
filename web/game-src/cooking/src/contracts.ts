// Общие контракты игры cooking (задача 1.5). Единственный источник типов и интерфейсов между областями игры.
// Владелец файла: Opus-агент (architect). Остальные агенты этот файл не правят: нужна правка - пишите в
// .coordination/game-cooking/inbox-opus.md, правка вносится вместе с записью в журнале interfaces.md.
//
// Соглашения:
// - Мир: плоскость XZ, единицы мира условные. Ось x растёт вправо по экрану, ось z растёт вниз по экрану
//   (в сторону камеры), ось y направлена вверх. Клавиша W означает "вверх по экрану", то есть движение в -z.
// - Все модели KayKit масштабируются в MODEL_SCALE раз: прилавок 1 x 1, стул 0.375, тарелка 0.475.
// - Прямоугольники Rect задаются углом с минимальными x и z и размерами, все числа кратны GRID_STEP (0.5).
// - Поворот yaw в радианах как у three.js (rotation.y): модель, "смотрящая" по +z, при yaw=0 обращена к камере,
//   yaw=PI смотрит от камеры (вверх по экрану). Вектор взгляда (sin yaw, cos yaw) в координатах (x, z).
// - Симуляция (sim/) не импортирует three и DOM. Время симуляции идёт фиксированным шагом SIM_STEP_SEC.
// - Все отображаемые строки лежат в texts/, в контрактах строк для игрока нет.
// - Идентификаторы на английском, комментарии на русском, тире запрещены, только дефис.

// ============================================================================
// 0. ВЕРСИЯ КОНТРАКТОВ
// ============================================================================

// Версия контрактов. Увеличивается при каждой правке, журнал правок лежит в .coordination/game-cooking/interfaces.md.
export const CONTRACTS_VERSION = 1;

// ============================================================================
// 1. БАЗОВЫЕ ТИПЫ И КОНСТАНТЫ
// ============================================================================

// Идентификаторы уровней портала.
export const LEVEL_IDS = ["easy", "medium", "hard"] as const;
// Идентификатор уровня: easy, medium или hard.
export type LevelId = (typeof LEVEL_IDS)[number];

// Точка или вектор на плоскости XZ. Поле z (а не y) выбрано сознательно: ось y в three.js это высота.
export interface Vec2 {
	x: number;
	z: number;
}

// Прямоугольник на плоскости XZ: угол с минимальными x и z и размеры. Все числа кратны GRID_STEP.
export interface Rect {
	// Минимальная x (левая сторона на экране).
	x: number;
	// Минимальная z (верхняя сторона на экране).
	z: number;
	// Размер по x.
	width: number;
	// Размер по z.
	depth: number;
}

// Шаг симуляции в секундах (60 Гц). Симуляция всегда идёт целыми шагами, а время кадра накапливается в цикле.
export const SIM_STEP_SEC = 1 / 60;

// Шаг сетки уровня: координаты мебели кратны ему, навигационная сетка имеет такую же клетку.
export const GRID_STEP = 0.5;

// Масштаб всех моделей KayKit при расстановке в мир (модель прилавка 2 x 2, в мире он 1 x 1).
export const MODEL_SCALE = 0.5;

// Поворот объекта на уровне в градусах по yaw (против часовой стрелки при взгляде сверху, как rotation.y в three.js).
// 0: "передняя" сторона модели (+z) смотрит на камеру (вниз по экрану), 90: на +x (вправо), 180: от камеры (вверх), 270: на -x.
export type Rotation = 0 | 90 | 180 | 270;

// Направление взгляда: индекс 0..7 с шагом 45 градусов. 0 - вверх по экрану (-z), далее по часовой стрелке:
// 0 вверх, 1 вверх-вправо, 2 вправо, 3 вниз-вправо, 4 вниз, 5 вниз-влево, 6 влево, 7 вверх-влево.
export type Facing8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Число направлений взгляда.
export const FACING_COUNT = 8;

// Единичные векторы направлений взгляда по индексу Facing8 (в координатах x, z; длина 1).
export const FACING_VECTORS: readonly Vec2[] = [
	{ x: 0, z: -1 },
	{ x: Math.SQRT1_2, z: -Math.SQRT1_2 },
	{ x: 1, z: 0 },
	{ x: Math.SQRT1_2, z: Math.SQRT1_2 },
	{ x: 0, z: 1 },
	{ x: -Math.SQRT1_2, z: Math.SQRT1_2 },
	{ x: -1, z: 0 },
	{ x: -Math.SQRT1_2, z: -Math.SQRT1_2 },
];

// Идентификаторы сущностей. Это просто строки, уникальные в пределах уровня. Принятые форматы:
// станция "board-1", стол "table-1", клиент "c-<номер группы>-<номер в группе>", группа "g-<номер>",
// заказ "o-<id клиента>", официант "waiter-1", блюдо в окне "wd-<номер>".
// Идентификатор станции.
export type StationId = string;
// Идентификатор стола.
export type TableId = string;
// Идентификатор клиента.
export type CustomerId = string;
// Идентификатор группы клиентов.
export type GroupId = string;
// Идентификатор заказа.
export type OrderId = string;
// Идентификатор официанта.
export type WaiterId = string;
// Идентификатор блюда, ждущего в окне выдачи.
export type WindowDishId = string;

// ============================================================================
// 2. ПРЕДМЕТЫ, БЛЮДА И РЕЦЕПТЫ (типы; таблицы значений реализует sim/kitchen, SONNET-1)
// ============================================================================

// Четыре блюда игры: бургер, окорок (готовая ветчина), овощной бургер, рагу.
export const DISH_IDS = ["burger", "ham", "veggieBurger", "stew"] as const;
// Идентификатор блюда: burger, ham (окорок), veggieBurger, stew (рагу).
export type DishId = (typeof DISH_IDS)[number];

// Вид предмета (ингредиента или полуфабриката). Тарелка описывается отдельно (PlateItem).
// steak - стейк (сырой или нарезанный), bun - булочка, ham - ветчина, potato/carrot/onion - овощи,
// patty - котлета из нарезанного стейка (готовится на сковороде), veggiePatty - овощная котлета из нарезанных
// картофеля и моркови (сковорода), stew - рагу (кастрюля; порция на тарелке).
export type IngredientKind = "steak" | "bun" | "ham" | "potato" | "carrot" | "onion" | "patty" | "veggiePatty" | "stew";

// Состояние предмета: raw - исходный (из ящика, ещё не обработанный, у булочки это и есть вид "булочка"),
// chopped - нарезанный (доска), cooked - готовый (сковорода, кастрюля, духовка), burnt - сгоревший.
export type ItemState = "raw" | "chopped" | "cooked" | "burnt";

// Пара "вид + состояние": используется в таблицах рецептов и переходов.
export interface ItemSpec {
	kind: IngredientKind;
	state: ItemState;
}

// Ингредиент или полуфабрикат: то, что лежит в руке повара, на прилавке, доске или в сковороде.
export interface IngredientItem {
	type: "ingredient";
	kind: IngredientKind;
	state: ItemState;
}

// Тарелка-контейнер. contents - ингредиенты на тарелке (мультимножество). Как только содержимое совпало с рецептом
// блюда меню, поле dish становится равным блюду (тарелка "превращается" в готовое блюдо), иначе dish = null.
// Тарелка вместе с содержимым занимает руку целиком (один предмет).
export interface PlateItem {
	type: "plate";
	contents: IngredientItem[];
	dish: DishId | null;
}

// Любой переносимый предмет.
export type Item = IngredientItem | PlateItem;

// Перечень всех допустимых пар "вид + состояние". Источник истины для таблиц SONNET-1 и для соответствия моделям
// (SONNET-3 сопоставляет каждой паре модель glTF). Другие пары в игре возникать не должны.
// Цепочки: steak raw -> chopped (доска) -> patty raw -> cooked -> burnt (сковорода); potato и carrot raw -> chopped (доска),
// пара chopped potato + chopped carrot -> veggiePatty raw -> cooked -> burnt (сковорода); ham raw -> cooked -> burnt (духовка);
// carrot, potato, onion chopped (до трёх) -> stew cooked -> burnt (кастрюля); bun raw без обработки.
export const ITEM_CATALOG: readonly ItemSpec[] = [
	{ kind: "steak", state: "raw" },
	{ kind: "steak", state: "chopped" },
	{ kind: "bun", state: "raw" },
	{ kind: "ham", state: "raw" },
	{ kind: "ham", state: "cooked" },
	{ kind: "ham", state: "burnt" },
	{ kind: "potato", state: "raw" },
	{ kind: "potato", state: "chopped" },
	{ kind: "carrot", state: "raw" },
	{ kind: "carrot", state: "chopped" },
	{ kind: "onion", state: "raw" },
	{ kind: "onion", state: "chopped" },
	{ kind: "patty", state: "raw" },
	{ kind: "patty", state: "cooked" },
	{ kind: "patty", state: "burnt" },
	{ kind: "veggiePatty", state: "raw" },
	{ kind: "veggiePatty", state: "cooked" },
	{ kind: "veggiePatty", state: "burnt" },
	{ kind: "stew", state: "cooked" },
	{ kind: "stew", state: "burnt" },
];

// Рецепт блюда: набор ингредиентов на тарелке (мультимножество, порядок не важен). Таблица рецептов лежит в
// sim/kitchen/recipes.ts (SONNET-1). Цена, чаевые и трудоёмкость блюда лежат в параметрах уровня (DishParams).
export interface DishRecipe {
	dish: DishId;
	ingredients: ItemSpec[];
}

// Процесс готовки на станции. Идентификатор переходов в таблицах и в параметрах времени (KitchenParams.cooking).
// patty - сковорода, нарезанный стейк; veggiePatty - сковорода, нарезанные картофель и морковь;
// ham - духовка, сырая ветчина; stew - кастрюля, нарезанные морковь, картофель и лук.
export type CookRecipeId = "patty" | "veggiePatty" | "ham" | "stew";

// Резка на доске: вход -> выход после удержания рабочего действия KitchenParams.cutSec секунд. Таблица в sim/kitchen.
export interface CutTransition {
	input: ItemSpec;
	output: ItemSpec;
}

// Готовка на станции: набор входов (мультимножество) -> готовый предмет -> сгоревший предмет. Время cookSec и burnSec
// берутся из KitchenParams.cooking по id. Таблица в sim/kitchen.
export interface CookTransition {
	id: CookRecipeId;
	// Вид станции, на которой идёт готовка.
	stationKind: "pan" | "pot" | "oven";
	// Что нужно положить (мультимножество). Для pan со стейком: один нарезанный steak.
	inputs: ItemSpec[];
	// Предмет, который лежит на станции, пока идёт готовка (patty raw, veggiePatty raw, ham raw, для рагу не используется).
	cooking: ItemSpec | null;
	// Готовый предмет (cooked).
	cooked: ItemSpec;
	// Сгоревший предмет (burnt), если готовое не забрать за burnSec.
	burnt: ItemSpec;
}

// ============================================================================
// 3. ДАННЫЕ УРОВНЯ (LevelConfig)
// ============================================================================
// Один источник данных: из него строятся расстановка моделей, коллизии, навигационная сетка, цели взаимодействия,
// слоты очереди. Три уровня используют один набор моделей и отличаются раскладкой и параметрами.

// Вид станции. Станция - то, с чем взаимодействует повар. Сковорода и кастрюля закреплены на плитах: вид "pan" означает
// плиту со сковородой, "pot" - плиту с кастрюлей.
// crate - ящик, бесконечно выдаёт один вид сырого ингредиента; counter - прилавок для одного предмета;
// cuttingBoard - разделочная доска; pan - плита со сковородой; pot - плита с кастрюлей (рагу, только hard);
// oven - духовка; plateStack - стопка тарелок; trash - урна; servingWindow - окно выдачи.
export type StationKind = "crate" | "counter" | "cuttingBoard" | "pan" | "pot" | "oven" | "plateStack" | "trash" | "servingWindow";

// Станция уровня.
export interface StationConfig {
	id: StationId;
	kind: StationKind;
	// Занимаемый прямоугольник: коллизия и зона взаимодействия.
	rect: Rect;
	// Поворот модели станции (лицевая сторона к игроку).
	rotationDeg: Rotation;
	// Только для crate: какой сырой ингредиент выдаёт ящик.
	ingredient?: IngredientKind;
	// Необязательное имя модели KayKit без расширения (визуальный выбор, например прилавок с раковиной). Иначе модель
	// выбирает render по виду станции.
	model?: string;
}

// Зона пола для отрисовки: кухня, зал или улица (камера охватывает все три).
export type ZoneKind = "kitchen" | "hall" | "street";

// Участок пола.
export interface FloorConfig {
	rect: Rect;
	zone: ZoneKind;
}

// Прочий объект сцены: стена, колонна, холодильник, декор. Если blocking = true, его rect блокирует движение и навигацию.
export interface PropConfig {
	id: string;
	// Имя модели KayKit без расширения (например "wall", "fridge_A") или null для невидимого препятствия.
	model: string | null;
	// Занимаемый прямоугольник на сетке (кратен GRID_STEP): коллизия и точка центра модели.
	rect: Rect;
	rotationDeg: Rotation;
	blocking: boolean;
	// Множитель высоты модели (по умолчанию 1). Низкие передние стены: 0.35, чтобы не закрывать обзор.
	heightScale?: number;
}

// Место за столом. Все поля заданы автором уровня, а не вычисляются.
export interface SeatConfig {
	// Занимаемый прямоугольник стула: статичное препятствие навигации и коллизий для всех.
	chairRect: Rect;
	// Имя модели стула (например "chair_A", "chair_stool").
	chairModel: string;
	// Поворот стула и сидящего: смотрит на стол.
	rotationDeg: Rotation;
	// Свободная точка рядом со стулом (вне препятствий, с запасом от стула и стола не меньше радиуса NPC), куда клиент идёт
	// по навигации и откуда "садится" (мгновенный перенос на sitPoint).
	approachPoint: Vec2;
	// Положение сидящего клиента (центр стула).
	sitPoint: Vec2;
	// Точка на столе, куда официант ставит блюдо перед этим местом.
	dishPoint: Vec2;
	// Точка пола, где стоит официант при подаче этого места. Должна быть достижима по навигации. Обычно равна approachPoint.
	servePoint: Vec2;
}

// Стол и его места. Число мест равно seats.length: 2 или 4.
export interface TableConfig {
	id: TableId;
	// Номер стола для игрока (1, 2, 3...): "Стол 3".
	number: number;
	// Занимаемый прямоугольник столешницы: препятствие.
	rect: Rect;
	// Имя модели стола (например "table_round_A", "table_round_A_small").
	model: string;
	rotationDeg: Rotation;
	seats: SeatConfig[];
}

// Окно выдачи. Станция вида servingWindow (stationId) задаёт прямоугольник окна на разделяющей стене.
export interface ServingWindowConfig {
	// Станция вида servingWindow из stations.
	stationId: StationId;
	// Положения блюд, ждущих в окне. Длина массива - вместимость окна (число одновременно ждущих блюд), порядок - порядок заполнения.
	dishPoints: Vec2[];
	// Точка со стороны зала, где официант стоит, забирая блюдо.
	pickupPoint: Vec2;
}

// Дверь между улицей и залом. Проём проходим для навигации (rect не входит в препятствия).
export interface DoorConfig {
	// Проём в стене (проходимая область).
	rect: Rect;
	rotationDeg: Rotation;
	// Точка в зале сразу за дверью.
	insidePoint: Vec2;
	// Точка на улице сразу перед дверью.
	outsidePoint: Vec2;
	// Где появляется новый клиент на улице (в кадре камеры).
	spawnPoint: Vec2;
	// Куда уходит клиент после оплаты и исчезает (в кадре камеры или на его краю).
	exitPoint: Vec2;
}

// Слот очереди на улице: место одной группы.
export interface QueueSlotConfig {
	// Номер слота: 0 - ближайший к двери, дальше дальше от двери. Группа занимает самый ближний свободный слот.
	index: number;
	// Центр слота. Члены группы стоят в position + QueueConfig.memberOffsets[номер в группе].
	position: Vec2;
}

// Очередь на улице.
export interface QueueConfig {
	slots: QueueSlotConfig[];
	// Смещения членов группы от центра слота (минимум 4 элемента, по числу мест в самой большой группе).
	memberOffsets: Vec2[];
}

// Начальное положение персонажа.
export interface SpawnConfig {
	position: Vec2;
	facing: Facing8;
}

// Официанты: вместимость берётся из params.waiter.capacity, число - длина waitPoints.
export interface WaitersConfig {
	// Точки ожидания у окна: у каждого официанта своя, он стартует в ней и возвращается к ней.
	waitPoints: Vec2[];
}

// --- Параметры баланса и поведения (все числа баланса из design.md лежат здесь, а не в коде) ---

// Параметры блюда: награда и трудоёмкость.
export interface DishParams {
	// Цена блюда в очках, начисляется при подаче.
	price: number;
	// Максимальные чаевые: итоговые чаевые = floor(maxTip * остаток терпения / полное терпение) при подаче.
	maxTip: number;
	// Трудоёмкость в секундах работы эталонного бота (идёт в бюджет работы расписания и в терпение за столом).
	effort: number;
}

// Параметры расписания дня (sim/customers/schedule.ts).
export interface ScheduleParams {
	// Клиенты приходят не позже (durationSec - flowCloseBeforeEndSec). Начальное значение 60. Тот же порог включает баннер.
	flowCloseBeforeEndSec: number;
	// Время первого прихода, секунды от начала смены.
	firstArrivalSec: number;
	// Среднее время между приходами групп (поток клиентов), секунды. Фактические промежутки случайны вокруг него.
	meanGapSec: number;
	// Минимальное время между приходами групп, секунды.
	minGapSec: number;
	// Веса размеров группы 1..N (индекс 0 - группа из одного). N не больше числа мест самого большого стола уровня.
	groupSizeWeights: number[];
	// Доля пропускной способности бота, которую может занять нагрузка в любом окне (начально 0.7).
	workBudgetShare: number;
	// Длина скользящего окна для бюджета работы, секунды.
	workWindowSec: number;
	// Пропускная способность эталонного бота: секунд работы (effort) в секунду времени, начально 1.
	botCapacity: number;
}

// Терпение двух фаз (design D8). Значения калибруются ботом.
export interface PatienceParams {
	// Фаза A: терпение группы в очереди, секунды (фиксированное на уровень).
	queueSec: number;
	// Фаза B (за столом): tableBaseSec + tableEffortCoef * effort блюда + tableWaiterAllowanceSec.
	tableBaseSec: number;
	tableEffortCoef: number;
	tableWaiterAllowanceSec: number;
}

// Параметры клиентов (sim/customers).
export interface CustomerParams {
	// Время еды клиента после подачи блюда, секунды (начально 12).
	eatSec: number;
	// Порог ожидания крупной группы: группа меньшего размера может пройти раньше первой в очереди не дольше этого времени, секунды.
	seatingBypassSec: number;
	// Скорость ходьбы клиента, единиц мира в секунду.
	speed: number;
}

// Параметры станций и времени готовки (sim/kitchen).
export interface KitchenParams {
	// Время резки при удержании рабочего действия, секунды (начально 2).
	cutSec: number;
	// Время готовки и подгорания по процессам: через cookSec предмет готов, ещё через burnSec сгорает.
	cooking: Record<CookRecipeId, { cookSec: number; burnSec: number }>;
	// Сколько нарезанных овощей принимает кастрюля (начально 3).
	potCapacity: number;
	// Сколько порций рагу даёт один полный набор (начально 2).
	stewPortionsPerBatch: number;
}

// Параметры повара (sim/player).
export interface PlayerParams {
	// Скорость, единиц мира в секунду.
	speed: number;
	// Радиус круга столкновения.
	radius: number;
	// Расстояние от центра повара до точки выбора цели по направлению взгляда (около 0.9).
	reach: number;
	// Допуск: цель - станция, ближайшая к точке выбора, если расстояние от точки до её прямоугольника не больше допуска.
	targetTolerance: number;
	// Гистерезис смены сектора взгляда, градусы: взгляд меняется, только когда ввод зашёл за границу сектора на этот угол.
	facingHysteresisDeg: number;
	// Минимальная длина вектора движения, при которой взгляд обновляется (мёртвая зона стика).
	facingDeadzone: number;
}

// Параметры навигации и расталкивания (sim/nav).
export interface NavParams {
	// Радиус NPC: раздувание препятствий в навигационной сетке (клетка заблокирована, если расстояние от её центра до
	// препятствия меньше agentRadius) и столкновение NPC со статикой (касание допустимо). Начально 0.25 (половина клетки).
	agentRadius: number;
	// Расстояние до цели, при котором агент считается пришедшим.
	arriveDistance: number;
	// Радиус расталкивания персонажей и сила расталкивания (единиц мира в секунду на полное перекрытие).
	separationRadius: number;
	separationStrength: number;
	// Если агент не продвигается к цели дольше этого времени, путь перестраивается, секунды.
	stuckTimeoutSec: number;
	// Продвижением считается смещение по пути больше этой величины за stuckTimeoutSec.
	stuckMinProgress: number;
}

// Параметры официантов (sim/waiter).
export interface WaiterParams {
	// Вместимость: сколько тарелок несёт за рейс (1 на easy и medium, 2 на hard).
	capacity: number;
	// Скорость ходьбы, единиц мира в секунду.
	speed: number;
	// Время забора блюда в окне и подачи на стол, секунды (короткая пауза для читаемости).
	handoffSec: number;
}

// Все параметры уровня. Значения по умолчанию лежат в config/levels/defaults.ts (владелец Opus-агент).
export interface LevelParams {
	// Длительность смены, секунды: 180 easy, 240 medium, 300 hard.
	durationSec: number;
	// Меню уровня: какие блюда клиенты заказывают и принимает тарелка.
	menu: DishId[];
	// Награда и трудоёмкость по всем блюдам (для блюд вне меню не используется).
	dishes: Record<DishId, DishParams>;
	schedule: ScheduleParams;
	patience: PatienceParams;
	customers: CustomerParams;
	kitchen: KitchenParams;
	player: PlayerParams;
	nav: NavParams;
	waiter: WaiterParams;
}

// Полное описание уровня.
export interface LevelConfig {
	id: LevelId;
	// Граница мира: навигационная сетка покрывает только её, выйти за неё нельзя. Включает улицу с очередью.
	bounds: Rect;
	// Прямоугольник, который должен целиком попадать в кадр камеры (ресторан и зона очереди).
	view: Rect;
	floors: FloorConfig[];
	// Стены, колонны, мебель и декор. Стены между кухней и залом, наружные стены и проём двери задаются здесь.
	props: PropConfig[];
	// Дополнительные невидимые препятствия (например, части стены вокруг проёма). Блокируют движение и навигацию.
	colliders: Rect[];
	stations: StationConfig[];
	window: ServingWindowConfig;
	tables: TableConfig[];
	door: DoorConfig;
	queue: QueueConfig;
	chefStart: SpawnConfig;
	waiters: WaitersConfig;
	params: LevelParams;
	// Список проверенных seed расписания: каждый прогнан ботом. При запуске уровня берётся один из них.
	verifiedSeeds: number[];
}

// ============================================================================
// 4. ВВОД
// ============================================================================

// Нормализованное состояние ввода на один шаг. Симуляция не знает об устройстве ввода (клавиатура, мышь, касания).
export interface InputState {
	// Вектор движения. x вправо +, z вниз по экрану + (клавиша W даёт z = -1). Длина от 0 до 1 включительно:
	// диагональ нормирована, противоположные клавиши гасят друг друга по оси.
	moveVector: Vec2;
	// Фронт: "взять/положить" (ЛКМ или E) нажато в этом кадре. true ровно в одном кадре на каждое нажатие.
	actionPressed: boolean;
	// Уровень: кнопка "взять/положить" сейчас удерживается.
	actionHeld: boolean;
	// Фронт: рабочее действие (ПКМ или Q) нажато в этом кадре.
	workPressed: boolean;
	// Уровень: рабочее действие удерживается (резка идёт, пока true и цель не сменилась).
	workHeld: boolean;
}

// Пустой ввод: ничего не нажато.
export const EMPTY_INPUT: Readonly<InputState> = {
	moveVector: { x: 0, z: 0 },
	actionPressed: false,
	actionHeld: false,
	workPressed: false,
	workHeld: false,
};

// Режим устройства ввода: клавиатура и мышь или сенсорный экран.
export type InputMode = "keyboard" | "touch";

// ============================================================================
// 5. СОБЫТИЯ СИМУЛЯЦИИ
// ============================================================================
// События нужны HUD (баннеры, обратная связь), рендеру (эффекты) и в будущем звуку. Их создают модули симуляции через
// EventSink.emit, шина проставляет время t. Потребитель забирает события через Simulation.drainEvents.

// Причина отказа действия повара (обратная связь: HUD показывает понятную подсказку по причине).
// handBusy - рука занята; handEmpty - нечего положить; nothingToTake - на станции нечего брать; stationOccupied - станция занята
// или нет места; itemNotAccepted - станция не принимает этот предмет; burntItem - сгоревшее нельзя использовать;
// plateRequired - для этого нужна тарелка в руке; plateNotAccepted - тарелка не принимает ингредиент (не подходит ни к одному
// рецепту меню); dishNotReady - в окно сдают не готовое блюдо; noOpenOrder - в окно сдают блюдо без открытого заказа;
// windowFull - в окне нет места.
export type ActionRejectReason =
	| "handBusy"
	| "handEmpty"
	| "nothingToTake"
	| "stationOccupied"
	| "itemNotAccepted"
	| "burntItem"
	| "plateRequired"
	| "plateNotAccepted"
	| "dishNotReady"
	| "noOpenOrder"
	| "windowFull";

// Где был клиент, когда у него истекло терпение.
export type PatiencePlace = "queue" | "table";

// Описание провала смены: что именно произошло (для оверлея провала).
export interface FailureInfo {
	// Где ушёл клиент: в очереди (фаза A) или за столом (фаза B).
	place: PatiencePlace;
	groupId: GroupId;
	customerId: CustomerId;
	// Стол: для place = "table"; для очереди null.
	tableId: TableId | null;
	tableNumber: number | null;
	// Блюдо клиента: для place = "table"; для очереди null (заказ ещё не сделан).
	dish: DishId | null;
}

// Фаза смены. ready: до нажатия "Начать"; running: идёт; failed: провал, симуляция замерла до подтверждения;
// finished: завершена (все обслужены или вышло время).
export type ShiftPhase = "ready" | "running" | "failed" | "finished";

// Причина завершения смены. allServed: все клиенты дня обслужены (в том числе досрочно); timeUp: вышло время;
// failed: клиент ушёл.
export type ShiftEndReason = "allServed" | "timeUp" | "failed";

// Итог смены для моста. 0 <= score <= maxScore, maxScore > 0.
export interface ShiftResult {
	// true только если к концу смены все клиенты дня обслужены.
	completed: boolean;
	score: number;
	maxScore: number;
	reason: ShiftEndReason;
}

// Статус заказа: ожидает блюда, блюдо принято в окне и в доставке, подано.
export type OrderStatus = "waiting" | "delivering" | "served";

// Содержимое событий (без времени). Время t добавляет шина.
export type SimEventBody =
	// Смена.
	| { type: "phaseChanged"; phase: ShiftPhase }
	| { type: "flowClosed" }
	| { type: "shiftFinished"; result: ShiftResult }
	| { type: "shiftFailed"; failure: FailureInfo; result: ShiftResult }
	// Клиенты.
	| { type: "groupArrived"; groupId: GroupId; size: number }
	| { type: "groupQueued"; groupId: GroupId; slotIndex: number }
	| { type: "groupSeated"; groupId: GroupId; tableId: TableId; tableNumber: number }
	| { type: "orderPlaced"; orderId: OrderId; customerId: CustomerId; tableId: TableId; seatIndex: number; dish: DishId }
	| { type: "customerStartedEating"; customerId: CustomerId; orderId: OrderId }
	| { type: "customerFinishedEating"; customerId: CustomerId }
	| { type: "groupLeft"; groupId: GroupId; tableId: TableId }
	| { type: "patienceExpired"; failure: FailureInfo }
	// Подача: блюдо поставлено перед клиентом, клиент обслужен.
	| { type: "dishServed"; orderId: OrderId; customerId: CustomerId; groupId: GroupId; tableId: TableId; dish: DishId; price: number; tip: number }
	| { type: "groupServed"; groupId: GroupId; tableId: TableId }
	// Окно и официанты.
	| { type: "dishAccepted"; windowDishId: WindowDishId; orderId: OrderId; dish: DishId }
	| { type: "waiterPickedUp"; waiterId: WaiterId; orderIds: OrderId[] }
	// Кухня.
	| { type: "actionRejected"; stationId: StationId; reason: ActionRejectReason }
	| { type: "itemTaken"; stationId: StationId; item: Item }
	| { type: "itemPlaced"; stationId: StationId; item: Item }
	| { type: "itemTrashed"; item: Item }
	| { type: "cuttingDone"; stationId: StationId }
	| { type: "cookingStarted"; stationId: StationId; recipe: CookRecipeId }
	| { type: "cookingDone"; stationId: StationId; recipe: CookRecipeId }
	| { type: "itemBurnt"; stationId: StationId }
	| { type: "dishAssembled"; dish: DishId };

// Добавляет время к каждому варианту объединения отдельно (распределённое условное).
type WithTime<T> = T extends unknown ? T & { t: number } : never;

// Событие симуляции: содержимое и время (секунды времени симуляции, SimClock.nowSec) на момент события.
export type SimEvent = WithTime<SimEventBody>;

// Приёмник событий: модули симуляции пишут события сюда (время проставляет шина).
export interface EventSink {
	emit(event: SimEventBody): void;
}

// Шина событий (реализация: sim/eventBus.ts, Opus-агент). Синхронные подписчики и накопитель для потребителей по кадрам.
export interface EventBus extends EventSink {
	// Подписка на все события. Возвращает функцию отписки. Подписчики вызываются синхронно внутри emit в порядке подписки.
	subscribe(listener: (event: SimEvent) => void): () => void;
	// Забирает накопленные с прошлого вызова события в порядке возникновения и очищает накопитель.
	drain(): SimEvent[];
}

// Часы симуляции: секунды времени симуляции с начала смены. Меняет только Simulation, остальные модули читают.
export interface SimClock {
	nowSec: number;
}

// ============================================================================
// 6. СНИМОК СОСТОЯНИЯ ДЛЯ HUD И РЕНДЕРА
// ============================================================================
// Снимок читается без доступа к внутренностям симуляции. Это обычные данные (копии): потребитель их не меняет.

// Состояние станции для отрисовки. idle: пусто; holding: что-то лежит, процесса нет (прилавок с предметом, доска с сырым предметом,
// кастрюля с неполным набором, резка прервана, progress может быть больше 0); processing: процесс идёт сейчас (удерживается резка
// или идёт готовка); ready: готово, можно забирать (нарезано, приготовлено; идёт отсчёт до подгорания, см. burnProgress);
// burnt: сгорело.
export type StationPhase = "idle" | "holding" | "processing" | "ready" | "burnt";

// Станция в снимке.
export interface StationSnapshot {
	id: StationId;
	kind: StationKind;
	// Что лежит на станции или в ней. Прилавок и доска: 0 или 1 предмет (на доске меняет состояние raw -> chopped). Сковорода и
	// духовка: 0 или 1 предмет (patty/veggiePatty/ham в состоянии raw, cooked или burnt). Кастрюля: до трёх нарезанных овощей
	// до готовки, после готовки один предмет stew (cooked или burnt). Ящик: пусто (он показывает свою модель). Урна, окно: пусто.
	items: readonly Item[];
	phase: StationPhase;
	// Прогресс резки или готовки 0..1 (над станцией). 0, если процесса нет.
	progress: number;
	// Прогресс до подгорания 0..1 после готовности (0 до готовности и для сгоревшего). Нужен для предупреждения над станцией.
	burnProgress: number;
	// Для pot: сколько порций рагу осталось (0, если рагу не готово).
	portions: number;
}

// Цель взаимодействия повара.
export interface TargetSnapshot {
	stationId: StationId;
	kind: StationKind;
}

// Повар в снимке.
export interface ChefSnapshot {
	position: Vec2;
	// Логическое направление взгляда 0..7 (симуляция использует его сразу).
	facing: Facing8;
	// Угол yaw точного направления взгляда. Рендер плавно доворачивает модель к нему по кратчайшей дуге.
	yaw: number;
	// Идёт ли повар (для покачивания).
	moving: boolean;
	// Предмет в руке или null.
	hand: Item | null;
	// Выбранная цель взаимодействия (для подсветки) или null.
	target: TargetSnapshot | null;
	// Выполняется ли сейчас рабочее действие (резка идёт): для анимации.
	working: boolean;
}

// Официант в снимке.
export interface WaiterSnapshot {
	id: WaiterId;
	position: Vec2;
	yaw: number;
	moving: boolean;
	// Блюда, которые официант несёт (от 0 до вместимости).
	carrying: readonly DishId[];
}

// Фаза клиента. arriving: идёт от места появления к цели; queued: стоит в очереди на улице; walkingToTable: идёт к столу;
// seated: сидит за столом и ждёт блюдо; eating: ест; leaving: идёт к выходу.
export type CustomerPhase = "arriving" | "queued" | "walkingToTable" | "seated" | "eating" | "leaving";

// Клиент в снимке.
export interface CustomerSnapshot {
	id: CustomerId;
	groupId: GroupId;
	position: Vec2;
	yaw: number;
	moving: boolean;
	phase: CustomerPhase;
	// Сидит ли (рендер рисует сидящую позу): phase seated или eating.
	isSeated: boolean;
	// Вариант внешности (индекс цвета одежды), стабилен для клиента.
	variant: number;
	tableId: TableId | null;
	seatIndex: number | null;
	dish: DishId;
	// Стоит ли блюдо перед клиентом на столе (подано, пока он ест).
	dishOnTable: boolean;
}

// Заказ в снимке (одна строка в карточке стола HUD).
export interface OrderSnapshot {
	id: OrderId;
	customerId: CustomerId;
	tableId: TableId;
	seatIndex: number;
	dish: DishId;
	status: OrderStatus;
	// Остаток терпения и полное терпение, секунды. После подачи значение замораживается.
	patienceLeftSec: number;
	patienceTotalSec: number;
	// Доля остатка 0..1 (1 - только что сели, 0 - ушёл). Цвет и пульсация (менее 0.25) считает HUD.
	patienceRatio: number;
}

// Состояние стола. free: нет группы; waiting: за столом группа и хотя бы один заказ не подан; served: подано всем, группа ест.
// HUD по переходу в served показывает "стол обслужен" и затем скрывает карточку.
export type TableState = "free" | "waiting" | "served";

// Стол в снимке (карточка HUD).
export interface TableSnapshot {
	tableId: TableId;
	number: number;
	// Число мест (2 или 4).
	capacity: number;
	state: TableState;
	groupId: GroupId | null;
	// Заказы группы за столом (пусто при state = free). Порядок: по месту.
	orders: readonly OrderSnapshot[];
}

// Группа в очереди на улице.
export interface QueueGroupSnapshot {
	groupId: GroupId;
	slotIndex: number;
	size: number;
	patienceLeftSec: number;
	patienceTotalSec: number;
	patienceRatio: number;
}

// Блюдо, ждущее в окне выдачи.
export interface WindowDishSnapshot {
	id: WindowDishId;
	dish: DishId;
	orderId: OrderId;
	// Индекс в ServingWindowConfig.dishPoints.
	slotIndex: number;
}

// Часть снимка, которую даёт модуль смены.
export interface ShiftSnapshot {
	phase: ShiftPhase;
	durationSec: number;
	elapsedSec: number;
	// Оставшееся время, не меньше 0.
	timeLeftSec: number;
	// true с момента, когда до конца осталось не больше flowCloseBeforeEndSec: новые гости не придут (баннер).
	flowClosed: boolean;
	score: number;
	// Максимум очков по расписанию дня, известен до начала и не меняется.
	maxScore: number;
	// Обслужено клиентов (блюдо подано) и всего клиентов дня: "X из N".
	servedCustomers: number;
	totalCustomers: number;
	// Причина провала при phase = "failed", иначе null.
	failure: FailureInfo | null;
	// Итог при phase = "finished" или "failed", иначе null.
	result: ShiftResult | null;
}

// Полный снимок игры: всё, что нужно HUD и рендеру.
export interface GameSnapshot extends ShiftSnapshot {
	// Номер выполненного шага симуляции.
	tick: number;
	chef: ChefSnapshot;
	waiters: readonly WaiterSnapshot[];
	customers: readonly CustomerSnapshot[];
	// Все станции уровня в порядке LevelConfig.stations.
	stations: readonly StationSnapshot[];
	// Блюда в окне выдачи.
	windowDishes: readonly WindowDishSnapshot[];
	// Столы в порядке LevelConfig.tables. HUD сам упорядочивает карточки по срочности.
	tables: readonly TableSnapshot[];
	// Группы в очереди на улице в порядке слотов.
	queue: readonly QueueGroupSnapshot[];
	// Сколько групп стоит в очереди (queue.length): для счётчика HUD.
	queuedGroups: number;
}

// Отладочная информация (оверлей при NEXT_PUBLIC_DEBUG=true): путь одного персонажа.
export interface DebugPath {
	agentId: string;
	// Оставшиеся точки пути.
	points: readonly Vec2[];
}

// Отладочные данные симуляции (не входят в обычный снимок).
export interface DebugInfo {
	// Сетка без раздувания (клетки под мебелью заблокированы) и навигационная сетка с раздутыми препятствиями.
	collisionGrid: NavGridView;
	navGrid: NavGridView;
	// Пути NPC.
	paths: readonly DebugPath[];
	// Точка выбора цели перед поваром (куда "смотрит" рука) или null.
	chefProbe: Vec2 | null;
}

// ============================================================================
// 7. ИНТЕРФЕЙСЫ МЕЖДУ ОБЛАСТЯМИ
// ============================================================================

// --- 7.1 Основа (sim/core, SONNET-1) ---

// Генератор псевдослучайных чисел по seed (mulberry32). Одинаковый seed даёт одинаковую последовательность.
export interface Rng {
	// Число в [0, 1).
	next(): number;
	// Целое в [min, max] включительно.
	nextInt(min: number, max: number): number;
	// Вещественное в [min, max).
	nextRange(min: number, max: number): number;
	// Случайный элемент непустого массива.
	pick<T>(items: readonly T[]): T;
	// Индекс по весам (веса неотрицательные, сумма больше 0).
	weightedIndex(weights: readonly number[]): number;
}

// Тип фабрики модуля: сигнатура экспортируемой функции, которую реализует владелец области.
// sim/core/rng.ts: export function createRng(seed: number): Rng
export type RngFactory = (seed: number) => Rng;

// Параметры цикла с фиксированным шагом.
export interface FixedStepLoopOptions {
	// Вызывается на каждый фиксированный шаг. dtSec всегда равен stepSec.
	onStep(dtSec: number): void;
	// Длительность шага, секунды (по умолчанию SIM_STEP_SEC).
	stepSec?: number;
	// Не больше стольких шагов за один advance (по умолчанию 5): защита от "спирали смерти". Остаток накопителя сверх лимита отбрасывается.
	maxStepsPerAdvance?: number;
}

// Цикл с фиксированным шагом и накопителем времени.
export interface FixedStepLoop {
	// Добавляет время кадра в накопитель и выполняет целые шаги. Возвращает число выполненных шагов.
	// Результат не зависит от размера кадров: одно и то же суммарное время даёт то же число шагов (в пределах лимита).
	advance(frameDtSec: number): number;
	// Сбрасывает накопитель.
	reset(): void;
}

// Тип фабрики модуля: сигнатура экспортируемой функции, которую реализует владелец области.
// sim/core/loop.ts: export function createFixedStepLoop(options: FixedStepLoopOptions): FixedStepLoop
export type FixedStepLoopFactory = (options: FixedStepLoopOptions) => FixedStepLoop;

// --- 7.2 Геометрия и навигация (sim/geometry, sim/nav, SONNET-2) ---

// Взгляд на сетку (для коллизий, поиска пути и отладочного оверлея). Клетка квадратная со стороной cellSize = GRID_STEP.
export interface NavGridView {
	// Угол сетки: мировые координаты левого верхнего угла клетки (0, 0). Равен углу LevelConfig.bounds.
	readonly originX: number;
	readonly originZ: number;
	readonly cellSize: number;
	readonly cols: number;
	readonly rows: number;
	// Заблокирована ли клетка. Клетки вне сетки считаются заблокированными.
	isBlocked(col: number, row: number): boolean;
	// Клетка, в которую попадает точка мира (может быть вне сетки).
	worldToCell(point: Vec2): { col: number; row: number };
	// Центр клетки в мировых координатах.
	cellToWorld(col: number, row: number): Vec2;
}

// Поиск пути A* по сетке с раздутыми препятствиями (8 соседей без срезания углов, эвристика octile, сглаживание по линии видимости).
// Сглаженный путь не заходит в заблокированные клетки навигационной сетки: линия видимости проверяется по клеткам сетки.
export interface Pathfinder {
	// Путь от from к to: точки после сглаживания, без начальной точки, последняя точка равна to. [] если from уже у цели.
	// null, если цель недостижима. Начало и цель, попавшие в заблокированную клетку, смещаются к ближайшей свободной.
	findPath(from: Vec2, to: Vec2): Vec2[] | null;
	// Длина найденного пути (сумма отрезков) или null, если недостижимо. Используется для выбора ближайшего официанта.
	pathLength(from: Vec2, to: Vec2): number | null;
}

// Геометрия уровня, построенная из LevelConfig. sim/geometry/index.ts: export function buildGeometry(level: LevelConfig): LevelGeometry
export interface LevelGeometry {
	level: LevelConfig;
	// Все статичные препятствия: блокирующие props, colliders, станции, столешницы столов и стулья.
	obstacles: readonly Rect[];
	// Сетка без раздувания: клетка заблокирована, если пересекается с препятствием (границы мира тоже блокируют).
	collisionGrid: NavGridView;
	// Навигационная сетка: клетка заблокирована, если расстояние от её центра до препятствия меньше params.nav.agentRadius
	// (или центр внутри препятствия, или клетка вне bounds). При agentRadius = 0.25 сетка совпадает с collisionGrid.
	navGrid: NavGridView;
}
// Тип фабрики GeometryFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type GeometryFactory = (level: LevelConfig) => LevelGeometry;

// Состояние агента навигации: idle - нет цели; moving - идёт по пути; arrived - дошёл до последней цели; unreachable - цель недостижима.
export type NavAgentStatus = "idle" | "moving" | "arrived" | "unreachable";

// Параметры создания агента навигации (NPC: клиент или официант).
export interface NavAgentSpec {
	id: string;
	position: Vec2;
	// Скорость ходьбы, единиц мира в секунду.
	speed: number;
	// Радиус круга для расталкивания и столкновения со статикой.
	radius: number;
}

// Агент навигации: персонаж, идущий по пути A* со столкновением со статикой и мягким расталкиванием с другими.
export interface NavAgent {
	readonly id: string;
	readonly position: Vec2;
	// Направление, в котором агент смотрит (yaw, как в снимке): по направлению движения или заданное setHeading.
	readonly heading: number;
	readonly status: NavAgentStatus;
	// Идёт ли агент прямо сейчас (для покачивания).
	readonly isMoving: boolean;
	// Оставшиеся точки пути (для отладки).
	readonly path: readonly Vec2[];
	// Строит путь к цели. false, если цель недостижима (status = "unreachable"). Прежний путь отменяется.
	moveTo(target: Vec2): boolean;
	// Отменяет путь, агент стоит (status = "idle").
	stop(): void;
	// Мгновенный перенос (посадка на стул, появление), путь отменяется. heading необязателен.
	teleport(position: Vec2, heading?: number): void;
	// Задаёт направление взгляда стоящего агента.
	setHeading(heading: number): void;
}

// Зависимости навигации.
export interface NavDeps {
	level: LevelConfig;
	geometry: LevelGeometry;
}

// Навигация: владеет всеми NPC-агентами, двигает их, расталкивает и перепланирует путь при застревании.
// sim/nav/index.ts: export function createNavSystem(deps: NavDeps): NavSystem
export interface NavSystem {
	readonly pathfinder: Pathfinder;
	readonly agents: readonly NavAgent[];
	createAgent(spec: NavAgentSpec): NavAgent;
	removeAgent(agentId: string): void;
	// Один шаг: движение по путям, столкновение со статикой, расталкивание, перепланирование. Расталкивание действует на
	// ДВИЖУЩИХСЯ агентов (status moving): они обходят и отталкиваются от других агентов (в том числе стоящих) и от повара.
	// Стоящие агенты (idle, arrived: очередь, официант в точке ожидания) расталкиванием не сдвигаются, чтобы очередь не "плыла".
	step(dtSec: number, chefPosition: Vec2): void;
}
// Тип фабрики NavSystemFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type NavSystemFactory = (deps: NavDeps) => NavSystem;

// --- 7.3 Повар (sim/player, SONNET-2) ---

// Цель взаимодействия: ближайшая станция к точке перед поваром по направлению взгляда.
export interface InteractionTarget {
	stationId: StationId;
	kind: StationKind;
	// Расстояние от точки выбора до прямоугольника станции.
	distance: number;
}

// Состояние повара (без руки: рука принадлежит кухне).
export interface PlayerState {
	position: Vec2;
	facing: Facing8;
	moving: boolean;
}

// Зависимости игрока.
export interface PlayerDeps {
	level: LevelConfig;
	geometry: LevelGeometry;
}

// Повар: движение кругом с коллизиями, взгляд 0..7 с гистерезисом, выбор цели.
// sim/player/index.ts: export function createPlayer(deps: PlayerDeps): Player
export interface Player {
	readonly state: PlayerState;
	// Один шаг: движение по input.moveVector (скольжение вдоль препятствий), обновление взгляда (в том числе при заблокированном
	// движении), пересчёт цели по новому взгляду сразу.
	step(input: InputState, dtSec: number): void;
	// Текущая цель или null (нет станции в допуске).
	getTarget(): InteractionTarget | null;
	// Точка выбора цели перед поваром (для отладки).
	getProbePoint(): Vec2;
}
// Тип фабрики PlayerFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type PlayerFactory = (deps: PlayerDeps) => Player;

// --- 7.4 Заказы и окно выдачи (кухня, клиенты, официант; SONNET-1 реализует обе стороны, SONNET-2 использует) ---

// Заказ клиента.
export interface Order {
	id: OrderId;
	customerId: CustomerId;
	groupId: GroupId;
	tableId: TableId;
	tableNumber: number;
	seatIndex: number;
	dish: DishId;
	status: OrderStatus;
	// Время создания заказа (SimClock.nowSec): порядок FIFO.
	createdAtSec: number;
	// Где стоит официант при подаче (SeatConfig.servePoint) и куда ставится блюдо (SeatConfig.dishPoint).
	servePoint: Vec2;
	dishPoint: Vec2;
	patienceTotalSec: number;
	patienceLeftSec: number;
}

// Таблица заказов: реализует система клиентов (sim/customers). Кухня привязывает к ней блюда, официант отмечает подачу.
export interface OrderBoard {
	// Все заказы текущей смены (открытые и поданные) в порядке создания.
	getOrders(): readonly Order[];
	getOrder(orderId: OrderId): Order | undefined;
	// Самый ранний заказ в статусе waiting на это блюдо (по createdAtSec, затем по порядку создания) или null.
	findEarliestWaitingOrder(dish: DishId): Order | null;
	// Привязка: заказ waiting -> delivering (блюдо принято в окне). false, если заказа нет или он не в статусе waiting.
	markDelivering(orderId: OrderId): boolean;
	// Подача: блюдо поставлено перед клиентом. Заказ -> served, клиент обслужен и начинает есть, терпение замораживается,
	// считаются цена и чаевые, шина получает dishServed (и groupServed, когда обслужена вся группа). false, если заказ не в статусе delivering.
	serveOrder(orderId: OrderId): boolean;
}

// Блюдо, ждущее в окне выдачи.
export interface WindowDish {
	id: WindowDishId;
	dish: DishId;
	orderId: OrderId;
	// Индекс в ServingWindowConfig.dishPoints.
	slotIndex: number;
	acceptedAtSec: number;
}

// Результат попытки сдать тарелку в окно.
export type WindowAcceptResult = { ok: true; windowDish: WindowDish } | { ok: false; reason: ActionRejectReason };

// Окно выдачи: реализует кухня (sim/kitchen). Принимает готовые блюда с открытым заказом, хранит до забора официантом.
export interface ServingWindow {
	// Принимает тарелку: нужна готовая тарелка (dish не null), открытый заказ (OrderBoard.findEarliestWaitingOrder), свободный слот.
	// При успехе привязывает блюдо к самому раннему заказу (OrderBoard.markDelivering), кладёт в слот, шлёт dishAccepted.
	tryAccept(plate: PlateItem): WindowAcceptResult;
	// Блюда, ждущие официанта, в порядке приёма (FIFO).
	getDishes(): readonly WindowDish[];
	// Официант забирает блюдо: убирает его из окна. null, если блюда уже нет.
	takeDish(windowDishId: WindowDishId): WindowDish | null;
}

// --- 7.5 Кухня (sim/kitchen, SONNET-1) ---

// Результат действия повара над станцией.
export type InteractResult = { ok: true } | { ok: false; reason: ActionRejectReason };

// Зависимости кухни.
export interface KitchenDeps {
	level: LevelConfig;
	orders: OrderBoard;
	clock: SimClock;
	bus: EventSink;
}

// Кухня: рука повара, все станции, рецепты, окно выдачи.
// sim/kitchen/index.ts: export function createKitchen(deps: KitchenDeps): Kitchen
// sim/kitchen/recipes.ts: таблицы (dishRecipes: Record<DishId, DishRecipe>, cutTransitions: CutTransition[], cookTransitions: CookTransition[]).
export interface Kitchen {
	readonly window: ServingWindow;
	// "Взять/положить" над станцией stationId (Simulation вызывает при input.actionPressed, если у повара есть цель).
	// Шлёт события itemTaken, itemPlaced, actionRejected и другие. Возвращает результат.
	interact(stationId: StationId): InteractResult;
	// Рабочее действие на этом шаге: станция, над которой удерживается работа (резка), или null (не удерживается, цель сменилась).
	// Simulation вызывает на каждом шаге до step(): stationId цели, если input.workHeld, иначе null.
	setWork(stationId: StationId | null): void;
	// Один шаг: прогресс резки (если setWork указывает на доску с нарезаемым предметом), готовка, подгорание.
	step(dtSec: number): void;
	// Предмет в руке повара или null.
	getHand(): Item | null;
	// true, если на этом шаге идёт резка (для анимации "working").
	isWorking(): boolean;
	getStationSnapshots(): StationSnapshot[];
	getWindowDishSnapshots(): WindowDishSnapshot[];
}
// Тип фабрики KitchenFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type KitchenFactory = (deps: KitchenDeps) => Kitchen;

// --- 7.6 Клиенты (sim/customers, SONNET-1) ---

// Расписание дня.

// Клиент в расписании.
export interface ScheduledCustomer {
	customerId: CustomerId;
	dish: DishId;
	// Вариант внешности (индекс цвета), заданный расписанием для воспроизводимости.
	variant: number;
}

// Группа в расписании.
export interface ScheduledGroup {
	groupId: GroupId;
	// Время прихода, секунды от начала смены (не больше durationSec - flowCloseBeforeEndSec).
	arrivalSec: number;
	// От 1 до 4 клиентов.
	members: ScheduledCustomer[];
}

// Полное расписание дня. Известно до начала смены и не меняется.
export interface DaySchedule {
	seed: number;
	levelId: LevelId;
	// Группы по возрастанию arrivalSec.
	groups: ScheduledGroup[];
	// Число клиентов всего (знаменатель "X из N").
	totalCustomers: number;
	// Максимум очков: сумма (price + maxTip) по всем клиентам.
	maxScore: number;
}

// Тип фабрики модуля: сигнатура экспортируемой функции, которую реализует владелец области.
// sim/customers/schedule.ts: export function buildDaySchedule(level: LevelConfig, seed: number): DaySchedule
export type DayScheduleFactory = (level: LevelConfig, seed: number) => DaySchedule;

// Зависимости системы клиентов.
export interface CustomerDeps {
	level: LevelConfig;
	schedule: DaySchedule;
	nav: NavSystem;
	clock: SimClock;
	bus: EventSink;
}

// Система клиентов: приходы по расписанию, столы и рассадка, очередь, заказы, терпение, еда, уход.
// sim/customers/index.ts: export function createCustomerSystem(deps: CustomerDeps): CustomerSystem
export interface CustomerSystem extends OrderBoard {
	// Один шаг: приходы, посадка из очереди, терпение (истечение шлёт patienceExpired), еда, уход.
	step(dtSec: number): void;
	getCustomerSnapshots(): CustomerSnapshot[];
	getTableSnapshots(): TableSnapshot[];
	getQueueSnapshots(): QueueGroupSnapshot[];
}
// Тип фабрики CustomerSystemFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type CustomerSystemFactory = (deps: CustomerDeps) => CustomerSystem;

// --- 7.7 Официанты (sim/waiter, SONNET-2) ---

// Зависимости системы официантов.
export interface WaiterDeps {
	level: LevelConfig;
	nav: NavSystem;
	window: ServingWindow;
	orders: OrderBoard;
	clock: SimClock;
	bus: EventSink;
}

// Система официантов: автомат каждого официанта, назначение блюд, рейсы. Блюдо остаётся в окне до WindowDish takeDish
// (официант забирает его, дойдя до pickupPoint). Резервирование блюд за официантами (чтобы два официанта не шли за одним блюдом)
// ведёт сама система официантов, окно о нём не знает.
// sim/waiter/index.ts: export function createWaiterSystem(deps: WaiterDeps): WaiterSystem
export interface WaiterSystem {
	// Один шаг: назначение блюд из окна свободным официантам, ходьба, подача (OrderBoard.serveOrder), возврат.
	step(dtSec: number): void;
	getWaiterSnapshots(): WaiterSnapshot[];
}
// Тип фабрики WaiterSystemFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type WaiterSystemFactory = (deps: WaiterDeps) => WaiterSystem;

// --- 7.8 Смена (sim/shift, SONNET-1) ---

// Зависимости смены. Смена подписывается на шину: dishServed (очки, счётчик обслуженных), patienceExpired (провал).
export interface ShiftDeps {
	level: LevelConfig;
	schedule: DaySchedule;
	clock: SimClock;
	// Шина целиком: смена и подписывается, и шлёт события.
	bus: EventBus;
}

// Смена: фазы, закрытие потока, провал при уходе клиента, досрочное и обычное завершение, правило completed, очки.
// sim/shift/index.ts: export function createShift(deps: ShiftDeps): Shift
export interface Shift {
	// Переход ready -> running. Повторный вызов и вызов в другой фазе игнорируются.
	start(): void;
	// Проверки на шаге (Simulation вызывает после остальных модулей, часы уже продвинуты): закрытие потока, досрочное завершение
	// (все обслужены), конец таймера. Не продвигает часы.
	step(): void;
	getSnapshot(): ShiftSnapshot;
	getResult(): ShiftResult | null;
}
// Тип фабрики ShiftFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type ShiftFactory = (deps: ShiftDeps) => Shift;

// --- 7.9 Ввод (src/input, SONNET-2) ---

// Параметры системы ввода.
export interface InputOptions {
	// Корневой элемент игры: на него вешается слой касаний (стик и кнопки), в нём подавляется contextmenu.
	root: HTMLElement;
	// Окно, на которое вешаются клавиатура и сброс при потере фокуса (по умолчанию window; подменяется в тестах).
	eventTarget?: Window;
}

// Источник ввода: собирает клавиатуру (по event.code), мышь и касания в InputState.
// input/index.ts: export function createInputSystem(options: InputOptions): InputSource
export interface InputSource {
	// Текущее состояние. Однократные признаки (actionPressed, workPressed) однократны: после чтения сбрасываются.
	read(): InputState;
	// Сброс всех нажатых клавиш и касаний (потеря фокуса, скрытие вкладки, пауза).
	reset(): void;
	// Включает и выключает ввод (например, на паузе или оверлее). Выключенный ввод возвращает пустое состояние.
	setEnabled(enabled: boolean): void;
	// Текущий режим устройства: клавиатура или касания. Касания включаются по (pointer: coarse) и первому касанию.
	getMode(): InputMode;
	// Подписка на смену режима. Возвращает функцию отписки.
	onModeChange(listener: (mode: InputMode) => void): () => void;
	// Снимает все обработчики и убирает слой касаний.
	dispose(): void;
}
// Тип фабрики InputFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type InputFactory = (options: InputOptions) => InputSource;

// --- 7.10 Рендер и HUD (src/render, src/hud, SONNET-3) ---

// Мост с порталом (portal-bridge.js, sdk/web). Тип нужен main и тестам с подменой моста.
export interface PortalBridgeApi {
	protocolVersion: number;
	isEmbedded: boolean;
	// Уровень из адреса (?level=easy).
	getLevelId(): LevelId;
	// Подписка на старт от портала. Первый вызов сообщает порталу о готовности.
	onStart(callback: (start: { gameId: string; levelId: string }) => void): void;
	// Итог уровня. false, если результат уже отправлен или числа неверные.
	finish(result: { score: number; maxScore: number; completed?: boolean }): boolean;
	// Выход без результата.
	exit(): void;
	// Фатальная ошибка: портал покажет экран с повтором.
	reportError(message: string): void;
}

// Иконки блюд для HUD: адреса изображений (data URL), отрисованные один раз из glTF. Нет иконки - HUD показывает текст.
export type DishIcons = Partial<Record<DishId, string>>;

// Зависимости подготовки ресурсов (подменяются в тестах: загрузчик моделей, проверка WebGL).
export interface PrepareAssetsDeps {
	bridge: PortalBridgeApi;
	// Загрузка моделей; по умолчанию GLTFLoader. Должна отклонять промис при сбое одной из моделей.
	loadModels?: () => Promise<unknown>;
	// Проверка WebGL; по умолчанию создание контекста на временном canvas.
	isWebGLAvailable?: () => boolean;
}

// render/index.ts: export async function prepareAssets(deps: PrepareAssetsDeps): Promise<LoadedAssets | null>
// Проверяет WebGL и загружает все модели. При отсутствии WebGL или сбое загрузки вызывает bridge.reportError и возвращает null.
// Сам bridge.onStart не вызывает: готовность сообщает main после успешной загрузки. LoadedAssets определяет render (render/assets.ts).

// Параметры сцены.
export interface SceneRendererOptions {
	// Контейнер для canvas (на весь размер фрейма).
	container: HTMLElement;
	level: LevelConfig;
	// Включает отладочный оверлей (сетка, пути, зоны, идентификаторы станций). При false оверлей не создаётся.
	debug: boolean;
}

// Сцена three.js: расставляет объекты по LevelConfig, рисует по снимку, подстраивает камеру под размер фрейма.
// render/index.ts: export function createSceneRenderer(options: SceneRendererOptions, assets: LoadedAssets): SceneRenderer
// render/index.ts: export function createDishIcons(assets: LoadedAssets): DishIcons
export interface SceneRenderer {
	// Каждый кадр: обновить объекты по снимку (повар, официанты, клиенты, предметы, станции, подсветка цели) и нарисовать.
	// frameDtSec - время кадра для плавных анимаций (покачивание, доворот повара).
	render(snapshot: GameSnapshot, frameDtSec: number): void;
	// События для эффектов (необязательны для работы, обработчик может игнорировать).
	handleEvents(events: readonly SimEvent[]): void;
	// Отладочные данные (только при debug = true): сетка, пути, точка выбора цели. При debug = false вызов игнорируется.
	setDebugInfo(info: DebugInfo | null): void;
	// Размер фрейма изменился: пересчитать камеру так, чтобы LevelConfig.view целиком был в кадре.
	resize(widthPx: number, heightPx: number): void;
	// Освобождает ресурсы WebGL и убирает canvas.
	dispose(): void;
}

// Отправка итога порталу (hud/reporter.ts, SONNET-3). Единая точка, через которую уходит результат или выход: гарантирует,
// что порталу уходит не больше одного сообщения за запуск, и сообщает main, что игру пора остановить.
// hud/reporter.ts: export function createResultReporter(bridge: PortalBridgeApi, onClosed: () => void): ResultReporter
export interface ResultReporter {
	// Отправляет итог смены через PortalBridge.finish({ score, maxScore, completed }). true, если отправлено; false, если
	// сообщение уже уходило (результат или выход) или мост отклонил числа. После успешной отправки вызывается onClosed.
	reportResult(result: ShiftResult): boolean;
	// Сообщает порталу о выходе без результата (PortalBridge.exit). true, если отправлено; повторно и после результата нет.
	// После отправки вызывается onClosed.
	reportExit(): boolean;
	// true после отправки результата или выхода.
	readonly isClosed: boolean;
}
// Тип фабрики ResultReporterFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type ResultReporterFactory = (bridge: PortalBridgeApi, onClosed: () => void) => ResultReporter;

// Параметры цикла кадров.
export interface FrameLoopOptions {
	// Вызывается на каждый кадр: время кадра в секундах (не больше maxFrameDtSec) и время requestAnimationFrame в миллисекундах.
	onFrame(frameDtSec: number, nowMs: number): void;
	// Верхняя граница dt кадра, секунды (по умолчанию 0.1): защита от скачка времени после скрытой вкладки.
	maxFrameDtSec?: number;
	// Планировщик кадров (по умолчанию requestAnimationFrame и cancelAnimationFrame); подменяется в тестах.
	scheduler?: {
		request(callback: (nowMs: number) => void): number;
		cancel(handle: number): void;
	};
}

// Цикл кадров (render/frameLoop.ts, SONNET-3): requestAnimationFrame с ограничением dt. Main запускает его после загрузки
// и останавливает после результата или выхода (задача 6.8).
// render/frameLoop.ts: export function createFrameLoop(options: FrameLoopOptions): FrameLoop
export interface FrameLoop {
	// Запускает цикл (повторный вызов игнорируется).
	start(): void;
	// Останавливает цикл: новые кадры не планируются, запланированный отменяется. После stop onFrame не вызывается.
	stop(): void;
	readonly isRunning: boolean;
}
// Тип фабрики FrameLoopFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type FrameLoopFactory = (options: FrameLoopOptions) => FrameLoop;

// Обратные вызовы HUD в main: только то, что влияет на время симуляции. Итог и выход HUD отправляет сам через ResultReporter.
export interface HudCallbacks {
	// Игрок нажал "Начать" (main вызывает Simulation.start). HUD не даёт нажать, пока телефон в портретной ориентации.
	onStartPressed(): void;
	// Игрок запросил паузу (кнопка или Escape). Main останавливает время и вызывает HUD.setPaused(true).
	onPauseRequested(): void;
	// Игрок выбрал "Продолжить" в меню паузы или нажал Escape на паузе. Main возобновляет время и вызывает HUD.setPaused(false).
	onResumeRequested(): void;
}

// Параметры HUD.
export interface HudOptions {
	// Корневой элемент игры: HUD - DOM-слой над canvas.
	root: HTMLElement;
	level: LevelConfig;
	callbacks: HudCallbacks;
	// Отправка итога порталу. HUD вызывает reporter.reportResult(snapshot.result) после "Продолжить" на оверлее провала
	// (completed = false, набранный score) и reporter.reportExit() после "Выйти" в меню паузы. Успешный итог отправляет main.
	reporter: ResultReporter;
	dishIcons: DishIcons;
	// Начальный режим ввода (подсказки управления зависят от него).
	inputMode: InputMode;
}

// HUD: заказы по столам, терпение, таймер, "X из N", очки, очередь, баннер, экраны (начало, пауза, провал, ориентация).
// hud/index.ts: export function createHud(options: HudOptions): Hud
// HUD сам определяет экраны по снимку: phase = "ready" - стартовый экран, phase = "failed" - оверлей провала с причиной
// (snapshot.failure), портретная ориентация на сенсорном устройстве - просьба повернуть экран.
export interface Hud {
	// Каждый кадр: новый снимок. HUD сам ограничивает обновление DOM (не чаще 10 раз в секунду).
	update(snapshot: GameSnapshot, nowMs: number): void;
	// События для баннеров и обратной связи (например, отказ окна).
	handleEvents(events: readonly SimEvent[]): void;
	// Смена режима ввода: подсказки управления и раскладка.
	setInputMode(mode: InputMode): void;
	// Показать или скрыть меню паузы.
	setPaused(paused: boolean): void;
	// Снимает обработчики и убирает DOM.
	dispose(): void;
}
// Тип фабрики HudFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type HudFactory = (options: HudOptions) => Hud;

// --- 7.11 Симуляция целиком (sim/simulation.ts, Opus-агент) ---

// Параметры создания симуляции.
export interface SimulationOptions {
	level: LevelConfig;
	// Seed расписания дня. Должен быть из LevelConfig.verifiedSeeds (проверяет вызывающий; тесты могут брать любой).
	seed: number;
}

// Порядок одного шага (sim/simulation.ts), только в фазе running:
//   1. clock.nowSec += SIM_STEP_SEC, tick += 1.
//   2. player.step(input, dt).
//   3. kitchen.setWork(input.workHeld ? id цели : null); если input.actionPressed и цель есть: kitchen.interact(id цели).
//   4. kitchen.step(dt).
//   5. customers.step(dt). Если смена перестала быть running (провал), остаток шага пропускается.
//   6. waiters.step(dt).
//   7. nav.step(dt, позиция повара).
//   8. shift.step().
// Признак workPressed симуляция не использует (резкой управляет workHeld), он оставлен для интерфейса и будущего звука.
//
// Симуляция целиком: единственный интерфейс, который видят main, рендер, HUD и бот.
// sim/simulation.ts: export function createSimulation(options: SimulationOptions): Simulation
export interface Simulation {
	readonly level: LevelConfig;
	readonly seed: number;
	// Расписание дня (известно до начала).
	readonly schedule: DaySchedule;
	// Геометрия и поиск пути (для бота и отладки).
	readonly geometry: LevelGeometry;
	readonly pathfinder: Pathfinder;
	// Переход ready -> running (кнопка "Начать").
	start(): void;
	// ОДИН фиксированный шаг SIM_STEP_SEC с этим вводом (бот и тесты). Ничего не делает, если фаза не running.
	step(input: InputState): void;
	// Продвигает симуляцию на время кадра через накопитель: выполняет 0..N фиксированных шагов, возвращает их число.
	// Однократные признаки ввода (actionPressed, workPressed) достаются только первому шагу кадра; если шагов не было,
	// признаки копятся до ближайшего шага и не теряются.
	advance(frameDtSec: number, input: InputState): number;
	getSnapshot(): GameSnapshot;
	// Забирает накопленные события (для HUD и рендера по кадрам).
	drainEvents(): SimEvent[];
	// Подписка на события (синхронно). Возвращает функцию отписки.
	subscribe(listener: (event: SimEvent) => void): () => void;
	// Итог смены, когда фаза finished или failed, иначе null.
	getResult(): ShiftResult | null;
	// Отладочные данные для оверлея.
	getDebugInfo(): DebugInfo;
}
// Тип фабрики SimulationFactory: сигнатура экспортируемой функции модуля (см. комментарий выше).
export type SimulationFactory = (options: SimulationOptions) => Simulation;
