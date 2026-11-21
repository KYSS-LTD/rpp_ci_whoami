# Интерфейсы игры cooking простым языком

Источник истины: `web/game-src/cooking/src/contracts.ts` (версия контрактов `CONTRACTS_VERSION`, сейчас 1). Этот документ коротко объясняет его, но при расхождении верен `contracts.ts`. Все числа баланса лежат в `LevelParams` (`config/levels/defaults.ts`), в код их не пишем.

Пути ниже относительны `web/game-src/cooking/src/`. Команды запускаются из папки `web`.

## 1. Общие договорённости

- Мир это плоскость XZ. x растёт вправо по экрану, z растёт вниз по экрану (к камере). Клавиша W означает движение в -z (вверх по экрану). Вектор `Vec2` называется `{ x, z }`, поле `y` в двумерной логике не используется (в three.js это высота).
- Модели KayKit при расстановке уменьшаются в `MODEL_SCALE = 0.5` раз: прилавок 1 x 1, тарелка около 0.5, стул около 0.4. Размеры в мире считать по этому масштабу.
- Прямоугольник `Rect` это `{ x, z, width, depth }`: угол с минимальными x и z и размеры. Всё на сетке `GRID_STEP = 0.5`. Центр модели ставится в центр прямоугольника.
- Угол `yaw` как у `rotation.y` в three.js: 0 смотрит вниз по экрану (+z), PI/2 вправо (+x), PI вверх (-z). Вектор взгляда `(sin yaw, cos yaw)` в `(x, z)`. Поворот объектов уровня `Rotation` в градусах 0, 90, 180, 270 по тому же правилу.
- Направление взгляда `Facing8`: 0 вверх по экрану, дальше по часовой стрелке (1 вверх-вправо, 2 вправо, 3 вниз-вправо, 4 вниз, 5 вниз-влево, 6 влево, 7 вверх-влево). Векторы: `FACING_VECTORS`. Помощники: `common/math.ts` (`facingToYaw`, `vectorToNearestFacing`, `normalizeFacing`, `rectCenter`, `distancePointToRect`, `rectsOverlap` и другие). Нужна новая функция общего назначения: просьба в `inbox-opus.md`.
- Время симуляции идёт фиксированными шагами `SIM_STEP_SEC = 1/60`. Время кадра накапливает `Simulation.advance`. Часы `SimClock.nowSec` двигает только `Simulation`, остальные модули читают.
- `sim/` не импортирует three и DOM. Весь отображаемый текст лежит в `texts/`.
- Идентификаторы: станция `crate-steak`, `board-1`; стол `table-1` и номер для игрока `number`; клиент `c-<группа>-<номер>`; группа `g-<номер>`; заказ `o-<id клиента>`; официант `waiter-1`; блюдо в окне `wd-<номер>`. Все это просто строки.
- Стиль: табы, комментарии на русском, тире запрещены (только дефис), имена на английском, отладка одной переменной `NEXT_PUBLIC_DEBUG` (`config/debug.ts`: `isDebugEnabled`, `debugLog`).

## 2. Карта модулей и фабрик

