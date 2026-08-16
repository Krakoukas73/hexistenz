// ─── edaPanelHost.js — façade (2026-07-02, ex-debugLightUi.js renommé le 2026-07-11) ──
// Ce fichier faisait ~3000 lignes et hébergeait à la fois le HUD FPS (touche F) et le
// panel EDA (touche E), sans lien réel entre les deux hormis un `root` DOM partagé et
// une synchro de visibilité croisée (`scorePanel` masqué si l'un OU l'autre est ouvert).
// Découpé en 3 : hud_fps.js (perf HUD, self-contained), edaPanelWiring.js (ex-hud_eda.js,
// panel EDA 3 onglets, constantes LUT/CIN/PIX/EAU/VENT/NUAGES, helpers de rendu), et cette
// façade qui reste le SEUL point d'entrée pour scene.js (import inchangé : createDebugLightUI
// + tickFps), assemble le root partagé.
//
// Renommé le 2026-07-11 (ex-debugLightUi.js) pour refléter son rôle réel : héberger le DOM
// partagé du panel EDA, pas un "panneau lumière de debug" comme le suggérait l'ancien nom.
// Le CSS géant (ex-installDebugLightCss(), ~1150 lignes injectées via un template
// literal JS) a été extrait vers css/eda.css le 2026-07-11 — chargé statiquement via
// @import dans css/style.css, plus aucune injection JS au runtime. cf. CONTEXT.md §20/§21.
import { ensureHelpTooltip, attachHelpTooltip, LUT_HELP } from './help.js';
import { tickFps, initFpsHud } from './hud_fps.js';
import { EDA_BODY_HTML, wireEdaPanel } from './edaPanelWiring.js';
import { getGameLang, setGameLang, registerLangRefresh, getLangFile, getLangVersion } from './gameLangReactive.js';
import { getTheme, setTheme } from './themeManager.js';
import { showCenterMessage } from './scorePopup.js';
import { announceLanguageChanged, announceThemeChanged, speak, resetTtsQueue, toggleTtsMute, isTtsMuted, announceVoiceOn, announceSoundOn } from './ttsAnnouncer.js';
import { toggleMute, isMuted } from './soundDesign.js';

export { tickFps };

