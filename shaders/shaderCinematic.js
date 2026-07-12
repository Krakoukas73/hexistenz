/**
 * shaderCinematic.js — Shader de post-traitement cinématique (ex-shaderCinematique.js, renommé en anglais le 2026-07-11).
 *
 * Importé directement par threeSetup.js (ex-détour via cinematicPass.js, simple
 * ré-export de compatibilité supprimé le 2026-07-11, round 4, cf. CONTEXT.md §21).
 *
 * Effets :
 *   1. Distorsion barillet  (barrel lens distortion)
 *   2. Tilt-shift           (flou gaussien 9-tap vertical hors bande nette)
 *   3. Aberration chrom.    (décalage radial R/B, par canal dans le blur)
 *   4. Halation             (halo chaud autour des hautes lumières — 8 samples)
 *   5. Vignette             (fondu radial aux bords)
 *   6. Grain film animé     (bruit blanc à 2 fréquences, piloté par uTime)
 *   7. Scan lines           (assombrissement 1 ligne sur 2, style CRT/argentique)
 *   8. God Rays             (rayons crépusculaires screen-space vers le soleil à l'écran)
 *   9. Bloom                (extraction hautes lumières + flou radial approx. 8-tap, réadditionné)
 *  10. Courbure écran (CRT) (déformation des UV avant échantillonnage + masque/assombrissement coins)
 *
 * Tous les effets sont court-circuités par `uEnabled < 0.5` → zéro coût GPU.
 * God Rays a en plus son propre bypass (`uGodRays < 0.001`) : zéro échantillon
 * texture supplémentaire quand l'intensité est à 0, indépendamment des autres effets.
 * Bloom (`uBloomIntensity < 0.001`) et Courbure écran (`uCrtCurvature < 0.001`) suivent
 * le même principe : bypass indépendant, sous-paramètres (seuil/rayon/douceur pour le
 * bloom, masque/assombrissement coins pour la courbure) sans effet tant que le
 * paramètre maître de leur groupe est à 0 — même logique que godRaysLength/Diffusion/
 * Threshold vis-à-vis de uGodRays.
 * uTime et uResolution sont mis à jour chaque frame par threeSetup.js.
 *
 * Export : CINEMATIC_SHADER
 */