| Область | Файл | Экспорт | Тип фабрики (contracts.ts) | Владелец |
|---|---|---|---|---|
| Генератор случайных чисел | `sim/core/rng.ts` | `createRng(seed)` | `RngFactory` | SONNET-1 |
| Цикл с фиксированным шагом | `sim/core/loop.ts` | `createFixedStepLoop(options)` | `FixedStepLoopFactory` | SONNET-1 |
| Кухня и окно выдачи | `sim/kitchen/index.ts` | `createKitchen(deps)` | `KitchenFactory` | SONNET-1 |
| Таблицы рецептов | `sim/kitchen/recipes.ts` | `dishRecipes`, `cutTransitions`, `cookTransitions` | `DishRecipe`, `CutTransition`, `CookTransition` | SONNET-1 |
| Расписание дня | `sim/customers/schedule.ts` | `buildDaySchedule(level, seed)` | `DayScheduleFactory` | SONNET-1 |
| Клиенты и заказы | `sim/customers/index.ts` | `createCustomerSystem(deps)` | `CustomerSystemFactory` | SONNET-1 |
| Смена | `sim/shift/index.ts` | `createShift(deps)` | `ShiftFactory` | SONNET-1 |
| Геометрия и сетки | `sim/geometry/index.ts` | `buildGeometry(level)` | `GeometryFactory` | SONNET-2 |
| Повар | `sim/player/index.ts` | `createPlayer(deps)` | `PlayerFactory` | SONNET-2 |
| Навигация | `sim/nav/index.ts` | `createNavSystem(deps)` | `NavSystemFactory` | SONNET-2 |
| Официанты | `sim/waiter/index.ts` | `createWaiterSystem(deps)` | `WaiterSystemFactory` | SONNET-2 |
| Ввод | `input/index.ts` | `createInputSystem(options)` | `InputFactory` | SONNET-2 |
| Подготовка ресурсов | `render/index.ts` | `prepareAssets(deps)` | `PrepareAssetsDeps` | SONNET-3 |
| Сцена | `render/index.ts` | `createSceneRenderer(options, assets)`, `createDishIcons(assets)` | `SceneRenderer`, `DishIcons` | SONNET-3 |
| Цикл кадров | `render/frameLoop.ts` | `createFrameLoop(options)` | `FrameLoopFactory` | SONNET-3 |
| HUD | `hud/index.ts` | `createHud(options)` | `HudFactory` | SONNET-3 |
| Отправка итога | `hud/reporter.ts` | `createResultReporter(bridge, onClosed)` | `ResultReporterFactory` | SONNET-3 |
| Шина событий | `sim/eventBus.ts` | `createEventBus(clock)` | `EventBus` | Opus-агент (готово) |
| Симуляция | `sim/simulation.ts` | `createSimulation(options)` | `SimulationFactory` | Opus-агент (фаза 2) |

Экспортируйте именно функции с такими именами и сигнатурами: сборку `Simulation` и `main.ts` пишет Opus-агент, опираясь на них. Типы зависимостей (`KitchenDeps`, `CustomerDeps`, `WaiterDeps` и так далее) лежат в `contracts.ts`.

## 3. Как идёт один шаг симуляции

Только в фазе `running` (порядок зафиксирован комментарием в `contracts.ts` перед `Simulation`):

1. `clock.nowSec += SIM_STEP_SEC`, `tick += 1`.
2. `player.step(input, dt)`: движение повара кругом со скольжением, взгляд 0..7, цель взаимодействия.
3. `kitchen.setWork(input.workHeld ? id цели : null)`; если `input.actionPressed` и цель есть: `kitchen.interact(id цели)`.
4. `kitchen.step(dt)`: резка (если держат работу над доской), готовка, подгорание.
5. `customers.step(dt)`: приходы по расписанию, рассадка, очередь, терпение, еда, уход. Истечение терпения шлёт событие `patienceExpired`: смена (`shift`) подписана на шину и переходит в `failed`, остаток шага пропускается.
6. `waiters.step(dt)`: назначение блюд из окна, ходьба, подача.
7. `nav.step(dt, позиция повара)`: движение всех NPC по путям, расталкивание, перепланирование.
8. `shift.step()`: закрытие потока за `flowCloseBeforeEndSec`, досрочное завершение (все обслужены), конец таймера.

Ввод: `Simulation.advance(frameDtSec, input)` отдаёт однократные признаки (`actionPressed`, `workPressed`) только первому шагу кадра; если за кадр шагов не было, признаки не теряются, а копятся до первого шага. `Simulation.step(input)` делает ровно один шаг (бот и тесты).

## 4. Данные уровня (`LevelConfig`)

