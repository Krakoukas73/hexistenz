// ─── ttsAnnouncer.js — annonces vocales via Web Speech API (SpeechSynthesis) ───
// Premier essai (2026-07-29, demande explicite) : lit à voix haute "N points !"
// (traduit) à chaque pose de tuile qui rapporte un score positif — même
// déclencheur que le popup central "+N" (cf. scene.js::placeTile, showScorePopup).
//
// Contraintes explicites de la demande :
//  - Web Speech API du navigateur, SpeechSynthesis (pas de service externe).
//  - Doit parler dans la voix système correspondant à la langue actuellement
//    sélectionnée parmi les 7 langues du jeu (fr/en/es/it/pt/fr-CA/de).
//
// Même mécanisme réactif top-level await + registerLangRefresh que le reste du
// code (cf. scene.js, gameHudI18n.js, etc.) — _pointsTemplate se met à jour
// automatiquement si la langue change en cours de partie.

import { getGameLang, getLangFile, getLangVersion, registerLangRefresh } from './gameLangReactive.js';
import { isMuted } from './soundDesign.js';
import { formatMissionTitle } from './missionLabels.js';

// BCP-47 le plus proche pour chaque code de langue interne du jeu (LANG_FILES,
// gameLangReactive.js) — sert à choisir une SpeechSynthesisVoice ET à fixer
// SpeechSynthesisUtterance.lang (le moteur du navigateur peut alors retomber sur
// une voix par défaut pour cette langue si aucune voix locale ne matche pile).
const TTS_LOCALES = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  'fr-CA': 'fr-CA',
  de: 'de-DE',
  ru: 'ru-RU',
  // 2026-07-29 — 9e langue (français médiéval, XIIe siècle) : reste du français
  // contemporain enrichi de vocabulaire (cf. french-medieval.json), aucune
  // locale BCP47 dédiée n'existe pour ça → réutilise la voix française standard.
  'fr-MED': 'fr-FR',
};

