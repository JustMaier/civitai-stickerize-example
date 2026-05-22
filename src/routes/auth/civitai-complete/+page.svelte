<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { setAuth } from '$lib/stores/auth.svelte';

	let message = $state('Completing sign-in…');

	onMount(() => {
		// The Civitai callback handed us the JWT via URL fragment so it never
		// hits the server in subsequent navigations. Parse it, push into the
		// auth store, then redirect to the main app.
		const hash = window.location.hash.startsWith('#')
			? window.location.hash.slice(1)
			: window.location.hash;
		const params = new URLSearchParams(hash);
		const token = params.get('token');
		const userId = params.get('userId');
		const email = params.get('email');
		const name = params.get('name') ?? '';
		const profilePhotoUrl = params.get('profilePhotoUrl') ?? undefined;

		if (!token || !userId || !email) {
			message = 'Sign-in failed. Redirecting…';
			goto('/?error=civitai_callback_missing_fields');
			return;
		}

		setAuth(token, { id: userId, email, name, profilePhotoUrl });
		// Strip the fragment before navigating so the JWT doesn't sit in history.
		history.replaceState(null, '', window.location.pathname);
		goto('/feed');
	});
</script>

<svelte:head>
	<title>Signing in… - Stickerize</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-[#FDF2F8]">
	<div class="text-center">
		<div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-pink-200 border-t-pink-500"></div>
		<p class="mt-4 text-sm font-medium uppercase tracking-wide text-gray-700">{message}</p>
	</div>
</div>
