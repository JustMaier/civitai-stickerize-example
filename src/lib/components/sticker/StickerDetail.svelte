<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	interface StickerDataPreview {
		sticker: {
			id: string;
			imagePath: string;
			prompt: string;
			characterIds: string[];
			createdAt: Date;
		};
		characterNames?: string[];
		isOnline?: boolean;
		onshare?: () => void;
		ondownload?: () => void;
		onregenerate?: () => void;
		ondelete?: () => void;
		onclose?: () => void;
	}

	export const preview: ComponentPreview<StickerDataPreview> = {
		name: 'StickerDetail',
		description: 'Full-screen overlay displaying a sticker with action buttons for share, download, regenerate, and delete',
		layout: 'column',
		background: 'checkered',
		isolate: true,
		variants: [
			{
				label: 'With Character Mention',
				props: {
					sticker: {
						id: 'sticker-1',
						imagePath: '/images/stickers/justin-cool.webp',
						prompt: '@Justin feeling cool today',
						characterIds: ['char-1'],
						createdAt: new Date('2024-01-15T10:30:00')
					},
					characterNames: ['Justin']
				},
				wrapperClass: 'relative h-[500px]'
			},
			{
				label: 'Without Prompt',
				props: {
					sticker: {
						id: 'sticker-2',
						imagePath: '/images/stickers/justin-fitness.webp',
						prompt: '',
						characterIds: ['char-1'],
						createdAt: new Date('2024-01-15T11:00:00')
					}
				},
				wrapperClass: 'relative h-[500px]'
			},
			{
				label: 'Long Prompt with Mentions',
				props: {
					sticker: {
						id: 'sticker-3',
						imagePath: '/images/stickers/justin-work.webp',
						prompt: '@Justin and @Sarah when you finally finish that big project and realize there are ten more waiting',
						characterIds: ['char-1', 'char-2'],
						createdAt: new Date('2024-01-15T12:00:00')
					},
					characterNames: ['Justin', 'Sarah']
				},
				wrapperClass: 'relative h-[500px]'
			},
			{
				label: 'Offline (Regenerate/Delete Disabled)',
				props: {
					sticker: {
						id: 'sticker-4',
						imagePath: '/images/stickers/justin-cool.webp',
						prompt: '@Justin offline mode test',
						characterIds: ['char-1'],
						createdAt: new Date('2024-01-15T13:00:00')
					},
					characterNames: ['Justin'],
					isOnline: false
				},
				wrapperClass: 'relative h-[500px]'
			}
		]
	};
</script>

<script lang="ts">
	import { X, Share2, Download, RefreshCw, Trash2, Quote, Copy, Check } from 'lucide-svelte';
	import { getAuthImageUrl } from '$lib/stores/auth.svelte';
	import { onMount } from 'svelte';

	interface StickerData {
		id: string;
		imagePath: string;
		prompt: string;
		characterIds: string[];
		createdAt: Date;
	}

	interface Props {
		sticker: StickerData;
		characterNames?: string[];
		isOnline?: boolean;
		onshare?: () => void;
		ondownload?: () => void;
		onregenerate?: () => void;
		ondelete?: () => void;
		onclose?: () => void;
	}

	let { sticker, characterNames = [], isOnline = true, onshare, ondownload, onregenerate, ondelete, onclose }: Props = $props();

	let copied = $state(false);

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
		if (!sticker.prompt || characterNames.length === 0) {
			return escapeHtml(sticker.prompt);
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

		while ((match = pattern.exec(sticker.prompt)) !== null) {
			if (match.index > lastIndex) {
				parts.push(escapeHtml(sticker.prompt.slice(lastIndex, match.index)));
			}
			parts.push(`<span class="text-[#C91977] font-semibold not-italic">${escapeHtml(match[1])}</span>`);
			lastIndex = pattern.lastIndex;
		}

		if (lastIndex < sticker.prompt.length) {
			parts.push(escapeHtml(sticker.prompt.slice(lastIndex)));
		}

		return parts.join('');
	});

	async function handleCopyPrompt() {
		if (!sticker.prompt) return;
		try {
			await navigator.clipboard.writeText(sticker.prompt);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Fallback for older browsers
			const textArea = document.createElement('textarea');
			textArea.value = sticker.prompt;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand('copy');
			document.body.removeChild(textArea);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		}
	}

	// Create authenticated image URL
	let authImageUrl = $derived(getAuthImageUrl(sticker.imagePath));

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

	function handleShare() {
		onshare?.();
	}

	function handleDownload() {
		ondownload?.();
	}

	function handleRegenerate() {
		onregenerate?.();
	}

	function handleDelete() {
		ondelete?.();
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
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Full-screen glassmorphic overlay -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md"
	onclick={handleBackdropClick}
	role="dialog"
	aria-modal="true"
	aria-label="Sticker detail view"
	tabindex="-1"
>
	<!-- Sticker container with floating buttons -->
	<div class="flex flex-col items-center max-w-[85vw] max-h-[85vh]">
		<!-- Image wrapper for positioning action buttons -->
		<div class="relative">
			<!-- Close button - top left of sticker -->
			<button
				type="button"
				onclick={handleClose}
				class="absolute -top-3 -left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2"
				aria-label="Close sticker detail"
			>
				<X class="h-5 w-5 text-[#1F2937]" />
			</button>

			<!-- Action buttons - top right of sticker, vertical cluster -->
			<div class="absolute -top-3 -right-3 z-10 flex flex-col gap-2">
				<button
					type="button"
					onclick={handleShare}
					class="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2"
					aria-label="Share sticker"
				>
					<Share2 class="h-5 w-5 text-[#1F2937]" />
				</button>

				<button
					type="button"
					onclick={handleDownload}
					class="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2"
					aria-label="Download sticker"
				>
					<Download class="h-5 w-5 text-[#1F2937]" />
				</button>

				<button
					type="button"
					onclick={handleRegenerate}
					disabled={!isOnline}
					class="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
					aria-label={!isOnline ? 'Regenerate sticker (unavailable while offline)' : 'Regenerate sticker'}
					title={!isOnline ? 'Unavailable while offline' : undefined}
				>
					<RefreshCw class="h-5 w-5 text-[#1F2937]" />
				</button>

				<button
					type="button"
					onclick={handleDelete}
					disabled={!isOnline}
					class="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
					aria-label={!isOnline ? 'Delete sticker (unavailable while offline)' : 'Delete sticker'}
					title={!isOnline ? 'Unavailable while offline' : undefined}
				>
					<Trash2 class="h-5 w-5 text-red-500" />
				</button>
			</div>

			<!-- Sticker image - no card wrapper, transparent PNG display -->
			<img
				src={authImageUrl}
				alt="Sticker"
				class="max-w-full max-h-[60vh] w-auto h-auto object-contain drop-shadow-2xl"
			/>
		</div>

		<!-- Prompt caption in premium glassmorphic container -->
		{#if sticker.prompt}
			<div class="relative w-[340px] max-w-[90vw] mt-6">
				<!-- Outer glow effect -->
				<div class="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#C91977]/20 via-[#8B5CF6]/20 to-[#C91977]/20 blur-xl"></div>

				<!-- Copy button - top right of prompt box -->
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
