<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	const sampleStickers = [
		{ id: '1', imagePath: '/images/stickers/justin.webp', prompt: 'Justin waving hello' },
		{ id: '2', imagePath: '/images/stickers/justin-cool.webp', prompt: 'Justin looking cool' },
		{ id: '3', imagePath: '/images/stickers/justin-fitness.webp', prompt: 'Justin working out' },
		{ id: '4', imagePath: '/images/stickers/justin-work.webp', prompt: 'Justin at work' }
	];

	const sampleJobs = [
		{ id: 'job-1', status: 'queued' as const, userPrompt: '@Justin waving hello', error: null },
		{ id: 'job-2', status: 'processing' as const, userPrompt: '@Justin doing a flip', error: null },
		{ id: 'job-3', status: 'failed' as const, userPrompt: '@Justin inappropriate', error: 'Content violated guidelines' }
	];

	// Helper to create feed items for preview
	const toStickerItem = (s: typeof sampleStickers[0]) => ({ type: 'sticker' as const, id: s.id, sticker: s });
	const toJobItem = (j: typeof sampleJobs[0]) => ({ type: 'job' as const, id: j.id, job: j });

	export const preview: ComponentPreview = {
		name: 'StickerGrid',
		description: 'Grid display for stickers with pull-to-refresh and infinite scroll support',
		layout: 'column',
		containerClass: 'h-96',
		variants: [
			{
				label: 'Empty State',
				props: {
					items: []
				},
				wrapperClass: 'h-80'
			},
			{
				label: 'With Stickers',
				props: {
					items: sampleStickers.slice(0, 4).map(toStickerItem)
				},
				wrapperClass: 'h-80'
			},
			{
				label: 'Loading Jobs Only',
				props: {
					items: sampleJobs.slice(0, 2).map(toJobItem)
				},
				wrapperClass: 'h-80'
			},
			{
				label: 'Mixed (Jobs then Stickers)',
				props: {
					items: [
						...sampleJobs.slice(0, 2).map(toJobItem),
						...sampleStickers.slice(0, 2).map(toStickerItem)
					]
				},
				wrapperClass: 'h-80'
			},
			{
				label: 'With Failed Job',
				props: {
					items: [
						toJobItem(sampleJobs[2]),
						...sampleStickers.slice(0, 2).map(toStickerItem)
					]
				},
				wrapperClass: 'h-80'
			},
			{
				label: 'Many Stickers (Grid Layout)',
				props: {
					items: sampleStickers.map(toStickerItem)
				},
				wrapperClass: 'h-96'
			}
		]
	};
</script>

<script lang="ts">
	import StickerTile from './StickerTile.svelte';

	interface Sticker {
		id: string;
		imagePath: string;
		prompt: string;
	}

	interface Job {
		id: string;
		status: 'queued' | 'processing' | 'failed';
		userPrompt: string;
		error: string | null;
		isRetryable?: boolean | null;
	}

	type FeedItem =
		| { type: 'sticker'; id: string; sticker: Sticker; createdAt?: Date }
		| { type: 'job'; id: string; job: Job; createdAt?: Date };

	interface Props {
		items: FeedItem[];
		onselect?: (sticker: Sticker) => void;
		onjobclick?: (job: Job) => void;
		onloadmore?: () => void;
		onrefresh?: () => Promise<void>;
	}

	let {
		items = [],
		onselect,
		onjobclick,
		onloadmore,
		onrefresh
	}: Props = $props();

	// Pull to refresh state
	let pullDistance = $state(0);
	let isPulling = $state(false);
	let isRefreshing = $state(false);
	let startY = $state(0);
	let containerElement: HTMLDivElement | null = $state(null);

	const PULL_THRESHOLD = 80;
	const MAX_PULL_DISTANCE = 120;

	// ResizeObserver for cleanup
	let resizeObserver: ResizeObserver | null = null;

	// Virtualization state
	let scrollTop = $state(0);
	let containerHeight = $state(0);

	// Constants for virtualization (2 columns, gap, padding)
	const ITEM_HEIGHT = 180; // Approximate height of a tile including gap
	const BUFFER_ITEMS = 4; // Number of extra items to render above/below viewport
	const COLUMNS = 2;

	// Items are already sorted by the parent component
	const allItems = $derived(items);

	// Calculate visible range based on scroll position
	const virtualState = $derived.by(() => {
		const totalItems = allItems.length;
		if (totalItems === 0) {
			return { visibleItems: [], startIndex: 0, totalHeight: 0, offsetY: 0 };
		}

		const rowHeight = ITEM_HEIGHT;
		const totalRows = Math.ceil(totalItems / COLUMNS);
		const totalHeight = totalRows * rowHeight;

		// Calculate visible rows
		const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_ITEMS);
		const endRow = Math.min(
			totalRows,
			Math.ceil((scrollTop + containerHeight) / rowHeight) + BUFFER_ITEMS
		);

		// Calculate visible item indices
		const startIndex = startRow * COLUMNS;
		const endIndex = Math.min(totalItems, endRow * COLUMNS);

		const visibleItems = allItems.slice(startIndex, endIndex);
		const offsetY = startRow * rowHeight;

		return { visibleItems, startIndex, totalHeight, offsetY };
	});

	function handleTouchStart(event: TouchEvent) {
		if (!containerElement || containerElement.scrollTop > 0 || isRefreshing) return;
		startY = event.touches[0].clientY;
		isPulling = true;
	}

	function handleTouchMove(event: TouchEvent) {
		if (!isPulling || isRefreshing) return;

		const currentY = event.touches[0].clientY;
		const diff = currentY - startY;

		if (diff > 0) {
			// Apply resistance to pull
			pullDistance = Math.min(diff * 0.5, MAX_PULL_DISTANCE);
		}
	}

	async function handleTouchEnd() {
		if (!isPulling) return;
		isPulling = false;

		if (pullDistance >= PULL_THRESHOLD && onrefresh) {
			isRefreshing = true;
			try {
				await onrefresh();
			} finally {
				isRefreshing = false;
			}
		}

		pullDistance = 0;
	}

	// Infinite scroll detection and virtualization scroll tracking
	function handleScroll(event: Event) {
		const target = event.target as HTMLElement;

		// Update virtualization state
		scrollTop = target.scrollTop;
		containerHeight = target.clientHeight;

		const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

		// Trigger load more when within 200px of bottom
		if (scrollBottom < 200 && onloadmore) {
			onloadmore();
		}
	}

	// Initialize container dimensions
	$effect(() => {
		if (containerElement) {
			// Clean up existing observer first
			if (resizeObserver) {
				resizeObserver.disconnect();
			}

			containerHeight = containerElement.clientHeight;

			// Update on resize
			resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					containerHeight = entry.contentRect.height;
				}
			});
			resizeObserver.observe(containerElement);

			return () => {
				if (resizeObserver) {
					resizeObserver.disconnect();
					resizeObserver = null;
				}
			};
		}
	});

	function handleStickerSelect(sticker: Sticker) {
		onselect?.(sticker);
	}