Одна структура задаёт всё: расстановку, коллизии, навигацию, цели, очередь, параметры. Примеры значений: полный рабочий уровень `sim/testing/testLevel.ts` (`createTestLevel(paramsOverrides, overrides)`), его схема описана в шапке файла.

- `bounds`: граница мира (сетка навигации покрывает только её), `view`: прямоугольник, который целиком должен попасть в кадр камеры, `floors`: участки пола кухни, зала, улицы.
- `props`: стены, колонны, мебель (с флагом `blocking`; `heightScale` для низких передних стен), `colliders`: невидимые препятствия.
- `stations`: станции (`crate` с `ingredient`, `counter`, `cuttingBoard`, `pan`, `pot`, `oven`, `plateStack`, `trash`, `servingWindow`), у каждой `rect` и `rotationDeg`. `pan` это плита со сковородой, `pot` плита с кастрюлей: сковороды и кастрюли не переносятся.
- `window`: окно выдачи (`stationId`, `dishPoints` это слоты блюд, длина массива это вместимость окна, `pickupPoint` у зала).
- `tables`: стол (`id`, `number`, `rect`, `model`) и `seats` (2 или 4): `chairRect` (стул, препятствие для всех), `approachPoint` (свободная точка рядом, куда клиент идёт по навигации), `sitPoint` (центр стула, клиент мгновенно переносится туда из `approachPoint`), `dishPoint` (на столе), `servePoint` (где стоит официант, обычно равна `approachPoint`).
- `door`: проём (`rect`, проходим), `insidePoint`, `outsidePoint`, `spawnPoint` (где появляются клиенты), `exitPoint` (куда уходят).
- `queue`: слоты `slots[i].position` (0 ближайший к двери) и `memberOffsets` (смещения членов группы от центра слота, минимум 4).
- `chefStart`, `waiters.waitPoints` (число официантов равно длине массива), `verifiedSeeds`.
- `params` (`LevelParams`): `durationSec`, `menu`, `dishes` (цена, чаевые, трудоёмкость), `schedule`, `patience`, `customers`, `kitchen`, `player`, `nav`, `waiter`.

Достижимость цели проверяется по `navGrid`: клетка заблокирована, если расстояние от её центра до препятствия меньше `params.nav.agentRadius` (0.25, то есть на сетке 0.5 совпадает с `collisionGrid`). Проходы меньше 1.0 непроходимы для NPC, делайте проёмы и проходы не уже 1.5.

### Готовые уровни (фаза 1)

- `config/levels/index.ts`: `getLevelConfig(levelId)` (новый объект на каждый вызов), `pickVerifiedSeed(level, random)`, `isLevelId`. Уровни: `easy.ts` (3 стола: 4, 2, 2 места; 180 с), `medium.ts` (4 стола: 4, 4, 2, 2; 240 с; три доски, три сковороды), `hard.ts` (6 столов: 4, 4, 2, 2, 2, 2; 300 с; кастрюля; два официанта по две тарелки).
- Общее устройство: кухня слева, разделяющая стена с окном выдачи (z 2.5..4.5) и проходом кухня-зал (z 4.5..6.5, ширина 2), зал справа, передняя (низкая, `heightScale` 0.35) стена с дверью шириной 2, улица под ней, очередь слева от двери (слоты в один или два ряда), появление клиентов справа от двери. `view` равен `bounds`.
- Помощники сборки: `config/levels/builders.ts` (стены из кусков по 2, `createFourTop`, `createTwoTop`, `createQueue` и другие), проверки: `validate.ts` (`validateLevelConfig`), `reachability.ts` (достижимость целей поиском в ширину, `findUnreachableTargets`).
- Стол на 4 места: места 0 север, 1 восток, 2 юг, 3 запад. Стол на 2 места: 0 слева (запад), 1 справа (восток).
- Списки `verifiedSeeds` пока предварительные (проверяются ботом в задаче 8.6).

