<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'Input',
		description: 'Text input field with label, validation, and size options',
		layout: 'column',
		variants: [
			{ label: 'Default', props: { label: 'Email', placeholder: 'Enter your email' } },
			{ label: 'Small', props: { label: 'Username', placeholder: 'Enter username', size: 'sm' } },
			{ label: 'Medium', props: { label: 'Username', placeholder: 'Enter username', size: 'md' } },
			{ label: 'Large', props: { label: 'Username', placeholder: 'Enter username', size: 'lg' } },
			{ label: 'Required', props: { label: 'Email', placeholder: 'Required field', required: true } },
			{ label: 'With Error', props: { label: 'Email', placeholder: 'Enter email', error: 'Invalid email address' } },
			{ label: 'Disabled', props: { label: 'Email', placeholder: 'Cannot edit', disabled: true } },
			{ label: 'Password with Toggle', props: { label: 'Password', type: 'password', placeholder: 'Enter password', showPasswordToggle: true } }
		]
	};
</script>

<script lang="ts">
	import { Eye, EyeOff } from 'lucide-svelte';

	// Fallback for environments where crypto.randomUUID isn't available
	function generateId(): string {
		if (typeof crypto !== 'undefined' && crypto.randomUUID) {
			return crypto.randomUUID();
		}
		// Simple fallback using Math.random
		return 'id-' + Math.random().toString(36).slice(2, 11);
	}

	interface Props {
		label: string;
		type?: 'text' | 'email' | 'password';
		placeholder?: string;
		value?: string;
		error?: string;
		disabled?: boolean;
		required?: boolean;
		showPasswordToggle?: boolean;
		size?: 'sm' | 'md' | 'lg';
		id?: string;
		autofocus?: boolean;
	}

	let {
		label,
		type = 'text',
		placeholder = '',
		value = $bindable(''),
		error = '',
		disabled = false,
		required = false,
		showPasswordToggle = false,
		size = 'md',
		id = generateId(),
		autofocus = false
	}: Props = $props();

	const sizeClasses = {
		sm: 'px-3 py-2 text-sm',
		md: 'px-4 py-3 text-base',
		lg: 'px-5 py-4 text-lg'
	} as const;

	let showPassword = $state(false);

	const inputType = $derived(
		type === 'password' && showPassword ? 'text' : type
	);

	function togglePasswordVisibility() {
		showPassword = !showPassword;
	}
</script>

<div class="flex flex-col gap-1.5">
	<label for={id} class="text-xs font-medium uppercase tracking-wide text-gray-500">
		{label}
		{#if required}
			<span class="text-pink-500">*</span>
		{/if}
	</label>

	<div class="relative">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			{id}
			type={inputType}
			bind:value
			{placeholder}
			{disabled}
			{required}
			autofocus={autofocus}
			class="w-full rounded-lg border bg-white text-gray-800 transition-all duration-200
				{sizeClasses[size]}
				placeholder:text-gray-400
				focus:outline-none focus:ring-2 focus:ring-pink-500/20
				disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400
				{error ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-pink-500'}
				{type === 'password' && showPasswordToggle ? 'pr-12' : ''}"
		/>

		{#if type === 'password' && showPasswordToggle}
			<button
				type="button"
				onclick={togglePasswordVisibility}
				{disabled}
				class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors
					hover:text-gray-600 focus:outline-none focus:text-pink-500
					disabled:cursor-not-allowed disabled:hover:text-gray-400"
				aria-label={showPassword ? 'Hide password' : 'Show password'}
			>
				{#if showPassword}
					<EyeOff class="h-5 w-5" />
				{:else}
					<Eye class="h-5 w-5" />
				{/if}
			</button>
		{/if}
	</div>

	{#if error}
		<p class="text-sm text-red-500">{error}</p>
	{/if}
</div>
