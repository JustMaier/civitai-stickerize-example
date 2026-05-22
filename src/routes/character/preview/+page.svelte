<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import { error as showError } from '$lib/components/ui/Toaster.svelte';
	import { ChevronLeft } from 'lucide-svelte';
	import { authFetch } from '$lib/utils/api';
	import { getAuthImageUrl } from '$lib/stores/auth.svelte';
	import { clearPendingState } from '$lib/stores/character-creation.svelte';

	// Character name - populated from job API response
	let characterName = $state('NEW CHARACTER');

	// Job state
	let jobId = $state<string | null>(null);
	let isLoading = $state(true);
	let characterId = $state<string | null>(null);
	let stickerUrl = $state<string | null>(null);
	let pollIntervalId: ReturnType<typeof setInterval> | null = null;

	// Error messages mapping (from PRD 08-decisions-made.md)
	const ERROR_MESSAGES: Record<string, string> = {
		'no_person': "We couldn't find a person in this photo. Please upload a photo with a clear view of someone's face.",
		'multiple_people': "We found multiple people in this photo. Please upload a photo with just one person.",
		'face_not_clear': "We can't clearly see the person's face. Please upload a photo with better lighting or angle.",
		'generation_failed': "Oops! This one didn't work out",
		'timeout': "Generation timed out. Please try again.",
		'policy_refusal': "Unfortunately, that prompt couldn't be processed. Try rephrasing."
	};

	// Get user-friendly error message
	function getErrorMessage(error: string | undefined): string {
		if (!error) return "Oops! This one didn't work out";

		// Check if it's a known error type
		for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
			if (error.toLowerCase().includes(key.replace('_', ' ')) || error.toLowerCase().includes(key)) {
				return message;
			}
		}

		// Return the error as-is if it's already user-friendly, otherwise use generic
		if (error.length < 100 && !error.includes('Error:')) {
			return error;
		}
		return "Oops! This one didn't work out";
	}

	// Poll job status
	async function pollJobStatus() {
		if (!jobId) return;

		try {
			const response = await authFetch(`/api/jobs/${jobId}`);
			const data = await response.json();

			if (!response.ok) {
				stopPolling();
				showError(data.error || 'Failed to check generation status', 5000);
				return;
			}

			// Update character name from job response if available
			if (data.characterName) {
				characterName = data.characterName;
			}

			if (data.status === 'complete') {
				stopPolling();
				characterId = data.resultId;
				// Add cache-busting timestamp to force reload after regeneration
				stickerUrl = `/api/images/characters/${data.resultId}?v=${Date.now()}`;
				isLoading = false;
			} else if (data.status === 'failed') {
				stopPolling();
				const errorMessage = getErrorMessage(data.error);
				showError(errorMessage, 5000);
				// Stay on page so user can try again or go back
				isLoading = false;
			}
			// If still queued or processing, continue polling
		} catch (err) {
			console.error('Polling error:', err);
			// Don't stop polling on network errors - could be temporary
		}
	}

	function startPolling() {
		if (pollIntervalId) return;

		// Poll immediately, then every 5 seconds
		pollJobStatus();
		pollIntervalId = setInterval(pollJobStatus, 5000);
	}

	function stopPolling() {
		if (pollIntervalId) {
			clearInterval(pollIntervalId);
			pollIntervalId = null;
		}
	}

	// Computed back button class
	let backButtonClass = $derived(
		`flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${!isLoading ? 'hover:bg-white/50 hover:text-gray-900' : ''}`
	);

	// Initialize from URL params on mount
	onMount(() => {
		const urlJobId = $page.url.searchParams.get('jobId');

		if (!urlJobId) {
			// No jobId - redirect back to create character
			showError('No generation in progress', 5000);
			goto('/character/new');
			return;
		}

		jobId = urlJobId;
		startPolling();

		// Cleanup on unmount
		return () => {
			stopPolling();
		};
	});

	function handleBack() {
		if (!isLoading) {
			stopPolling();
			// Form state is preserved in the character-creation store
			goto('/character/new');
		}
	}

	async function handleKeepIt() {
		stopPolling();

		// Clear the pending character creation state
		clearPendingState();

		// Request welcome sticker for first-time users
		// Server validates eligibility and handles the prompt
		if (characterId) {
			requestWelcomeSticker(characterId);
		}

		// Navigate to feed immediately (don't wait for sticker generation)
		goto('/feed');
	}

	/**
	 * Request welcome sticker via secure server endpoint
	 * Server checks if user is eligible (hasn't received one yet)
	 * and generates the sticker with a server-controlled prompt
	 */
	async function requestWelcomeSticker(charId: string) {
		try {
			await authFetch('/api/welcome-sticker', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ characterId: charId })
			});
			// Fire and forget - server handles eligibility check
		} catch (err) {
			// Silent failure - welcome sticker is a nice-to-have
			console.error('Failed to request welcome sticker:', err);
		}
	}

	async function handleTryAgain() {
		// If we have a successful character, use regenerate endpoint
		if (characterId) {
			isLoading = true;
			stickerUrl = null;

			try {
				const response = await authFetch(`/api/characters/${characterId}/regenerate`, {
					method: 'POST'
				});

				const data = await response.json();

				if (!response.ok) {
					showError(data.error || 'Failed to start regeneration', 5000);
					isLoading = false;
					return;
				}

				// Update jobId and start polling again
				jobId = data.jobId;

				// Update URL without navigation
				if (browser) {
					const newUrl = new URL(window.location.href);
					newUrl.searchParams.set('jobId', data.jobId);
					window.history.replaceState({}, '', newUrl.toString());
				}

				startPolling();
			} catch (err) {
				console.error('Regeneration error:', err);
				showError('Something went wrong', 5000);
				isLoading = false;
			}
			return;
		}

		// No character yet (failed before creation) - retry the failed job
		if (!jobId) {
			stopPolling();
			goto('/character/new');
			return;
		}

		isLoading = true;

		try {
			const response = await authFetch(`/api/jobs/${jobId}/retry`, {
				method: 'POST'
			});

			const data = await response.json();

			if (!response.ok) {
				// If photo is gone, redirect to upload new photo
				if (response.status === 410 || data.code === 'photo_not_found') {
					showError('Original photo no longer available. Please upload a new photo.', 5000);
					stopPolling();
					goto('/character/new');
					return;
				}

				showError(data.error || 'Failed to retry generation', 5000);
				isLoading = false;
				return;
			}

			// Update jobId and start polling again
			jobId = data.jobId;

			// Update URL without navigation
			if (browser) {
				const newUrl = new URL(window.location.href);
				newUrl.searchParams.set('jobId', data.jobId);
				window.history.replaceState({}, '', newUrl.toString());
			}

			startPolling();
		} catch (err) {
			console.error('Retry error:', err);
			showError('Something went wrong', 5000);
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Sticker Preview - Stickerize</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-[#FDF2F8]">
	<!-- Header with Back Button and Badge -->
	<header class="flex items-center justify-between p-4">
		<button
			type="button"
			onclick={handleBack}
			disabled={isLoading}
			class={backButtonClass}
			aria-label="Go back"
		>
			<ChevronLeft class="h-6 w-6" />
		</button>
		<Badge variant="pink" size="md">
			STICKER PREVIEW
		</Badge>
		<!-- Invisible spacer to center the badge -->
		<div class="h-10 w-10"></div>
	</header>

	<!-- Main Content -->
	<main class="flex flex-1 flex-col items-center px-6 pb-8">

		{#if isLoading}
			<!-- Loading State -->
			<div class="mt-16 flex flex-1 flex-col items-center justify-center">
				<LoadingSpinner size="lg" showMessage={true} />
			</div>
		{:else if stickerUrl}
			<!-- Character Name -->
			<h1 class="mt-6 bg-gradient-to-r from-[#C91977] to-[#8B5CF6] bg-clip-text text-center text-4xl font-extrabold leading-normal text-transparent">
				{characterName}!
			</h1>

			<!-- Sticker Image -->
			<div class="mt-8 flex w-full max-w-sm flex-1 items-center justify-center">
				<img
					src={getAuthImageUrl(stickerUrl)}
					alt="{characterName} sticker"
					class="w-full object-contain"
				/>
			</div>

			<!-- Action Buttons -->
			<div class="mt-8 flex w-full max-w-sm flex-col gap-3">
				<Button variant="primary" fullWidth onclick={handleKeepIt}>
					KEEP IT!
				</Button>
				<Button variant="outlined" fullWidth onclick={handleTryAgain}>
					TRY AGAIN
				</Button>
			</div>
		{:else}
			<!-- Failed state (no stickerUrl but not loading) -->
			<div class="mt-16 flex flex-1 flex-col items-center justify-center gap-6">
				<div class="text-center">
					<p class="text-xl font-medium text-gray-700">Generation didn't complete</p>
					<p class="mt-2 text-gray-500">You can try again or go back to change the photo</p>
				</div>

				<div class="flex w-full max-w-sm flex-col gap-3">
					<Button variant="primary" fullWidth onclick={handleTryAgain}>
						TRY AGAIN
					</Button>
					<Button variant="outlined" fullWidth onclick={handleBack}>
						CHANGE PHOTO
					</Button>
				</div>
			</div>
		{/if}
	</main>
</div>