### Сборка симуляции и эталонный бот (фаза 2)

- `sim/simulation.ts`: `createSimulation({ level, seed })` собирает реальные модули в порядке шага из contracts.ts. Однократные признаки ввода (`actionPressed`, `workPressed`) достаются первому шагу кадра и не теряются при кадре без шагов; вне фазы running `advance` ничего не делает.
- `bot/`: `createBot(simulation)` и `runBot(simulation)` (`bot/bot.ts`), навигатор повара (`bot/chefNav.ts`), проверка seed (`bot/verify.ts`: `verifySeed`, `findVerifiedSeeds`, пороги `MIN_PATIENCE_MARGIN` 0.25, `MIN_TIME_MARGIN_SEC` 10, `STUCK_THRESHOLD_SEC` 4). Бот читает только публичный снимок и события.
- Калибровка (8.6): трудоёмкость блюд измерена ботом и лежит в `config/levels/dishes.ts` (burger 11, ham 8, veggieBurger 17, stew 19); значения по умолчанию в `defaults.ts` остались прежними (их используют тесты областей). Доля бюджета работы 0.70, 0.78, 0.85, среднее время между приходами групп 14, 12, 10 секунд, терпение за столом для бургера 97, 84, 77 секунд. Время еды оставлено 12 секунд. Списки `verifiedSeeds` на 8 seed на уровень.

### Сборка игры (9.1, 9.2)

- `game.ts`: `startGame({ bridge, root, modules?, random?, debug?, documentRef? })` (все модули подменяются в тестах, `game.test.ts`); `main.ts` только вызывает его. Порядок: `prepareAssets` (null: ошибка уже сообщена порталу), затем `bridge.onStart` (сообщает готовность), по сообщению старта уровень берётся из него (`getLevelConfig`, seed из `verifiedSeeds`), создаются симуляция, ввод, сцена, HUD и цикл кадров.
- Время идёт только в фазе running и не на паузе; ввод включён тоже только тогда. Скрытая вкладка (`visibilitychange`) в фазе running ставит игру на паузу и открывает меню паузы. Успешное завершение отправляет `game.ts` через `ResultReporter`, провал и выход отправляет HUD; после отправки цикл, ввод, HUD и сцена освобождаются.

## 5. Предметы, станции, рецепты

- Предмет это `Item = IngredientItem | PlateItem`. `IngredientItem` это `{ type: "ingredient", kind, state }`. `PlateItem` это `{ type: "plate", contents[], dish | null }`: тарелка с содержимым занимает руку целиком; как только содержимое совпало с рецептом блюда, `dish` становится `DishId`.
- Допустимые пары вид/состояние: `ITEM_CATALOG` (только они возникают в игре).
- Цепочки: `steak raw` -> доска (`cutSec`) -> `steak chopped` -> сковорода -> `patty raw/cooked/burnt`; `potato` и `carrot` `raw` -> доска -> `chopped`; `potato chopped` + `carrot chopped` на сковороде -> `veggiePatty raw/cooked/burnt`; `ham raw` -> духовка -> `ham cooked/burnt`; до трёх нарезанных `carrot`, `potato`, `onion` в кастрюле -> `stew cooked/burnt` (`stewPortionsPerBatch` порций, по одной на тарелку). Булочка `bun raw` не обрабатывается.
- Блюда: `burger` (bun + patty cooked), `ham` (ham cooked), `veggieBurger` (bun + veggiePatty cooked), `stew` (stew cooked). Тарелка принимает ингредиент, только если он подходит хотя бы к одному рецепту меню уровня.
- Время готовки и подгорания: `params.kitchen.cooking` по ключам `CookRecipeId` (`patty`, `veggiePatty`, `ham`, `stew`).
- Сгоревшее не годится ни в один рецепт, его только в урну. Причины отказа действия: `ActionRejectReason` (HUD показывает по ним подсказки).

## 6. Заказы, окно выдачи, официант

