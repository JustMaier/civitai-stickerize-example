<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'Toast',
		description: 'Notification toast with auto-dismiss and manual close functionality',
		layout: 'column',
		isolate: true,
		variants: [
			{
				label: 'Info (default)',
				props: { message: 'This is an informational message', variant: 'info', duration: 999999 }
			},
			{
				label: 'Success',
				props: { message: 'Operation completed successfully!', variant: 'success', duration: 999999 }
			},
			{
				label: 'Error',
				props: { message: 'Something went wrong. Please try again.', variant: 'error', duration: 999999 }
			},
			{
				label: 'Long message',
				props: {
					message: 'This is a longer notification message that demonstrates how the toast handles extended content',
					variant: 'info',
					duration: 999999
				}
			}
		]
	};
</script>

<script lang="ts">
	interface Props {
		message: string;
		variant?: 'success' | 'error' | 'info';
		duration?: number;
		onclose?: () => void;
	}

	let {
		message,
		variant = 'info',
		duration = 3000,
		onclose
	}: Props = $props();

	let visible = $state(true);
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const variantClasses = {
		success: 'bg-green-600 text-white',
		error: 'bg-red-600 text-white',
		info: 'bg-blue-600 text-white'
	};

	const variantIcons = {
		success: 'M5 13l4 4L19 7',
		error: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
		info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
	};

	function dismiss() {
		visible = false;
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		onclose?.();
	}

	$effect(() => {
		if (duration > 0) {
			timeoutId = setTimeout(() => {
				dismiss();
			}, duration);
		}

		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	});
</script>

{#if visible}
	<div
		role="alert"
		aria-live="polite"
		class="fixed bottom-6 left-1/2 z-50 w-[calc(100vw-3rem)] max-w-sm -translate-x-1/2 transform animate-slide-up rounded-lg px-4 py-3 shadow-lg transition-all duration-300 {variantClasses[variant]}"
	>
		<div class="flex items-center gap-3">
			<svg
				class="h-5 w-5 flex-shrink-0"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d={variantIcons[variant]}
				/>
			</svg>
			<span class="flex-1 text-sm font-medium">{message}</span>
			<button
				type="button"
				class="flex-shrink-0 rounded p-1 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
				onclick={dismiss}
				aria-label="Dismiss notification"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	</div>
{/if}

<style>
	@keyframes slide-up {
		from {
			transform: translate(-50%, 100%);
			opacity: 0;
		}
		to {
			transform: translate(-50%, 0);
			opacity: 1;
		}
	}

	.animate-slide-up {
		animation: slide-up 0.3s ease-out forwards;
	}
</style>