// 2026-07-29 — textes du popup central pour les 2 nouveaux boutons 🗣️/🔊 du bandeau
// bas-gauche (mêmes clés json que scene.js::_soundOnText/_soundOffText/_voiceOnText/
// _voiceOffText, dupliquées ICI plutôt qu'importées : scene.js importe déjà
// edaPanelHost.js (createDebugLightUI/tickFps) — un import dans l'autre sens créerait
// une dépendance circulaire. Même mécanisme réactif top-level-await + registerLangRefresh
// que le reste du fichier.
const _edaHostLangFile = getLangFile();
const _edaHostLangData = await fetch(`./json/languages/${_edaHostLangFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .catch(err => {
    console.error(`[edaPanelHost] Impossible de charger ${_edaHostLangFile}.json`, err);
    return {};
  });
let _soundOnText = _edaHostLangData?.game?.sound?.on ?? '';
let _soundOffText = _edaHostLangData?.game?.sound?.off ?? '';
let _voiceOnText = _edaHostLangData?.game?.tts?.voiceOn ?? '';
let _voiceOffText = _edaHostLangData?.game?.tts?.voiceOff ?? '';

registerLangRefresh((data) => {
  _soundOnText = data?.game?.sound?.on ?? '';
  _soundOffText = data?.game?.sound?.off ?? '';
  _voiceOnText = data?.game?.tts?.voiceOn ?? '';
  _voiceOffText = data?.game?.tts?.voiceOff ?? '';
});

// Références aux 2 boutons, remplies par createDebugLightUI() ci-dessous — servent
// à syncMuteButtons() (exportée), appelée par scene.js après un mute/unmute déclenché
// au CLAVIER (touches M/T) pour que l'état visuel (actif/barré) des boutons reste
// synchronisé quelle que soit l'origine du changement (clic OU touche).
let _soundMuteBtnRef = null;
let _ttsMuteBtnRef = null;

/** Resynchronise l'état visuel (actif/barré) des boutons 🔊/🗣️ sur l'état réel courant. */
export function syncMuteButtons() {
  _soundMuteBtnRef?.classList.toggle('debug-light-toggle--muted', isMuted());
  _ttsMuteBtnRef?.classList.toggle('debug-light-toggle--muted', isTtsMuted());
}

export function createDebugLightUI({ visualEnvironment, postprocess, forestOverlay = null, cloudSky = null, environmentDirector = null }) {
  if (!visualEnvironment) return null;

  ensureHelpTooltip();

  const root = document.createElement('section');
  root.id = 'debugLightPanel';
  root.className = 'debug-light-panel collapsed';
  root.innerHTML = `
    <div class="debug-light-left-col">
      <div id="fps-counter" class="fps-counter">-- FPS</div>
      <div class="debug-light-btn-rows">
        <!-- 2026-07-31, demande explicite : les 2 rangées (photo/galerie/replay/voix/son
             d'une part, langue/thème/FPS/EDA d'autre part) fusionnées en UNE SEULE ligne
             (dépasse le stade "compatibilité 1920x1080" du 2026-07-20 ci-dessous, qui
             n'était déjà qu'une réduction 3→2 lignes — cf. CONTEXT.md §35/§21).
             .debug-light-btn-row reste inchangée (flex row, nowrap) : un seul conteneur
             suffit désormais, .debug-light-btn-rows (wrapper colonne) n'a plus qu'un
             enfant mais reste en place pour ne pas toucher au reste du CSS. -->
        <div class="debug-light-btn-row">
          <button id="snapshotBtn" class="debug-light-toggle" type="button" tabindex="-1"><span class="snapshot-emoji">📷</span></button>
          <button id="galleryBtn" class="debug-light-toggle" type="button" tabindex="-1"><span class="gallery-emoji">🖼️</span></button>
          <button id="replayBtn" class="debug-light-toggle" type="button" tabindex="-1"><span class="replay-emoji">🎬</span></button>
          <!-- 2026-07-29 — boutons 🗣️ (voix TTS, touche T) / 🔊 (son global, touche M),
               demande explicite : même ligne que 📷/🖼️/🎬, cliquables, actifs/barrés
               selon l'état courant (cf. syncMuteButtons ci-dessus et .debug-light-toggle--muted
               dans css/eda.css). -->
          <button id="ttsMuteBtn" class="debug-light-toggle" type="button" tabindex="-1"><span class="tts-emoji">😃</span></button>
          <button id="soundMuteBtn" class="debug-light-toggle" type="button" tabindex="-1"><span class="sound-emoji">🔊</span></button>
          <select id="gameLangSelect" class="debug-light-toggle debug-light-lang-select" tabindex="-1">
            <option value="da">DA</option>
            <option value="de">DE</option>
            <option value="el">EL</option>
            <option value="en">EN</option>
            <option value="es">ES</option>
            <option value="fi">FI</option>
            <option value="fr">FR</option>
            <option value="fr-CA">QC</option>
            <option value="fr-MED">XII</option>
            <option value="it">IT</option>
            <option value="nl">NL</option>
            <option value="no">NO</option>
            <option value="pl">PL</option>
            <option value="pt">PT</option>
            <option value="ru">RU</option>
            <option value="sv">SV</option>
            <option value="tr">TR</option>
          </select>
          <select id="gameThemeSelect" class="debug-light-toggle debug-light-lang-select" tabindex="-1">
            <option value="bleu">BLEU SIDÉRAL</option>
            <option value="ancien">MÉDIÉVAL</option>
          </select>
          <button id="fpsHudToggle" class="debug-light-toggle debug-light-toggle--fps" type="button" tabindex="-1"><mark class="btn-key">F</mark>PS</button>
          <button id="debugLightToggle" class="debug-light-toggle" type="button" tabindex="-1"><mark class="btn-key">E</mark>DA</button>
        </div>
      </div>
    </div>
    ${EDA_BODY_HTML}
  `;

  document.body.appendChild(root);

  // Tooltips au survol des 4 boutons du bandeau (FPS/EDA/📷/langue) — système
  // custom `lutHelpTooltip` (helpTooltip.js/helpTexts.js) utilisé partout ailleurs
  // dans le jeu (ui.js, startupMenu.js, multiplayerRooms.js…), PAS l'attribut
  // `title` natif du navigateur qui y était resté par erreur (signalé 2026-07-15).
  // Fonctions `() => LUT_HELP[...]` (pas de valeur figée) pour rester à jour après
  // un changement de langue en cours de partie, cf. gameLangReactive.js.
  attachHelpTooltip(root.querySelector('#fpsHudToggle'),   () => LUT_HELP['topbar.fps'] ?? '');
  attachHelpTooltip(root.querySelector('#debugLightToggle'), () => LUT_HELP['topbar.eda'] ?? '');
  attachHelpTooltip(root.querySelector('#snapshotBtn'),     () => LUT_HELP['topbar.snapshot'] ?? '');
  attachHelpTooltip(root.querySelector('#galleryBtn'),      () => LUT_HELP['topbar.gallery'] ?? '');
  attachHelpTooltip(root.querySelector('#replayBtn'),       () => LUT_HELP['topbar.replay'] ?? '');
  attachHelpTooltip(root.querySelector('#gameLangSelect'),  () => LUT_HELP['topbar.lang'] ?? '');
  attachHelpTooltip(root.querySelector('#gameThemeSelect'), () => LUT_HELP['topbar.theme'] ?? '');
  attachHelpTooltip(root.querySelector('#ttsMuteBtn'),      () => LUT_HELP['topbar.muteVoice'] ?? '');
  attachHelpTooltip(root.querySelector('#soundMuteBtn'),    () => LUT_HELP['topbar.mute'] ?? '');

  // ─── Boutons 🗣️/🔊 (2026-07-29, demande explicite) ──────────────────────────
  // Relais cliquable vers exactement le même comportement que les touches T/M
  // (scene.js) : bascule + popup central de confirmation + annonce vocale à la
  // RÉACTIVATION uniquement (silence à la coupure). `toggleMute()` sans argument
  // retombe sur la dernière instance ambientSoundDesign enregistrée via
  // registerAmbientSoundDesign() (musicPlayer.js) — ce module n'a pas directement
  // accès à cette instance (créée après createDebugLightUI() dans scene.js).
  _soundMuteBtnRef = root.querySelector('#soundMuteBtn');
  _ttsMuteBtnRef = root.querySelector('#ttsMuteBtn');
  syncMuteButtons();

  _soundMuteBtnRef.addEventListener('click', () => {
    const muted = toggleMute();
    syncMuteButtons();
    showCenterMessage(muted ? _soundOffText : _soundOnText);
    if (!muted) announceSoundOn();
  });

  _ttsMuteBtnRef.addEventListener('click', () => {
    const muted = toggleTtsMute();
    syncMuteButtons();
    showCenterMessage(muted ? _voiceOffText : _voiceOnText);
    if (!muted) announceVoiceOn();
  });

  // Sélecteur de langue en jeu (2026-07-13, v2 — v1 avec 2 boutons FR/EN rejetée :
  // pas scalable si d'autres langues arrivent un jour). Un unique <select> qui
  // grandit tout seul avec la liste d'options ; l'ajout d'une langue future ne
  // demande QUE d'ajouter une <option>, pas un nouveau bouton par langue.
  // setGameLang() (gameLangReactive.js) écrit dataset.lang + localStorage, PUIS
  // notifie tous les modules abonnés via registerLangRefresh — dont gameHudI18n.js
  // (HUD statique de game.php, refonte 2026-07-14 : ex dual-render data-fr/data-en,
  // remplacé par data-i18n) et les modules bilingues JS (helpTexts.js, highscore.js,
  // hud_fps.js, missionLabels.js, multiplayerClient.js, multiplayerRooms.js,
  // placementOverlay.js, edaPanelWiring.js, scene.js) qui retraduisent leurs propres
  // textes en direct. PAS de reload (essayé puis retiré : ça renvoyait au menu de
  // démarrage en pleine partie, inacceptable).
  const langSelect = root.querySelector('#gameLangSelect');
  langSelect.value = getGameLang();
  // 2026-07-29 — annonce vocale (TTS) "Langue française" (etc.) au changement de
  // langue. setGameLang() est asynchrone : on attend sa résolution avant d'annoncer,
  // pour être sûr que ttsAnnouncer.js (abonné via registerLangRefresh, comme tous
  // les modules bilingues) a bien reçu la nouvelle langue avant de parler.
  langSelect.addEventListener('change', () => setGameLang(langSelect.value).then(announceLanguageChanged));

  // Sélecteur de thème graphique en jeu (2026-07-17, demande explicite) — juste après
  // le sélecteur de langue dans le même bandeau. Même composant themeManager.js déjà
  // utilisé par la prez (index.php) et par le script inline précoce de game.php : pas
  // de nouvelle plomberie, setTheme() écrit data-theme + localStorage['hexistenz_theme'],
  // consommé immédiatement par les CSS [data-theme="bleu"]/[data-theme="ancien"] déjà
  // en place sur tout le HUD (cf. CONTEXT.md §32). Pas de rechargement de page.
  // Libellés des options (BLEU/MÉDIÉVAL) retraduits en direct au changement de langue —
  // même mécanisme que #gameLangSelect ci-dessus, via game.eda.themeNames (json/languages)
  // et registerLangRefresh (gameLangReactive.js). Bug signalé 2026-07-17 : le texte des
  // options était codé en dur, donc jamais retraduit contrairement à la prez (qui utilise
  // le data-i18n générique sur theme.bleu/theme.ancien) — celui-ci reste un <select> peuplé
  // en JS pur, il lui faut sa propre logique de retraduction, comme les noms de préréglages
  // dans edaPanelWiring.js. `_themeNames` est aussi réutilisé par le handler de changement
  // ci-dessous pour le popup central de confirmation (2026-07-17, même mécanisme que
  // #gameLangSelect via scorePopup.js/showCenterMessage) : toujours la traduction la plus
  // fraîche, pas de re-fetch au clic.
  const themeSelect = root.querySelector('#gameThemeSelect');
  themeSelect.value = getTheme();
  let _themeNames = null;
  function applyThemeOptionLabels(themeNames) {
    _themeNames = themeNames;
    const optBleu = themeSelect.querySelector('option[value="bleu"]');
    const optAncien = themeSelect.querySelector('option[value="ancien"]');
    if (optBleu) optBleu.textContent = (themeNames?.bleu ?? 'Bleu sidéral').toUpperCase();
    if (optAncien) optAncien.textContent = (themeNames?.ancien ?? 'Médiéval').toUpperCase();
  }
  fetch(`./json/languages/${getLangFile()}.json?v=${getLangVersion()}`)
    .then(r => r.json())
    .then(data => applyThemeOptionLabels(data?.game?.eda?.themeNames))
    .catch(err => console.error('[edaPanelHost] Impossible de charger les libellés de thème', err));
  registerLangRefresh((data) => applyThemeOptionLabels(data?.game?.eda?.themeNames));

  themeSelect.addEventListener('change', () => {
    const theme = setTheme(themeSelect.value);
    const themeLabel = _themeNames?.[theme] ?? theme;
    showCenterMessage(themeLabel);
    // 2026-07-29 — annonce vocale (TTS) du thème sélectionné, dans la langue en
    // cours. Réutilise directement `themeLabel` (déjà traduit via game.eda.themeNames,
    // même texte que le popup visuel ci-dessus).
    // 2026-08-05 — demande explicite : préfixer l'annonce vocale par "Thème "
    // (ex. "Bleu sidéral" → "Thème Bleu sidéral") — announceThemeChanged()
    // injecte `themeLabel` dans le gabarit game.tts.themeChanged de la langue
    // courante (cf. ttsAnnouncer.js), au lieu d'un simple speak(themeLabel).
    announceThemeChanged(themeLabel);
  });

  const fpsApi = initFpsHud(root);
  return wireEdaPanel(root, { visualEnvironment, postprocess, forestOverlay, cloudSky, environmentDirector, fpsApi });
}
