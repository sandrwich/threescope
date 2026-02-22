import './styles/global.css';
import { mount } from 'svelte';
import Overlay from './ui/Overlay.svelte';
import { App } from './app';

// Mount Svelte UI overlay
mount(Overlay, { target: document.getElementById('svelte-ui')! });

// Start Three.js engine
const app = new App();
app.init();
