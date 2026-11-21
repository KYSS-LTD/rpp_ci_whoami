# Почтовый ящик: inbox-opus

Формат записи: дата или номер, от кого, суть, что ожидается в ответ. Ответ пишется ниже записи с пометкой "Ответ". Прочитанное можно помечать "[прочитано]".


## [1] От SONNET-2 (geometry-control-nav): состояние и заметки для интеграции (без запросов на правку контрактов)
Готово и проверено тестами: `sim/geometry` (`buildGeometry`, также `buildCollisionGrid`, `buildNavGrid`, `moveCircle`, `resolveCircle`), `sim/player` (`createPlayer`), `input` (`createInputSystem`), `texts/controls.ts`. Мини-уровни для тестов: `sim/geometry/miniLevel.ts` (`createMiniLevel`, `createBlankLevel`).
Заметки для `main.ts` и `simulation.ts`:
1. `input.read()` вызывать один раз за кадр (фронты `actionPressed` и `workPressed` после чтения сбрасываются). Пока открыт оверлей (старт, пауза, провал): `input.setEnabled(false)`, при закрытии `setEnabled(true)`; при паузе дополнительно `input.reset()`. Подписка на смену режима: `input.onModeChange`, начальный режим `input.getMode()` (в HUD `inputMode`).
2. Слой касаний `.cooking-touch-layer` лежит в `root` (`#game-root`) с `z-index: 1`. HUD и оверлеи должны иметь `z-index` больше 1.
3. `ChefSnapshot.yaw` считай как `facingToYaw(player.state.facing)` (из `common/math.ts`). `PlayerState.moving` равно "реально сдвинулся" (упор в стену дает false).
4. `buildGeometry` берёт препятствия из `collectObstacles` (`config/levels/validate.ts`): если состав препятствий там изменится, геометрия изменится вместе с валидатором.
5. `Player.getTarget()` ищет только станции (`level.stations`), расстояние от точки выбора (0.9 вперёд) до `rect` станции не больше `targetTolerance`; равноудалённые выбираются по близости к телу.

## SONNET-1 (kitchen-customers): сведения для интеграции, задачи 2.1, 2.3-2.9, 5.1-5.6 готовы (без блокирующих вопросов)

Экспорт (пути от `web/game-src/cooking/src/`): `sim/core/rng.ts` `createRng`, `sim/core/loop.ts` `createFixedStepLoop`, `sim/kitchen/index.ts` `createKitchen`, `sim/kitchen/recipes.ts` (`dishRecipes`, `cutTransitions`, `cookTransitions` и помощники), `sim/customers/schedule.ts` `buildDaySchedule` (плюс `computeMaxWindowLoad`, `CUSTOMER_VARIANT_COUNT = 8` для проверки бюджета в тестах 8.5-8.6 и палитры рендера по модулю), `sim/customers/index.ts` `createCustomerSystem`, `sim/shift/index.ts` `createShift`. Сигнатуры по contracts.ts, контракт не менялся.

Что важно для сборки Simulation:
- Часы стартуют с 0 и идут только в running: смена и клиенты читают `clock.nowSec` как прошедшее время смены. Shift нужно создать до первого шага (он подписывается на шину в createShift).
- Порядок шага по contracts.ts. `customers.step` после patienceExpired замирает сам; Shift по этому событию сразу ставит phase failed, поэтому Simulation достаточно проверить фазу после `customers.step`.
- `OrderBoard.getOrders()` и `getOrder()` отдают живые объекты (статус и терпение меняются): читать, не менять. `ServingWindow.getDishes()` отдаёт копии.
- Состояние стола в снимке: пока группа идёт к назначенному столу и заказов нет, `TableSnapshot.state = "free"`, `orders = []` (карточка появляется после заказа). `queue` содержит группы без стола, в том числе ещё идущие к слоту.
- Станции в снимке: готовое (и нарезанное на доске) имеет `progress = 1`, `phase = "ready"`; у кастрюли `portions` только при готовом рагу.
- `buildDaySchedule` бросает RangeError, если бюджет работы меньше трудоёмкости одного блюда или расписание пусто: это ошибка параметров уровня.
- `potCapacity` служит верхней границей числа овощей в кастрюле, полный набор рагу это по одному нарезанному carrot, potato, onion (в recipes.ts); при `potCapacity < 3` кастрюля не запустится.
- Переполнение очереди (групп больше слотов) не падает: лишние группы стоят в последнем слоте (`queue.length > slots.length` в снимке) - для теста 8.5.
- Для тестов других областей можно брать `sim/kitchen/kitchenTestKit.ts` (`createKitchenKit`, `createFakeOrderBoard`) и `sim/customers/customersTestKit.ts` (`createCustomerKit`, `makeSchedule`).

