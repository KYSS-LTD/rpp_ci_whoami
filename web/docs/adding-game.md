# Как добавить игру

Игра подключается по контракту `game-module-contract`: папка в `games/` и одна строка в реестре. Другие файлы ядра менять не нужно. Шаблоны:

- `games/demo` - готовая викторина на React: уровни, результат, тесты;
- `games/city-builder` - игра на three.js из готовой веб-сборки (раздел "Игра на Unity или three.js" ниже);
- `games/pixel-lab` (2D) - заглушка будущей React-игры: манифест с полями витрины и уровень, который пока показывает кадр-превью вместо сцены.

Есть два способа подключить игру:

| Способ | Когда | Что сдаёт команда |
| --- | --- | --- |
| React-модуль | викторины и простые игры на React | папку `games/<gameId>` с компонентами уровней |
| Веб-сборка во фрейме | Unity WebGL, three.js, любой HTML5-движок | папку `games/<gameId>` с манифестом и текстами и сборку в `public/game-builds/<gameId>/` |

Шаги 1-7 ниже описывают React-модуль. Для веб-сборки сначала прочитайте шаги 1-3 и 6, затем раздел "Игра на Unity или three.js".

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

### Поля витрины (необязательные)

Эти поля нужны только библиотеке игр на `/games`. Без них игра всё равно регистрируется.

```ts
	format: "2d",                   // "quiz" | "2d" | "3d" | "simulation": метка и фильтр ленты
	summary: myGameTexts.summary,   // краткая сводка в карточке игры; без неё показывается description
	preview: {                      // кадры из игры, пути от папки public
		frames: ["/game-previews/my-game/frame-1.svg", "/game-previews/my-game/frame-2.webp"],
	},
	estimatedMinutes: 5,            // примерное время одного уровня
	inDevelopment: true,            // метка "В разработке" для заглушек
```

Кадры кладутся в `public/game-previews/<gameId>/`, формат 16:10 (например, 1280x800). Подойдут скриншоты, анимированный WebP или GIF, SVG с анимацией. В карточке игры кадры сменяются каждые 4,5 секунды с плавным приближением; в ленте показывается первый кадр. Текста на кадрах лучше избегать: весь текст живёт в `texts/`. Папку для кадров не называйте `public/games`, иначе пути пересекутся с адресами уровней `/games/<gameId>/<level>`.

Новый формат игры добавляется в `gameFormats` (`core/contract/types.ts`) и в `gamesTexts.formats` (`texts/games`).

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

Можно один компонент на все уровни (как в демо) или отдельный на каждый. 2D- и 3D-игры рисуют сцену внутри компонента уровня (canvas, WebGL), платформе важен только вызов `onFinish`. Пока игра в разработке, компонент может не вызывать `onFinish`, как в заглушках `city-builder` и `pixel-lab`: тогда результаты, ачивки и дипломы не создаются. Игра не пишет в LocalStorage сама: имя, сохранение результата, ачивки и дипломы делает платформа. Результат с `completed: false` сохраняется, но не даёт ачивок и дипломов.

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
2. `npm run dev`, страница `/games`: игра видна в ленте, по кнопке "Играть" открывается карточка с превью, сводкой и тремя уровнями.
3. Пройдите уровень: на `/diplomas` появился диплом, на `/me` обновился анализ.

Тесты игры можно взять из `games/demo/demo.test.tsx`: проверка манифеста, результат с `completed=true` и выход с `completed=false`.

## Игра на Unity или three.js

Игра собирается своим движком и подключается как готовая веб-сборка. Портал открывает её в изолированном фрейме и обменивается сообщениями (`docs/game-bridge-protocol.md`). Писать React-код не нужно. Готовый пример: `games/city-builder` и `public/game-builds/city-builder/`.

### 1. Сборка

Положите сборку в `public/game-builds/<gameId>/`. Стартовая страница - `index.html`, все файлы игры лежат рядом с ней или во вложенных папках. Внешние CDN не используйте: библиотеки кладите в сборку (в примере three.js лежит в `vendor/`).

Подключите мост из `sdk/`:

- three.js и другие веб-игры: скопируйте `sdk/web/portal-bridge.js` в папку сборки и подключите до кода игры;
- Unity: плагин, обёртка C# и шаблон WebGL из `sdk/unity/`, настройки сборки в `sdk/README.md`.

Как получить уровень и отдать результат: `sdk/README.md`. Если копия `portal-bridge.js` лежит в репозитории портала, добавьте её путь в `bridgeCopies` теста `sdk/sdk-consistency.test.ts`, чтобы копия не отстала от оригинала.

### 2. Манифест

Манифест такой же, как у React-игры (шаг 3), плюс поле `runtime`:

```ts
	runtime: {
		kind: "iframe",
		entry: "/game-builds/my-game/index.html", // только внутри /game-builds/<gameId>/
		readyTimeoutSec: 60,                      // необязательно, по умолчанию 30
	},
```

Игра с путём вне своей папки или с внешним адресом не регистрируется. Таймаут увеличьте для тяжёлых Unity-сборок: если за это время игра не вызовет `onStart` (Unity: `Ready()`), портал покажет экран ошибки с повтором.

### 3. Модуль игры

Компоненты уровней не нужны:

```ts
export const myGameModule: GameModuleInput = { manifest: myGameManifest };
```

Регистрация в `core/registry/index.ts` такая же, как у React-игры (шаг 6).

### 4. Тексты

Название, описание и тексты витрины лежат в `games/<gameId>/texts/index.ts`, как у React-игры. Текст внутри сцены рисует сама игра.

### 5. Ограничения изоляции

- Нет `localStorage`, `sessionStorage`, IndexedDB и cookie: прогресс уровня держите в памяти. Unity: выключить Data Caching, не полагаться на `PlayerPrefs`.
- Нет доступа к странице и данным портала. Имя игрока, ачивки и дипломы ведёт портал.
- Время уровня считает портал, `gameId` и `levelId` тоже берутся из запуска.
- Результат проверяется: `0 <= score <= maxScore`, `maxScore > 0`, один результат за запуск.

### 6. Проверка

1. `npm run check` и `npm run build` проходят.
2. Сборка открывается напрямую: `/game-builds/<gameId>/index.html?level=easy`. Мост работает автономно и пишет сообщения в консоль.
3. В библиотеке `/games` по кнопке "Играть" открывается карточка игры, "Начать" запускает уровень во фрейме, результат приводит к экрану итога, на `/diplomas` появляется диплом.

Встроенная панель браузера Claude Code блокирует запросы из изолированных фреймов (`ERR_BLOCKED_BY_CLIENT`), поэтому проверяйте iframe-игры в обычном браузере.

