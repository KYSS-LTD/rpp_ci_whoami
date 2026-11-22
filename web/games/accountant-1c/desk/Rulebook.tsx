"use client";

// Справочник бухгалтера на столе (design.md, D11): закрытая папка открывается в разворот с вкладками.
import { useState } from "react";
import { accountantTexts } from "../texts";
import type { PaperPosition } from "./contexts";
import { Paper } from "./Paper";
import styles from "./desk.module.css";

const texts = accountantTexts.rulebook;

export type RulebookTabId = keyof typeof texts.tabs;

const tabIds = Object.keys(texts.tabs) as RulebookTabId[];

interface RulebookProps {
	defaultPosition: PaperPosition;
	// С какой вкладки открывать: у каждого задания своя нужная страница.
	initialTab?: RulebookTabId;
}

export function Rulebook({ defaultPosition, initialTab = "accounts" }: RulebookProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<RulebookTabId>(initialTab);

	return (
		<Paper
			id="rulebook"
			anchorRight
			defaultPosition={defaultPosition}
			variant="pad"
			width={isOpen ? 360 : 150}
			title={texts.title}
			ariaLabel={texts.title}
		>
			{isOpen ? (
				<div className={styles.rulebookOpen}>
					<div className={styles.rulebookTabs} role="tablist" aria-label={texts.title}>
						{tabIds.map((tabId) => (
							<button
								key={tabId}
								type="button"
								role="tab"
								id={`rulebook-tab-${tabId}`}
								aria-selected={activeTab === tabId}
								aria-controls="rulebook-page"
								className={styles.rulebookTab}
								onClick={() => setActiveTab(tabId)}
							>
								{texts.tabs[tabId]}
							</button>
						))}
					</div>
					<div id="rulebook-page" role="tabpanel" aria-labelledby={`rulebook-tab-${activeTab}`} className={styles.rulebookPage}>
						<ul>
							{texts.pages[activeTab].map((line) => (
								<li key={line}>{line}</li>
							))}
						</ul>
					</div>
					<button type="button" className={styles.rulebookToggle} onClick={() => setIsOpen(false)}>
						{texts.close}
					</button>
				</div>
			) : (
				<button type="button" className={styles.rulebookCover} onClick={() => setIsOpen(true)}>
					<span className={styles.rulebookSpine} aria-hidden="true" />
					{texts.open}
				</button>
			)}
		</Paper>
	);
}
