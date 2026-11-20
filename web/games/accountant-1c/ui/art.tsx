// Иллюстрации игры inline SVG (design.md, D7): персонажи, фикус, штамп, купюры, весы, посетитель.
// Цвета заданы классами из art.module.css через переменные: рамка стола следует теме портала, окно программы своей палитре.
import type { FicusState, StampId } from "../logic/mood";
import styles from "./art.module.css";

interface ArtProps {
	className?: string;
}

// Фикус в горшке: состояние меняет листья, наклон и цветы.
export function Ficus({ state, label, className }: ArtProps & { state: FicusState; label: string }) {
	return (
		<svg viewBox="0 0 80 110" className={`${styles.ficus} ${className ?? ""}`} data-state={state} role="img" aria-label={label}>
			<g className={styles.ficusPlant}>
				<path className={styles.ficusStem} d="M40 82 C40 64 38 50 42 30" />
				<ellipse className={styles.ficusLeaf} cx="28" cy="58" rx="13" ry="6.5" transform="rotate(-28 28 58)" />
				<ellipse className={styles.ficusLeaf} cx="53" cy="52" rx="13" ry="6.5" transform="rotate(24 53 52)" />
				<ellipse className={styles.ficusLeaf} cx="30" cy="38" rx="12" ry="6" transform="rotate(-36 30 38)" />
				<ellipse className={styles.ficusLeaf} cx="54" cy="32" rx="12" ry="6" transform="rotate(30 54 32)" />
				<ellipse className={styles.ficusLeaf} cx="42" cy="20" rx="7" ry="11" />
				<g className={styles.ficusFlowers}>
					<circle cx="22" cy="46" r="4.5" />
					<circle cx="60" cy="42" r="4.5" />
					<circle cx="42" cy="9" r="4.5" />
				</g>
			</g>
			<path className={styles.ficusPot} d="M22 80 H58 L54 106 H26 Z" />
			<rect className={styles.ficusPotRim} x="19" y="77" width="42" height="7" rx="2" />
		</svg>
	);
}

// Кружка с чаем на столе.
export function Mug({ label, className }: ArtProps & { label: string }) {
	return (
		<svg viewBox="0 0 60 60" className={`${styles.mug} ${className ?? ""}`} role="img" aria-label={label}>
			<path className={styles.steam} d="M22 14 C18 9 26 7 22 2 M32 14 C28 9 36 7 32 2" />
			<rect className={styles.mugBody} x="12" y="18" width="30" height="34" rx="5" />
			<path className={styles.mugHandle} d="M42 26 C54 26 54 44 42 44" />
			<rect className={styles.mugStripe} x="12" y="28" width="30" height="5" />
		</svg>
	);
}

// Портрет главбуха: очки, пучок, жемчуг.
export function ChiefAvatar({ className }: ArtProps) {
	return (
		<svg viewBox="0 0 48 48" className={`${styles.avatar} ${className ?? ""}`} aria-hidden="true">
			<circle className={styles.avatarBg} cx="24" cy="24" r="24" />
			<circle className={styles.hairDark} cx="24" cy="10" r="7" />
			<path className={styles.shirtChief} d="M8 48 C8 36 16 32 24 32 C32 32 40 36 40 48 Z" />
			<circle className={styles.skin} cx="24" cy="22" r="10" />
			<path className={styles.hairDark} d="M14 20 C14 12 34 12 34 20 C30 16 18 16 14 20 Z" />
			<circle className={styles.glasses} cx="20" cy="23" r="3.4" />
			<circle className={styles.glasses} cx="28" cy="23" r="3.4" />
			<path className={styles.glasses} d="M23.4 23 H24.6" />
			<g className={styles.pearls}>
				<circle cx="18" cy="34" r="1.4" />
				<circle cx="21" cy="35" r="1.4" />
				<circle cx="24" cy="35.4" r="1.4" />
				<circle cx="27" cy="35" r="1.4" />
				<circle cx="30" cy="34" r="1.4" />
			</g>
		</svg>
	);
}

// Портрет директора: залысина, галстук.
export function DirectorAvatar({ className }: ArtProps) {
	return (
		<svg viewBox="0 0 48 48" className={`${styles.avatar} ${className ?? ""}`} aria-hidden="true">
			<circle className={styles.avatarBgAlt} cx="24" cy="24" r="24" />
			<path className={styles.suit} d="M7 48 C7 36 15 31 24 31 C33 31 41 36 41 48 Z" />
			<path className={styles.tie} d="M24 32 L21 36 L24 46 L27 36 Z" />
			<circle className={styles.skin} cx="24" cy="21" r="10" />
			<path className={styles.hairGrey} d="M14 20 C14 16 16 14 18 14 M34 20 C34 16 32 14 30 14" />
			<circle className={styles.eye} cx="20.5" cy="21" r="1.2" />
			<circle className={styles.eye} cx="27.5" cy="21" r="1.2" />
			<path className={styles.mouth} d="M21 26 Q24 28 27 26" />
		</svg>
	);
}

