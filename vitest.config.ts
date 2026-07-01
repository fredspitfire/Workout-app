import { defineConfig } from 'vitest/config';

// Standalone config so tests don't load the SvelteKit vite plugin. The engine is
// pure TypeScript with no framework deps — run it directly.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
