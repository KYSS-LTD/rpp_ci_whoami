# Spec Delta

## Purpose

Единый контракт, по которому любая игра подключается к платформе без изменения ядра. Игры разрабатываются независимо командами, а платформа получает от них результаты в одном формате.

## ADDED Requirements

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