const _ttsLangFile = getLangFile();
const _ttsLangData = await fetch(`./json/languages/${_ttsLangFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .catch(err => {
    console.error(`[ttsAnnouncer] Impossible de charger ${_ttsLangFile}.json`, err);
    return {};
  });

let _pointsTemplate = _ttsLangData?.game?.tts?.pointsAnnounce ?? '{n} points !';
// 2026-07-29 — annonces missions (nouvelle mission générée / mission terminée),
// mêmes clés json que pointsAnnounce, cf. game.tts dans json/languages/*.json.
let _newMissionTemplate = _ttsLangData?.game?.tts?.newMission ?? 'Nouvelle mission : {title}';
let _missionCompletedTemplate = _ttsLangData?.game?.tts?.missionCompleted ?? 'Bravo ! Mission terminée !';
// 2026-07-29 (2e round) — panneau EDA, aide en ligne, compteurs moulins/trains/
// bateaux/comètes du panneau STATISTIQUES DE LA PARTIE.
let _edaOpenedTemplate = _ttsLangData?.game?.tts?.edaOpened ?? 'Éditeur de direction artistique';
let _helpOpenedTemplate = _ttsLangData?.game?.tts?.helpOpened ?? 'Aide';
// 2026-07-29 (3e round) — même gabarit que le popup visuel "Voix activée" (touche T,
// cf. scene.js), désormais aussi PRONONCÉ (et pas seulement affiché) à la réactivation.
let _voiceOnTemplate = _ttsLangData?.game?.tts?.voiceOn ?? 'Voix activée';
// 2026-07-29 (6e round) — même principe que _voiceOnTemplate ci-dessus, mais pour
// la touche M (son/musique/ambiance, cf. soundDesign.js::toggleMute), pas la touche
// T. Réutilise le gabarit game.sound.on déjà existant (popup visuel _soundOnText,
// cf. scene.js) — pas de nouvelle clé json.
let _soundOnTemplate = _ttsLangData?.game?.sound?.on ?? 'Sons activés';
// 2026-07-29 (4e round) — annonce du changement de langue via le sélecteur du HUD
// (#gameLangSelect, cf. edaPanelHost.js). Phrase auto-référentielle dans CHAQUE
// langue (ex. "Langue française" en fr, "English language" en en) — même principe
// que game.langName déjà utilisé par le popup visuel (gameLangReactive.js::setGameLang),
// mais formulé en phrase complète plutôt qu'un simple nom de langue.
let _languageChangedTemplate = _ttsLangData?.game?.tts?.languageChanged ?? 'Langue française';
let _millsTemplate = _ttsLangData?.game?.tts?.millsCount ?? '{n} moulins';
let _trainsTemplate = _ttsLangData?.game?.tts?.trainsCount ?? '{n} trains';
let _boatsTemplate = _ttsLangData?.game?.tts?.boatsCount ?? '{n} bateaux';
let _cometsTemplate = _ttsLangData?.game?.tts?.cometsCount ?? '{n} comètes';

registerLangRefresh((data) => {
  _pointsTemplate = data?.game?.tts?.pointsAnnounce ?? '{n} points !';
  _newMissionTemplate = data?.game?.tts?.newMission ?? 'Nouvelle mission : {title}';
  _missionCompletedTemplate = data?.game?.tts?.missionCompleted ?? 'Bravo ! Mission terminée !';
  _edaOpenedTemplate = data?.game?.tts?.edaOpened ?? 'Éditeur de direction artistique';
  _helpOpenedTemplate = data?.game?.tts?.helpOpened ?? 'Aide';
  _voiceOnTemplate = data?.game?.tts?.voiceOn ?? 'Voix activée';
  _soundOnTemplate = data?.game?.sound?.on ?? 'Sons activés';
  _languageChangedTemplate = data?.game?.tts?.languageChanged ?? 'Langue française';
  _millsTemplate = data?.game?.tts?.millsCount ?? '{n} moulins';
  _trainsTemplate = data?.game?.tts?.trainsCount ?? '{n} trains';
  _boatsTemplate = data?.game?.tts?.boatsCount ?? '{n} bateaux';
  _cometsTemplate = data?.game?.tts?.cometsCount ?? '{n} comètes';
});

// ─── Sélection de voix ──────────────────────────────────────────────────────
// Chrome (contrairement à Firefox/Safari) charge la liste des voix de façon
// asynchrone : speechSynthesis.getVoices() renvoie souvent [] au tout premier
// appel, la vraie liste n'arrivant qu'après l'événement 'voiceschanged'. On ne
// bloque jamais le premier speak() pour autant — au pire il retombe sur
// utter.lang seul (le navigateur choisit alors sa propre voix par défaut pour
// cette langue), et les annonces suivantes profitent du cache une fois rempli.
let _voicesCache = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const _refreshVoices = () => { _voicesCache = window.speechSynthesis.getVoices(); };
  _refreshVoices();
  window.speechSynthesis.onvoiceschanged = _refreshVoices;
}

// 2026-07-29 — retour utilisateur : fr et fr-CA tombaient sur EXACTEMENT la même
// voix (aucune voix fr-CA dédiée n'était installée sur le poste testé — vérifié en
// direct, cf. speechSynthesis.getVoices() : seules 3 voix "fr-FR" locales dispo,
// pas de "fr-CA"). Dans ce cas de repli (pas de voix native pour la locale exacte),
// on choisit un NOM de voix différent de celui utilisé par "fr" pur au sein de la
// même famille de langue — un rendu au moins audiblement distinct entre les deux,
// plutôt que la sélection par défaut (1ère voix trouvée) qui les faisait toujours
// coïncider. Purement un choix de confort ; si le système propose un jour une vraie
// voix "fr-CA", elle sera choisie en priorité (1er bloc ci-dessous, inchangé).
//
// 2026-07-29 (7e langue) — allemand : demande explicite d'une voix MASCULINE.
// Contrairement au cas fr-CA ci-dessus (aucune voix "fr-CA" native, donc repli
// famille), l'allemand a généralement plusieurs voix "de-DE" DISPONIBLES (ex.
// Windows : Stefan (H) + Hedda/Katja (F) ; macOS : Markus/Yannick (H) + Anna (F)).
// Le hint doit donc aussi s'appliquer à la correspondance EXACTE de locale, pas
// seulement au repli de famille — cf. _pickVoice ci-dessous, étape 1 modifiée.
const FALLBACK_VOICE_HINTS = {
  'fr-CA': ['julie', 'paul'],
  de: ['stefan', 'markus', 'conrad', 'yannick', 'klaus', 'male'],
  // 2026-07-29 — 8e langue (russe), même demande explicite de voix masculine que
  // pour l'allemand. Noms les plus fréquents des voix russes homme installées
  // (Windows/Edge : "Pavel", "Dmitry"/"Dmitri" ; macOS/Chrome : "Yuri" ; "male" en
  // dernier repli générique, même logique que de ci-dessus).
  ru: ['pavel', 'dmitry', 'dmitri', 'yuri', 'male'],
};

function _pickVoice(locale, langCode) {
  if (!_voicesCache.length) return null;
  const lang = locale.toLowerCase();
  const base = lang.split('-')[0];
  const hints = FALLBACK_VOICE_HINTS[langCode];

  // 1) correspondance exacte de la locale (ex. "de-DE"). S'il y a PLUSIEURS voix
  // pour cette locale (cas fréquent en allemand : voix homme + femme installées),
  // et qu'un hint de préférence de nom existe pour cette langue (cf. l'allemand,
  // demande explicite de voix masculine), on le priorise avant de retomber sur la
  // 1ère trouvée. Avant le 7e langue (allemand), cette étape ne gérait qu'un seul
  // candidat possible en pratique (fr/en/es/it/pt n'avaient jamais qu'une voix
  // exacte sur les postes testés) — d'où le passage de .find() à .filter() ici.
  const exactMatches = _voicesCache.filter(v => v.lang.toLowerCase() === lang);
  if (exactMatches.length) {
    if (hints) {
      for (const hint of hints) {
        const hinted = exactMatches.find(v => v.name.toLowerCase().includes(hint));
        if (hinted) return hinted;
      }
    }
    return exactMatches[0];
  }

  // 2) repli même famille de langue ("fr-*") : préférence nommée si ce code de
  // langue a un hint (cf. FALLBACK_VOICE_HINTS ci-dessus), sinon 1ère trouvée.
  const family = _voicesCache.filter(v => v.lang.toLowerCase().startsWith(base + '-'));
  if (hints) {
    for (const hint of hints) {
      const hinted = family.find(v => v.name.toLowerCase().includes(hint));
      if (hinted) return hinted;
    }
  }
  if (family.length) return family[0];

  // 3) langue seule sans région, en dernier repli.
  return _voicesCache.find(v => v.lang.toLowerCase() === base) || null;
}

// ─── Mute dédié aux annonces vocales (touche T) ────────────────────────────
// 2026-07-29, demande explicite : T doit couper/réactiver UNIQUEMENT le TTS,
// sans toucher à la musique/ambiance (déjà gérées par M, cf. musicPlayer.js::
// toggleMute/isMuted). État de session uniquement (pas de persistance
// localStorage), comme le mute musique — repart à "actif" à chaque rechargement.
let _ttsMuted = false;

/** Bascule le mute des annonces vocales. Retourne le nouvel état muet. */
export function toggleTtsMute() {
  _ttsMuted = !_ttsMuted;
  return _ttsMuted;
}

/** Lit l'état muet des annonces vocales sans le modifier. */
export function isTtsMuted() {
  return _ttsMuted;
}

/**
 * Prononce un texte dans la langue actuellement sélectionnée (parmi les 6
 * supportées), avec la meilleure voix système disponible pour cette langue.
 * No-op silencieux si l'API n'est pas supportée, si le son est coupé (touche
 * M, cf. musicPlayer.js::isMuted), si les annonces vocales sont coupées (touche
 * T, ci-dessus), ou si le texte est vide.
 *
 * 2026-07-29 — NE coupe plus la parole en cours à chaque appel : un même tour
 * de jeu peut désormais déclencher plusieurs annonces (points, mission
 * terminée, nouvelle mission), qui doivent s'enchaîner dans l'ordre plutôt que
 * s'annuler l'une l'autre (speechSynthesis.speak() les met naturellement en
 * file). Voir resetTtsQueue() ci-dessous pour l'annulation "nouveau tour".
 *
 * Fire-and-forget : réservé aux annonces UI isolées (EDA, aide, T/M, langue,
 * thème) qui coupent déjà tout avec resetTtsQueue() juste avant. Les annonces
 * de tour (points/missions/stats) passent par _speakAndWait + _enqueue plus
 * bas, qui ont besoin de savoir QUAND une phrase se termine pour intercaler
 * correctement les jingles .ogg — cf. bug 2026-07-31 ci-dessous.
 */
export function speak(text) {
  if (!text) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (isMuted() || _ttsMuted) return;

  const langCode = getGameLang();
  const locale = TTS_LOCALES[langCode] ?? TTS_LOCALES.fr;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = locale;
  const voice = _pickVoice(locale, langCode);
  if (voice) utter.voice = voice;

  window.speechSynthesis.speak(utter);
}

// ─── File d'attente séquentielle des annonces d'un même tour ──────────────────
// 2026-07-31 — bug constaté : avec 3 annonces enchaînées dans un même tour
// (ex. points, mission terminée, nouvelle mission), le jingle .ogg de la 3e
// partait TOUT DE SUITE (au moment de l'appel JS) au lieu d'attendre que les
// 2 premières phrases aient fini d'être prononcées — parce que le jingle était
// joué immédiatement puis le TTS seulement mis dans la file NATIVE de
// speechSynthesis (qui, elle, respecte bien l'ordre des voix, mais ne peut pas
// intercaler un fichier audio hors-TTS au bon moment).
//
// Fix : notre propre file d'attente séquentielle (Promise chaînées), où chaque
// annonce de tour n'est traitée qu'une fois la précédente réellement terminée
// (attend l'événement onend/onerror de l'utterance, pas juste son appel). Le
// jingle d'une annonce n'est donc joué que juste avant SA propre phrase, plus
// jamais en avance.
let _queueGen = 0;
let _queueTail = Promise.resolve();

function _waitMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Comme speak(), mais retourne une Promise résolue à la FIN réelle de l'énoncé. */
function _speakAndWait(text) {
  if (!text) return Promise.resolve();
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve();
  if (isMuted() || _ttsMuted) return Promise.resolve();

  return new Promise((resolve) => {
    const langCode = getGameLang();
    const locale = TTS_LOCALES[langCode] ?? TTS_LOCALES.fr;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = locale;
    const voice = _pickVoice(locale, langCode);
    if (voice) utter.voice = voice;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

/**
 * Ajoute une annonce de tour à la file séquentielle. `job` est marqué du
 * numéro de génération courant à l'ajout : si resetTtsQueue() est appelé entre
 * temps (nouveau tour), les jobs du tour précédent encore en attente sont
 * silencieusement ignorés dès leur tour venu plutôt que de parler en retard.
 */
function _enqueue(job) {
  const myGen = _queueGen;
  _queueTail = _queueTail.then(async () => {
    if (myGen !== _queueGen) return;
    await job();
  });
  return _queueTail;
}

/**
 * Coupe net toute annonce en cours ou en attente (ex. plusieurs poses de
 * tuile rapprochées) — à appeler UNE FOIS en tout début de traitement d'un
 * nouveau tour, avant la séquence d'annonces de ce tour (announcePoints /
 * announceMissionCompleted / announceNewMission), afin qu'un tour n'empiète
 * jamais sur les annonces laissées par le tour précédent tout en laissant les
 * annonces d'un même tour s'enchaîner normalement (cf. speak() ci-dessus).
 */
export function resetTtsQueue() {
  _queueGen++;
  _queueTail = Promise.resolve();
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
}

/**
 * Annonce "N points !" (traduit) pour une pose de tuile qui rapporte un score
 * strictement positif — même condition de déclenchement que showScorePopup
 * (cf. scene.js::placeTile). N'annonce rien pour un score nul, négatif, ou
 * non numérique.
 *
 * @param {number} score - valeur du dernier coup (ex. placedTile.score)
 */
export function announcePoints(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 0) return;
  _enqueue(() => _speakAndWait(_pointsTemplate.replace('{n}', Math.round(value))));
}

// ─── Jingles missions (nouvelle mission / mission réussie) — 2026-07-31 ───────
// Demande explicite : faire précéder les annonces vocales de mission d'un
// petit son (fourni par l'utilisateur dans /sounds/ui/), suivi d'une pause de
// 150ms avant d'envoyer le TTS — plutôt que TTS seul comme jusqu'ici.
//
// Étendu le même jour (2e demande) : chaque jingle devient un POOL de variantes
// (3 pour nouvelle mission, 4 pour mission réussie) — une piochée au hasard à
// CHAQUE annonce (Math.random(), pas de rotation/anti-répétition demandée),
// pour ne pas entendre toujours exactement le même son. `_pickCue()` mutualise
// le tirage pour les 2 pools.
const MISSION_NEW_SOUND_URLS = [
  './sounds/ui/mission-new-1.ogg',
  './sounds/ui/mission-new-2.ogg',
  './sounds/ui/mission-new-3.ogg',
];
const MISSION_SUCCESS_SOUND_URLS = [
  './sounds/ui/mission-succes-1.ogg',
  './sounds/ui/mission-succes-2.ogg',
  './sounds/ui/mission-succes-3.ogg',
  './sounds/ui/mission-succes-4.ogg',
];
const MISSION_SOUND_TO_TTS_DELAY_MS = 150;

/** Pioche une URL au hasard dans un pool de jingles. */
function _pickCue(urls) {
  return urls[Math.floor(Math.random() * urls.length)];
}

/**
 * Joue un son ponctuel (jingle UI) et attend sa fin réelle (évènement `ended`),
 * silencieux si Audio indisponible ou en erreur.
 *
 * 2026-07-31, erratum (2e passe) — avant ce fix, la fonction ne faisait que
 * DÉMARRER la lecture puis rendait la main aussitôt : correct tant que le
 * jingle unique d'origine (~1,2s) tenait dans le délai perçu, mais devenu
 * audible dès l'extension en pools (fichiers plus longs, ex. mission-new-2.ogg
 * ~2x plus gros que l'original) — le TTS démarrait 150ms après le DÉBUT du
 * son, pas après sa FIN, donc les deux se chevauchaient largement. Attendre
 * `ended` ici rend le comportement correct quelle que soit la durée du
 * fichier pioché dans le pool.
 */
function _playCue(url) {
  if (typeof window === 'undefined' || typeof window.Audio === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      audio.addEventListener('ended', () => resolve(), { once: true });
      audio.addEventListener('error', () => resolve(), { once: true });
      audio.play().catch(() => resolve());
    } catch (err) {
      console.warn(`[ttsAnnouncer] Impossible de jouer ${url}`, err);
      resolve();
    }
  });
}

/**
 * Joue un jingle UI jusqu'à sa fin, attend encore 150ms, PUIS prononce le
 * texte — mêmes garde-fous que speak() (son coupé, TTS coupé, texte vide)
 * vérifiés AVANT de jouer le jingle : pas de bip sans annonce vocale derrière
 * si tout est muet. Retourne une Promise résolue une fois la phrase terminée,
 * pour la file _enqueue.
 */
async function _playCueThenSpeak(url, text) {
  if (!text) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (isMuted() || _ttsMuted) return;
  await _playCue(url);
  await _waitMs(MISSION_SOUND_TO_TTS_DELAY_MS);
  await _speakAndWait(text);
}

/**
 * Annonce "Nouvelle mission : [titre]" (traduit), précédée d'un jingle piochée
 * au hasard dans MISSION_NEW_SOUND_URLS (3 variantes) + 150ms de pause, quand
 * une nouvelle mission vient d'être générée pour la tuile posée — même
 * déclencheur que le HUD Missions (cf. scene.js::placeTile,
 * placedTile.generatedMission / maybeAddMissionForCurrentTile). Réutilise
 * formatMissionTitle() pour obtenir exactement le même libellé que celui
 * affiché dans le HUD Missions.
 *
 * @param {object|null|undefined} mission - mission générée (ou rien à annoncer)
 */
export function announceNewMission(mission) {
  if (!mission) return;
  const title = formatMissionTitle(mission);
  const text = _newMissionTemplate.replace('{title}', title);
  const url = _pickCue(MISSION_NEW_SOUND_URLS);
  _enqueue(() => _playCueThenSpeak(url, text));
}

/**
 * Annonce "Bravo ! Mission terminée !" (traduit), précédée d'un jingle piochée
 * au hasard dans MISSION_SUCCESS_SOUND_URLS (4 variantes) + 150ms de pause,
 * quand une ou plusieurs missions viennent d'être complétées par la tuile
 * posée — même déclencheur que le HUD Missions (cf. scene.js::placeTile,
 * completedMissions / getCompletedMissions). Une seule annonce, même si
 * plusieurs missions sont complétées d'un coup (cas rare) — pas d'énumération
 * par mission.
 *
 * @param {Array} completedMissions - liste des missions complétées ce tour
 */
export function announceMissionCompleted(completedMissions) {
  if (!Array.isArray(completedMissions) || completedMissions.length === 0) return;
  const url = _pickCue(MISSION_SUCCESS_SOUND_URLS);
  _enqueue(() => _playCueThenSpeak(url, _missionCompletedTemplate));
}

// ─── Annonces UI (panneau EDA, aide en ligne) — 2e round, 2026-07-29 ───────────
// Déclenchements ISOLÉS (pas liés à un tour de pose de tuile) : on coupe net
// toute annonce en cours avant de parler, comme la touche T (retour immédiat sur
// une action UI explicite), plutôt que de mettre en file comme announcePoints
// et consorts (qui, eux, doivent s'enchaîner au sein d'un même tour — cf. speak()
// plus haut et resetTtsQueue() dans scene.js::placeTile).

/** Annonce "Éditeur de direction artistique" à l'OUVERTURE du panneau EDA (touche E ou clic). */
export function announceEdaOpened() {
  resetTtsQueue();
  speak(_edaOpenedTemplate);
}

/** Annonce "Aide" à l'OUVERTURE du menu d'aide (touche H, ESC, ou clic). */
export function announceHelpOpened() {
  resetTtsQueue();
  speak(_helpOpenedTemplate);
}

/**
 * Annonce "Voix activée" (même gabarit que le popup visuel, cf. scene.js) quand
 * la touche T RÉACTIVE les annonces vocales. À appeler APRÈS que `_ttsMuted` soit
 * repassé à `false` (sinon `speak()` s'auto-bloquerait) — cf. scene.js, appelé
 * juste après `toggleTtsMute()` quand celui-ci renvoie `false`. Pas d'équivalent
 * à la coupure (rien à prononcer une fois la voix coupée, par définition).
 */
export function announceVoiceOn() {
  resetTtsQueue();
  speak(_voiceOnTemplate);
}

/**
 * Annonce "Sons activés" (même gabarit que le popup visuel game.sound.on, cf.
 * scene.js) quand la touche M RÉACTIVE le son/musique/ambiance. Symétrique à
 * announceVoiceOn() ci-dessus mais pour M (soundDesign.js::toggleMute) plutôt que
 * T (touche dédiée au TTS). À appeler APRÈS toggleMute(), uniquement si le son
 * vient de repasser à l'état actif — sinon `speak()` se bloquerait lui-même via
 * `isMuted()` (le son venant tout juste d'être coupé). Rien n'est prononcé à la
 * coupure (silence par définition — annoncer "son coupé" à voix haute serait
 * contradictoire).
 */
export function announceSoundOn() {
  resetTtsQueue();
  speak(_soundOnTemplate);
}

/**
 * Annonce le nom de la langue nouvellement sélectionnée (ex. "Langue française"),
 * DANS cette langue — à appeler APRÈS que setGameLang() ait fini de propager la
 * nouvelle langue à tous les modules abonnés (dont ce fichier, via
 * registerLangRefresh), donc APRÈS résolution de sa Promise. Cf. edaPanelHost.js,
 * seul point d'entrée du sélecteur de langue du HUD (#gameLangSelect).
 */
export function announceLanguageChanged() {
  resetTtsQueue();
  speak(_languageChangedTemplate);
}

// ─── Annonces des compteurs du panneau STATISTIQUES DE LA PARTIE ──────────────
// (moulins/trains/bateaux/comètes) — 2e round, 2026-07-29. Un seul point d'appel
// (cf. scene.js::refreshStatsUI, appelé après CHAQUE pose/undo/sync/comète cassée)
// avec mémorisation de la valeur précédente de chacun des 4 compteurs : on
// n'annonce QUE si la valeur a réellement changé depuis le dernier appel (jamais
// au premier appel — pas d'annonce parasite "0 moulins" au chargement de la page).
function _announceCountIfChanged(newValue, prevRef, template) {
  const value = Number(newValue ?? 0);
  const changed = prevRef.value !== null && value !== prevRef.value;
  prevRef.value = value;
  // 2026-07-31 — passe par la même file que announcePoints/announceMissionCompleted/
  // announceNewMission (_enqueue), pas speak() direct : sinon un compteur annoncé
  // dans le même tour pourrait doubler une phrase encore en cours au lieu d'attendre
  // son tour (même bug de fond que le jingle de mission parti trop tôt).
  if (changed) _enqueue(() => _speakAndWait(template.replace('{n}', value)));
}

const _millRef   = { value: null };
const _trainRef  = { value: null };
const _boatRef   = { value: null };
const _cometRef  = { value: null };

/**
 * À appeler après chaque recalcul des statistiques de la partie (cf.
 * scene.js::refreshStatsUI). Annonce individuellement chaque compteur parmi
 * moulins/trains/bateaux/comètes qui a changé depuis le dernier appel — mise
 * en file (pas d'annulation) : ces annonces peuvent s'enchaîner avec
 * announcePoints/announceMissionCompleted/announceNewMission au sein du même
 * tour de pose de tuile.
 *
 * @param {object} stats - objet stats (cf. getGameStats/getFullGameStats) :
 *   millCount, trainLines, boatCount, cometHits.
 */
export function announceStatsIfChanged(stats) {
  if (!stats) return;
  _announceCountIfChanged(stats.millCount,  _millRef,  _millsTemplate);
  _announceCountIfChanged(stats.trainLines, _trainRef, _trainsTemplate);
  _announceCountIfChanged(stats.boatCount,  _boatRef,  _boatsTemplate);
  _announceCountIfChanged(stats.cometHits,  _cometRef, _cometsTemplate);
}
