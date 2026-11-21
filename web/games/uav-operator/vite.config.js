import { defineConfig } from 'vite';

export default defineConfig({
	base: './',
	build: { outDir: '../../public/game-builds/uav-operator', emptyOutDir: true, rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