// Посетитель кассы: нейтральная фигура, цвет зависит от номера.
export function VisitorAvatar({ variant, className }: ArtProps & { variant: number }) {
	return (
		<svg viewBox="0 0 64 72" className={`${styles.visitor} ${className ?? ""}`} data-variant={variant % 4} aria-hidden="true">
			<path className={styles.visitorBody} d="M10 72 C10 52 20 44 32 44 C44 44 54 52 54 72 Z" />
			<circle className={styles.skin} cx="32" cy="26" r="14" />
			<path className={styles.visitorHair} d="M18 24 C18 10 46 10 46 24 C40 18 24 18 18 24 Z" />
			<circle className={styles.eye} cx="27" cy="27" r="1.6" />
			<circle className={styles.eye} cx="37" cy="27" r="1.6" />
			<path className={styles.mouth} d="M27 33 Q32 36 37 33" />
		</svg>
	);
}

// Пачка купюр.
export function Banknotes({ className }: ArtProps) {
	return (
		<svg viewBox="0 0 90 50" className={`${styles.banknotes} ${className ?? ""}`} aria-hidden="true">
			<rect className={styles.noteBack} x="10" y="4" width="74" height="36" rx="4" transform="rotate(-6 47 22)" />
			<rect className={styles.noteFront} x="6" y="10" width="74" height="36" rx="4" />
			<circle className={styles.noteMark} cx="43" cy="28" r="9" />
			<rect className={styles.noteMark} x="12" y="16" width="10" height="4" rx="2" />
			<rect className={styles.noteMark} x="64" y="36" width="10" height="4" rx="2" />
		</svg>
	);
}

// Весы: наклон коромысла в градусах, положительный кренит вправо.
export function Scales({ tiltDeg, label, className }: ArtProps & { tiltDeg: number; label: string }) {
	return (
		<svg viewBox="0 0 120 90" className={`${styles.scales} ${className ?? ""}`} role="img" aria-label={label}>
			<path className={styles.scalesBase} d="M48 86 H72 L66 78 H54 Z" />
			<rect className={styles.scalesPost} x="58" y="16" width="4" height="64" />
			<g className={styles.scalesBeam} style={{ transform: `rotate(${tiltDeg}deg)` }}>
				<rect className={styles.scalesPost} x="14" y="14" width="92" height="4" rx="2" />
				<path className={styles.scalesString} d="M18 18 L8 44 M18 18 L28 44 M102 18 L92 44 M102 18 L112 44" />
				<path className={styles.scalesPan} d="M4 44 H32 C30 52 6 52 4 44 Z" />
				<path className={styles.scalesPan} d="M88 44 H116 C114 52 90 52 88 44 Z" />
			</g>
			<circle className={styles.scalesPivot} cx="60" cy="16" r="5" />
		</svg>
	);
}

// Штамп на отчёте: цвет зависит от итога, текст подписи передаётся из texts.
export function Stamp({ stampId, label, className }: ArtProps & { stampId: StampId; label: string }) {
	return (
		<div className={`${styles.stamp} ${className ?? ""}`} data-stamp={stampId} role="img" aria-label={label}>
			<svg viewBox="0 0 200 120" aria-hidden="true">
				<rect className={styles.stampFrame} x="6" y="6" width="188" height="108" rx="14" />
				<rect className={styles.stampFrameInner} x="14" y="14" width="172" height="92" rx="9" />
			</svg>
			<span className={styles.stampText}>{label}</span>
		</div>
	);
}

// Значок окна программы: абстрактный квадрат с листком, без чужих логотипов.
export function AppIcon({ className }: ArtProps) {
	return (
		<svg viewBox="0 0 24 24" className={`${styles.appIcon} ${className ?? ""}`} aria-hidden="true">
			<rect className={styles.appIconBg} x="1" y="1" width="22" height="22" rx="5" />
			<path className={styles.appIconLeaf} d="M7 17 C7 10 12 6 18 6 C18 12 14 17 7 17 Z" />
			<path className={styles.appIconVein} d="M8 16 L15 9" />
		</svg>
	);
}