export const CINEMATIC_SHADER = {
  name: 'CinematicShader',

  uniforms: {
    tDiffuse:     { value: null  },
    uEnabled:     { value: 0.0  },
    // tilt-shift
    uTilt:        { value: 0.60 },
    uFocusCenter: { value: 0.50 },
    uFocusBand:   { value: 0.35 },
    // vignette
    uVignette:    { value: 0.55 },
    // grain
    uGrain:       { value: 0.30 },
    // aberration chromatique
    uChromatic:   { value: 0.45 },
    // halation (bloom chaud sur hautes lumières)
    uHalation:    { value: 0.25 },
    // distorsion barillet (lens distortion)
    uBarrel:      { value: 0.08 },
    // scan lines (lignes CRT / argentique)
    uScanLines:   { value: 0.0  },
    uScanLinesIntensity: { value: 0.52 }, // profondeur du noir des scanlines : 0 = transparent, 1 = noir total (défaut = ancienne valeur fixe 0.52)
    // God Rays — radial blur screen-space vers la position écran du soleil
    uGodRays:          { value: 0.0  }, // intensité, 0 = désactivé (bypass total)
    uGodRaysLength:    { value: 0.40 }, // portée des échantillons (fraction de l'écran)
    uGodRaysDiffusion: { value: 0.85 }, // atténuation par échantillon (0=rayons courts, 1=longs/doux)
    uGodRaysThreshold: { value: 0.70 }, // seuil de luminance à partir duquel un pixel "source" contribue
    uGodRaysLayers:    { value: 0.0  }, // feuilletage : bandes de densité superposées (0 = dégradé lisse)
    // Bloom — extraction hautes lumières + flou radial approx. (bypass total à 0)
    uBloomIntensity: { value: 0.0  }, // intensité, 0 = désactivé (bypass total)
    uBloomThreshold: { value: 0.75 }, // seuil de luminance au-delà duquel un pixel contribue au bloom
    uBloomRadius:    { value: 2.0  }, // rayon du flou en pixels écran
    uBloomSoftness:  { value: 0.4  }, // douceur de la transition seuil (largeur du smoothstep)
    // Courbure écran (CRT) — déformation des UV avant échantillonnage (bypass total à 0)
    uCrtCurvature:  { value: 0.0  }, // intensité de la courbure, 0 = aucune déformation (bypass total)
    uCrtMask:       { value: 0.5  }, // masque hors-écran / bords noirs quand les UV sortent du cadre
    uCrtCornerDark: { value: 0.2  }, // assombrissement additionnel des coins, style tube CRT
    // uTime mis à jour chaque frame par threeSetup.js
    uTime:        { value: 0.0  },
    // uResolution : initialisé et mis à jour par threeSetup.js (THREE.Vector2 requis)
    // uSunScreenPos : position écran (uv 0..1) du soleil, mise à jour chaque frame
    // → ne pas mettre ici pour éviter la dépendance à THREE dans ce fichier.
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    precision mediump float;

    uniform sampler2D tDiffuse;
    uniform float uEnabled;
    uniform float uTilt;
    uniform float uFocusCenter;
    uniform float uFocusBand;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uChromatic;
    uniform float uHalation;
    uniform float uBarrel;
    uniform float uScanLines;
    uniform float uScanLinesIntensity;
    uniform float uGodRays;
    uniform float uGodRaysLength;
    uniform float uGodRaysDiffusion;
    uniform float uGodRaysThreshold;
    uniform float uGodRaysLayers;
    uniform vec2  uSunScreenPos;
    uniform float uBloomIntensity;
    uniform float uBloomThreshold;
    uniform float uBloomRadius;
    uniform float uBloomSoftness;
    uniform float uCrtCurvature;
    uniform float uCrtMask;
    uniform float uCrtCornerDark;
    uniform float uTime;
    uniform vec2  uResolution;

    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {

      // Bypass total : zéro coût GPU (aucun échantillon supplémentaire) quand le
      // master cinéma est désactivé — cf. commentaire d'en-tête du fichier.
      if (uEnabled < 0.5) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      vec2  crtC        = vUv - 0.5;
      vec2  uv          = vUv;
      vec3  col         = texture2D(tDiffuse, uv).rgb;
      vec2  dir         = uv - 0.5;
      float crtInBounds = 1.0;

      {

        // ── -1. Courbure écran (CRT) — déformation des UV avant tout échantillonnage ──────
        // Paramètre séparé de la distorsion barillet ci-dessous (autre effet, autre usage) :
        // ici on simule la surface incurvée d'un tube cathodique, appliquée AVANT le barillet.
        // Bypass total (uCrtCurvature < 0.001) : les sous-paramètres uCrtMask / uCrtCornerDark
        // n'ont alors aucun effet, quelle que soit leur valeur (même principe que God Rays).
        vec2 uvCrt = vUv;
        if (uCrtCurvature > 0.001) {
          // Anisotropie légère : courbure verticale un peu plus faible que l'horizontale,
          // comme sur beaucoup de vrais tubes CRT (rayon de courbure vertical plus grand).
          vec2 crtAxis = vec2(1.0, 0.85);
          uvCrt = vUv + crtC * dot(crtC, crtC) * uCrtCurvature * 1.35 * crtAxis;
          crtInBounds = step(0.0, uvCrt.x) * step(uvCrt.x, 1.0) * step(0.0, uvCrt.y) * step(uvCrt.y, 1.0);
        }

        // ── 0. Distorsion barillet ───────────────────────────────────────────────
        vec2 bc = uvCrt - 0.5;
        float bk = uBarrel * dot(bc, bc) * 3.2;
        uv = clamp(0.5 + bc * (1.0 + bk), 0.0, 1.0);

        // ── 1. Tilt-shift : blur gaussien vertical hors bande nette ─────────────
        float distFromBand = max(0.0, abs(uv.y - uFocusCenter) - uFocusBand * 0.5);
        float blur = distFromBand * distFromBand * uTilt * 0.062;

        // ── 2. Aberration chromatique ────────────────────────────────────────────
        dir = uv - 0.5;
        float edgeD = length(dir * vec2(1.6, 1.0));
        float caAmt = uChromatic * (0.005 + blur * 0.28) * edgeD;
        vec2  uvR   = clamp(uv + dir * caAmt, 0.0, 1.0);
        vec2  uvB   = clamp(uv - dir * caAmt, 0.0, 1.0);

        float blurR = max(0.0, abs(uvR.y - uFocusCenter) - uFocusBand * 0.5);
        blurR = blurR * blurR * uTilt * 0.062;
        float blurB = max(0.0, abs(uvB.y - uFocusCenter) - uFocusBand * 0.5);
        blurB = blurB * blurB * uTilt * 0.062;

        // ── 3. 9 taps gaussiens par canal R / G / B (σ = 1.8) ──────────────────
        float r = 0.0, g = 0.0, b = 0.0, tw = 0.0;
        for (int i = -4; i <= 4; i++) {
          float fi = float(i);
          float w  = exp(-fi * fi / 6.48);
          r  += texture2D(tDiffuse, clamp(vec2(uvR.x, uvR.y + fi * blurR), 0.0, 1.0)).r * w;
          g  += texture2D(tDiffuse, clamp(vec2(uv.x,  uv.y  + fi * blur ), 0.0, 1.0)).g * w;
          b  += texture2D(tDiffuse, clamp(vec2(uvB.x, uvB.y + fi * blurB), 0.0, 1.0)).b * w;
          tw += w;
        }
        col = vec3(r, g, b) / tw;

        // ── 4. Halation : halo chaud sur hautes lumières ─────────────────────────
        float hR   = uHalation * 0.022;
        vec3  hGlo = vec3(0.0);
        float hW   = 0.0;
        vec3  _hs;
        float _e;
        _hs = texture2D(tDiffuse, clamp(vec2(uv.x + hR*0.30, uv.y          ), 0.0, 1.0)).rgb; _e = max(0.0, dot(_hs, vec3(0.299,0.587,0.114)) - 0.72); hGlo += _hs*_e; hW += _e;
        _hs = texture2D(tDiffuse, clamp(vec2(uv.x - hR*0.30, uv.y          ), 0.0, 1.0)).rgb; _e = max(0.0, dot(_hs, vec3(0.299,0.587,0.114)) - 0.72); hGlo += _hs*_e; hW += _e;
        _hs = texture2D(tDiffuse, clamp(vec2(uv.x + hR*0.65, uv.y          ), 0.0, 1.0)).rgb; _e = max(0.0, dot(_hs, vec3(0.299,0.587,0.114)) - 0.72); hGlo += _hs*_e; hW += _e;
        _hs = texture2D(tDiffuse, clamp(vec2(uv.x - hR*0.65, uv.y          ), 0.0, 1.0)).rgb; _e = max(0.0, dot(_hs, vec3(0.299,0.587,0.114)) - 0.72); hGlo += _hs*_e; hW += _e;
        _hs = texture2D(tDiffuse, clamp(vec2(uv.x,           uv.y + hR*0.30), 0.0, 1.0)).rgb; _e = max(0.0, dot(_hs, vec3(0.299,0.587,0.114)) - 0.72); hGlo += _hs*_e; hW += _e;
        _hs = texture2D(tDiffuse, clamp(vec2(uv.x,           uv.y - hR*0.30), 0.0, 1.0)).rgb; _e = max(0.0, dot(_hs, vec3(0.299,0.587,0.114)) - 0.72); hGlo += _hs*_e; hW += _e;
        _hs = texture2D(tDiffuse, clamp(vec2(uv.x,           uv.y + hR*0.65), 0.0, 1.0)).rgb; _e = max(0.0, dot(_hs, vec3(0.299,0.587,0.114)) - 0.72); hGlo += _hs*_e; hW += _e;
        _hs = texture2D(tDiffuse, clamp(vec2(uv.x,           uv.y - hR*0.65), 0.0, 1.0)).rgb; _e = max(0.0, dot(_hs, vec3(0.299,0.587,0.114)) - 0.72); hGlo += _hs*_e; hW += _e;
        if (hW > 0.001) col += (hGlo / hW) * vec3(1.5, 0.65, 0.40) * uHalation * 0.42;

        // ── 4b. God Rays : radial blur screen-space vers la position écran du soleil ──
        // Pas d'occlusion pré-calculée (pas de RenderPass/buffer supplémentaire) : on
        // réutilise tDiffuse lui-même comme approximation du masque de source — seuls les
        // pixels au-dessus de uGodRaysThreshold (ciel/soleil) contribuent aux rayons, ce qui
        // laisse naturellement apparaître des faisceaux découpés par les silhouettes
        // (arbres, tours) sans passe additionnelle.
        if (uGodRays > 0.001) {
          const int NUM_GODRAY_SAMPLES = 16;
          vec2  toSun  = uSunScreenPos - uv;
          vec2  grStep = toSun * (uGodRaysLength / float(NUM_GODRAY_SAMPLES));
          vec2  grUv   = uv;
          float decay  = 1.0;
          vec3  grAccum = vec3(0.0);
          // Décalage spatial (basé sur uv) pour que les tranches ne forment pas des anneaux
          // parfaitement concentriques autour du soleil — aspect plus organique.
          float layerPhase0 = uv.x * 9.0 - uv.y * 6.0;
          for (int i = 0; i < NUM_GODRAY_SAMPLES; i++) {
            grUv += grStep;
            vec2 grUvClamped = clamp(grUv, 0.0, 1.0);
            vec3 grSample = texture2D(tDiffuse, grUvClamped).rgb;
            float grLum = dot(grSample, vec3(0.299, 0.587, 0.114));
            float grMask = smoothstep(uGodRaysThreshold, uGodRaysThreshold + 0.15, grLum);
            // Feuilletage : module la contribution de chaque tranche par une onde de densité
            // le long du rayon → effet de nappes / voiles superposés plus ou moins opaques,
            // au lieu d'un dégradé continu uniforme. Coût nul en plus (mêmes 16 échantillons).
            float layerWave = 0.5 + 0.5 * sin(layerPhase0 + float(i) * (2.2 + uGodRaysLayers * 3.4));
            float layerWeight = mix(1.0, 0.35 + 0.65 * layerWave, uGodRaysLayers);
            grAccum += grSample * grMask * decay * layerWeight;
            decay *= uGodRaysDiffusion;
          }
          col += (grAccum / float(NUM_GODRAY_SAMPLES)) * uGodRays * 1.6;
        }

        // ── 4c. Bloom léger sur hautes lumières ──────────────────────────────────
        // Extraction seuil (uBloomThreshold) + flou radial approx. 8 échantillons + centre.
        // Ne floute pas toute l'image : seuls les pixels au-dessus du seuil contribuent,
        // le reste de l'accumulation reste nul. Bypass total à 0 (mêmes principes que God Rays).
        if (uBloomIntensity > 0.001) {
          vec2  bloomTexel = 1.0 / max(uResolution, vec2(1.0));
          float bloomRad   = max(uBloomRadius, 0.0);
          float bloomSoft  = max(uBloomSoftness, 0.001);
          float bloomHi    = uBloomThreshold + bloomSoft * 0.5 + 0.02;
          const int BLOOM_TAPS = 8;
          vec3 bloomAccum = vec3(0.0);
          for (int i = 0; i < BLOOM_TAPS; i++) {
            float ang  = (float(i) + 0.5) * (6.28318 / float(BLOOM_TAPS));
            vec2  offs = vec2(cos(ang), sin(ang)) * bloomTexel * bloomRad;
            vec3  bs   = texture2D(tDiffuse, clamp(uv + offs, 0.0, 1.0)).rgb;
            float bl   = dot(bs, vec3(0.299, 0.587, 0.114));
            bloomAccum += bs * smoothstep(uBloomThreshold, bloomHi, bl);
          }
          // Échantillon central : contribution de la couleur déjà accumulée (tilt/CA/halation/god rays)
          float centerLum = dot(col, vec3(0.299, 0.587, 0.114));
          bloomAccum += col * smoothstep(uBloomThreshold, bloomHi, centerLum);
          col += (bloomAccum / float(BLOOM_TAPS + 1)) * uBloomIntensity;
        }

        // ── 5. Vignette radiale ──────────────────────────────────────────────────
        float vd   = dot(dir * 1.35, dir * 1.35);
        float vign = pow(clamp(1.0 - vd, 0.0, 1.0), uVignette * 2.0 + 0.15);
        col *= vign;

        // ── 5b. Courbure écran (CRT) — masque hors-écran + assombrissement progressif des bords ──
        // Actif uniquement si la courbure est engagée (uCrtCurvature > 0) : sinon
        // crtInBounds vaut toujours 1 et cette étape n'a aucun effet, quels que soient
        // uCrtMask / uCrtCornerDark — ne modifie donc jamais le rendu existant (barillet,
        // vignette, etc.) quand la courbure écran n'est pas utilisée.
        if (uCrtCurvature > 0.001) {
          float crtMaskFactor = mix(1.0, crtInBounds, uCrtMask);
          col *= crtMaskFactor;
          // Distance "bord" (Chebyshev, max = 0.5 tout le long du pourtour, pas seulement
          // aux coins) mélangée à la distance radiale (max aux coins) : assombrit tous les
          // bords progressivement, en restant un peu plus marqué dans les coins — comme un
          // vrai tube CRT, où le vignettage n'est pas nul sur les bords droits/gauches.
          float crtEdgeDist   = max(abs(crtC.x), abs(crtC.y));
          float crtRadialDist = dot(crtC, crtC);
          float crtDarkDist   = mix(crtEdgeDist, crtRadialDist, 0.4);
          float crtCornerFactor = 1.0 - uCrtCornerDark * smoothstep(0.22, 0.50, crtDarkDist);
          col *= crtCornerFactor;
        }

        // ── 6. Grain film animé ──────────────────────────────────────────────────
        float t     = fract(uTime * 0.041);
        float noise = rand(uv * 1.61 + t) + rand(uv * 3.07 - t * 1.3) - 1.0;
        col += noise * uGrain * 0.040;

        // ── 7. Scan lines ─────────────────────────────────────────────────────────
        // uScanLinesIntensity : profondeur du noir (0 = transparent/aucun assombrissement,
        // 1 = noir total) — remplace l'ancienne constante fixe 0.52 codée en dur.
        float slPos  = mod(vUv.y * uResolution.y, 8.0);
        float slDark = step(0.5, uScanLines) * (1.0 - step(uScanLines, slPos));
        col *= 1.0 - slDark * uScanLinesIntensity;
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};
