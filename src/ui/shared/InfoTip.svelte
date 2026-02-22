<script lang="ts">
  let { children }: { children: any } = $props();
</script>

<span class="info-tip">ⓘ
  <span class="info-tip-content">
    {@render children()}
  </span>
</span>

<style>
  .info-tip {
    cursor: help;
    color: var(--text-ghost);
    font-size: 11px;
    position: relative;
    margin-left: 4px;
  }
  .info-tip:hover { color: var(--text-dim); }
  .info-tip-content {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    right: -12px;
    background: #111;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 11px;
    padding: 10px 12px;
    width: 320px;
    pointer-events: none;
    z-index: 10;
    line-height: 1.6;
    font-weight: normal;
    border-radius: 3px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
  .info-tip:hover .info-tip-content { display: block; }
  .info-tip-content :global(b) { color: var(--text); font-weight: 600; }
  .info-tip-content :global(.tip-options) {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
  }
  .info-tip-content :global(.tip-options div) { padding: 2px 0; }
  .info-tip-content :global(.tip-options + *) {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
  }
</style>
