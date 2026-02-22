<script lang="ts">
  import Modal from './shared/Modal.svelte';
  import { uiStore } from '../stores/ui.svelte';
</script>

<Modal bind:open={uiStore.infoModalOpen}>
  <div class="touch-controls">
    <div class="section">
      <h3>Touch</h3>
      <div class="ctrl-table">
        <span class="ctrl-key">1 finger drag</span><span class="ctrl-desc">Orbit camera</span>
        <span class="ctrl-key">2 finger drag</span><span class="ctrl-desc">Pan camera</span>
        <span class="ctrl-key">Pinch</span><span class="ctrl-desc">Zoom in / out</span>
        <span class="ctrl-key">Tap satellite</span><span class="ctrl-desc">Select / deselect</span>
      </div>
    </div>
  </div>
  <div class="desktop-controls">
    <div class="section">
      <h3>Mouse</h3>
      <div class="ctrl-table">
        <span class="ctrl-key"><kbd>RMB</kbd> drag</span><span class="ctrl-desc">Orbit camera</span>
        <span class="ctrl-key"><kbd>Shift</kbd>+<kbd>RMB</kbd> drag</span><span class="ctrl-desc">Pan camera</span>
        <span class="ctrl-key"><kbd>Scroll</kbd></span><span class="ctrl-desc">Zoom in / out</span>
        <span class="ctrl-key">Click satellite</span><span class="ctrl-desc">Select / deselect</span>
      </div>
    </div>
    <div class="section">
      <h3>Keyboard</h3>
      <div class="ctrl-table">
        <span class="ctrl-key"><kbd>Space</kbd></span><span class="ctrl-desc">Pause / resume</span>
        <span class="ctrl-key"><kbd>.</kbd> <kbd>,</kbd></span><span class="ctrl-desc">Speed up / slow down</span>
        <span class="ctrl-key"><kbd>/</kbd></span><span class="ctrl-desc">Reset speed</span>
        <span class="ctrl-key"><kbd>M</kbd></span><span class="ctrl-desc">Toggle 2D / 3D map</span>
        <span class="ctrl-key"><kbd>Ctrl</kbd>+<kbd>K</kbd></span><span class="ctrl-desc">Command palette</span>
        <span class="ctrl-key"><kbd>Ctrl</kbd>+<kbd>F</kbd></span><span class="ctrl-desc">Search satellite</span>
      </div>
    </div>
  </div>
  <div class="section">
    <h3>About</h3>
    TLE data from <a href="https://celestrak.org" target="_blank">CelesTrak</a><br>
    Based on <a href="https://github.com/aweeri/TLEscope" target="_blank">TLEscope</a> by aweeri<br>
    <a href="https://github.com/aweeri/TLEscope/blob/main/LICENSE" target="_blank">AGPL-3.0</a>
    &middot; <a href="https://github.com/sandrwich/threescope" target="_blank">Source code</a>
  </div>
</Modal>

<style>
  h3 {
    font-size: 14px;
    color: var(--text-dim);
    margin-bottom: 8px;
    font-weight: normal;
  }
  .section { margin-bottom: 14px; }
  .section:last-child { margin-bottom: 0; }
  .ctrl-table {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
  }
  .ctrl-key { color: var(--text-dim); text-align: right; white-space: nowrap; }
  .ctrl-desc { color: var(--text-muted); }
  :global(.info-modal) a { color: var(--text-faint); text-decoration: none; }
  :global(.info-modal) a:hover { color: var(--text-dim); }
  kbd {
    background: var(--kbd-bg);
    border: 1px solid var(--border);
    padding: 0 4px;
    font-family: inherit;
    font-size: 12px;
    color: var(--text-dim);
  }
  .touch-controls { display: none; }
  .desktop-controls { display: block; margin-bottom: 14px; }
  @media (pointer: coarse) {
    .touch-controls { display: block; }
    .desktop-controls { display: none; }
  }
</style>
