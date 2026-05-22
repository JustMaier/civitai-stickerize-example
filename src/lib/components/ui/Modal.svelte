<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'Modal',
		description: 'Dialog overlay with backdrop blur, title, and close functionality',
		layout: 'column',
		background: 'checkered',
		isolate: true,
		variants: [
			{
				label: 'With Title',
				props: { open: true, title: 'Confirm Action' },
				slot: 'Are you sure you want to proceed with this action?'
			},
			{
				label: 'Without Title',
				props: { open: true },
				slot: 'This modal has no title, just content.'
			},
			{
				label: 'Long Content',
				props: { open: true, title: 'Terms and Conditions' },
				slot: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
			},
			{
				label: 'Closed (default)',
				props: { open: false, title: 'Hidden Modal' },
				slot: 'This content is not visible when closed.'
			}
		]
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		open?: boolean;
		title?: string;
		onclose?: () => void;
		children?: Snippet;
	}

	let { open = $bindable(false), title, onclose, children }: Props = $props();

	// Prevent body scroll when modal is open
	$effect(() => {
		if (open) {
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
		}
	});

	function close() {
		open = false;
		onclose?.();
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			close();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			close();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		onclick={handleBackdropClick}
		onkeydown={(e) => e.key === 'Escape' && close()}
		role="dialog"
		aria-modal="true"
		aria-labelledby={title ? 'modal-title' : undefined}
		tabindex="-1"
		transition:fade={{ duration: 200 }}
	>
		<!-- Backdrop blur overlay -->
		<div class="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true"></div>

		<!-- Modal panel -->
		<div
			class="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-white/95 shadow-xl backdrop-blur-md"
			transition:scale={{ duration: 200, start: 0.95 }}
		>
			<!-- Header with close button -->
			<div class="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
				{#if title}
					<h2 id="modal-title" class="text-lg font-semibold text-gray-900">
						{title}
					</h2>
				{:else}
					<div></div>
				{/if}
				<button
					type="button"
					class="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
					onclick={close}
					aria-label="Close modal"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content - scrollable -->
			<div class="flex-1 overflow-y-auto overscroll-contain px-6 py-4 text-gray-700">
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
