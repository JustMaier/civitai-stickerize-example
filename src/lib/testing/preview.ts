import type { Component } from 'svelte';

/**
 * Defines a single variant/state of a component for visual testing.
 */
export interface PreviewVariant<TProps = Record<string, unknown>> {
	/** Human-readable label for this variant */
	label: string;
	/** Props to pass to the component */
	props?: Partial<TProps>;
	/** Text content to render as children (for components with slots) */
	slot?: string;
	/** Additional wrapper classes for this variant */
	wrapperClass?: string;
}

/**
 * Preview configuration embedded in a component's <script module> block.
 *
 * @example
 * ```svelte
 * <script module>
 *   export const preview: ComponentPreview = {
 *     name: 'Button',
 *     variants: [
 *       { label: 'Primary', props: { variant: 'primary' }, slot: 'Click me' },
 *       { label: 'Disabled', props: { disabled: true }, slot: 'Disabled' },
 *     ]
 *   };
 * </script>
 * ```
 */
export interface ComponentPreview<TProps = Record<string, unknown>> {
	/** Display name for the component */
	name: string;
	/** Description of the component's purpose */
	description?: string;
	/** List of variants/states to render */
	variants: PreviewVariant<TProps>[];
	/**
	 * Layout for variants:
	 * - 'row': horizontal layout (default, good for small components)
	 * - 'column': vertical stack (good for full-width components)
	 * - 'grid': responsive grid
	 */
	layout?: 'row' | 'column' | 'grid';
	/** Background color for the preview area */
	background?: 'light' | 'dark' | 'checkered';
	/** Wrapper classes applied to the component group container */
	containerClass?: string;
	/**
	 * Isolate this component's variants to contain fixed-position overlays.
	 * Use for modals, toasts, bottom sheets, and other overlay components.
	 * Each variant will be rendered in its own containing block.
	 */
	isolate?: boolean;
}

/**
 * Resolved preview data used by the page generator.
 */
export interface ResolvedPreview extends ComponentPreview {
	/** Import path relative to $lib */
	importPath: string;
	/** Component file path */
	filePath: string;
}
