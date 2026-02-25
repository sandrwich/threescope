<script lang="ts">
  let {
    checked = $bindable(false),
    onchange,
    disabled = false,
    mixed = false,
    color = '',
    size = 'md',
    class: extraClass = '',
    ...rest
  }: {
    checked?: boolean;
    onchange?: (e: Event) => void;
    disabled?: boolean;
    mixed?: boolean;
    color?: string;
    size?: 'sm' | 'md' | 'lg';
    class?: string;
    [key: string]: unknown;
  } = $props();
</script>

<input
  type="checkbox"
  class="cb cb-{size} {extraClass}"
  class:mixed
  bind:checked
  {disabled}
  onchange={onchange}
  style={color ? `--cb-color:${color}` : ''}
  {...rest}
/>

<style>
  .cb {
    appearance: none;
    -webkit-appearance: none;
    border: 2px solid var(--cb-color, var(--border-hover));
    background: transparent;
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
  }
  .cb:hover { border-color: var(--cb-color, var(--text-dim)); }
  .cb:checked::after {
    content: '';
    position: absolute;
    background: var(--cb-color, var(--text-dim));
  }
  .cb:disabled { opacity: 0.4; cursor: default; }

  /* Sizes */
  .cb-sm { width: 12px; height: 12px; }
  .cb-sm:checked::after { top: 1px; left: 1px; right: 1px; bottom: 1px; }
  .cb-md { width: 14px; height: 14px; }
  .cb-md:checked::after { top: 2px; left: 2px; right: 2px; bottom: 2px; }
  .cb-lg { width: 16px; height: 16px; }
  .cb-lg:checked::after { top: 2px; left: 2px; right: 2px; bottom: 2px; }

  /* Mixed / indeterminate state */
  .cb.mixed::after {
    content: '';
    position: absolute;
    left: 1px; right: 1px;
    top: 50%; transform: translateY(-50%);
    height: 2px;
    background: var(--cb-color, var(--text-dim));
  }
</style>
