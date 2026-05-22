<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'Avatar',
		description: 'User avatar with optional status indicator',
		layout: 'row',
		variants: [
			{ label: 'Small', props: { src: '', alt: 'User', size: 'sm', fallback: 'JD' } },
			{ label: 'Medium', props: { src: '', alt: 'User', size: 'md', fallback: 'JD' } },
			{ label: 'Large', props: { src: '', alt: 'User', size: 'lg', fallback: 'JD' } },
			{ label: 'Online', props: { src: '', alt: 'User', size: 'md', fallback: 'JD', status: 'online' } },
			{ label: 'Offline', props: { src: '', alt: 'User', size: 'md', fallback: 'JD', status: 'offline' } },
			{ label: 'Away', props: { src: '', alt: 'User', size: 'md', fallback: 'JD', status: 'away' } },
			{ label: 'Large Online', props: { src: '', alt: 'User', size: 'lg', fallback: 'AB', status: 'online' } }
		]
	};
</script>

<script lang="ts">
	import { getAuthImageUrl } from '$lib/stores/auth.svelte';

	interface Props {
		src: string;
		alt: string;
		size?: 'sm' | 'md' | 'lg';
		fallback: string;
		status?: 'online' | 'offline' | 'away';
	}

	let { src, alt, size = 'md', fallback, status }: Props = $props();

	let errorForSrc = $state<string | null>(null);

	const sizeClasses = {
		sm: 'w-8 h-8 text-xs',
		md: 'w-12 h-12 text-sm',
		lg: 'w-16 h-16 text-base'
	} as const;

	const statusColors = {
		online: 'bg-green-500',
		offline: 'bg-gray-400',
		away: 'bg-yellow-500'
	} as const;

	const statusDotSizes = {
		sm: 'w-2 h-2 border',
		md: 'w-3 h-3 border-2',
		lg: 'w-4 h-4 border-2'
	} as const;

	// Create authenticated image URL for API images
	let authSrc = $derived(getAuthImageUrl(src));
	let showImage = $derived(src && errorForSrc !== src);

	function handleError() {
		errorForSrc = src;
	}
</script>

<div
	class="relative inline-flex items-center justify-center rounded-full border border-gray-200 bg-pink-100 overflow-hidden {sizeClasses[size]}"
>
	{#if showImage}
		<img
			src={authSrc}
			{alt}
			class="w-full h-full object-cover"
			onerror={handleError}
		/>
	{:else}
		<span class="font-semibold text-pink-600 uppercase select-none">
			{fallback}
		</span>
	{/if}
	{#if status}
		<span
			class="absolute bottom-0 right-0 rounded-full border-white {statusColors[status]} {statusDotSizes[size]}"
			aria-label="{status} status"
		></span>
	{/if}
</div>
