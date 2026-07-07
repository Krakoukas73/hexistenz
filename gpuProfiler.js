/**
 * gpuProfiler.js — Décomposition du temps GPU réel par passe de post-process (F12).
 *
 * Contexte (2026-07-05) : gpuTimer.js mesure un temps GPU réel unique pour TOUTE
 * la frame (cf. postprocess.render() dans threeSetup.js), ce qui suffit pour le HUD
 * mais ne dit rien de QUELLE passe est responsable quand ce chiffre oscille (ex:
 * GPU 70-100% sur une grille vide, sans item ni ombre affichée). EXT_disjoint_timer_query
 * interdit d'imbriquer deux requêtes TIME_ELAPSED actives simultanément — donc pas moyen
 * d'avoir "1 timer global" ET "N timers de détail" en même temps. Ce module remplace le
 * timer global unique par N timers SÉQUENTIELS (jamais imbriqués, puisque les passes du
 * composer s'exécutent l'une après l'autre) : un par passe (beauty/monde+ciel+eau+ombres,
 * fumée, color grading, cinématique, output, texte).
 *
 * Usage (cf. threeSetup.js + scene.js) :
 *   const gpuProfiler = createGpuProfiler(renderer);
 *   gpuProfiler.wrapPassConditional(pixelPass, 'beauty — ombre recalculée ce frame',
 *                                   'beauty — ombre réutilisée (cache)', r => r.shadowMap.autoUpdate);
 *   gpuProfiler.wrapPass(colorGradingPass, 'colorGrading (LUT)');
 *   ...
 *   // chaque frame, après tout le rendu :
 *   gpuProfiler.poll();
 *   // toutes les N frames :
 *   gpuProfiler.report({ camY: camera.position.y, ... });
 */
import { createGpuTimer } from './gpuTimer.js';

const HISTORY_LEN = 120; // ~2s @ 60fps — assez pour voir l'amplitude min/max d'une oscillation lente

export function createGpuProfiler(renderer) {
  const segments = new Map(); // label -> { timer, history: number[] }
  const supported = createGpuTimer(renderer).supported; // sonde jetable, juste pour le flag

  function _segment(label) {
    let seg = segments.get(label);
    if (!seg) {
      seg = { timer: createGpuTimer(renderer), history: [] };
      segments.set(label, seg);
    }
    return seg;
  }

  /** Monkey-patch pass.render(...) pour chronométrer cette passe précisément. */
  function wrapPass(pass, label) {
    const seg = _segment(label);
    const orig = pass.render.bind(pass);
    pass.render = function patchedForProfiler(...args) {
      seg.timer.begin();
      const ret = orig(...args);
      seg.timer.end();
      return ret;
    };
    return pass;
  }

  /**
   * Comme wrapPass, mais bascule vers l'un de deux labels selon un prédicat évalué
   * SYNCHRONEMENT à chaque appel de render() (donc aucun risque de désalignement avec
   * les résultats async du timer, contrairement à un tag posé après-coup sur l'historique).
   * Sert à isoler, à l'intérieur d'une même passe, un sous-coût conditionnel — typiquement
   * la passe "beauty" qui recalcule ou non la shadow map selon shadowRefreshFrame % 3
   * (cf. scene.js ligne ~670) : si le coût oscille avec cette cadence, ça se voit ici.
   */
  function wrapPassConditional(pass, labelIf, labelElse, predicate) {
    const segIf = _segment(labelIf);
    const segElse = _segment(labelElse);
    const orig = pass.render.bind(pass);
    pass.render = function patchedForProfilerConditional(...args) {
      const seg = predicate(...args) ? segIf : segElse;
      seg.timer.begin();
      const ret = orig(...args);
      seg.timer.end();
      return ret;
    };
    return pass;
  }

  /** Chronomètre un appel synchrone isolé (ex: renderTextLayer, pas un Pass composer). */
  function timeSync(label, fn) {
    const seg = _segment(label);
    seg.timer.begin();
    const ret = fn();
    seg.timer.end();
    return ret;
  }

  /** À appeler une fois par frame, après tout le rendu — récupère les résultats async disponibles. */
  function poll() {
    for (const seg of segments.values()) {
      const ms = seg.timer.poll();
      if (ms != null) {
        seg.history.push(ms);
        if (seg.history.length > HISTORY_LEN) seg.history.shift();
      }
    }
  }

  /**
   * Agrège les compteurs GPU_DISJOINT_EXT de tous les timers de segments (cf. gpuTimer.js).
   * Un disjointRatio élevé (> quelques %) indique du scaling de fréquence GPU / reset pilote
   * en cours de mesure — piste directe pour l'oscillation 15-45ms observée à charge stable
   * (cf. threeSetup.js powerPreference: 'high-performance', ajouté le 2026-07-05 pour ça).
   */
  function getDisjointSummary() {
    let disjointCount = 0, pollCount = 0;
    for (const seg of segments.values()) {
      const s = seg.timer.getDisjointStats?.();
      if (s) { disjointCount += s.disjointCount; pollCount += s.pollCount; }
    }
    return { disjointCount, pollCount, disjointRatio: pollCount ? +(disjointCount / pollCount).toFixed(3) : 0 };
  }

  /** getGpuMs() global = somme des derniers échantillons connus de chaque passe. */
  function getTotalMs() {
    let sum = 0, any = false;
    for (const seg of segments.values()) {
      const last = seg.history[seg.history.length - 1];
      if (last != null) { sum += last; any = true; }
    }
    return any ? sum : null;
  }

  /** Log console.table : dernier / min / max / moy / amplitude par passe sur les 120 derniers échantillons. */
  function report(extraContext = {}) {
    const rows = {};
    let totalLast = 0, totalMin = 0, totalMax = 0;
    for (const [label, seg] of segments) {
      const h = seg.history;
      if (h.length === 0) continue;
      const last = h[h.length - 1];
      let min = Infinity, max = -Infinity, sum = 0;
      for (const v of h) { if (v < min) min = v; if (v > max) max = v; sum += v; }
      const avg = sum / h.length;
      rows[label] = {
        'dernier (ms)':    last.toFixed(2),
        'min (ms)':        min.toFixed(2),
        'max (ms)':        max.toFixed(2),
        'moy (ms)':        avg.toFixed(2),
        'amplitude (ms)':  (max - min).toFixed(2),
        'échantillons':    h.length,
      };
      totalLast += last; totalMin += min; totalMax += max;
    }
    console.log(
      `%c[GPU PROFILER] dernier total≈${totalLast.toFixed(2)}ms | plage des passes sur ${HISTORY_LEN}f: ${totalMin.toFixed(2)}–${totalMax.toFixed(2)}ms`,
      'color:#5ad6ff; font-weight:bold'
    );
    console.table(rows);
    // Ligne dédiée (pas noyée dans l'objet contexte tronqué "{…}" par Chrome) :
    // disjointRatio élevé = le pilote signale un scaling de fréquence GPU / reset pendant
    // les mesures → confirme une cause matérielle à l'oscillation plutôt qu'un coût de rendu.
    const disjoint = getDisjointSummary();
    console.log(
      `%c[GPU PROFILER] disjoint: ${disjoint.disjointCount}/${disjoint.pollCount} polls (ratio=${disjoint.disjointRatio})`,
      disjoint.disjointRatio > 0.02 ? 'color:#ff6b6b; font-weight:bold' : 'color:#8a8'
    );
    console.log('[GPU PROFILER] contexte:', extraContext);
  }

  return { wrapPass, wrapPassConditional, timeSync, poll, report, getTotalMs, getDisjointSummary, supported, segments };
}
