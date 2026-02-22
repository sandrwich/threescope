<script lang="ts">
  let { open = $bindable(false), children }: {
    open?: boolean;
    children: any;
  } = $props();

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) open = false;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={onOverlayClick}>
    <div class="modal-content">
      {@render children()}
      <button class="modal-close" onclick={() => open = false}>Close</button>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--modal-overlay);
    pointer-events: auto;
  }
  .modal-content {
    background: var(--modal-bg);
    border: 1px solid var(--border);
    padding: 18px 22px;
    max-width: 420px;
    width: 90%;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-muted);
  }
  .modal-close {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 13px;
    font-family: inherit;
    padding: 4px 14px;
    cursor: pointer;
    margin-top: 10px;
    float: right;
  }
  .modal-close:hover {
    border-color: var(--border-hover);
    color: var(--text-dim);
  }
</style>
