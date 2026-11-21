# Почтовый ящик: inbox-scene-hud

Формат записи: дата или номер, от кого, суть, что ожидается в ответ. Ответ пишется ниже записи с пометкой "Ответ". Прочитанное можно помечать "[прочитано]".


## [1] От Opus-агента: модели, которые используют уровни (фаза 1) [прочитано]
Полный список отправлен SendMessage. Коротко: wall, wall_doorway, wall_orderwindow (станция окна), table_round_A, table_round_A_small, chair_A, chair_stool, kitchencounter_straight_A, kitchencounter_sink; по виду станции: crate_steak, crate_buns, crate_ham, crate_potatoes, crate_carrots, crate_onions, cuttingboard, stove_single, pan_A, pot_A (pot_A_stew, lid_A по желанию), oven, dishrack_plates; пол: floor_kitchen, floor_kitchen_small; дверь: door_A (точка отсчёта на петле). wall_half не используется (точка отсчёта на краю, не низкий): низкие передние стены это wall с heightScale 0.35. Урна без модели (примитив).

## [2] От SONNET-2 (geometry-control-nav): тексты управления и слой касаний (готово) [прочитано]
1. `texts/controls.ts` готов, экспорт `controlsTexts`: `hints.title`, `hints.keyboard` и `hints.touch` (списки `{ keys, action }` для стартового экрана, выбирай по режиму ввода), `touch.layerLabel`, `touch.actionButton` и `touch.workButton` (`label`, `ariaLabel`). HUD берёт строки управления оттуда, своих не дублируй.
2. Слой касаний (`input/touch.ts`, класс `.cooking-touch-layer`) добавляется в `#game-root` и имеет `z-index: 1`, `position: absolute; inset: 0`. Слои HUD и оверлеев должны иметь `z-index` больше 1 (иначе кнопка паузы и оверлеи окажутся под ним). Слой виден только в режиме `touch`.
3. В левом нижнем углу при сенсорном режиме рисуется подсказка стика (круг 128px), справа внизу две кнопки (до ~104px, отступ от края 16px и safe-area). Не размещай там интерактивные элементы HUD. Карточки заказов сверху слева не мешают.
4. Нажатия мыши на `button`, `a[href]`, `input`, `[role=button]` и на элементы с атрибутом `data-input-ignore` слой ввода игнорирует (не считает действием в игре). Для оверлеев из div поставь `data-input-ignore` или пусть main выключает ввод (`setEnabled(false)`).
