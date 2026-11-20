# Spec Delta

## Purpose

Система ачивок, которая награждает пользователя за прохождение игр и уровней. Ачивки выдаются по результатам, которые платформа получает от игр по стандартному контракту.

## ADDED Requirements

### Requirement: Achievement definitions
Каждая ачивка SHALL иметь уникальный идентификатор, название, описание и условие выдачи. Список ачивок SHALL задаваться отдельно от кода игр.

#### Scenario: Achievement list is loaded
- **WHEN** платформа запускается
- **THEN** список ачивок загружается из конфигурации ачивок

### Requirement: Award on level completion
Ачивка SHALL выдаваться, когда результат уровня с `completed=true` удовлетворяет её условию.

#### Scenario: Completing a level unlocks an achievement
- **WHEN** пользователь завершает уровень и результат соответствует условию ачивки
- **THEN** ачивка выдаётся и отображается уведомлением

#### Scenario: Abandoned level does not unlock achievements
- **WHEN** уровень не завершён (`completed=false`)
- **THEN** ни одна ачивка за этот уровень не выдаётся

### Requirement: Achievement is awarded once
Ачивка SHALL выдаваться один раз. Повторное прохождение не создаёт повторной выдачи.

#### Scenario: Repeated completion
- **WHEN** пользователь повторно проходит уровень, за который ачивка уже выдана
- **THEN** ачивка не выдаётся повторно, счётчик ачивок не меняется

### Requirement: Achievement storage
Выданные ачивки SHALL сохраняться в LocalStorage вместе с датой выдачи.

#### Scenario: Achievement survives page reload
- **WHEN** пользователь перезагружает страницу после получения ачивки
- **THEN** ачивка остаётся в списке полученных с той же датой

### Requirement: Achievement list view
Платформа SHALL показывать список всех ачивок с отметкой о получении.

#### Scenario: Locked and unlocked achievements are shown
- **WHEN** пользователь открывает список ачивок
- **THEN** полученные ачивки помечены датой, неполученные показаны как закрытые
