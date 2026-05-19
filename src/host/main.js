import '../styles/global.css';
import { bootstrapHost } from './app.js';

const root = document.getElementById('app');
bootstrapHost(root).catch((error) => {
  root.textContent = `Failed to launch host: ${error.message}`;
  console.error(error);
});
