<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'PageHeader',
		description: 'Sticky header with title, optional back button, and action slot',
		layout: 'column',
		variants: [
			{
				label: 'Default (with back button)',
				props: { title: 'Page Title' }
			},
			{
				label: 'Without back button',
				props: { title: 'Home', showBack: false }
			},
			{
				label: 'Long title',
				props: { title: 'This Is A Very Long Page Title That Might Overflow' }
			},
			{
				label: 'Short title',
				props: { title: 'Edit' }
			}
		],
		containerClass: 'w-full max-w-md'
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronLeft } from 'lucide-svelte';

	interface Props {
		title: string;
		showBack?: boolean;
		onback?: () => void;
		children?: Snippet;
	}

	let { title, showBack = true, onback, children }: Props = $props();

	function handleBack() {
		if (onback) {
			onback();
		} else {
			history.back();
		}
	}
</script>

<header
	class="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4"
>
	<!-- Left: Back button or spacer -->
	<div class="flex w-10 items-center justify-start">
		{#if showBack}
			<button
				type="button"
				onclick={handleBack}
				class="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2"
				aria-label="Go back"
			>
				<ChevronLeft class="h-6 w-6" />
			</button>
		{/if}
	</div>

	<!-- Center: Title -->
	<h1 class="flex-1 text-center text-lg font-semibold text-gray-900">
		{title}
	</h1>

	<!-- Right: Action slot or spacer -->
	<div class="flex w-10 items-center justify-end">
		{@render children?.()}
	</div>
</header>
