<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Toaster from '$lib/components/ui/Toaster.svelte';
	import { browser, dev } from '$app/environment';

	let { children } = $props();

	$effect(() => {
		if (browser && 'serviceWorker' in navigator) {
			// In dev mode, Vite serves service worker as ES module
			navigator.serviceWorker
				.register('/service-worker.js', {
					type: dev ? 'module' : 'classic'
				})
				.catch((err) => {
					console.error('Service worker registration failed:', err);
				});
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
<Toaster />
