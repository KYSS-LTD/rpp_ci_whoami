import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { commonTexts } from "@/texts/common";
import { SiteFooter } from "./_components/SiteFooter";
import { SiteHeader } from "./_components/SiteHeader";
import { StorageWarning } from "./_components/StorageWarning";

// Основной шрифт портала с кириллицей. Подключается через переменную --font-sans (см. globals.css).
const mainFont = Manrope({
	variable: "--font-sans",
	subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
	title: commonTexts.documentTitle,
	description: commonTexts.documentDescription,
};

// Корневой макет: шапка, предупреждение о хранении и подвал видны на всех страницах.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="ru" className={mainFont.variable}>
			<body>
				<SiteHeader />
				<StorageWarning />
				<main>{children}</main>
				<SiteFooter />
			</body>
		</html>
	);
}
