"use client";

// Общие данные рабочего места (design.md, D11).
// - LevelChrome: то, что принадлежит уровню (очки, часы, сообщения, замечания, уведомления, выход).
// - DeskLayout: положение бумаг на столе и порядок стопки.
// - AmountTarget: последнее выбранное поле суммы, куда калькулятор вставляет результат.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { WindowMessage, WindowNotification } from "../ui/AppWindow";
import type { DropEvent } from "../ui/useDrag";

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
	exitLabel?: string;
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
	getPosition: (id: string, fallback: PaperPosition) => PaperPosition;
	getLayer: (id: string) => number;
	moveBy: (id: string, fallback: PaperPosition, event: DropEvent) => void;
	bringToFront: (id: string) => void;
}

const DeskLayoutContext = createContext<DeskLayout | null>(null);

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
		(id: string, fallback: PaperPosition, { element, offset }: DropEvent) => {
			const desk = deskRef.current;
			const measured = desk && element.offsetParent === desk && desk.clientWidth > 0;
			if (measured && getComputedStyle(element).position !== "absolute") return;
			const origin = measured ? { x: element.offsetLeft, y: element.offsetTop } : undefined;
			setPositions((previous) => {
				const current = origin ?? previous[id] ?? fallback;
				const x = current.x + offset.dx;
				const y = current.y + offset.dy;
				return { ...previous, [id]: { x: Math.round(x), y: Math.round(y) } };
			});
		},
		[deskRef],
	);

	const value = useMemo<DeskLayout>(
		() => ({
			getPosition: (id, fallback) => positions[id] ?? fallback,
			getLayer: (id) => layers[id] ?? 1,
			moveBy,
			bringToFront,
		}),
		[positions, layers, moveBy, bringToFront],
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