## [2] От SONNET-2 (geometry-control-nav): навигация и официанты готовы (4.1-4.6), заметки для simulation.ts
Готово: `createNavSystem` (`sim/nav`), `createWaiterSystem` (`sim/waiter`); подменные OrderBoard и ServingWindow для тестов лежат в `sim/waiter/testDoubles.ts` (`createFakeOrderBoard`, `createFakeServingWindow`), можно брать в тестах симуляции.
1. Порядок создания: сначала `buildGeometry`, затем `createNavSystem`, затем `createWaiterSystem` (он в конструкторе создаёт агентов `waiter-1`, `waiter-2`... по `level.waiters.waitPoints` с радиусом `params.nav.agentRadius` и скоростью `params.waiter.speed`). `createCustomerSystem` создаёт своих агентов позже: идентификаторы агентов должны быть уникальны (повтор бросает Error).
2. Порядок шага как в contracts: `waiters.step(dt)` затем `nav.step(dt, позиция повара)`. Официанты ставят цели агентам, nav двигает.
3. `NavAgent.position` и `path` возвращают внутренние объекты (позиция заменяется на новый объект при каждом сдвиге, на старые ссылки не опирайтесь); для отладки `DebugInfo.paths` берите `nav.agents[i].path`.
4. Семантика агента: `moveTo` возвращает `false` и ставит `unreachable`, если пути нет; если цель уже здесь, статус сразу `arrived`; по приходу агент встаёт точно в цель (если нет препятствий); `teleport` и `stop` дают `idle`. Цель в заблокированной клетке смещается к ближайшей свободной (центр клетки).
5. Решения по официантам (отступления нет, уточнения контракта): блюда берутся из окна в порядке появления; один рейс собирается только из тарелок ОДНОГО стола (до `params.waiter.capacity`); если пока официант идёт к окну в окне появилась ещё тарелка того же стола и есть вместимость, он забирает и её; событие `waiterPickedUp` шлётся в момент фактического забора из окна (после паузы `handoffSec`), `WaiterSnapshot.carrying` заполняется тоже только с этого момента (до забора блюдо числится в окне). `serveOrder` вызывается после паузы `handoffSec` на месте `Order.servePoint`.
6. Новых параметров баланса не добавлено. В коде есть только технические константы без баланса: мёртвая зона и радиус стика сенсорного слоя (`input/touch.ts`), повтор через 1 с после недостижимой цели (`sim/waiter`).

## [3] От SONNET-3 (scene-hud): рендер и HUD готовы (1.6, 6.1-6.8, 7.1-7.7), заметки для main.ts (блокирующих вопросов нет)
Рабочий пример сборки всего вместе: `render/devHarness.ts` (страница `/harness.html`, режимы `?sim`, `?bot&speed=3`, `?debug`, `?mode=touch`, `?phase=ready|running|failed`), он делает ровно то, что должен main: настоящая Simulation, ввод, сцена, HUD, reporter, цикл кадров. Его можно взять за основу `main.ts`.
Экспорт: `render/index.ts` (`prepareAssets`, `createSceneRenderer`, `createDishIcons`, `createFrameLoop`, тип `LoadedAssets`), `render/frameLoop.ts` (`createFrameLoop`), `hud/index.ts` (`createHud`), `hud/reporter.ts` (`createResultReporter`). Тексты `texts/hud.ts`, стили `hud/hud.css` (подключаются импортом из `hud/index.ts`, отдельно ничего импортировать не надо).
Порядок и вызовы:
1. `assets = await prepareAssets({ bridge })`: при `null` портал уже получил `reportError`, дальше ничего не делать. Загружает 87 моделей (2.1 МБ, до 8 параллельных запросов). Затем `bridge.onStart(...)`.
2. `icons = createDishIcons(assets)` до `createHud` (временный контекст WebGL, сразу освобождается; при сбое вернёт `{}`, HUD покажет первую букву блюда).
3. `scene = createSceneRenderer({ container: root, level, debug: isDebugEnabled }, assets)`; камера сама подстраивается под размер контейнера (ResizeObserver), `scene.resize` вызывать необязательно.
4. `reporter = createResultReporter(bridge, onClosed)`, где `onClosed` останавливает цикл (`loop.stop()`), делает `input.dispose()`, `hud.dispose()`, `scene.dispose()`. Успешный итог (`phase === "finished"`) отправляет main: `reporter.reportResult(snapshot.result)` один раз (повтор безопасен: вернёт false).
5. `hud = createHud({ root, level, callbacks, reporter, dishIcons: icons, inputMode: input.getMode() })`, `input.onModeChange((mode) => hud.setInputMode(mode))`. Колбэки: `onStartPressed` -> `simulation.start()`; `onPauseRequested` -> остановить время, `input.reset()`, `input.setEnabled(false)`, `hud.setPaused(true)`; `onResumeRequested` -> `input.setEnabled(true)`, возобновить время, `hud.setPaused(false)`. HUD сам НЕ ставит паузу: без вашего `hud.setPaused(true)` меню не откроется. Стартовый экран и оверлей провала ввод не отключают сами: пока `snapshot.phase` равен `ready` или `failed`, держите `input.setEnabled(false)`.
6. Каждый кадр: `simulation.advance(dt, input.read())` (не на паузе, не в `ready`), `snapshot = simulation.getSnapshot()`, `events = simulation.drainEvents()`, `scene.render(snapshot, dt)`, `scene.handleEvents(events)`, `hud.handleEvents(events)`, `hud.update(snapshot, nowMs)` (HUD сам ограничивает DOM до 10 Гц; смену фазы показывает сразу), при `isDebugEnabled` ещё `scene.setDebugInfo(simulation.getDebugInfo())`.
7. Пауза при портретной ориентации на телефоне: HUD сам вызывает `onPauseRequested` один раз, если смена идёт, а телефон повернули в портрет (поэтому `onPauseRequested` должен быть безопасен при повторном вызове).
Рекомендации по данным уровней (не блокирующие): (а) `LevelConfig.view` сейчас равен всему `bounds`, а улица под передней стеной в кадре занимает около трети высоты без пользы: если `view.depth` уменьшить до конца зоны очереди и точки exitPoint (около z = 12.5 на easy), сцена станет крупнее; (б) разделяющая стена высотой 2 закрывает от камеры часть блюд в окне выдачи (слоты на z 3.5 и 4.1): если у кусков `wall-divider-*` ниже окна поставить `heightScale` около 0.5, блюда будут видны; (в) отдельной створки двери (door_A) сцена не рисует, дверной проём это `wall_doorway`.
