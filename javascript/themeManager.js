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

export function getTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : 'ancien';
  } catch {
    return 'ancien';
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
