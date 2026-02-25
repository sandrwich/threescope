<script lang="ts">
  let {
    onclick,
    disabled = false,
    active = false,
    variant = 'default',
    size = 'sm',
    class: extraClass = '',
    children,
    ...rest
  }: {
    onclick?: (e: MouseEvent) => void;
    disabled?: boolean;
    active?: boolean;
    variant?: 'default' | 'ghost' | 'danger';
    size?: 'xs' | 'sm' | 'md' | 'lg';
    class?: string;
    children: any;
    [key: string]: unknown;
  } = $props();
</script>

<button
  class="btn btn-{variant} btn-{size} {extraClass}"
  class:active
  {onclick}
  {disabled}
  {...rest}
>
  {@render children()}
</button>

<style>
  .btn {
    font-family: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .btn :global(svg) {
    width: 1.1em;
    height: 1.1em;
    flex-shrink: 0;
  }
  .btn:disabled { opacity: 0.4; cursor: default; }

  /* ── Variants ── */
  .btn-default {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
  }
  .btn-default:hover { border-color: var(--border-hover); color: var(--text); }
  .btn-default.active { color: var(--accent); border-color: var(--accent); }

  .btn-ghost {
    background: none;
    border: none;
    color: var(--text-ghost);
  }
  .btn-ghost:hover { color: var(--text-dim); }
  .btn-ghost.active { color: var(--accent); }

  .btn-danger {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
  }
  .btn-danger:hover { border-color: var(--danger); color: var(--danger-bright); }

  /* ── Sizes ── */
  .btn-xs {
    font-size: 9px;
    padding: 1px 5px;
  }
  .btn-sm {
    font-size: 11px;
    padding: 3px 10px;
  }
  .btn-md {
    font-size: 13px;
    padding: 4px 14px;
  }
  .btn-lg {
    font-size: 12px;
    padding: 5px 18px;
  }
</style>
