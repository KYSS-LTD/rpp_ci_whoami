"use client";

// Окно учётной программы «Учёт: ООО Ромашка» на мониторе (design.md, D5): жёлто-красная палитра,
// панель разделов, вкладки форм, панель «Сообщения» и уведомления директора в углу.
// Нет логотипа, названия и иконок чужих программ. На узком экране разделы сворачиваются в меню, сообщения выезжают шторкой.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { accountantTexts } from "../texts";
import { prefersReducedMotion } from "./motion";
import styles from "./AppWindow.module.css";

export type WindowSectionId = keyof typeof accountantTexts.window.sections;

export interface WindowMessage {
	id: number;
	kind: "mistake" | "info";
	text: string;
}

export interface WindowNotification {
	id: number;
	text: string;
}

// Через сколько уведомление закрывается само, мс.
const notificationLifetimeMs = 9000;

interface AppWindowProps {
	activeSection: WindowSectionId;
	formTitle: string | null;
	messages: WindowMessage[];
	open: boolean;
	launcherRef: RefObject<HTMLButtonElement | null>;
	onClose: () => void;
	children: ReactNode;
}

const windowTexts = accountantTexts.window;
const sectionIds = Object.keys(windowTexts.sections) as WindowSectionId[];

// Уведомление директора: закрывается кнопкой или само через notificationLifetimeMs.
function NotificationToast({ notification, onClose }: { notification: WindowNotification; onClose: (id: number) => void }) {
	useEffect(() => {
		const timerId = window.setTimeout(() => onClose(notification.id), notificationLifetimeMs);
		return () => window.clearTimeout(timerId);
	}, [notification.id, onClose]);

	return (
		<li className={styles.toast}>
			<div className={styles.toastBody}>
				<p className={styles.toastAuthor}>{accountantTexts.characters.directorShort}</p>
				<p>{notification.text}</p>
			</div>
			<button type="button" className={styles.toastClose} aria-label={windowTexts.closeNotification} onClick={() => onClose(notification.id)}>
				×
			</button>
		</li>
	);
}

export function DirectorNotices({ notifications, hidden, onClose }: { notifications: WindowNotification[]; hidden: boolean; onClose: (id: number) => void }) {
	return (
		<ul className={styles.notifications} hidden={hidden} aria-label={windowTexts.notificationsLabel} aria-live="polite">
			{notifications.map((notification) => <NotificationToast key={notification.id} notification={notification} onClose={onClose} />)}
		</ul>
	);
}

export function AppWindow({ activeSection, formTitle, messages, open, launcherRef, onClose, children }: AppWindowProps) {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isMessagesOpen, setIsMessagesOpen] = useState(false);
	const windowRef = useRef<HTMLElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const wasOpen = useRef(false);

	useLayoutEffect(() => {
		const element = windowRef.current;
		const launcher = launcherRef.current;
		const previous = wasOpen.current;
		wasOpen.current = open;
		if (!element || !launcher || previous === open) return;
		if (open) closeRef.current?.focus({ preventScroll: true });
		if (!open) launcher.focus({ preventScroll: true });
		if (prefersReducedMotion() || !element.animate) return;
		const bounds = element.getBoundingClientRect();
		const origin = launcher.getBoundingClientRect();
		if (!bounds.width || !bounds.height) return;
		const frames = [
			{ transform: `translate(${origin.left - bounds.left}px, ${origin.top - bounds.top}px) scale(${origin.width / bounds.width}, ${origin.height / bounds.height})`, opacity: 0.45, visibility: "visible" },
			{ transform: "none", opacity: 1, visibility: "visible" },
		];
		const animation = element.animate(open ? frames : frames.reverse(), { duration: 220, easing: "ease-in-out" });
		return () => animation.cancel();
	}, [launcherRef, open]);

	return (
		<section ref={windowRef} className={styles.window} aria-label={windowTexts.appTitle} aria-hidden={!open} inert={!open}
			data-testid="accounting-window" data-accounting-app data-open={open}
			onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) onClose(); }}>
			<header className={styles.titleBar}>
				<span className={styles.appMark} aria-hidden="true" />
				<p className={styles.appTitle}>{windowTexts.appTitle}</p>
				<button
					type="button"
					className={styles.menuToggle}
					aria-expanded={isMenuOpen}
					aria-controls="accountant-sections"
					onClick={() => setIsMenuOpen((open) => !open)}
				>
					☰ {windowTexts.menuToggle}
				</button>
				<button ref={closeRef} data-tutorial-switch type="button" className={styles.closeWindow} aria-label={windowTexts.minimize} onClick={onClose}>×</button>
			</header>

			<div className={styles.body}>
				<nav id="accountant-sections" className={styles.sections} data-open={isMenuOpen ? "true" : "false"} aria-label={windowTexts.sectionsLabel}>
					<ul>
						{sectionIds.map((sectionId) => (
							<li key={sectionId} className={styles.section} aria-current={sectionId === activeSection ? "page" : undefined}>
								<span className={styles.sectionMark} aria-hidden="true" />
								{windowTexts.sections[sectionId]}
							</li>
						))}
					</ul>
				</nav>

				<div className={styles.workspace}>
					<div className={styles.tabs}>
						<span className={styles.tab}>{windowTexts.homeTab}</span>
						{formTitle ? <span className={`${styles.tab} ${styles.tabActive}`}>{formTitle}</span> : null}
					</div>
					<div className={styles.form}>{children}</div>

					<section className={styles.messages} data-open={isMessagesOpen ? "true" : "false"} aria-label={windowTexts.messagesTitle}>
						<button
							type="button"
							className={styles.messagesToggle}
							aria-expanded={isMessagesOpen}
							onClick={() => setIsMessagesOpen((open) => !open)}
						>
							{windowTexts.messagesToggle} ({messages.length})
						</button>
						<h2 className={styles.panelTitle}>{windowTexts.messagesTitle}</h2>
						<ul className={styles.messageList} aria-live="polite">
							{messages.length === 0 ? <li className={styles.empty}>{windowTexts.messagesEmpty}</li> : null}
							{messages.map((message) => (
								<li key={message.id} className={styles.message} data-kind={message.kind}>
									<strong>{message.kind === "mistake" ? windowTexts.messageMistake : windowTexts.messageInfo}</strong> {message.text}
								</li>
							))}
						</ul>
					</section>
				</div>
			</div>
		</section>
	);
}
