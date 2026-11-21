// Мост Unity-игры с порталом профессий (протокол версии 1, docs/game-bridge-protocol.md).
// Положите скрипт на пустой объект первой сцены. Имя объекта может быть любым: оно передаётся в JavaScript.
//
// Порядок работы:
//   1. Подпишитесь на OnStart и вызовите Ready(), когда игра готова принять уровень.
//   2. Портал пришлёт уровень: сработает OnStart("easy" | "medium" | "hard").
//   3. В конце уровня вызовите Finish(score, maxScore), при выходе без результата Exit(), при сбое ReportError(...).
//
// В редакторе Unity и в не-WebGL сборках портала нет: Ready() сразу присылает уровень из поля editorLevelId.
// Не проверено на реальной Unity-сборке: проверяет первая команда с Unity-игрой (см. sdk/README.md).

using System;
using System.Runtime.InteropServices;
using UnityEngine;

public class PortalBridge : MonoBehaviour
{
	// Единственный мост на игру. Доступен из любого скрипта после Awake.
	public static PortalBridge Instance { get; private set; }

	// Старт уровня от портала, параметр - идентификатор уровня.
	public event Action<string> OnStart;

	// Уровень, который прислал портал. Пусто, пока старта не было.
	public string LevelId { get; private set; } = "";

	// Сохранённый JSON-блок игры. null, если портал ещё не прислал прогресс.
	public string ProgressJson { get; private set; } = "null";

	[Tooltip("Уровень для запуска в редакторе и вне портала: easy, medium или hard")]
	[SerializeField] private string editorLevelId = "easy";

#if UNITY_WEBGL && !UNITY_EDITOR
	[DllImport("__Internal")] private static extern void PortalBridge_Init(string objectName);
	[DllImport("__Internal")] private static extern string PortalBridge_GetLevelId();
	[DllImport("__Internal")] private static extern string PortalBridge_GetProgressJson();
	[DllImport("__Internal")] private static extern int PortalBridge_SaveProgressJson(string json);
	[DllImport("__Internal")] private static extern int PortalBridge_Finish(double score, double maxScore, int completed);
	[DllImport("__Internal")] private static extern void PortalBridge_Exit();
	[DllImport("__Internal")] private static extern void PortalBridge_ReportError(string message);
#endif

	private void Awake()
	{
		if (Instance != null && Instance != this)
		{
			Destroy(gameObject);
			return;
		}
		Instance = this;
		DontDestroyOnLoad(gameObject);
	}

	// Уровень из адреса сборки. Можно вызвать до старта, чтобы заранее загрузить ресурсы уровня.
	public string GetLevelIdFromUrl()
	{
#if UNITY_WEBGL && !UNITY_EDITOR
		return PortalBridge_GetLevelId();
#else
		return editorLevelId;
#endif
	}

	// Сообщает порталу, что игра готова принять уровень. Вызывать один раз.
	public void Ready()
	{
#if UNITY_WEBGL && !UNITY_EDITOR
		PortalBridge_Init(gameObject.name);
#else
		HandlePortalStart(editorLevelId);
#endif
	}

	// Вызывается из JavaScript (PortalBridge.jslib) через SendMessage. Из кода игры не вызывать.
	public void HandlePortalStart(string levelId)
	{
		LevelId = levelId;
		OnStart?.Invoke(levelId);
	}

	// Вызывается из JavaScript при старте. Игровой код может разобрать ProgressJson и восстановить своё состояние.
	public void HandlePortalProgress(string json)
	{
		ProgressJson = string.IsNullOrEmpty(json) ? "null" : json;
	}

	// Прочитать последний блок прогресса через веб-SDK.
	public string GetProgressJson()
	{
#if UNITY_WEBGL && !UNITY_EDITOR
		ProgressJson = PortalBridge_GetProgressJson();
#endif
		return string.IsNullOrEmpty(ProgressJson) ? "null" : ProgressJson;
	}

	// Сохранить JSON-блок игры (объект до 4096 байт UTF-8). Возвращает false, если данные неверны или мост недоступен.
	public bool SaveProgressJson(string json)
	{
#if UNITY_WEBGL && !UNITY_EDITOR
		return PortalBridge_SaveProgressJson(json ?? "null") == 1;
#else
		ProgressJson = json ?? "null";
		Debug.Log("[PortalBridge] прогресс: " + ProgressJson);
		return true;
#endif
	}

	// Итог уровня. Нужно 0 <= score <= maxScore и maxScore > 0. Возвращает false, если результат не отправлен.
	public bool Finish(double score, double maxScore, bool completed = true)
	{
#if UNITY_WEBGL && !UNITY_EDITOR
		return PortalBridge_Finish(score, maxScore, completed ? 1 : 0) == 1;
#else
		Debug.Log($"[PortalBridge] результат: {score} / {maxScore}, completed={completed}");
		return maxScore > 0 && score >= 0 && score <= maxScore;
#endif
	}

	// Игрок вышел без результата. Портал покажет экран незавершённого уровня и ничего не сохранит.
	public void Exit()
	{
#if UNITY_WEBGL && !UNITY_EDITOR
		PortalBridge_Exit();
#else
		Debug.Log("[PortalBridge] выход без результата");
#endif
	}

	// Игра не может продолжать. Портал покажет экран с повтором.
	public void ReportError(string message)
	{
#if UNITY_WEBGL && !UNITY_EDITOR
		PortalBridge_ReportError(message ?? "");
#else
		Debug.LogError($"[PortalBridge] ошибка: {message}");
#endif
	}
}