</script>

<div
	bind:this={containerElement}
	class="relative flex-1 overflow-y-auto overscroll-contain"
	onscroll={handleScroll}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	role="region"
	aria-label="Sticker feed"
>
	<!-- Pull to refresh indicator -->
	{#if (pullDistance > 0 || isRefreshing) && onrefresh}
		<div
			class="flex items-center justify-center transition-all duration-200"
			style="height: {isRefreshing ? PULL_THRESHOLD : pullDistance}px;"
		>
			<div class="flex flex-col items-center gap-1">
				{#if isRefreshing}
					<div class="w-6 h-6 border-2 border-[#C91977] border-t-transparent rounded-full animate-spin"></div>
					<span class="text-xs text-[#4B5563] font-medium">Refreshing...</span>
				{:else if pullDistance >= PULL_THRESHOLD}
					<svg
						class="w-6 h-6 text-[#C91977] transition-transform"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
					</svg>
					<span class="text-xs text-[#C91977] font-medium">Release to refresh</span>
				{:else}
					<svg
						class="w-6 h-6 text-[#4B5563] transition-transform"
						style="transform: rotate({(pullDistance / PULL_THRESHOLD) * 180}deg)"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
					</svg>
					<span class="text-xs text-[#4B5563] font-medium">Pull to refresh</span>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Virtualized grid container -->
	<div class="relative" style="height: {virtualState.totalHeight}px; min-height: 100%;">
		<!-- Positioned grid that moves with scroll -->
		<div
			class="absolute left-0 right-0 grid grid-cols-2 gap-3 p-4"
			style="transform: translateY({virtualState.offsetY}px);"
		>
			{#each virtualState.visibleItems as item (item.id)}
				{#if item.type === 'job'}
					<StickerTile
						sticker={null}
						status={item.job.status === 'failed' ? 'failed' : 'loading'}
						isRetryable={item.job.isRetryable ?? true}
						onclick={() => onjobclick?.(item.job)}
					/>
				{:else if item.type === 'sticker'}
					<StickerTile
						sticker={item.sticker}
						status="complete"
						onclick={() => handleStickerSelect(item.sticker)}
					/>
				{/if}
			{/each}
		</div>
	</div>

	<!-- Empty state (no items) -->
	{#if items.length === 0}
		<div class="flex flex-col items-center justify-center py-12 px-6 text-center">
			<div class="w-16 h-16 mb-4 rounded-full bg-gradient-to-br from-[#FDF2F8] to-[#F5D5E9] flex items-center justify-center">
				<svg
					class="w-8 h-8 text-[#C91977]"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
				</svg>
			</div>
			<h3 class="text-lg font-semibold text-[#1F2937] mb-2">Your sticker feed is empty</h3>
			<p class="text-sm text-[#4B5563] max-w-xs">
				Make your first meme! Type @character followed by what you'd like them to do.
			</p>
		</div>
	{/if}
</div>
