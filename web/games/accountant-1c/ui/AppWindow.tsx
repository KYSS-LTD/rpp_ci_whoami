"use client";

// Окно учётной программы «Учёт: ООО Ромашка» на мониторе (design.md, D5): жёлто-красная палитра,
// панель разделов, вкладки форм, панель «Сообщения» и уведомления директора в углу.
// Нет логотипа, названия и иконок чужих программ. На узком экране разделы сворачиваются в меню, сообщения выезжают шторкой.
import { useEffect, useState, type ReactNode } from "react";
import { accountantTexts } from "../texts";
import { PixelCharacter } from "./pixel";
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
	notifications: WindowNotification[];
	onCloseNotification: (id: number) => void;
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
			<PixelCharacter character="director" label={accountantTexts.characters.director} className={styles.toastAvatar} />
			<div className={styles.toastBody}>
				<p className={styles.toastAuthor}>{accountantTexts.characters.director}</p>
				<p>{notification.text}</p>
			</div>
			<button type="button" className={styles.toastClose} aria-label={windowTexts.closeNotification} onClick={() => onClose(notification.id)}>
				×
			</button>
		</li>
	);
}

export function AppWindow({ activeSection, formTitle, messages, notifications, onCloseNotification, children }: AppWindowProps) {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isMessagesOpen, setIsMessagesOpen] = useState(false);

	return (
		<div className={styles.monitor}>
			<div className={styles.window} data-testid="accounting-window">
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

				<ul className={styles.notifications} aria-label={windowTexts.notificationsLabel} aria-live="polite">
					{notifications.map((notification) => (
						<NotificationToast key={notification.id} notification={notification} onClose={onCloseNotification} />
					))}
				</ul>
			</div>
			<span className={styles.monitorStand} aria-hidden="true" />
		</div>
	);
}
