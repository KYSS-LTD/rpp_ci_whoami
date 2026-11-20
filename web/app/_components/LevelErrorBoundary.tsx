"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { debugLog } from "@/core/debug";
import { LevelFallback } from "./LevelFallback";

interface LevelErrorBoundaryProps {
	children: ReactNode;
	// Запускает уровень заново. Родитель меняет key у границы, и уровень монтируется с нуля.
	onRetry: () => void;
}

interface LevelErrorBoundaryState {
	hasError: boolean;
}

// Перехватывает исключения при отрисовке уровня React-игры и показывает запасной экран.
// Классовый компонент: в React перехватить ошибку отрисовки можно только так.
export class LevelErrorBoundary extends Component<LevelErrorBoundaryProps, LevelErrorBoundaryState> {
	state: LevelErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError(): LevelErrorBoundaryState {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		debugLog("level", "уровень игры упал при отрисовке", error, info.componentStack);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return <LevelFallback onRetry={this.props.onRetry} />;
		}
		return this.props.children;
	}
}
