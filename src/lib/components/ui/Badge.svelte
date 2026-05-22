<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'Badge',
		description: 'Small label for status, categories, or metadata',
		layout: 'row',
		variants: [
			{ label: 'Pink (Default)', props: { variant: 'pink' }, slot: 'New' },
			{ label: 'Purple', props: { variant: 'purple' }, slot: 'Pro' },
			{ label: 'Gold', props: { variant: 'gold' }, slot: 'Premium' },
			{ label: 'Pink Outline', props: { variant: 'pink', outline: true }, slot: 'New' },
			{ label: 'Purple Outline', props: { variant: 'purple', outline: true }, slot: 'Pro' },
			{ label: 'Gold Outline', props: { variant: 'gold', outline: true }, slot: 'Premium' },
			{ label: 'Small', props: { size: 'sm' }, slot: 'SM' },
			{ label: 'Medium', props: { size: 'md' }, slot: 'MD' },
			{ label: 'Large', props: { size: 'lg' }, slot: 'LG' }
		]
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'pink' | 'purple' | 'gold';
		outline?: boolean;
		size?: 'sm' | 'md' | 'lg';
		children: Snippet;
	}

	let { variant = 'pink', outline = false, size = 'md', children }: Props = $props();

	const solidClasses = {
		pink: 'bg-[#C91977] text-white',
		purple: 'bg-[#8B5CF6] text-white',
		gold: 'bg-[#F5D547] text-gray-900'
	};

	const outlineClasses = {
		pink: 'bg-transparent border-2 border-[#C91977] text-[#C91977]',
		purple: 'bg-transparent border-2 border-[#8B5CF6] text-[#8B5CF6]',
		gold: 'bg-transparent border-2 border-[#F5D547] text-[#F5D547]'
	};

	const sizeClasses = {
		sm: 'px-2 py-0.5 text-xs',
		md: 'px-3 py-1 text-sm',
		lg: 'px-4 py-1.5 text-base'
	};

	const baseClasses = 'inline-flex items-center rounded-full font-medium uppercase';

	let variantClasses = $derived(outline ? outlineClasses[variant] : solidClasses[variant]);
	let classes = $derived(`${baseClasses} ${variantClasses} ${sizeClasses[size]}`.trim());
</script>

<span class={classes}>
	{@render children()}
</span>
