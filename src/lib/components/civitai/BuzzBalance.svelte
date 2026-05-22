<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'BuzzBalance',
		description: 'Civitai Buzz balance pill with rolling-number animation and floating deduction badge',
		layout: 'column',
		variants: [
			{
				label: 'Connected, normal',
				props: { mockBalance: 12450 }
			},
			{
				label: 'Connected, zero',
				props: { mockBalance: 0 }
			},
			{
				label: 'Connected, six figures',
				props: { mockBalance: 248_392 }
			},
			{
				label: 'Disconnected (hidden)',
				props: { mockConnected: false }
			}
		]
	};
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { authFetch } from '$lib/utils/api';

	interface Props {
		/** Bindable refetch hook — parent calls this after a job completes. */
		refetch?: () => void;
		/** Visual-test escape hatch — skips the network fetch and uses this value. */
		mockBalance?: number;
		/** Visual-test escape hatch — overrides the connected flag. */
		mockConnected?: boolean;
	}

	let { refetch = $bindable(() => {}), mockBalance, mockConnected }: Props = $props();

	let connected = $state<boolean | null>(null);
	let balance = $state<number | null>(null);
	let loading = $state(false);

	// Tweened number for the rolling-digit effect.
	const display = tweened(0, { duration: 800, easing: cubicOut });

	// Transient deltas shown floating above the pill when balance drops.
	let deltas = $state<Array<{ id: number; amount: number }>>([]);
	let nextDeltaId = 0;

	async function fetchBalance(): Promise<void> {
		if (mockBalance !== undefined) return;
		loading = true;
		try {
			const res = await authFetch('/api/civitai/buzz');
			if (!res.ok) {
				connected = false;
				return;
			}
			const data: { connected: boolean; balance: number | null } = await res.json();
			connected = data.connected;
			updateBalance(data.balance);
		} catch (error) {
			console.error('[BuzzBalance] fetch failed:', error);
			connected = false;
		} finally {
			loading = false;
		}
	}

	function updateBalance(next: number | null): void {
		if (next === null) {
			balance = null;
			return;
		}
		const prev = balance;
		balance = next;
		if (prev !== null && next < prev) {
			const id = nextDeltaId++;
			deltas = [...deltas, { id, amount: prev - next }];
			setTimeout(() => {
				deltas = deltas.filter(d => d.id !== id);
			}, 1500);
		}
		display.set(next);
	}

	onMount(() => {
		if (mockBalance !== undefined) {
			connected = mockConnected ?? true;
			balance = mockBalance;
			display.set(mockBalance, { duration: 0 });
			return;
		}
		fetchBalance();
	});

	refetch = fetchBalance;

	const formatted = $derived(Math.round($display).toLocaleString());
	const visible = $derived(connected === true && balance !== null);
</script>

{#if visible}
	<div class="relative inline-flex items-center">
		<div
			class="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 shadow-sm transition-opacity"
			class:opacity-60={loading}
			title="Civitai Buzz balance"
			aria-label={`Civitai Buzz balance: ${formatted}`}
		>
			<span aria-hidden="true" class="text-amber-500">⚡</span>
			<span class="tabular-nums">{formatted}</span>
		</div>

		{#each deltas as delta (delta.id)}
			<span
				class="pointer-events-none absolute -top-1 right-2 text-xs font-bold text-rose-600 tabular-nums"
				in:fly={{ y: 0, duration: 150 }}
				out:fly={{ y: -24, duration: 1200 }}
			>
				−{delta.amount.toLocaleString()}
			</span>
		{/each}
	</div>
{/if}
