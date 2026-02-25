<script lang="ts">
  let {
    value = $bindable(''),
    onchange,
    size = 'sm',
    class: extraClass = '',
    children,
    ...rest
  }: {
    value?: string;
    onchange?: (e: Event) => void;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    class?: string;
    children: any;
    [key: string]: unknown;
  } = $props();
</script>

<select class="sel sel-{size} {extraClass}" bind:value {onchange} {...rest}>
  {@render children()}
</select>

<style>
  .sel {
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-family: inherit;
    cursor: pointer;
  }
  .sel:hover { border-color: var(--border-hover); }
  .sel:focus { border-color: var(--border-hover); outline: none; }

  .sel-xs { font-size: 9px; padding: 1px 3px; }
  .sel-sm { font-size: 11px; padding: 2px 4px; }
  .sel-md { font-size: 13px; padding: 3px 6px; }
  .sel-lg { font-size: 12px; padding: 4px 8px; }
</style>
