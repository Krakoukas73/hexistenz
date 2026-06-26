/**
 * hexLabelFont.js — chargement de HexgonBold pour les sprites canvas.
 *
 * Diagnostic des tentatives précédentes :
 *   document.fonts.add(f) + requestAnimationFrame ne garantit pas que le moteur
 *   canvas a enregistré la police — ce comportement est non spécifié et
 *   varie selon les navigateurs.
 *
 * Solution définitive :
 *   document.fonts.load(spec) est l'unique API garantissant qu'une police est
 *   prête pour ctx.font dans un canvas. Elle résout seulement quand la police
 *   est disponible pour le rendu canvas, pas juste chargée en mémoire.
 *
 *   L'URL est relative (./) pour fonctionner quel que soit le sous-dossier
 *   où le jeu est hébergé.
 */

export const HEX_FONT_FAMILY = 'DeltaBlock, system-ui, sans-serif';
export const sharedLabelCache = new Map();

// CSS @font-face — pour les contextes DOM (HUD, etc.)
{
  const style = document.createElement('style');
  style.textContent = `@font-face {
    font-family: 'DeltaBlock';
    src: url('./fonts/DeltaBlock-Regular.ttf') format('truetype');
    font-weight: 100 900;
    font-display: block;
  }`;
  document.head.appendChild(style);
}

// FontFace API — chemin relatif à la page (pas au fichier JS)
const _face = new FontFace('DeltaBlock', "url('./fonts/DeltaBlock-Regular.ttf')", {
  weight: '100 900',
  display: 'block',
});

export const hexFontReady = _face.load()
  .then(f => {
    document.fonts.add(f);
    return document.fonts.load('900 96px DeltaBlock');
  })
  .then(() => {
    sharedLabelCache.clear();
  })
  .catch(err => {
    console.error('[DeltaBlock] ✗ échec chargement :', err);
    sharedLabelCache.clear();
  });
