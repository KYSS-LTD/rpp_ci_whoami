import Image from "next/image";
import Link from "next/link";
import { commonTexts } from "@/texts/common";
import styles from "./SiteFooter.module.css";

// Ссылки в подвале повторяют основные разделы шапки.
const footerLinks = [
	{ href: "/games", label: commonTexts.navGames },
	{ href: "/achievements", label: commonTexts.navAchievements },
	{ href: "/me", label: commonTexts.navProfile },
];

// Подвал сайта: название, короткое описание, ссылки и пометка о локальном хранении данных.
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
				<p className={styles.notice}>{commonTexts.localDataNotice}</p>
			</div>
		</footer>
	);
}
