"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { resetProgress } from "@/core/progress";
import { commonTexts } from "@/texts/common";
import { ResetDialog } from "./ResetDialog";
import styles from "./SiteHeader.module.css";

const navigationLinks = [
	{ href: "/", label: commonTexts.navHome },
	{ href: "/games", label: commonTexts.navGames },
	{ href: "/achievements", label: commonTexts.navAchievements },
	{ href: "/me", label: commonTexts.navProfile },
];

// Ссылка считается текущей, если открыта её страница или вложенная (например, уровень внутри /games).
function isLinkActive(href: string, activePath: string | null): boolean {
	if (activePath === null) {
		return false;
	}
	return href === "/"
		? activePath === "/"
		: activePath === href || activePath.startsWith(`${href}/`);
}

// Список ссылок навигации. activePath = null рисует ссылки без выделения текущей.
function NavigationList({ activePath }: { activePath: string | null }) {
	return (
		<ul className={styles.navList}>
			{navigationLinks.map((link) => (
				<li key={link.href}>
					<Link
						href={link.href}
						className={styles.navLink}
						aria-current={isLinkActive(link.href, activePath) ? "page" : undefined}
					>
						{link.label}
					</Link>
				</li>
			))}
		</ul>
	);
}

// Читает текущий адрес и выделяет активную ссылку.
function ActiveNavigationList() {
	return <NavigationList activePath={usePathname()} />;
}

// Шапка сайта: навигация и кнопка сброса результатов.
export function SiteHeader() {
	const [isResetOpen, setIsResetOpen] = useState(false);

	// Диалог рисуется рядом с шапкой, а не внутри: у шапки есть backdrop-filter,
	// а он ломает position: fixed у вложенных элементов.
	return (
		<>
			<header className={styles.header}>
				<div className={styles.inner}>
					<Link href="/" className={styles.brand}>
						<Image unoptimized src="/brand/logo.png" alt="" width={36} height={36} />
						{commonTexts.siteName}
					</Link>
					<nav aria-label="Основная навигация" className={styles.nav}>
						{/* При cacheComponents адрес страницы уровня с неизвестными параметрами известен только при запросе,
						    поэтому чтение адреса обёрнуто в Suspense, а до него показываются ссылки без выделения. */}
						<Suspense fallback={<NavigationList activePath={null} />}>
							<ActiveNavigationList />
						</Suspense>
					</nav>
					<button
						type="button"
						className={styles.resetButton}
						onClick={() => setIsResetOpen(true)}
					>
						{commonTexts.resetButton}
					</button>
				</div>
			</header>
			{isResetOpen ? (
				<ResetDialog
					onConfirm={() => {
						resetProgress();
						setIsResetOpen(false);
					}}
					onCancel={() => setIsResetOpen(false)}
				/>
			) : null}
		</>
	);
}
