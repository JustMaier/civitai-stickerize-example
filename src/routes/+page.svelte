<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	onMount(() => {
		if (isAuthenticated()) {
			goto('/feed');
		}
	});

	function handleFooterClick(link: string) {
		// Placeholder — wire up a modal later if needed.
		console.log(`Clicked: ${link}`);
	}
</script>

<div class="flex min-h-screen flex-col bg-[#FDF2F8]">
	<main class="flex flex-1 flex-col items-center justify-center px-6 py-8">
		<Badge variant="pink" size="md">STICKERIZE</Badge>

		<h1 class="mt-3 text-center text-2xl font-bold tracking-wide text-gray-900">
			YOUR LIFE IN STICKERS.
		</h1>

		<div class="my-8">
			<img
				src="/images/stickers/hero-sticker.webp"
				alt="Sample sticker character"
				class="h-64 w-64 rotate-3 object-contain drop-shadow-xl transition-transform hover:rotate-6"
			/>
		</div>

		{#if data.civitaiOAuthConfigured}
			<form method="POST" action="/api/auth/oauth/civitai" class="w-full max-w-sm">
				<Button type="submit" variant="primary" fullWidth>
					<span class="flex items-center gap-2">
						<span aria-hidden="true">⚡</span>
						Continue with Civitai
					</span>
				</Button>
			</form>
			<p class="mt-3 text-center text-xs text-gray-500">
				Sign in with your Civitai account to generate stickers using your own Buzz.
			</p>
		{:else}
			<div class="w-full max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
				Civitai OAuth isn't configured yet. Set <code>OAUTH_CIVITAI_CLIENT_ID</code>,
				<code>OAUTH_CIVITAI_CLIENT_SECRET</code>, and <code>CIVITAI_SESSION_SECRET</code>
				in your <code>.env</code> to enable sign-in.
			</div>
		{/if}
	</main>

	<footer class="px-6 pb-8">
		<div class="flex items-center justify-center gap-6 text-sm text-gray-500">
			<button
				type="button"
				class="hover:text-gray-700 hover:underline"
				onclick={() => handleFooterClick('privacy')}
			>
				Privacy
			</button>
			<button
				type="button"
				class="hover:text-gray-700 hover:underline"
				onclick={() => handleFooterClick('terms')}
			>
				Terms
			</button>
			<button
				type="button"
				class="hover:text-gray-700 hover:underline"
				onclick={() => handleFooterClick('support')}
			>
				Support
			</button>
		</div>
	</footer>
</div>
