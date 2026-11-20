# Spec Delta

## ADDED Requirements

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
