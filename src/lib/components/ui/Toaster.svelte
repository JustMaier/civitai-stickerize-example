<script lang="ts" module>
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export type ToastVariant = 'success' | 'error' | 'info';

	export interface ToastAction {
		label: string;
		onClick: () => void;
	}

	export interface ToastData {
		id: string;
		message: string;
		variant: ToastVariant;
		duration: number;
		action?: ToastAction;
	}

	/**
	 * Preview configuration for visual testing.
	 *
	 * Note: Toaster is a container component that manages multiple toasts via
	 * module-level state. It doesn't accept props - toasts are added via the
	 * exported `toast()`, `success()`, `error()`, and `info()` functions.
	 *
	 * For visual testing, use the Toast component directly which accepts props.
	 * The Toaster preview shows an empty state since it requires runtime
	 * function calls to display toasts.
	 */
	export const preview: ComponentPreview = {
		name: 'Toaster',
		description:
			'Toast container that manages multiple notifications. Use toast(), success(), error(), or info() functions to show toasts.',
		layout: 'column',
		isolate: true,
		variants: [
			{
				label: 'Empty (default state)',
				props: {},
				wrapperClass: 'h-16 flex items-center justify-center text-gray-400 text-sm italic'
			}
		]
	};

	let toasts = $state<ToastData[]>([]);

	function generateId(): string {
		return Math.random().toString(36).substring(2, 11);
	}

	export function toast(
		message: string,
		options: { variant?: ToastVariant; duration?: number; action?: ToastAction } = {}
	): string {
		const id = generateId();
		const newToast: ToastData = {
			id,
			message,
			variant: options.variant ?? 'info',
			duration: options.duration ?? 3000,
			action: options.action
		};
		toasts = [...toasts, newToast];
		return id;
	}

	/**
	 * Add a toast using object syntax
	 * Convenience function for easier migration from other toast libraries
	 */
	export function addToast(options: {
		type: ToastVariant;
		message: string;
		action?: ToastAction;
		duration?: number;
	}): string {
		return toast(options.message, {
			variant: options.type,
			duration: options.duration,
			action: options.action
		});
	}

	export function success(message: string, duration?: number): string {
		return toast(message, { variant: 'success', duration });
	}

	export function error(message: string, duration?: number): string {
		return toast(message, { variant: 'error', duration });
	}

	export function info(message: string, duration?: number): string {
		return toast(message, { variant: 'info', duration });
	}

	export function dismiss(id: string): void {
		toasts = toasts.filter((t) => t.id !== id);
	}

	export function dismissAll(): void {
		toasts = [];
	}

	export function getToasts(): ToastData[] {
		return toasts;
	}
</script>

<script lang="ts">
	const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

	function removeToast(id: string) {
		const timeout = timeouts.get(id);
		if (timeout) {
			clearTimeout(timeout);
			timeouts.delete(id);
		}
		toasts = toasts.filter((t) => t.id !== id);
	}

	function scheduleRemoval(id: string, duration: number) {
		if (duration > 0 && !timeouts.has(id)) {
			const timeout = setTimeout(() => {
				removeToast(id);
			}, duration);
			timeouts.set(id, timeout);
		}
	}

	$effect(() => {
		toasts.forEach((t) => {
			scheduleRemoval(t.id, t.duration);
		});

		return () => {
			timeouts.forEach((timeout) => clearTimeout(timeout));
			timeouts.clear();
		};
	});

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
</script>

{#if toasts.length > 0}
	<div
		class="fixed bottom-6 left-1/2 z-50 flex w-[calc(100vw-3rem)] max-w-sm -translate-x-1/2 transform flex-col-reverse gap-2"
		aria-live="polite"
		aria-label="Notifications"
	>
		{#each toasts as toastItem (toastItem.id)}
			<div
				role="alert"
				class="animate-slide-up rounded-lg px-4 py-3 shadow-lg transition-all duration-300 {variantClasses[toastItem.variant]}"
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
							d={variantIcons[toastItem.variant]}
						/>
					</svg>
					<span class="flex-1 text-sm font-medium">{toastItem.message}</span>
					{#if toastItem.action}
						<button
							type="button"
							class="flex-shrink-0 rounded px-2 py-1 text-sm font-medium underline hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
							onclick={() => {
								toastItem.action?.onClick();
								removeToast(toastItem.id);
							}}
						>
							{toastItem.action.label}
						</button>
					{/if}
					<button
						type="button"
						class="flex-shrink-0 rounded p-1 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
						onclick={() => removeToast(toastItem.id)}
						aria-label="Dismiss notification"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	@keyframes slide-up {
		from {
			transform: translateY(100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.animate-slide-up {
		animation: slide-up 0.3s ease-out forwards;
	}
</style>
