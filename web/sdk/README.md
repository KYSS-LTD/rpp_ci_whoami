# SDK моста для игр портала

SDK нужен играм, которые подключаются к порталу готовой веб-сборкой: Unity WebGL, three.js или любая HTML5-игра. Игра открывается в изолированном фрейме и обменивается с порталом сообщениями. SDK прячет формат сообщений: игре нужно получить уровень и отправить результат.

Как подключить игру целиком (папка сборки, манифест, тексты): `docs/adding-game.md`. Формат сообщений, если нужен мост без SDK: `docs/game-bridge-protocol.md`.

```
sdk/
	web/portal-bridge.js                    веб-SDK: three.js и любые HTML5-игры, его же использует Unity
	unity/Plugins/PortalBridge.jslib        плагин Unity: вызовы из C# в portal-bridge.js
	unity/Scripts/PortalBridge.cs           обёртка для C#
	unity/WebGLTemplates/Portal/index.html  шаблон страницы WebGL-сборки
```

## three.js и другие веб-игры

1. Скопируйте `sdk/web/portal-bridge.js` в папку сборки игры и подключите обычным скриптом до кода игры:

```html
<script src="portal-bridge.js"></script>
<script type="module" src="game.js"></script>
```

2. Начинайте уровень только после старта от портала:

```js
// Можно заранее загрузить ресурсы уровня, пока портал не прислал старт.
const levelId = PortalBridge.getLevelId(); // "easy" | "medium" | "hard"

PortalBridge.onStart((start) => {
	// start.levelId - уровень, который выбрал игрок
	startLevel(start.levelId);
});
```

3. В конце уровня отправьте результат. Портал сам добавит игру, уровень и время, проверит числа и выдаст ачивки и диплом:

```js
PortalBridge.finish({ score: 8, maxScore: 10 }); // completed по умолчанию true
```

4. Остальные вызовы:

```js
PortalBridge.finish({ score: 3, maxScore: 10, completed: false }); // игрок бросил уровень, очки сохранить без наград
PortalBridge.exit(); // игрок вышел без результата, ничего не сохраняется
PortalBridge.reportError("WebGL недоступен"); // игра не может продолжать, портал покажет экран с повтором
```

Правила:

- `onStart` вызывайте один раз, когда игра готова принять уровень: первый вызов сообщает порталу о готовности. Если не вызвать его за время ожидания (30 секунд или `runtime.readyTimeoutSec` из манифеста), портал покажет экран ошибки.
- `finish` принимается один раз за запуск. Нужно `0 <= score <= maxScore` и `maxScore > 0`, иначе `finish` вернёт `false` и ничего не отправит.
- Без портала (сборка открыта напрямую) SDK работает автономно: старт приходит сразу с уровнем из адреса `?level=medium`, сообщения пишутся в консоль.

## Unity WebGL

> Unity-часть не проверена на реальной Unity-сборке: в окружении разработки портала Unity нет. Проверена цепочка шаблон -> плагин -> портал на заглушке загрузчика в Chrome. Первая команда с Unity-игрой проверяет её на своей сборке и снимает эту пометку.

1. Скопируйте в проект Unity:
	- `sdk/unity/Plugins/PortalBridge.jslib` -> `Assets/Plugins/`
	- `sdk/unity/Scripts/PortalBridge.cs` -> `Assets/Scripts/` (или любую папку скриптов)
	- папку `sdk/unity/WebGLTemplates/Portal` -> `Assets/WebGLTemplates/Portal` (в ней уже лежит копия `portal-bridge.js`)
2. Player Settings > Resolution and Presentation: шаблон WebGL `Portal`.
3. Player Settings > Publishing Settings:
	- Compression Format: `Disabled` или включите `Decompression Fallback`. Портал не отдаёт сжатые файлы с заголовком `Content-Encoding`, без этого сжатая сборка не запустится.
	- Data Caching: выключить. В изолированном фрейме нет IndexedDB, кэш Unity упадёт.
4. Положите компонент `PortalBridge` на пустой объект первой сцены и запускайте уровень по старту от портала:

```csharp
public class LevelBootstrap : MonoBehaviour
{
	private void Start()
	{
		PortalBridge.Instance.OnStart += StartLevel;
		PortalBridge.Instance.Ready(); // портал пришлёт уровень
	}

	private void StartLevel(string levelId)
	{
		// загрузить сцену или настройки уровня levelId
	}

	private void OnLevelCompleted(int score, int maxScore)
	{
		PortalBridge.Instance.Finish(score, maxScore);
	}
}
```

5. Соберите WebGL в папку `public/game-builds/<gameId>/` портала. Стартовая страница `index.html` и есть `runtime.entry` в манифесте.

Ещё про Unity:

- `PlayerPrefs` в изолированном фрейме не сохраняются между запусками. Прогресс уровня держите в памяти.
- В редакторе Unity `Ready()` сразу присылает уровень из поля `editorLevelId` компонента, а `Finish` пишет результат в консоль.
- Файлы `Build/*.wasm` и `Build/*.data` большие. Храните их в Git LFS: `git lfs track "web/public/game-builds/**/Build/*"` (настройку LFS делает владелец репозитория).

## Ограничения изоляции

Игра работает во фрейме без доступа к источнику портала. Поэтому в игре недоступны `localStorage`, `sessionStorage`, IndexedDB и cookie: прогресс уровня храните в памяти. Все файлы сборки грузятся из её папки `public/game-builds/<gameId>/`, внешние CDN не используйте.

Пример рабочей игры на three.js: `public/game-builds/city-builder/`.
