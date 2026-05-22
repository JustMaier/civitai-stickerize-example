<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	interface JobDataPreview {
		job: {
			id: string;
			status: 'queued' | 'processing' | 'failed';
			userPrompt: string;
			error: string | null;
		};
		characterNames?: string[];
		isOnline?: boolean;
		isRetryable?: boolean;
		onretry?: () => void;
		ondismiss?: () => void;
		onclose?: () => void;
	}

	export const preview: ComponentPreview<JobDataPreview> = {
		name: 'JobDetail',
		description: 'Full-screen overlay displaying a job in progress or failed state',
		layout: 'column',
		background: 'checkered',
		isolate: true,
		variants: [
			{
				label: 'Loading (Queued)',
				props: {
					job: {
						id: 'job-1',
						status: 'queued',
						userPrompt: '@Justin doing a thumbs up',
						error: null
					},
					characterNames: ['Justin']
				},
				wrapperClass: 'relative h-[400px]'
			},
			{
				label: 'Loading (Processing)',
				props: {
					job: {
						id: 'job-2',
						status: 'processing',
						userPrompt: '@Justin as the Success Kid meme',
						error: null
					},
					characterNames: ['Justin']
				},
				wrapperClass: 'relative h-[400px]'
			},
			{
				label: 'Failed',
				props: {
					job: {
						id: 'job-3',
						status: 'failed',
						userPrompt: '@Justin doing something inappropriate',
						error: 'The prompt requests content that violates our guidelines.'
					},
					characterNames: ['Justin']
				},
				wrapperClass: 'relative h-[400px]'
			},
			{
				label: 'Failed (Long Error)',
				props: {
					job: {
						id: 'job-4',
						status: 'failed',
						userPrompt: '@Justin and @Sarah in a complex scene',
						error: 'Failed to generate image after multiple attempts. The image generation service returned an error: Rate limit exceeded. Please try again later.'
					},
					characterNames: ['Justin', 'Sarah']
				},
				wrapperClass: 'relative h-[400px]'
			},
			{
				label: 'Failed (Offline)',
				props: {
					job: {
						id: 'job-5',
						status: 'failed',
						userPrompt: '@Justin waving hello',
						error: 'Network error occurred.'
					},
					characterNames: ['Justin'],
					isOnline: false
				},
				wrapperClass: 'relative h-[400px]'
			},
			{
				label: 'Failed (Non-retryable)',
				props: {
					job: {
						id: 'job-6',
						status: 'failed',
						userPrompt: '@Justin doing something inappropriate',
						error: 'This prompt was flagged by our content guidelines.'
					},
					characterNames: ['Justin'],
					isRetryable: false
				},
				wrapperClass: 'relative h-[400px]'
			}
		]
	};
</script>

