<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'BottomSheet',
		description: 'Modal sheet that slides up from the bottom of the screen',
		layout: 'grid',
		background: 'dark',
		isolate: true,
		variants: [
			{
				label: 'With Title',
				props: { open: true, title: 'Select Option' },
				slot: 'This is the sheet content with a title header.'
			},
			{
				label: 'Without Title',
				props: { open: true },
				slot: 'This sheet has no title, just content.'
			},
			{
				label: 'Short Content',
				props: { open: true, title: 'Quick Action' },
				slot: 'Brief message.'
			},
			{
				label: 'Long Scrollable Content',
				props: { open: true, title: 'Terms of Service' },
				slot: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.'
			},
			{
				label: 'Closed State',
				props: { open: false, title: 'Hidden Sheet' },
				slot: 'This content is not visible when closed.'
			}
		]
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly, fade } from 'svelte/transition';

	interface Props {
		open: boolean;
		title?: string;
		onclose?: () => void;
		children?: Snippet;
	}

	let { open = $bindable(false), title, onclose, children }: Props = $props();

	function handleBackdropClick() {
		open = false;
		onclose?.();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
			onclose?.();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<button
		type="button"
		class="fixed inset-0 z-40 bg-black/50 cursor-default"
		onclick={handleBackdropClick}
		aria-label="Close bottom sheet"
		transition:fade={{ duration: 200 }}
	></button>

	<!-- Sheet -->
	<div
		class="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl bg-white"
		role="dialog"
		aria-modal="true"
		aria-labelledby={title ? 'bottom-sheet-title' : undefined}
		transition:fly={{ y: 300, duration: 300 }}
	>
		<!-- Drag handle -->
		<div class="flex justify-center py-3">
			<div class="h-1 w-10 rounded-full bg-gray-300"></div>
		</div>

		<!-- Title -->
		{#if title}
			<h2 id="bottom-sheet-title" class="px-4 pb-2 text-lg font-semibold text-gray-900">
				{title}
			</h2>
		{/if}

		<!-- Content -->
		<div class="flex-1 overflow-y-auto px-4 pb-6">
			{@render children?.()}
		</div>
	</div>
{/if}
