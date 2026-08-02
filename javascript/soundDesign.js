// ─── soundDesign.js — façade de compatibilité (découpé le 2026-07-11) ───────
// Refactor sans risque (cf. CONTEXT.md §21) : ce fichier faisait 676 lignes mêlant
// un lecteur musique HTML Audio (~230 lignes) et une classe d'ambiance spatiale
// THREE.Audio (~380 lignes), couplage à sens unique seulement. Découpé en :
//   musicPlayer.js         musique (intro/ingame/ending/chi-mai), duck, mute
//   ambientSoundDesign.js  ambiance spatiale (corbeaux/oiseaux/village/plage/train/bateau)
// Ce fichier ne fait plus que ré-exporter les deux pour ne rien casser chez les
// importateurs externes (scene.js, startupMenu.js, multiplayerRooms.js) — API
// publique inchangée.
export { startMenuMusic, startIngameMusic, startEndingMusic, setMusicDuck, setChiMaiMode, toggleMute, isMuted, registerAmbientSoundDesign } from './musicPlayer.js';
export { createAmbientSoundDesign } from './ambientSoundDesign.js';
