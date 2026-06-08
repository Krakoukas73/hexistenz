import { initScene } from './scene.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScene, { once: true });
} else {
  initScene();
}
