import '../styles/global.css';
import { bootstrapController } from './app.js';

const root = document.getElementById('app');
bootstrapController(root).catch((error) => {
  root.textContent = `Failed to launch controller: ${error.message}`;
  console.error(error);
});
