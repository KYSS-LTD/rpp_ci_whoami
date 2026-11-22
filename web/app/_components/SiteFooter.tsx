import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { commonTexts } from "@/texts/common";
import styles from "./SiteFooter.module.css";

// Ссылки в подвале повторяют основные разделы шапки.
const footerLinks = [
	{ href: "/games", label: commonTexts.navGames },
	{ href: "/achievements", label: commonTexts.navAchievements },
	{ href: "/me", label: commonTexts.navProfile },
];

const credits = commonTexts.footerCredits;

// Ссылка на внешний сайт, открывается в новой вкладке.
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	);
}

// Подвал сайта: название, короткое описание, ссылки и сведения о проекте.
export function SiteFooter() {
	return (
		<footer className={styles.footer}>
			<div className={styles.inner}>
				<div className={styles.about}>
					<Link href="/" className={styles.brand}>
						<Image unoptimized src="/brand/logo.png" alt="" width={24} height={24} />
						{commonTexts.siteName}
					</Link>
					<p>{commonTexts.footerTagline}</p>
				</div>
				<nav aria-label={commonTexts.footerNavigationLabel}>
					<ul className={styles.links}>
						{footerLinks.map((link) => (
							<li key={link.href}>
								<Link href={link.href}>{link.label}</Link>
							</li>
						))}
					</ul>
				</nav>
				<div className={styles.credits}>
					<p>
						{credits.eventPrefix} <ExternalLink href={credits.eventUrl}>{credits.eventName}</ExternalLink>. {credits.caseText}
					</p>
					<p>
						{credits.teamPrefix} <ExternalLink href={credits.teamUrl}>{credits.teamName}</ExternalLink>
						<span className={styles.divider} aria-hidden="true" />
						<ExternalLink href={credits.sourceUrl}>{credits.sourceLabel}</ExternalLink>
					</p>
				</div>
			</div>
		</footer>
	);
}
