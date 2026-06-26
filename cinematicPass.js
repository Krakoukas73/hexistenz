/**
 * cinematicPass.js — Effets cinématiques
 *
 *  1. Distorsion barillet  (barrel lens distortion)
 *  2. Tilt-shift           (flou gaussien 9-tap vertical hors bande nette)
 *  3. Aberration chrom.    (décalage radial R/B, par canal dans le blur)
 *  4. Halation             (halo chaud autour des hautes lumières — 8 samples)
 *  5. Vignette             (fondu radial aux bords)
 *  6. Grain film animé     (bruit blanc à 2 fréquences, piloté par uTime)
 *  7. Scan lines           (assombrissement 1 ligne sur 2, style CRT/argentique)
 *
 * Tous les effets sont court-circuités par `uEnabled < 0.5` → zéro coût GPU.
 * uTime et uResolution sont mis à jour chaque frame par threeSetup.js.
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
    // uTime mis à jour chaque frame par threeSetup.js
    uTime:        { value: 0.0  },
    // uResolution : initialisé et mis à jour par threeSetup.js (THREE.Vector2 requis)
    // → ne pas mettre ici pour éviter la dépendance à THREE dans ce fichier.
    // threeSetup.js injecte l'uniform après création du ShaderPass.
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
    uniform float uTime;
    uniform vec2  uResolution;

    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {

      // Bypass complet si désactivé — zéro coût GPU
      if (uEnabled < 0.5) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      // ── 0. Distorsion barillet ───────────────────────────────────────────────
      // uv recentré, distordu radialement, reclampé.
      // Un uBarrel faible (~0.08) donne une déformation d'objectif grand-angle
      // subtile ; > 0.25 devient un effet "fisheye" marqué.
      vec2 bc = vUv - 0.5;
      float bk = uBarrel * dot(bc, bc) * 3.2;
      vec2 uv = clamp(0.5 + bc * (1.0 + bk), 0.0, 1.0);

      // ── 1. Tilt-shift : blur gaussien vertical hors bande nette ─────────────
      float distFromBand = max(0.0, abs(uv.y - uFocusCenter) - uFocusBand * 0.5);
      float blur = distFromBand * distFromBand * uTilt * 0.062;

      // ── 2. Aberration chromatique ────────────────────────────────────────────
      vec2  dir   = uv - 0.5;
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
      vec3 col = vec3(r, g, b) / tw;

      // ── 4. Halation : halo chaud sur hautes lumières ─────────────────────────
      // 8 samples en croix (H + V) à deux distances — simule le saignement
      // de lumière dans l'émulsion argentique (rouge-orangé chaud).
      // Seuil luminance 0.72 → seules les zones très claires contribuent.
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

      // ── 5. Vignette radiale ──────────────────────────────────────────────────
      float vd   = dot(dir * 1.35, dir * 1.35);
      float vign = pow(clamp(1.0 - vd, 0.0, 1.0), uVignette * 2.0 + 0.15);
      col *= vign;

      // ── 6. Grain film animé ──────────────────────────────────────────────────
      float t     = fract(uTime * 0.041);
      float noise = rand(uv * 1.61 + t) + rand(uv * 3.07 - t * 1.3) - 1.0;
      col += noise * uGrain * 0.040;

      // ── 7. Scan lines ─────────────────────────────────────────────────────────
      // uScanLines = 0–6 : nombre de pixels sombres par cycle de 8 px.
      //   0 → off, 1 → 1/8, 3 → Amiga (3/8), 4 → Apple II / CGA / EGA (4/8), 6 → 6/8.
      // step(0.5, uScanLines) court-circuite tout quand uScanLines = 0.
      float slPos  = mod(vUv.y * uResolution.y, 8.0);
      float slDark = step(0.5, uScanLines) * (1.0 - step(uScanLines, slPos));
      col *= 1.0 - slDark * 0.52;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};
