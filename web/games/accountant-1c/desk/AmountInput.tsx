"use client";

// Поле суммы, которое знает о калькуляторе (design.md, D11): при фокусе становится целью кнопки «В поле».
import { useEffect, useId, useRef, type InputHTMLAttributes } from "react";
import { useAmountTarget } from "./contexts";

interface AmountInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
	value: string;
	onValueChange: (value: string) => void;
	// Подпись поля: её показывает калькулятор на кнопке «В поле».
	label: string;
}

export function AmountInput({ value, onValueChange, label, onFocus, ...inputProps }: AmountInputProps) {
	const inputId = useId();
	const { target, setTarget } = useAmountTarget();
	// Обработчик в ref: калькулятор вызывает его позже, когда состояние формы уже другое.
	const onValueChangeRef = useRef(onValueChange);
	// Текущая цель калькулятора, чтобы при удалении поля понять, не оно ли выбрано.
	const currentTargetIdRef = useRef<string | null>(null);

	useEffect(() => {
		onValueChangeRef.current = onValueChange;
		currentTargetIdRef.current = target?.id ?? null;
	});

	// Поле убрали со стола: калькулятор больше не должен в него писать. Срабатывает только при удалении поля.
	useEffect(() => {
		return () => {
			if (currentTargetIdRef.current === inputId) {
				setTarget(null);
			}
		};
	}, [inputId, setTarget]);

	return (
		<input
			{...inputProps}
			type="text"
			inputMode="decimal"
			autoComplete="off"
			aria-label={inputProps["aria-label"] ?? label}
			data-amount-input={inputId}
			value={value}
			onChange={(event) => onValueChange(event.target.value)}
			onFocus={(event) => {
				setTarget({ id: inputId, label, apply: (nextValue) => onValueChangeRef.current(nextValue) });
				onFocus?.(event);
			}}
		/>
	);
}
