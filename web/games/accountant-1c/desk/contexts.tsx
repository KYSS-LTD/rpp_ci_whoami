"use client";

// Общие данные рабочего места (design.md, D11).
// - LevelChrome: то, что принадлежит уровню (очки, часы, сообщения, замечания, уведомления, выход).
// - DeskLayout: положение бумаг на столе и порядок стопки.
// - AmountTarget: последнее выбранное поле суммы, куда калькулятор вставляет результат.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { WindowMessage, WindowNotification } from "../ui/AppWindow";

// ---------- Уровень ----------

// Листок «Замечание» от главбуха: правильный ответ, причина, шутка.
export interface Slip {
	id: number;
	correct: string;
	reason: string;
	joke: string;
}

export interface LevelChrome {
	dayNumber: number;
	// Название уровня на полосе дня, например "Первый день".
	levelTitle: string;
	startedAtMs: number;
	scoreText: string;
	// Доля набранных очков для фикуса, null пока проверок не было.
	share: number | null;
	messages: WindowMessage[];
	slips: Slip[];
	notifications: WindowNotification[];
	removeSlip: (id: number) => void;
	closeNotification: (id: number) => void;
	onExitEarly: () => void;
	isExitDisabled: boolean;
}

const noop = () => undefined;

// Значения без уровня: мини-игру можно отрисовать отдельно (в тестах).
const defaultChrome: LevelChrome = {
	dayNumber: 1,
	levelTitle: "",
	startedAtMs: 0,
	scoreText: "",
	share: null,
	messages: [],
	slips: [],
	notifications: [],
	removeSlip: noop,
	closeNotification: noop,
	onExitEarly: noop,
	isExitDisabled: false,
};

const LevelChromeContext = createContext<LevelChrome>(defaultChrome);

export const LevelChromeProvider = LevelChromeContext.Provider;

export function useLevelChrome(): LevelChrome {
	return useContext(LevelChromeContext);
}

// ---------- Бумаги на столе ----------

export interface PaperPosition {
	x: number;
	y: number;
}

interface DeskLayout {
	deskRef: RefObject<HTMLDivElement | null>;
	getPosition: (id: string, fallback: PaperPosition) => PaperPosition;
	getLayer: (id: string) => number;
	moveBy: (id: string, fallback: PaperPosition, dx: number, dy: number) => void;
	bringToFront: (id: string) => void;
}

const DeskLayoutContext = createContext<DeskLayout | null>(null);

// Отступ, который бумага всегда оставляет видимым на столе, в пикселях.
const visibleMargin = 48;

export function DeskLayoutProvider({ deskRef, children }: { deskRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
	const [positions, setPositions] = useState<Record<string, PaperPosition>>({});
	const [layers, setLayers] = useState<Record<string, number>>({});
	const topLayerRef = useRef(1);

	const bringToFront = useCallback((id: string) => {
		setLayers((previous) => {
			if (previous[id] === topLayerRef.current && topLayerRef.current > 1) {
				return previous;
			}
			topLayerRef.current += 1;
			return { ...previous, [id]: topLayerRef.current };
		});
	}, []);

	const moveBy = useCallback(
		(id: string, fallback: PaperPosition, dx: number, dy: number) => {
			const desk = deskRef.current;
			// Нулевой размер значит, что стол ещё не разложен (или тестовая среда): тогда без ограничений.
			const deskWidth = desk?.clientWidth || Number.POSITIVE_INFINITY;
			const deskHeight = desk?.clientHeight || Number.POSITIVE_INFINITY;
			setPositions((previous) => {
				const current = previous[id] ?? fallback;
				// Бумага не уезжает со стола целиком: остаётся край, за который её можно взять.
				const x = Math.min(Math.max(current.x + dx, -visibleMargin), deskWidth - visibleMargin);
				const y = Math.min(Math.max(current.y + dy, 0), deskHeight - visibleMargin);
				return { ...previous, [id]: { x: Math.round(x), y: Math.round(y) } };
			});
		},
		[deskRef],
	);

	const value = useMemo<DeskLayout>(
		() => ({
			deskRef,
			getPosition: (id, fallback) => positions[id] ?? fallback,
			getLayer: (id) => layers[id] ?? 1,
			moveBy,
			bringToFront,
		}),
		[deskRef, positions, layers, moveBy, bringToFront],
	);

	return <DeskLayoutContext.Provider value={value}>{children}</DeskLayoutContext.Provider>;
}

export function useDeskLayout(): DeskLayout | null {
	return useContext(DeskLayoutContext);
}

// ---------- Поле для калькулятора ----------

export interface AmountTarget {
	id: string;
	label: string;
	apply: (value: string) => void;
}

interface AmountTargetState {
	target: AmountTarget | null;
	setTarget: (target: AmountTarget | null) => void;
}

const AmountTargetContext = createContext<AmountTargetState>({ target: null, setTarget: noop });

export function AmountTargetProvider({ children }: { children: ReactNode }) {
	const [target, setTarget] = useState<AmountTarget | null>(null);
	const value = useMemo(() => ({ target, setTarget }), [target]);
	return <AmountTargetContext.Provider value={value}>{children}</AmountTargetContext.Provider>;
}

export function useAmountTarget(): AmountTargetState {
	return useContext(AmountTargetContext);
}
