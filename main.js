import { showStartupScreen } from './multiplayerUi.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', showStartupScreen, { once: true });
} else {
  showStartupScreen();
}