Это главный стык трёх областей.

- Клиенты (SONNET-1) реализуют `OrderBoard`: `getOrders`, `getOrder`, `findEarliestWaitingOrder(dish)`, `markDelivering(orderId)`, `serveOrder(orderId)`. Заказ создаётся при посадке (по одному на клиента), статусы `waiting` -> `delivering` -> `served`.
- Кухня (SONNET-1) реализует `ServingWindow`: `tryAccept(plate)` принимает только готовое блюдо (`plate.dish != null`) с открытым заказом и свободным слотом; привязывает его к самому раннему заказу `waiting` этого блюда (вызывает `orders.markDelivering`), кладёт в слот, шлёт `dishAccepted`; при отказе возвращает причину (`dishNotReady`, `noOpenOrder`, `windowFull`), блюдо остаётся в руке. `getDishes()` (FIFO), `takeDish(id)`.
- Официанты (SONNET-2) смотрят `window.getDishes()`, сами резервируют блюда за собой (окно о резервировании не знает), по длине пути (`nav.pathfinder.pathLength`) выбирают ближайшего свободного, идут к `level.window.pickupPoint`, `takeDish`, затем несут к `order.servePoint`, по прибытии `orders.serveOrder(orderId)` и возвращаются в свою точку ожидания (или сразу к следующему блюду). Вместимость `params.waiter.capacity`; на hard две тарелки одного стола идут одним рейсом.
- `serveOrder` (клиенты) делает клиента обслуженным, считает цену и чаевые (`floor(maxTip * остаток терпения / полное терпение)`), шлёт `dishServed` (и `groupServed`, когда обслужена вся группа), клиент начинает есть `params.customers.eatSec`.

## 7. Клиенты и навигация

- Клиент создаёт NPC-агента `nav.createAgent` в `door.spawnPoint`. Если стол свободен: `moveTo(seat.approachPoint)` (путь сквозь дверь строит A*), по прибытии `agent.teleport(seat.sitPoint, yaw стула)` и он сидит. Если стола нет: `moveTo(queue.slots[i].position + memberOffsets[k])`. Уход: `teleport(seat.approachPoint)`, затем `moveTo(door.exitPoint)`, по прибытии `nav.removeAgent`.
- Агент: `position`, `heading` (yaw), `status` (`idle`, `moving`, `arrived`, `unreachable`), `isMoving`, `path`, `moveTo`, `stop`, `teleport`, `setHeading`.
- Расталкивание действует на движущихся агентов; стоящие (очередь, официант в точке ожидания) расталкиванием не сдвигаются. NPC сталкиваются только со статикой и мягко расходятся друг с другом и с поваром.
- Повар двигается сам по себе (`sim/player`), не через `NavSystem`.
- Перепланирование пути при отсутствии продвижения: `params.nav.stuckTimeoutSec`, `stuckMinProgress`.

## 8. События и снимок

- События: `SimEvent` (с временем `t`) через `EventSink.emit(body)` (шина проставляет `t`); потребители: `Simulation.subscribe` и `Simulation.drainEvents`. Список событий: `SimEventBody` в `contracts.ts`.
- Снимок `GameSnapshot` это обычные данные: `phase`, `timeLeftSec`, `flowClosed`, `score`, `maxScore`, `servedCustomers` и `totalCustomers`, `queuedGroups`, `failure`, `result`, `chef` (позиция, `facing`, `yaw`, `hand`, `target`, `working`), `waiters`, `customers`, `stations`, `windowDishes`, `tables` (заказы по столам со статусом и `patienceRatio`), `queue`.
- Фазы смены: `ready` (до "Начать") -> `running` -> `failed` (клиент ушёл, симуляция замирает) или `finished`. `completed = true` только если к концу смены все клиенты дня обслужены (досрочно или нет); доедать не обязательно. `0 <= score <= maxScore`, `maxScore > 0`.
- Отладка: `Simulation.getDebugInfo()` (сетки, пути, точка выбора цели).

