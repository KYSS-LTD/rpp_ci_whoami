import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Checkpoint } from "@/core/progress/checkpoints";

interface CheckpointSession {
	initial: Checkpoint;
	remember: (field: string, value: unknown) => void;
	update: (field: string, value: unknown) => void;
	flush: () => void;
}

const CheckpointContext = createContext<CheckpointSession | null>(null);

function createCheckpointSession(checkpoint: Checkpoint | undefined) {
	let save: ((data: Checkpoint) => void) | undefined;
	const initial: Checkpoint = checkpoint?.version === 1 ? checkpoint : { version: 1 };
	const data = { ...initial };
	const startedAt = Date.now();
	const elapsedBeforeStart = typeof initial.elapsedMs === "number" ? initial.elapsedMs : 0;
	let pending = false;
	let hasProgress = checkpoint?.version === 1;

	function flush() {
		if (!pending) return;
		pending = false;
		save?.({ ...data, elapsedMs: elapsedBeforeStart + Math.max(0, Date.now() - startedAt) });
	}

	return {
		initial,
		setSaver(onSave: typeof save) {
			save = onSave;
		},
		remember(field: string, value: unknown) {
			if (!Object.hasOwn(data, field)) data[field] = value;
		},
		flush,
		capture() {
			if (!hasProgress) return;
			pending = true;
			flush();
		},
		update(field: string, value: unknown) {
			if (value === undefined) delete data[field];
			else data[field] = value;
			hasProgress = true;
			if (pending) return;
			pending = true;
			queueMicrotask(flush);
		},
	};
}

export function CheckpointProvider({ checkpoint, onSave, children }: {
	checkpoint?: Checkpoint;
	onSave?: (data: Checkpoint) => void;
	children: ReactNode;
}) {
	const [session] = useState(() => createCheckpointSession(checkpoint));
	useLayoutEffect(() => {
		session.setSaver(onSave);
		return () => session.setSaver(undefined);
	}, [session, onSave]);
	useEffect(() => {
		function onVisibilityChange() {
			if (document.hidden) session.capture();
		}
		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("pagehide", session.capture);
		return () => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("pagehide", session.capture);
		};
	}, [session]);

	return <CheckpointContext.Provider value={onSave ? session : null}>{children}</CheckpointContext.Provider>;
}

export function useCheckpoint() {
	return useContext(CheckpointContext);
}

export function useSavedState<T>(field: string, initial: T | (() => T)) {
	const session = useCheckpoint();
	const [value, setValue] = useState<T>(() => {
		if (session && Object.hasOwn(session.initial, field)) return session.initial[field] as T;
		return typeof initial === "function" ? (initial as () => T)() : initial;
	});
	const previous = useRef(value);
	useLayoutEffect(() => {
		if (!Object.is(previous.current, value)) {
			previous.current = value;
			session?.update(field, value);
		} else {
			session?.remember(field, value);
		}
	}, [field, session, value]);
	return [value, setValue] as const;
}
