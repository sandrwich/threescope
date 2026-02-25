<script lang="ts">
</script>

<div class="bottom-panel">
  <div>
    TLE data from <a href="https://celestrak.org" target="_blank">CelesTrak</a><br>
    Based on <a href="https://github.com/aweeri/TLEscope" target="_blank">TLEscope</a> by aweeri
    &middot; <a href="https://github.com/aweeri/TLEscope/blob/main/LICENSE" target="_blank">AGPL-3.0</a>
    &middot; <a href="https://github.com/sandrwich/threescope" target="_blank">Source code</a>
  </div>
</div>

<style>
  .bottom-panel {
    position: absolute;
    bottom: 8px;
    left: 10px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--scene-text-dim);
  }
  .bottom-panel :global(a) {
    color: var(--scene-text-dim);
    text-decoration: none;
    pointer-events: auto;
  }
  .bottom-panel :global(a:hover) { color: var(--scene-text); }
</style>
