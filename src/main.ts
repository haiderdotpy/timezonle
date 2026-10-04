import './style.css';
import { startApp } from './ui/app.js';

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing');
startApp(root).catch((err: unknown) => {
  root.textContent = `Failed to start Timezonle: ${err instanceof Error ? err.message : String(err)}`;
});
