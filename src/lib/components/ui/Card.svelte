<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'Card',
		description: 'A container component with optional elevation and hover effects',
		layout: 'grid',
		variants: [
			{ label: 'Default', props: {}, slot: 'Default card with medium padding' },
			{ label: 'Elevated', props: { elevated: true }, slot: 'Elevated card with larger shadow' },
			{ label: 'Hoverable', props: { hoverable: true }, slot: 'Hover over me to see the effect' },
			{
				label: 'Elevated + Hoverable',
				props: { elevated: true, hoverable: true },
				slot: 'Elevated and hoverable card'
			},
			{ label: 'Padding: none', props: { padding: 'none' }, slot: 'No padding' },
			{ label: 'Padding: sm', props: { padding: 'sm' }, slot: 'Small padding' },
			{ label: 'Padding: md', props: { padding: 'md' }, slot: 'Medium padding (default)' },
			{ label: 'Padding: lg', props: { padding: 'lg' }, slot: 'Large padding' }
		]
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		hoverable?: boolean;
		elevated?: boolean;
		padding?: 'none' | 'sm' | 'md' | 'lg';
		children: Snippet;
	}

	let { hoverable = false, elevated = false, padding = 'md', children }: Props = $props();

	const paddingClasses: Record<string, string> = {
		none: '',
		sm: 'p-2',
		md: 'p-4',
		lg: 'p-6'
	};
</script>

<div
	class="bg-white rounded-lg {paddingClasses[padding]} {elevated
		? 'shadow-lg'
		: 'shadow-sm'} {hoverable
		? 'transition-transform duration-200 hover:-translate-y-1 hover:shadow-md'
		: ''}"
>
	{@render children()}
</div>
