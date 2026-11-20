# game-module-contract Specification

## Purpose

Единый контракт, по которому любая игра подключается к платформе без изменения ядра. Игры разрабатываются независимо командами, а платформа получает от них результаты в одном формате.

## Requirements

### Requirement: Game manifest
Каждая игра SHALL предоставлять манифест с полями: уникальный `gameId`, название, описание, список уровней сложности и список тегов профессий с весами.

#### Scenario: Valid manifest is registered
- **WHEN** игра экспортирует манифест со всеми обязательными полями
- **THEN** игра появляется в реестре и отображается на экране игр

#### Scenario: Manifest without gameId is rejected
- **WHEN** манифест не содержит `gameId` или `gameId` повторяет уже зарегистрированный
- **THEN** игра не регистрируется и в журнал пишется ошибка с указанием причины

### Requirement: Three difficulty levels per game
Каждая игра SHALL содержать ровно три уровня сложности с идентификаторами `easy`, `medium`, `hard`. Уровень SHALL быть доступен для прохождения независимо от других уровней.

#### Scenario: Game exposes three levels
- **WHEN** игра зарегистрирована
- **THEN** платформа показывает три уровня сложности с их названиями

#### Scenario: Missing level is rejected
- **WHEN** манифест содержит меньше или больше трёх уровней либо неизвестный идентификатор уровня
- **THEN** игра не регистрируется

### Requirement: Standard result payload
По завершении уровня игра SHALL передать платформе результат в стандартном формате: `gameId`, `levelId`, `score`, `maxScore`, `completed` (boolean), `durationSec`.

#### Scenario: Completed level reports result
- **WHEN** пользователь завершает уровень
- **THEN** платформа получает результат с полями `gameId`, `levelId`, `score`, `maxScore`, `completed=true`, `durationSec`

#### Scenario: Abandoned level is not counted as completed
- **WHEN** пользователь выходит из уровня до его завершения
- **THEN** результат передаётся с `completed=false` и не учитывается в дипломах и ачивках

### Requirement: Profession tags with weights
Манифест SHALL содержать список профессий с весами от 0 до 1, которые описывают, насколько прохождение игры отражает данную профессию.

#### Scenario: Weights are used for analysis
- **WHEN** пользователь завершил игру с весами профессий
- **THEN** веса учитываются в расчёте соответствия профессиям

#### Scenario: Weight out of range is rejected
- **WHEN** вес профессии меньше 0 или больше 1
- **THEN** игра не регистрируется

### Requirement: Modular registration without core changes
Добавление новой игры SHALL требовать только создания папки игры и её регистрации в реестре. Изменения кода ядра для этого не допускаются.

#### Scenario: New game is added
- **WHEN** разработчик добавляет папку игры с манифестом и подключает её в реестр
- **THEN** игра появляется на экране игр без изменения файлов ядра, кроме файла реестра

### Requirement: Game display text is external
Весь отображаемый текст игры SHALL храниться в отдельном файле локализации игры, а не в коде компонентов.

#### Scenario: Text is taken from the game text file
- **WHEN** игра отображает название уровня или подсказку
- **THEN** текст берётся из файла текстов игры

### Requirement: Optional showcase fields
Манифест SHALL допускать необязательные поля витрины: формат игры (`quiz`, `2d`, `3d`, `simulation`), краткую сводку, список кадров превью, примерное время уровня в минутах и признак игры в разработке. Отсутствие этих полей MUST NOT мешать регистрации, а поле неверного типа или значения MUST отклонять игру.

#### Scenario: Manifest without showcase fields is registered
- **WHEN** манифест содержит только обязательные поля
- **THEN** игра регистрируется и показывается в библиотеке без метки формата и с обложкой-заглушкой

#### Scenario: Invalid showcase field is rejected
- **WHEN** манифест содержит неизвестный формат, пустой список кадров, неположительное время уровня или признак разработки не логического типа
- **THEN** игра не регистрируется и в журнал пишется причина

### Requirement: Result validated before saving
Платформа SHALL проверять результат уровня любой игры перед сохранением: `score` и `maxScore` конечные числа, `maxScore` больше 0, `score` от 0 до `maxScore`, `durationSec` конечное неотрицательное число. Результат, не прошедший проверку, MUST NOT сохраняться и давать ачивки и дипломы.

#### Scenario: Score above maximum is rejected
- **WHEN** игра передаёт результат с `score=15` и `maxScore=3`
- **THEN** попытка не сохраняется, ачивки и дипломы не выдаются, пользователь видит сообщение, что результат не удалось засчитать

#### Scenario: Valid result is saved
- **WHEN** игра передаёт результат с `score=2`, `maxScore=3`, `completed=true`
- **THEN** попытка сохраняется и учитывается в ачивках, дипломах и анализе

### Requirement: Result belongs to the running level
Платформа SHALL принимать результат только для игры и уровня, которые сейчас запущены.

#### Scenario: Result for another level is ignored
- **WHEN** компонент уровня `easy` передаёт результат с `levelId=hard`
- **THEN** результат не сохраняется
