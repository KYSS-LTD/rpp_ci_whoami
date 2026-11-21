// Константы интерфейса HUD. Это параметры показа (частота обновления, время баннеров), а не баланс игры: баланс лежит в
// LevelParams (config/levels). Все значения именованы, чтобы их можно было менять в одном месте.

// Не чаще стольких миллисекунд HUD обновляет DOM (10 раз в секунду, design D2).
export const HUD_UPDATE_INTERVAL_MS = 100;

// Сколько миллисекунд карточка обслуженного стола показывает "Стол обслужен", прежде чем скрыться.
export const SERVED_CARD_VISIBLE_MS = 3000;

// Сколько секунд времени смены (по часам симуляции) виден баннер закрытия потока после того, как поток закрылся.
export const FLOW_BANNER_VISIBLE_SEC = 6;

// Сколько миллисекунд видна всплывающая подсказка (отказ действия, подача).
export const HINT_VISIBLE_MS = 2500;

// Доля остатка терпения, ниже которой индикатор пульсирует (четверть, по спецификации HUD).
export const URGENT_PATIENCE_RATIO = 0.25;

// Шаг квантования остатка терпения в секундах при упорядочивании карточек: убирает перестановки из-за долей секунды.
export const URGENCY_SORT_STEP_SEC = 0.5;

// --- Раскладка HUD (hud/ordersLayout.ts): размеры в пикселях страницы. Те же числа уходят в CSS через переменные, поэтому
// расчёт раскладки и стили не расходятся. ---

// Экран низкой высоты (телефон в альбомной ориентации и маленькое окно): HUD сжимается.
export const LOW_SCREEN_MAX_HEIGHT_PX = 520;

// Отступ HUD от краёв экрана без вырезов (с вырезами берётся safe-area-inset), зазор между блоками HUD.
export const HUD_EDGE_PADDING_PX = 8;
export const HUD_GAP_PX = 8;
export const HUD_GAP_LOW_PX = 4;

// Ширина центрального блока (таймер, счётчики, баннер): на низком экране уже, чтобы освободить место карточкам заказов.
export const HUD_CENTER_WIDTH_PX = 264;
export const HUD_CENTER_WIDTH_LOW_PX = 160;

// Экранные кнопки "Взять" и "Резать" слоя касаний (input/touch.css) стоят столбиком у правого нижнего угла: размер кнопки
// clamp(72px, 20vmin, 104px), зазор между ними 16, отступ от края 16. Карточки заказов стоят вверху справа и не опускаются
// к кнопкам ближе запаса. Стик слева внизу занимает 128 + 16, он ниже кнопок, поэтому в запас не входит.
export const TOUCH_BUTTON_MIN_PX = 72;
export const TOUCH_BUTTON_MAX_PX = 104;
export const TOUCH_BUTTON_VMIN_RATIO = 0.2;
export const TOUCH_BUTTON_GAP_PX = 16;
export const TOUCH_EDGE_INSET_PX = 16;
export const TOUCH_RESERVE_MARGIN_PX = 12;

// Наибольшее число мест (и заказов) у одного стола.
export const MAX_ORDERS_PER_TABLE = 4;

// Полная карточка стола: ширина, высота шапки, внутренние отступы и запас высоты одной строки заказа (название блюда
// может занять две строки). Оценка нарочно с запасом: карточка не должна выйти за свою зону.
export const FULL_CARD_WIDTH_PX = 264;
export const FULL_CARD_HEADER_PX = 36;
export const FULL_CARD_PADDING_PX = 20;
export const FULL_ORDER_ROW_PX = 60;

// Полный вид занимает много места и закрывает кухню: он допустим, пока блок не выше этой доли высоты зоны. Возврат из компактного
// вида в полный только при заполнении не выше второй, меньшей доли (гистерезис: вид не мигает, когда число заказов колеблется у границы).
export const FULL_MAX_FILL_RATIO = 0.6;
export const FULL_RETURN_FILL_RATIO = 0.45;

// Компактная карточка стола (одна строка: номер и ряд значков блюд, под каждым значком полоса терпения).
export const COMPACT_ICON_PX = 32;
export const COMPACT_ICON_GAP_PX = 4;
export const COMPACT_BADGE_PX = 24;
export const COMPACT_CARD_PADDING_X_PX = 8;
export const COMPACT_CARD_INNER_GAP_PX = 8;
export const COMPACT_CARD_HEIGHT_PX = 48;
export const COMPACT_CARD_GAP_PX = 4;

// Масштаб компактной карточки на обычном (не низком) экране: на компьютере и планшете значки крупнее.
export const COMPACT_SCALE_NORMAL = 1.25;

// Телефон: короткая сторона окна не больше этого числа. На телефоне вместо карточек столов показана сводка по блюдам
// (плитка блюда и число порций, которые ещё ждут все столы), она помещается в зону при любой нагрузке.
export const PHONE_MAX_SHORT_SIDE_PX = 500;

// Зоны экрана, в которых размещается HUD. Нижние зоны HUD не занимает (там стик и кнопки на сенсорных устройствах).
export type HudZone = "top-left" | "top-center" | "top-right";
