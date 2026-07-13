/**
 * gpuTimer.js — Mesure du temps GPU réel via EXT_disjoint_timer_query_webgl2.
 *
 * Contexte (2026-07-04) : le HUD FPS affichait un "render Xms" calculé avec
 * performance.now() autour de postprocess.render() (cf. scene.js). Ce chrono ne mesure
 * que la SOUMISSION CPU des draw calls — WebGL est asynchrone, le JS revient dès que les
 * commandes sont dans la file du driver, sans attendre leur exécution réelle sur le GPU.
 * Résultat : ce chiffre pouvait dépasser largement 16.7ms alors que le FPS affiché
 * restait bloqué à 60 (signe que ce n'était pas le vrai goulot) — diagnostiqué en
 * éliminant un par un cinématique/LUT/nuages/pixelSize sans jamais faire bouger le
 * chiffre de façon cohérente.
 *
 * Cette requête de timing GPU est la seule façon fiable de mesurer le temps d'exécution
 * réel : elle est ASYNCHRONE par nature (le résultat n'est jamais disponible dans la
 * frame où on la lance — il faut le récupérer 1 à quelques frames plus tard via poll()).
 *
 * Usage (1 timer pour tout le composer, cf. threeSetup.js) :
 *   const gpuTimer = createGpuTimer(renderer);
 *   // chaque frame, autour de TOUT le rendu GPU de la frame :
 *   gpuTimer.begin();
 *   ... postprocess.render() ...
 *   gpuTimer.end();
 *   const gpuMs = gpuTimer.poll(); // dernier résultat dispo (peut dater de 1-3 frames) ou null
 */
export function createGpuTimer(renderer) {
  const gl  = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');

  if (!ext || typeof gl.createQuery !== 'function') {
    // WebGL1 ou extension indisponible sur ce driver/navigateur — pas de mesure réelle possible.
    return {
      supported: false,
      begin() {},
      end() {},
      poll() { return null; }
    };
  }

  const MAX_PENDING = 8; // garde-fou : file illimitée si un contexte perdu bloque les résultats
  const pending = [];
  let activeQuery = null;
  let lastMs = null;

  // 2026-07-05 — diagnostic oscillation GPU (cf. threeSetup.js powerPreference) :
  // GPU_DISJOINT_EXT signale un changement de fréquence GPU (DVFS) ou un reset pilote pendant
  // la requête — si ça se déclenche souvent, l'oscillation 15-45ms observée sur scène statique
  // vient du throttling matériel/pilote, pas du code de rendu. Compteur exposé + log throttlé.
  let disjointCount = 0;
  let pollCount = 0;

  return {
    supported: true,

    begin() {
      if (activeQuery) return; // une requête TIME_ELAPSED ne s'imbrique jamais — sécurité
      activeQuery = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, activeQuery);
    },

    end() {
      if (!activeQuery) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(activeQuery);
      activeQuery = null;
      // Abandon silencieux des plus vieilles si jamais elles ne se libèrent pas
      // (context perdu, etc.) — évite une fuite de WebGLQuery.
      while (pending.length > MAX_PENDING) {
        gl.deleteQuery(pending.shift());
      }
    },

    poll() {
      // GPU_DISJOINT_EXT : un évènement disjoint (changement de fréquence GPU, reset
      // pilote…) invalide toute mesure en cours de vol — on vide sans lire ces résultats.
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      pollCount++;
      if (disjoint) {
        disjointCount++;
        if (disjointCount % 20 === 1) {
          console.warn(`[GPU-TIMER-DIAG] GPU_DISJOINT_EXT détecté (${disjointCount}/${pollCount} polls) — changement de fréquence GPU ou reset pilote en cours de mesure`);
        }
      }

      while (pending.length > 0) {
        const q = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break; // pas encore prêt
        if (!disjoint) {
          const ns = gl.getQueryParameter(q, gl.QUERY_RESULT); // GLuint64, en nanosecondes
          lastMs = ns / 1e6;
        }
        gl.deleteQuery(q);
        pending.shift();
      }
      return lastMs;
    },
    getDisjointStats() { return { disjointCount, pollCount }; },
  };
}
