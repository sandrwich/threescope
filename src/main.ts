import './styles/global.css';
import { mount } from 'svelte';
import Overlay from './ui/Overlay.svelte';
import { App } from './app';
import { initTheme } from './ui/shared/theme';

// Initialize theme palette (reads CSS custom properties for canvas code)
initTheme();

// Mount Svelte UI overlay
mount(Overlay, { target: document.getElementById('svelte-ui')! });

// Start Three.js engine
const app = new App();
app.init();

// ── Service Worker registration ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}
