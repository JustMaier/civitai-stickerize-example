<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'StickerTile',
		description: 'Displays a sticker in various states: loading, complete, or failed',
		layout: 'row',
		containerClass: 'max-w-md',
		variants: [
			{
				label: 'Loading',
				props: {
					sticker: null,
					status: 'loading'
				},
				wrapperClass: 'w-24'
			},
			{
				label: 'Complete',
				props: {
					sticker: {
						id: 'sticker-1',
						imagePath: '/images/stickers/justin.webp',
						prompt: 'Excited thumbs up'
					},
					status: 'complete'
				},
				wrapperClass: 'w-24'
			},
			{
				label: 'Complete (different sticker)',
				props: {
					sticker: {
						id: 'sticker-2',
						imagePath: '/images/stickers/justin-cool.webp',
						prompt: 'Waving hello'
					},
					status: 'complete'
				},
				wrapperClass: 'w-24'
			},
			{
				label: 'Failed',
				props: {
					sticker: null,
					status: 'failed'
				},
				wrapperClass: 'w-24'
			},
			{
				label: 'Failed (Non-retryable)',
				props: {
					sticker: null,
					status: 'failed',
					isRetryable: false
				},
				wrapperClass: 'w-24'
			},
			{
				label: 'Loading (clickable)',
				props: {
					sticker: null,
					status: 'loading',
					onclick: () => console.log('clicked loading')
				},
				wrapperClass: 'w-24'
			}
		]
	};
</script>

<script lang="ts">
	import { getAuthImageUrl } from '$lib/stores/auth.svelte';

	interface Sticker {
		id: string;
		imagePath: string;
		prompt: string;
	}

	interface Props {
		sticker: Sticker | null;
		status: 'loading' | 'complete' | 'failed';
		onclick?: () => void;
		isRetryable?: boolean;
	}

	let { sticker, status, onclick, isRetryable = true }: Props = $props();

	// Create authenticated image URL
	let authImageUrl = $derived(sticker ? getAuthImageUrl(sticker.imagePath) : '');

	const loadingTexts = ['SKETCHING...', 'WAITING...'];
	let loadingTextIndex = $state(0);

	const retryableFailedTexts = ['OOPS!', 'UH OH...', 'TAP TO RETRY'];
	const nonRetryableFailedTexts = ['OOPS!', "CAN'T USE THIS"];
	let failedTexts = $derived(isRetryable ? retryableFailedTexts : nonRetryableFailedTexts);
	let failedTextIndex = $state(0);

	$effect(() => {
		if (status !== 'loading') return;

		const interval = setInterval(() => {
			loadingTextIndex = (loadingTextIndex + 1) % loadingTexts.length;
		}, 2000);

		return () => clearInterval(interval);
	});

	$effect(() => {
		if (status !== 'failed') return;

		const interval = setInterval(() => {
			failedTextIndex = (failedTextIndex + 1) % failedTexts.length;
		}, 2500);

		return () => clearInterval(interval);
	});
</script>

<button
	type="button"
	class="relative aspect-square w-full rounded-lg border border-[#E5E7EB] overflow-hidden transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
	onclick={onclick}
	aria-label={status === 'complete' && sticker ? `View sticker: ${sticker.prompt}` : status === 'loading' ? 'View generating sticker' : 'View failed sticker'}
>
	{#if status === 'loading'}
		<!-- Loading State -->
		<div class="absolute inset-0 bg-gradient-to-br from-[#FDF2F8] via-[#F5D5E9] to-[#E9D5F5] animate-shimmer">
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-2">
				<!-- Simple spinner -->
				<div class="relative w-8 h-8">
					<div
						class="absolute inset-0 rounded-full border-3 border-transparent border-t-[#C91977] border-r-[#8B5CF6] animate-spin"
					></div>
					<div
						class="absolute inset-1.5 rounded-full bg-gradient-to-br from-[#C91977]/20 to-[#8B5CF6]/20"
					></div>
				</div>
				<span class="text-xs font-medium uppercase tracking-wide text-[#4B5563]">
					{loadingTexts[loadingTextIndex]}
				</span>
			</div>
		</div>

	{:else if status === 'complete' && sticker}
		<!-- Complete State -->
		<div class="absolute inset-0 bg-white flex items-center justify-center p-2">
			<img
				src={authImageUrl}
				alt={sticker.prompt}
				class="max-w-full max-h-full object-contain"
				loading="lazy"
			/>
		</div>

	{:else if status === 'failed'}
		<!-- Failed State - Playful but clear -->
		<div class="absolute inset-0 bg-gradient-to-br from-[#FDF2F8] via-[#F8E4E8] to-[#FCE7E4] flex flex-col items-center justify-center gap-2 animate-failed-pulse">
			<!-- Alert triangle icon -->
			<svg class="w-12 h-12 text-[#E07B7B]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
			</svg>
			<span class="text-xs font-medium uppercase tracking-wide text-[#C07070]">
				{failedTexts[failedTextIndex]}
			</span>
		</div>
	{/if}
</button>

<style>
	@keyframes shimmer {
		0% {
			background-position: -200% 0;
		}
		100% {
			background-position: 200% 0;
		}
	}

	.animate-shimmer {
		background-size: 200% 100%;
		animation: shimmer 3s ease-in-out infinite;
	}

	@keyframes failed-pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.85;
		}
	}

	.animate-failed-pulse {
		animation: failed-pulse 3s ease-in-out infinite;
	}

	.border-3 {
		border-width: 3px;
	}
</style>
