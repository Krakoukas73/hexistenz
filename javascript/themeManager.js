// ─── themeManager.js — plomberie du sélecteur de thème graphique (2026-07-17) ───
// 2 thèmes pour tout le HUD — "ancien" (valeur interne INCHANGÉE, affiché
// "Médiéval" dans l'UI — parchemin, technique CSS border-image 9-slice ;
// **thème par défaut depuis 2026-07-17**) et "bleu" (fonds légèrement
// transparents et bleutés, liseré bleu lumineux, coins arrondis).
// Ce module ne fait QUE la plomberie : persistance du choix + attribut data-theme
// sur <html>, exactement comme gameLangReactive.js le fait pour la langue — le
// câblage visuel vit dans css/themes/bleu.css et medieval.css (prez, déplacés
// dans css/themes/ le 2026-07-17 puis renommés theme-bleu.css/theme-ancien.css
// → bleu.css/medieval.css le même jour, noms de fichiers seuls — la valeur
// interne du thème reste "ancien" partout, cf. THEMES ci-dessous) et des blocs
// [data-theme="..."] directement dans base.css/eda.css/help.css/etc. (in-game).
// Chantier considéré clos (~100% de l'UI convertie), cf. CONTEXT.md §32.
export const THEMES = ['bleu', 'ancien'];
const STORAGE_KEY = 'hexistenz_theme';

// 2026-08-01 — demande explicite : le thème par défaut ("ancien"/Médiéval,
// cf. commentaire d'en-tête) est visuellement lourd (cadre décoratif 4 côtés,
// parchemins 9-slice, cf. CONTEXT.md §39) et prend beaucoup de place en
// pixels — pénalisant sur petit écran. Détection mobile (Android/iOS/autres)
// pour ne préférer "bleu" QUE quand le visiteur n'a JAMAIS choisi de thème
// lui-même (aucune entrée localStorage) — un choix explicite, même sur
// mobile, reste toujours prioritaire et n'est jamais écrasé.
// Détection volontairement simple (regex UA), cohérente avec le reste du
// projet qui n'utilise aucune lib de détection dédiée : navigator.userAgent
// couvre Android/iPhone/iPad/iPod ; userAgentData.mobile (Client Hints,
// Chrome/Edge récents) utilisé en complément quand disponible, plus fiable
// sur les Chromebooks/tablettes qui usurpent parfois un UA desktop.
function isMobileDevice() {
  try {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      return navigator.userAgentData.mobile;
    }
  } catch {}
  try {
    return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}

export function getTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (THEMES.includes(stored)) return stored;
    return isMobileDevice() ? 'bleu' : 'ancien';
  } catch {
    return isMobileDevice() ? 'bleu' : 'ancien';
  }
}

/** Applique le thème courant sur <html data-theme="..."> sans le persister (utilisé au chargement). */
export function applyTheme(theme = getTheme()) {
  if (!THEMES.includes(theme)) theme = 'ancien';
  document.documentElement.dataset.theme = theme;
  return theme;
}

/** Point d'entrée unique pour changer de thème (sélecteur prez, futur sélecteur in-game). */
export function setTheme(theme) {
  if (!THEMES.includes(theme)) theme = 'ancien';
  try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  applyTheme(theme);
  return theme;
}
