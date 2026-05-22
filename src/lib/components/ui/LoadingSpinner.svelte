<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'LoadingSpinner',
		description: 'Animated loading spinner with rotating ring and orbiting sparkle',
		layout: 'grid',
		variants: [
			{ label: 'Default (Pink)', props: {} },
			{ label: 'Purple', props: { color: 'purple' } },
			{ label: 'Gold', props: { color: 'gold' } },
			{ label: 'White', props: { color: 'white' }, wrapperClass: 'bg-gray-800 p-4 rounded-lg' },
			{ label: 'Small', props: { size: 'sm' } },
			{ label: 'Medium', props: { size: 'md' } },
			{ label: 'Large', props: { size: 'lg' } },
			{ label: 'No Message', props: { showMessage: false } },
			{ label: 'White Large', props: { color: 'white', size: 'lg' }, wrapperClass: 'bg-gray-800 p-4 rounded-lg' }
		]
	};
</script>

<script lang="ts">
	interface Props {
		size?: 'sm' | 'md' | 'lg';
		color?: 'pink' | 'purple' | 'gold' | 'white';
		showMessage?: boolean;
		messages?: string[];
	}

	const defaultMessages = [
		'Capturing your essence...',
		'Adding extra sparkle...',
		'Teaching pixels to dance...',
		'Consulting the meme gods...',
		'Almost there, legend...',
		'Warming up the creativity engine...',
		'Channeling your inner meme lord...',
		'Sprinkling some pixel dust...'
	];

	let {
		size = 'md',
		color = 'pink',
		showMessage = true,
		messages = defaultMessages
	}: Props = $props();

	let currentMessageIndex = $state(0);

	const sizeClasses = {
		sm: 'w-8 h-8',
		md: 'w-12 h-12',
		lg: 'w-16 h-16'
	};

	const textSizeClasses = {
		sm: 'text-sm',
		md: 'text-base',
		lg: 'text-lg'
	};

	const colorConfig = {
		pink: {
			gradientFrom: '#C91977',
			gradientTo: '#8B5CF6',
			sparkle: '#F5D547',
			sparkleShadow: 'shadow-yellow-400/50'
		},
		purple: {
			gradientFrom: '#8B5CF6',
			gradientTo: '#6366F1',
			sparkle: '#C91977',
			sparkleShadow: 'shadow-pink-400/50'
		},
		gold: {
			gradientFrom: '#F5D547',
			gradientTo: '#F59E0B',
			sparkle: '#C91977',
			sparkleShadow: 'shadow-pink-400/50'
		},
		white: {
			gradientFrom: '#FFFFFF',
			gradientTo: '#E5E7EB',
			sparkle: '#F5D547',
			sparkleShadow: 'shadow-yellow-400/50'
		}
	};

	const currentColor = $derived(colorConfig[color]);

	$effect(() => {
		if (!showMessage || messages.length === 0) return;

		const interval = setInterval(() => {
			currentMessageIndex = (currentMessageIndex + 1) % messages.length;
		}, 2500);

		return () => clearInterval(interval);
	});
</script>

<div class="flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
	<div class="relative {sizeClasses[size]}">
		<!-- Outer spinning ring with gradient -->
		<div
			class="absolute inset-0 rounded-full border-4 border-transparent animate-spin-slow"
			style="background: linear-gradient(to right, {currentColor.gradientFrom}, {currentColor.gradientTo}); mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0); mask-composite: exclude; -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor;"
		></div>

		<!-- Inner pulsing dot -->
		<div
			class="absolute inset-2 rounded-full animate-pulse-glow"
			style="background: linear-gradient(to bottom right, {currentColor.gradientFrom}, {currentColor.gradientTo});"
		></div>

		<!-- Orbiting sparkle -->
		<div class="absolute inset-0 animate-orbit">
			<div
				class="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full shadow-lg {currentColor.sparkleShadow}"
				style="background-color: {currentColor.sparkle};"
			></div>
		</div>
	</div>

	{#if showMessage && messages.length > 0}
		<p
			class="text-[#4B5563] {textSizeClasses[size]} font-medium text-center animate-fade-in-out"
			aria-label="Loading status"
		>
			{messages[currentMessageIndex]}
		</p>
	{/if}

	<span class="sr-only">Loading</span>
</div>

<style>
	@keyframes spin-slow {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes pulse-glow {
		0%,
		100% {
			opacity: 0.6;
			transform: scale(0.85);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}

	@keyframes orbit {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes fade-in-out {
		0% {
			opacity: 0;
			transform: translateY(4px);
		}
		15% {
			opacity: 1;
			transform: translateY(0);
		}
		85% {
			opacity: 1;
			transform: translateY(0);
		}
		100% {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	.animate-spin-slow {
		animation: spin-slow 1.5s linear infinite;
	}

	.animate-pulse-glow {
		animation: pulse-glow 2s ease-in-out infinite;
	}

	.animate-orbit {
		animation: orbit 2s linear infinite;
	}

	.animate-fade-in-out {
		animation: fade-in-out 2.5s ease-in-out infinite;
	}
</style>
