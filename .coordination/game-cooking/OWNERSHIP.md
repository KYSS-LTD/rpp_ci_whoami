# Владение файлами: change game-cooking

Правило: каждый агент правит только свои файлы. Нужна правка чужого файла: написать владельцу или Opus-агенту в его inbox (см. `inbox-*.md` в этой папке). Опус-агент и architect это одна роль (Opus-агент, фактически выполняется Sonnet).

Все пути ниже относительны `web/games/cooking/src/`, если не сказано иное. Задачи берутся из `openspec/changes/game-cooking/tasks.md` через skill `openspec-apply-change` строго по своим номерам. Коммиты делает только пользователь, git-команды, меняющие состояние (commit, push, stash, reset, checkout, rebase), не запускать.

## Агенты и задачи

| Агент | Роль | Задачи |
|---|---|---|
| Opus-агент (architect) | общие интерфейсы, интеграция, конфиги уровней, бот | 1.1-1.5, 8.1-8.7, 9.1, 9.2, 9.5 (подготовка), 9.6 |
| SONNET-1 `kitchen-customers` | кухня, клиенты, смена, цикл симуляции | 2.1, 2.3-2.9, 5.1-5.6 |
| SONNET-2 `geometry-control-nav` | геометрия, ввод, повар, навигация, официанты | 2.2, 3.1-3.7, 4.1-4.6 |
| SONNET-3 `scene-hud` | рендер, HUD, ассеты | 1.6, 6.1-6.8, 7.1-7.7 |
| Оркестратор | ручное прохождение, проверка в обычном браузере, кадры превью | 9.3, 9.4, 9.5 |

## Файлы по владельцам

### SONNET-1 (kitchen-customers)

- `sim/core/` (`rng.ts`, `loop.ts`: `createRng`, `createFixedStepLoop`)
- `sim/kitchen/` (`index.ts`: `createKitchen`; `recipes.ts`: таблицы рецептов и переходов)
- `sim/customers/` (`index.ts`: `createCustomerSystem`; `schedule.ts`: `buildDaySchedule`)
- `sim/shift/` (`index.ts`: `createShift`)
- тесты рядом с кодом (`*.test.ts` в тех же папках)

### SONNET-2 (geometry-control-nav)

- `input/` (`index.ts`: `createInputSystem`, клавиатура, мышь, касания)
- `sim/geometry/` (`index.ts`: `buildGeometry`, коллизии и сетки; мини-уровень для своих тестов 2.2 лежит здесь же)
- `sim/player/` (`index.ts`: `createPlayer`)
- `sim/nav/` (`index.ts`: `createNavSystem`; A*, следование по пути, расталкивание, перепланирование)
- `sim/waiter/` (`index.ts`: `createWaiterSystem`)
- `texts/controls.ts` (тексты подсказок управления и экранных кнопок)
- тесты рядом с кодом

### SONNET-3 (scene-hud)

- `render/` (`index.ts`: `prepareAssets`, `createSceneRenderer`, `createDishIcons`; `frameLoop.ts`: `createFrameLoop`; `assets.ts`: загрузка моделей, тип `LoadedAssets`)
- `hud/` (`index.ts`: `createHud`; `reporter.ts`: `createResultReporter`; стили HUD `hud/*.css`)
- `texts/hud.ts` (тексты HUD, экранов, названия блюд, причины отказов)
- `public/models/` (копии glTF, `.bin`, `restaurantbits_texture.png`, лицензия пака; путь `web/games/cooking/public/models/`)
- `config/assets.ts` (список моделей)
- тесты рядом с кодом

### Opus-агент

- `contracts.ts` (единственный источник интерфейсов; правит только Opus-агент по запросу через `inbox-opus.md`)
- `common/` (`math.ts`: общие математические помощники)
- `config/debug.ts`, `config/levels/` (`defaults.ts`, `validate.ts`, будущие `easy.ts`, `medium.ts`, `hard.ts`, `index.ts`)
- `main.ts`, `global.d.ts`, `base.css`
- `sim/simulation.ts` (сборка `createSimulation`), `sim/eventBus.ts`
- `sim/testing/` (общие фикстуры и двойники: `testLevel.ts`, `fakeNav.ts`)
- `bot/` (эталонный бот, задача 8.4), тесты уровней и бота (8.5, 8.6)
- `texts/index.ts` (общий реэкспорт), `texts/system.ts`
- вне `src/`: `web/games/cooking/index.html`, `vite.config.ts`, `public/portal-bridge.js` (копия, создаётся шагом перед сборкой), `web/package.json`, `web/scripts/check-dashes.mjs`, `web/scripts/copy-portal-bridge.mjs`, `web/sdk/sdk-consistency.test.ts`, `web/eslint.config.mjs`, `web/core/registry/index.ts`, `web/texts/professions/index.ts`, `web/games/cooking/`, `web/public/game-previews/cooking/`, `web/public/game-builds/cooking/` (результат сборки, только через `npm run build:cooking`), `web/docs/cooking.md`, `.claude/launch.json`