<script lang="ts">
	import { X, RefreshCw, Trash2, Quote, Copy, Check } from 'lucide-svelte';
	import { onMount } from 'svelte';

	interface JobData {
		id: string;
		status: 'queued' | 'processing' | 'failed';
		userPrompt: string;
		error: string | null;
	}

	interface Props {
		job: JobData;
		characterNames?: string[];
		isOnline?: boolean;
		isRetryable?: boolean;
		onretry?: () => void;
		ondismiss?: () => void;
		onclose?: () => void;
	}

	let { job, characterNames = [], isOnline = true, isRetryable = true, onretry, ondismiss, onclose }: Props = $props();

	let copied = $state(false);

	async function handleCopyPrompt() {
		if (!job.userPrompt) return;
		try {
			await navigator.clipboard.writeText(job.userPrompt);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Fallback for older browsers
			const textArea = document.createElement('textarea');
			textArea.value = job.userPrompt;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand('copy');
			document.body.removeChild(textArea);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		}
	}

	// Helper functions for highlighting character names
	function escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function escapeHtml(str: string): string {
		const map: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#x27;'
		};
		return str.replace(/[&<>"']/g, (char) => map[char]);
	}

	// Generate highlighted prompt HTML with character names in primary color
	const highlightedPrompt = $derived.by(() => {
		if (!job.userPrompt || characterNames.length === 0) {
			return escapeHtml(job.userPrompt);
		}

		// Sort by length (longest first) to avoid partial matches
		const sortedNames = [...characterNames].sort((a, b) => b.length - a.length);
		const pattern = new RegExp(
			`(@(?:${sortedNames.map(escapeRegex).join('|')}))(?=\\s|$|[.,!?;:])`,
			'gi'
		);

		const parts: string[] = [];
		let lastIndex = 0;
		let match: RegExpExecArray | null;
		pattern.lastIndex = 0;

		while ((match = pattern.exec(job.userPrompt)) !== null) {
			if (match.index > lastIndex) {
				parts.push(escapeHtml(job.userPrompt.slice(lastIndex, match.index)));
			}
			parts.push(`<span class="text-[#C91977] font-semibold not-italic">${escapeHtml(match[1])}</span>`);
			lastIndex = pattern.lastIndex;
		}

		if (lastIndex < job.userPrompt.length) {
			parts.push(escapeHtml(job.userPrompt.slice(lastIndex)));
		}

		return parts.join('');
	});

	// Prevent body scroll when overlay is open
	onMount(() => {
		const scrollY = window.scrollY;
		document.body.style.position = 'fixed';
		document.body.style.top = `-${scrollY}px`;
		document.body.style.left = '0';
		document.body.style.right = '0';
		document.body.style.overflow = 'hidden';

		return () => {
			document.body.style.position = '';
			document.body.style.top = '';
			document.body.style.left = '';
			document.body.style.right = '';
			document.body.style.overflow = '';
			window.scrollTo(0, scrollY);
		};
	});

	function handleClose() {
		onclose?.();
	}

	function handleRetry() {
		onretry?.();
	}

	function handleDismiss() {
		ondismiss?.();
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
		}
	}

	const isLoading = $derived(job.status === 'queued' || job.status === 'processing');
	const isFailed = $derived(job.status === 'failed');

	const loadingTexts = ['Sketching...', 'Creating magic...', 'Almost there...'];
	let loadingTextIndex = $state(0);

	$effect(() => {
		if (!isLoading) return;

		const interval = setInterval(() => {
			loadingTextIndex = (loadingTextIndex + 1) % loadingTexts.length;
		}, 2500);

		return () => clearInterval(interval);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Full-screen glassmorphic overlay -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md"
	onclick={handleBackdropClick}
	role="dialog"
	aria-modal="true"
	aria-label={isLoading ? 'Sticker generating' : 'Failed sticker details'}
	tabindex="-1"
>
	<!-- Content container -->
	<div class="flex flex-col items-center max-w-[85vw] w-[340px]">
		{#if isLoading}
			<!-- Loading state -->
			<div class="relative w-full">
				<!-- Close button - top left -->
				<button
					type="button"
					onclick={handleClose}
					class="absolute -top-3 -left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2"
					aria-label="Close"
				>
					<X class="h-5 w-5 text-[#1F2937]" />
				</button>

				<!-- Glassmorphic card -->
				<div class="relative rounded-2xl border border-white/40 bg-gradient-to-br from-white/90 via-white/80 to-white/70 shadow-xl backdrop-blur-xl overflow-hidden">
					<!-- Status area -->
					<div class="px-6 py-8 flex flex-col items-center">
						<!-- Loading spinner -->
						<div class="relative w-16 h-16 mb-4">
							<div
								class="absolute inset-0 rounded-full border-4 border-transparent border-t-[#C91977] border-r-[#8B5CF6] animate-spin"
							></div>
							<div
								class="absolute inset-2 rounded-full bg-gradient-to-br from-[#C91977]/20 to-[#8B5CF6]/20"
							></div>
						</div>
						<span class="text-sm font-medium text-[#4B5563]">
							{loadingTexts[loadingTextIndex]}
						</span>
					</div>
				</div>
			</div>

		{:else if isFailed}
			<!-- Failed state with floating icon above card -->

			<!-- Floating alert icon above the card -->
			<div class="relative z-10 -mb-8">
				<div class="flex h-18 w-18 items-center justify-center rounded-full border border-amber-200/60 bg-gradient-to-br from-amber-50/90 via-amber-100/80 to-amber-50/70 shadow-lg backdrop-blur-sm">
					<svg
						class="w-12 h-12 text-amber-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>
			</div>

			<!-- Main card -->
			<div class="relative w-full">
				<!-- Close button - top left -->
				<button
					type="button"
					onclick={handleClose}
					class="absolute -top-3 -left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2"
					aria-label="Close"
				>
					<X class="h-5 w-5 text-[#1F2937]" />
				</button>

				<!-- Action buttons - top right -->
				<div class="absolute -top-3 -right-3 z-10 flex flex-col gap-2">
					{#if isRetryable}
						<button
							type="button"
							onclick={handleRetry}
							disabled={!isOnline}
							class="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
							aria-label={!isOnline ? 'Retry (unavailable while offline)' : 'Retry'}
							title={!isOnline ? 'Unavailable while offline' : 'Retry'}
						>
							<RefreshCw class="h-5 w-5 text-[#1F2937]" />
						</button>
					{/if}

					<button
						type="button"
						onclick={handleDismiss}
						class="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
						aria-label="Dismiss"
						title="Dismiss"
					>
						<Trash2 class="h-5 w-5 text-gray-500" />
					</button>
				</div>

				<!-- Glassmorphic card -->
				<div class="relative rounded-2xl border border-white/40 bg-gradient-to-br from-white/90 via-white/80 to-white/70 shadow-xl backdrop-blur-xl overflow-hidden">
					<!-- Title area -->
					<div class="px-6 pt-10 pb-4 text-center">
						<h2 class="text-lg font-semibold text-gray-700">
							{isRetryable ? 'Generation Failed' : "Prompt Couldn't Be Used"}
						</h2>
					</div>

					<!-- Error message with yellow background -->
					{#if job.error}
						<div class="mx-4 mb-4 rounded-xl bg-amber-50/70 px-4 py-3">
							<p class="text-sm text-amber-700 text-center">
								{job.error}
							</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Prompt card (shared between loading and failed states) -->
		{#if job.userPrompt}
			<div class="relative w-full mt-6">
				<!-- Outer glow effect -->
				<div class="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#C91977]/20 via-[#8B5CF6]/20 to-[#C91977]/20 blur-xl"></div>

				<!-- Copy button - top right -->
				<button
					type="button"
					onclick={handleCopyPrompt}
					class="absolute -top-3 -right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2"
					aria-label={copied ? 'Copied!' : 'Copy prompt'}
				>
					{#if copied}
						<Check class="h-5 w-5 text-green-500" />
					{:else}
						<Copy class="h-5 w-5 text-[#1F2937]" />
					{/if}
				</button>

				<!-- Main glass container -->
				<div class="relative rounded-2xl border border-white/40 bg-gradient-to-br from-white/85 via-white/75 to-white/65 px-5 py-3 shadow-xl backdrop-blur-xl">
					<!-- Decorative quote icon -->
					<div class="absolute -top-3 left-4">
						<div class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#C91977] to-[#8B5CF6] shadow-md">
							<Quote class="h-3 w-3 text-white" />
						</div>
					</div>

					<!-- Subtle inner highlight -->
					<div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"></div>

					<!-- Prompt text -->
					<p class="text-center text-sm font-medium italic text-gray-700 pt-1">
						{@html highlightedPrompt}
					</p>
				</div>
			</div>
		{/if}
	</div>
</div>
