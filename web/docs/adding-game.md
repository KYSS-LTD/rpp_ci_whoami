# Как добавить игру

Игра подключается по контракту `game-module-contract`: папка в `games/` и одна строка в реестре. Другие файлы ядра менять не нужно. Шаблон - демо-игра `games/demo`.

## 1. Скопировать шаблон

Скопируйте `games/demo` в `games/<gameId>`. Имя папки должно совпадать с `gameId` из манифеста: тест `core/registry/coverage.test.ts` сверяет папки с реестром.

```
games/<gameId>/
	manifest.ts       манифест игры
	levels/           компоненты уровней
	texts/index.ts    весь отображаемый текст игры
	index.ts          модуль игры для реестра
```

В `index.ts` и компонентах переименуйте `demo*` и `DemoLevel` в имена своей игры.

## 2. Тексты

Весь текст, который видит пользователь (название, описание, названия уровней, подсказки, кнопки), пишется в `texts/index.ts` игры. В компонентах текст не пишется. Только дефис, тире запрещено (`npm run check:dashes`).

## 3. Манифест

```ts
export const myGameManifest: GameManifest = {
	gameId: "my-game",              // уникальный, совпадает с именем папки
	title: myGameTexts.title,
	description: myGameTexts.description,
	contractVersion: 1,             // версия контракта, которую поддерживает платформа
	levels: [                       // ровно три уровня: easy, medium, hard
		{ id: "easy", title: myGameTexts.levelTitles.easy },
		{ id: "medium", title: myGameTexts.levelTitles.medium },
		{ id: "hard", title: myGameTexts.levelTitles.hard },
	],
	professionTags: [               // вес от 0 до 1
		{ professionId: "analyst", weight: 0.8 },
	],
};
```

Игра с ошибкой в манифесте не регистрируется, а причина пишется в консоль с меткой `[registry]`. Отклоняются: пустой или повторный `gameId`, другая `contractVersion`, не три уровня или неизвестный уровень, вес вне 0-1.

Название профессии берётся из `texts/professions`. Если `professionId` там нет, на странице анализа показывается сам идентификатор.

## 4. Компоненты уровней

Компонент уровня получает `{ level, onFinish }` (`LevelComponentProps`) и один раз вызывает `onFinish` с результатом:

```ts
onFinish({
	gameId: myGameManifest.gameId,
	levelId: level.id,
	score,                // набранные очки
	maxScore,             // максимум очков, больше 0
	completed: true,      // false, если игрок вышел из уровня
	durationSec,
});
```

Можно один компонент на все уровни (как в демо) или отдельный на каждый. Игра не пишет в LocalStorage сама: имя, сохранение результата, ачивки и дипломы делает платформа. Результат с `completed: false` сохраняется, но не даёт ачивок и дипломов.

## 5. Модуль игры

```ts
export const myGameModule: GameModuleInput = {
	manifest: myGameManifest,
	levelComponents: { easy: MyLevel, medium: MyLevel, hard: MyLevel },
};
```

## 6. Регистрация

В `core/registry/index.ts` добавьте импорт и строку в список:

```ts
import { myGameModule } from "../../games/my-game";

export const gameImports: GameModuleInput[] = [demoGameModule, myGameModule];
```

## 7. Проверка

1. `npm run check`: типы, тесты (включая покрытие реестра), тире, линтер.
2. `npm run dev`, страница `/games`: игра видна с тремя уровнями.
3. Пройдите уровень: на `/diplomas` появился диплом, на `/me` обновился анализ.

Тесты игры можно взять из `games/demo/demo.test.tsx`: проверка манифеста, результат с `completed=true` и выход с `completed=false`.
