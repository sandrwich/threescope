<script lang="ts">
  let { checked = $bindable(false), onchange, ...rest }: {
    checked?: boolean;
    onchange?: (e: Event) => void;
    [key: string]: unknown;
  } = $props();
</script>

<input
  type="checkbox"
  class="checkbox"
  bind:checked
  onchange={onchange}
  {...rest}
/>

<style>
  .checkbox {
    appearance: none;
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border: 2px solid var(--border-hover);
    background: transparent;
    cursor: pointer;
    position: relative;
  }
  .checkbox:hover { border-color: var(--text); }
  .checkbox:checked::after {
    content: '';
    position: absolute;
    top: 2px; left: 2px; right: 2px; bottom: 2px;
    background: var(--text);
  }
</style>
