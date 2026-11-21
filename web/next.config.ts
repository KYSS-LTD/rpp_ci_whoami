import type { NextConfig } from "next";

// Заголовки для файлов сборок iframe-игр из public/game-builds (capability game-iframe-bridge, design D2 и D3).
// - CORS: у изолированного фрейма непрозрачный источник, без разрешения он не загрузит модули, .wasm и .data своей сборки.
// - CSP sandbox: сборка остаётся изолированной от данных портала, даже если открыть её прямо по адресу.
const gameBuildHeaders = [
	{ key: "Access-Control-Allow-Origin", value: "*" },
	{ key: "Content-Security-Policy", value: "sandbox allow-scripts" },
];
const uavBuildHeaders = [
	gameBuildHeaders[0],
	{ key: "Content-Security-Policy", value: "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox" },
];

const nextConfig: NextConfig = {
	output: process.env.DOCKER_STANDALONE === "1" ? "standalone" : undefined,
	cacheComponents: true,
	partialPrefetching: true,
	async headers() {
		return [
			{ source: "/game-builds/:path*", headers: gameBuildHeaders },
			{ source: "/game-builds/uav-operator/:path*", headers: uavBuildHeaders },
		];
	},
};

export default nextConfig;
