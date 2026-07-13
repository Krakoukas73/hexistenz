import { showPreloader }    from './preloader.js';
import { showStartupScreen } from './startupMenu.js';

function boot() {
  showPreloader(showStartupScreen);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