## 9. HUD, рендер и итог

- HUD сам определяет экран по снимку: `ready` стартовый экран, `failed` оверлей провала, портретная ориентация на сенсорном устройстве просьба повернуть. HUD вызывает колбэки `onStartPressed`, `onPauseRequested`, `onResumeRequested` и сам отправляет итог через `ResultReporter` (`reportResult` после "Продолжить" на провале, `reportExit` после "Выйти").
- `prepareAssets` проверяет WebGL и грузит модели; при сбое сам вызывает `bridge.reportError` и возвращает `null`. `bridge.onStart` вызывает main после успеха.
- `createFrameLoop` даёт `start`, `stop`, `isRunning`; main останавливает цикл, когда reporter закрылся (`onClosed`).

## 10. Тесты

- Тесты лежат рядом с кодом (`*.test.ts`), запуск из `web`: `npx vitest run game-src/cooking/src/<папка>`. Окружение по умолчанию jsdom (общий конфиг); чисто симуляционным тестам добавляйте первой строкой `// @vitest-environment node`, DOM-тесты оставляйте на jsdom.
- Общие помощники: `sim/testing/testLevel.ts` (`createTestLevel`), `sim/testing/fakeNav.ts` (`createFakeNavSystem`, `createStraightPathfinder`), `config/levels/defaults.ts` (`createParams(overrides)`), `sim/eventBus.ts` (`createEventBus(clock)`), `config/levels/validate.ts` (`validateLevelConfig`, `collectObstacles`).
- Проверять свои файлы: `npx vitest run <путь>` и `npx tsc --noEmit` (смотреть только ошибки своих файлов). Полный `npm run check`, `npm run build` и `npm run build:cooking` запускает только Opus-агент.
- Игра по прямому адресу `/game-builds/cooking/index.html?level=easy` в встроенном браузере Claude не работает (CSP sandbox), для просмотра сцены в нём запускается `dev:cooking` (конфигурация `cooking` в `.claude/launch.json`, порт 5174, адрес `http://localhost:5174/?level=easy`).

## 11. Как попросить изменить контракт

Запись в `inbox-opus.md`: что нужно, зачем, какой стык затронут. Opus-агент правит `contracts.ts`, повышает версию в журнале ниже и пишет в inbox затронутых агентов. Не меняйте `contracts.ts` сами.

## 12. Допущения версии 1

- Окно выдачи не бывает "полным" в обычной игре: вместимость `dishPoints.length` берётся с запасом, но причина `windowFull` предусмотрена.
- `stewPortionsPerBatch` по умолчанию 2 (калибруется ботом). Повар берёт порцию рагу только с тарелкой в руке (`plateRequired`, если рука пуста).
- Трудоёмкость блюда (`effort`) измеряется в секундах работы эталонного бота; бюджет работы расписания считается по ней и по `botCapacity`.
- `workPressed` в `InputState` симуляция не использует (резка управляется `workHeld`), признак оставлен для интерфейса и будущего звука.
- Модели для стола, стульев и стен задаются именами KayKit в `LevelConfig`; существование файлов проверяет тест уровня (Opus-агент) по списку `config/assets.ts` (SONNET-3).

## Журнал изменений contracts.ts

| Версия | Дата | Что изменилось | Кого затрагивает |
|---|---|---|---|
| 1 | фаза 0 | Первая версия: типы данных уровня, предметы, ввод, события, снимок, интерфейсы областей (геометрия, навигация, игрок, кухня, окно и заказы, клиенты, официанты, смена, ввод, рендер, HUD, отправка итога, цикл кадров, симуляция) | все |
| 1 (правка комментария) | фаза 1 | Комментарий `PropConfig.heightScale`: низкие стены 0.35 вместо 0.25. Версия не повышалась, типы не менялись | SONNET-3 |
