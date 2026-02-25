<script lang="ts">
  let {
    value = $bindable(''),
    size = 'sm',
    class: extraClass = '',
    ...rest
  }: {
    value?: string | number;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    class?: string;
    [key: string]: unknown;
  } = $props();
</script>

<input class="inp inp-{size} {extraClass}" bind:value {...rest} />

<style>
  .inp {
    background: var(--ui-bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-family: inherit;
    box-sizing: border-box;
  }
  .inp:hover { border-color: var(--border-hover); }
  .inp:focus { border-color: var(--border-hover); outline: none; }
  .inp::placeholder { color: var(--text-ghost); }

  .inp-xs { font-size: 9px; padding: 1px 3px; }
  .inp-sm { font-size: 11px; padding: 2px 4px; }
  .inp-md { font-size: 13px; padding: 3px 6px; }
  .inp-lg { font-size: 12px; padding: 4px 8px; }
</style>
