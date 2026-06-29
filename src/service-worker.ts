/// <reference types="@sveltejs/kit" />
/**
 * Offline-tolerance service worker (SvelteKit auto-registers this file in prod).
 * You'll usually have signal at home, so this is a resilience bonus, not a
 * design constraint: it precaches the app shell + static assets so logging keeps
 * working if the network blips. AI features still need the network.
 */
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `coach-cache-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	// Never cache API calls (engine/AI) — they must hit the server.
	if (url.pathname.startsWith('/api')) return;

	// Cache-first for our own precached build assets; network-first otherwise.
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			if (ASSETS.includes(url.pathname)) {
				const cached = await cache.match(url.pathname);
				if (cached) return cached;
			}
			try {
				const response = await fetch(request);
				if (response.ok && url.origin === location.origin) cache.put(request, response.clone());
				return response;
			} catch {
				const cached = await cache.match(request);
				if (cached) return cached;
				throw new Error('offline and not cached');
			}
		})()
	);
});
