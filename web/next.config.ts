import type { NextConfig } from "next";

// Заголовки для файлов сборок iframe-игр из public/game-builds (capability game-iframe-bridge, design D2 и D3).
// - CORS: у изолированного фрейма непрозрачный источник, без разрешения он не загрузит модули, .wasm и .data своей сборки.
// - CSP sandbox: сборка остаётся изолированной от данных портала, даже если открыть её прямо по адресу.
const gameBuildHeaders = [
	{ key: "Access-Control-Allow-Origin", value: "*" },
	{ key: "Content-Security-Policy", value: "sandbox allow-scripts" },
];

const nextConfig: NextConfig = {
	cacheComponents: true,
	partialPrefetching: true,
	async headers() {
		return [{ source: "/game-builds/:path*", headers: gameBuildHeaders }];
	},
};

export default nextConfig;
