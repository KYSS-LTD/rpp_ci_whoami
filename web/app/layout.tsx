import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { commonTexts } from "@/texts/common";
import { SiteHeader } from "./_components/SiteHeader";
import { StorageWarning } from "./_components/StorageWarning";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
	title: commonTexts.documentTitle,
	description: commonTexts.documentDescription,
};

// Корневой макет: шапка и предупреждение о хранении видны на всех страницах.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="ru" className={`${geistSans.variable} ${geistMono.variable}`}>
			<body>
				<SiteHeader />
				<StorageWarning />
				<main>{children}</main>
			</body>
		</html>
	);
}