## Решённые неоднозначности

1. Задача 2.2 (SONNET-2): типы данных уровня лежат в `contracts.ts` (задаёт Opus-агент). SONNET-2 пишет функции построения коллизий и навигационной сетки по этим типам. Мини-уровень SONNET-2 для своих тестов клеток лежит у него (`sim/geometry/`). Общая полная фикстура для всех областей: `sim/testing/testLevel.ts` (Opus-агент), её можно брать как есть или менять через `createTestLevel(paramsOverrides, overrides)`.
2. Задача 6.1 (SONNET-3) и 9.1 (Opus-агент): `prepareAssets` в `render/` проверяет WebGL, загружает модели и при сбое сам вызывает `bridge.reportError`; готовность (`bridge.onStart`) сообщает `main.ts` после успешной загрузки.
3. Задача 6.8 (SONNET-3) и 7.6: остановку и отправку итога разделяют так. `render/frameLoop.ts` даёт `createFrameLoop` с `stop()`. `hud/reporter.ts` даёт `createResultReporter(bridge, onClosed)`: единственная точка, через которую порталу уходит итог или выход (ровно один раз). HUD после "Продолжить" на провале вызывает `reporter.reportResult(snapshot.result)`, после "Выйти" в паузе `reporter.reportExit()`. Успешный итог (фаза `finished`) отправляет `main.ts` через тот же reporter. `onClosed` вызывает `main.ts`: он останавливает цикл кадров и снимает обработчики (ввод, HUD, рендер). Тест 6.8 "Игра завершена" пишется SONNET-3 на связке reporter, frame loop и подменённого ввода.
4. Задача 7.5 (пауза и ориентация): HUD определяет экраны сам по снимку и режиму ввода; время останавливает `main.ts` по колбэкам `onPauseRequested` и `onResumeRequested`.
5. Иконки блюд для HUD (`createDishIcons`) делает SONNET-3 в `render/`, передаёт в HUD `main.ts`.
6. Названия блюд и причины отказов (`ActionRejectReason`) для игрока лежат в `texts/hud.ts` (SONNET-3). Подсказки клавиш и экранных кнопок: `texts/controls.ts` (SONNET-2); HUD берёт строки управления из него.
7. Слои экрана (снизу вверх): canvas (рендер), слой касаний (ввод, SONNET-2), HUD (`pointer-events: none` везде, кроме интерактивных элементов), оверлеи (старт, пауза, провал, ориентация). Карточки заказов HUD вверху слева, нижняя часть и правый край на сенсорных устройствах свободны для стика и кнопок.
8. Новые параметры баланса (числа) агенты в код не пишут: просят Opus-агента добавить поле в `LevelParams` и значение в `config/levels/defaults.ts`.
9. Общие файлы проекта вне `games/cooking` и `games/cooking` правит только Opus-агент.

## Второй этап (задачи 10-16 в tasks.md)

Добавлены исключения и новые файлы (владелец указан):
- SONNET-2 дополнительно (исключение из правила 9): `web/core/bridge/`, `web/core/storage/`, `web/app/_components/IframeLevel.tsx`, `web/sdk/` (веб-SDK, копии `portal-bridge.js`, Unity SDK, README, тесты согласованности), `web/docs/game-bridge-protocol.md`, `web/docs/adding-game.md`; правки точечные, остальной код портала не трогать.
- SONNET-3 дополнительно: `web/scripts/capture-tutorial.mjs`, `web/games/cooking/src/config/tutorial.ts`, `web/games/cooking/public/tutorial/`, `web/games/cooking/src/texts/hud.ts` (подсказки); модель раковины `kitchencounter_sink` удаляется (задача 14.3).
- Opus-агент: `progress.ts` (разбор и обновление блока данных игры), `bot/tutorialScript.ts`, `config/levels/*`, `game.ts`, `web/docs/cooking.md`, `web/package.json` (devDependency `gifenc` и скрипт `capture:tutorial` уже добавлены).
- Нумерация задач: ARCH 10.1 (готово), 15.1-15.5, 16.1-16.2; S1 11.1-11.7; S2 12.1-12.6, 13.1; S3 14.1-14.6.
