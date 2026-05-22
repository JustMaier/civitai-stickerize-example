<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'Button',
		description: 'Primary action button with multiple variants',
		layout: 'row',
		variants: [
			{ label: 'Primary', props: { variant: 'primary' }, slot: 'Primary' },
			{ label: 'Secondary', props: { variant: 'secondary' }, slot: 'Secondary' },
			{ label: 'Outlined', props: { variant: 'outlined' }, slot: 'Outlined' },
			{ label: 'Disabled', props: { variant: 'primary', disabled: true }, slot: 'Disabled' },
			{ label: 'Full Width', props: { variant: 'primary', fullWidth: true }, slot: 'Full Width', wrapperClass: 'w-full' },
		]
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'outlined';
		disabled?: boolean;
		type?: 'button' | 'submit';
		fullWidth?: boolean;
		children: Snippet;
	}

	let {
		variant = 'primary',
		disabled = false,
		type = 'button',
		fullWidth = false,
		children,
		onclick,
		class: className = '',
		...restProps
	}: Props = $props();

	const baseClasses =
		'inline-flex items-center justify-center rounded-full px-6 py-3 min-h-11 font-semibold text-base transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

	const variantClasses = {
		primary:
			'bg-gradient-to-r from-[#C91977] to-[#A91566] text-white shadow-lg hover:shadow-xl hover:scale-[1.02] focus:ring-[#C91977]',
		secondary:
			'bg-white text-[#C91977] border-2 border-[#C91977] hover:bg-pink-50 focus:ring-[#C91977]',
		outlined:
			'bg-transparent text-[#C91977] border-2 border-[#C91977] hover:bg-pink-50 focus:ring-[#C91977]'
	};

	let computedClasses = $derived(
		[baseClasses, variantClasses[variant], fullWidth ? 'w-full' : '', className]
			.filter(Boolean)
			.join(' ')
	);
</script>

<button {type} {disabled} class={computedClasses} {onclick} {...restProps}>
	{@render children()}
</button>
