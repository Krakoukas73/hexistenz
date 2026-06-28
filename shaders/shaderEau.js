/**
 * shaderEau.js — Shaders GLSL de l'eau réaliste.
 *
 * Utilisé par realisticWater.js.
 * Note : le vertex shader utilise ${WORLD_CURVATURE_SHADER} injecté à la volée
 * par realisticWater.js via interpolation de template literal.
 *
 * Exports :
 *   waterVertexShaderTemplate   — template string (contient ${WORLD_CURVATURE_SHADER})
 *   waterFragmentShader         — fragment shader complet
 *
 * Partie 1 — normales procédurales hL/hR/hU/hD, Fresnel visible (0.55),
 *            ombrage directionnel diffuse + specular.
 * Partie 2 — gradient bathymétrique via attribute aShoreDepth posé CPU
 *            (2 anneaux de voisins eau, normalisé 0–1) : rivières clair, mers sombres.
 * Partie 3 — Voronoï deux usages :
 *   - grande échelle (5 u) via voronoiGrad() : perturbe les normales → courants
 *     visibles à moyenne / longue distance sans révéler de cellules identifiables.
 *   - échelle moyenne (2.8 u) : modulation couleur ±0.28 → masses d'eau lisibles.
 */

/**
 * Template du vertex shader eau.
 * À appeler sous forme de fonction pour injecter WORLD_CURVATURE_SHADER :
 *   waterVertexShaderTemplate(WORLD_CURVATURE_SHADER)
 *
 * Attribute entrant : aShoreDepth (float, 0=rive, 1=eau ouverte)
 * Varyings produits : vWorldPosition, vWave, vShoreDepth
 * Uniforms : uTime
 */
export function waterVertexShaderTemplate(worldCurvatureGlsl) {
  return /* glsl */`
    attribute float aShoreDepth;    // 0 = rive isolée, 1 = eau ouverte (calculé CPU, 2 anneaux)

    varying vec3  vWorldPosition;
    varying float vWave;
    varying float vShoreDepth;

    uniform float uTime;

    ${worldCurvatureGlsl}

    void main() {
      vec3 transformed = position;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vec2 p = worldPos.xz;

      float swellA = sin(p.x * 2.35 + p.y * 0.55 + uTime * 1.15) * 0.034;  // était 0.040 → −15 %
      float swellB = cos(p.y * 3.10 - p.x * 0.45 - uTime * 1.38) * 0.027;  // était 0.032 → −16 %
      float chopA  = sin((p.x + p.y) * 5.25 + uTime * 2.65) * 0.015;       // était 0.018 → −17 %
      float chopB  = cos((p.x - p.y) * 6.70 - uTime * 2.05) * 0.012;       // était 0.015 → −20 %
      float wave   = swellA + swellB + chopA + chopB;

      // Atténuation près des rives : minimum 0.18 à la rive (léger clapotis résiduel),
      // plein au large (aShoreDepth ≥ 0.65). Évite une surface morte au contact terre/eau.
      float shoreWaveFactor = mix(0.18, 1.0, smoothstep(0.0, 0.65, aShoreDepth));
      // −0.012 : abaisse légèrement le niveau moyen pour éviter de recouvrir les plages.
      transformed.y += wave * shoreWaveFactor - 0.012;
      vWave       = wave;
      vShoreDepth = aShoreDepth;

      vec4 displacedWorld = modelMatrix * vec4(transformed, 1.0);
      displacedWorld = dorfromantikApplyWorldCurvature(displacedWorld);
      vWorldPosition = displacedWorld.xyz;

      gl_Position = projectionMatrix * viewMatrix * displacedWorld;
    }
  `;
}

/**
 * Fragment shader eau.
 *
 * Uniforms  : uTime, uOpacity, uDeepColor, uShallowColor
 * Varyings  : vWorldPosition, vWave, vShoreDepth
 * Built-ins : cameraPosition (Three.js ShaderMaterial auto-inject)
 *
 * Pipeline :
 *   1. Normales de vague (dérivées finies hL/hR/hU/hD).
 *   2. Voronoï grande échelle (5 u) via voronoiGrad() → direction de courant voroDir.
 *   2b. FBM advecté par voroDir (P_Malin — "Where the River Goes") :
 *        double sample décalé de 0.5 en temps → flowNorm sans artefact de glissement.
 *        Blend 48 % waveNorm + 52 % flowNorm → courants qui suivent réellement le flow.
 *   3. Fresnel (1−NdotV)×0.55.
 *   4. Voronoï couleur (2.8 u) : modulation ±0.28 du paramètre de mélange.
 *   5. Bathymétrie vShoreDepth^0.6 → rivières claires, mers très sombres.
 *   6. Couleur de base mix(deep, shallow, finalT).
 *   7. Diffuse + specular depuis normales combinées.
 *   8. Fresnel teinté.
 *   9. Gamma.
 */
export const waterFragmentShader = /* glsl */`
  varying vec3  vWorldPosition;
  varying float vWave;
  varying float vShoreDepth;

  uniform float uTime;
  uniform float uOpacity;
  uniform vec3  uDeepColor;
  uniform vec3  uShallowColor;

  // ── Hauteur de vague — reprend exactement la formule du vertex shader ───────
  float waveH(vec2 p) {
    // Amplitudes alignées sur le vertex shader (réduites ~15-20 %)
    return sin(p.x * 2.35 + p.y * 0.55 + uTime * 1.15) * 0.034
         + cos(p.y * 3.10 - p.x * 0.45 - uTime * 1.38) * 0.027
         + sin((p.x + p.y) * 5.25  + uTime * 2.65) * 0.015
         + cos((p.x - p.y) * 6.70  - uTime * 2.05) * 0.012;
  }

  // ── Hash partagé Voronoï ──────────────────────────────────────────────────
  vec2 voroHash(vec2 p) {
    return fract(sin(vec2(
      dot(p, vec2(127.1, 311.7)),
      dot(p, vec2(269.5, 183.3))
    )) * 43758.5453123);
  }

  // ── Voronoï deux passes — bords précis (Xuan Yang / iquilezles) ──────────
  //
  // Passe 1 (3×3) : trouve la cellule la plus proche → minOff, minVec.
  // Passe 2 (5×5 centré sur minOff) : distance exacte au bord de Voronoï
  //   via la formule de projection iquilezles :
  //   borderD = dot(½(minVec + r), normalize(r − minVec))
  //
  // Avantage vs simple distance-to-center :
  //   les bords sont des lignes précises (≈0), pas des zones floues.
  //   La modulation de couleur crée des frontières nettes entre les masses d'eau.
  //
  // Retourne vec3(borderDist, dir.x, dir.z) :
  //   borderDist ≈ 0  sur un bord, ≈ 0.35–0.50 au cœur d'une cellule.
  //   dir        = direction normalisée fragment→centre de cellule (→ entrée fbmFlowDXY).
  //
  // ts = vitesse de dérive temporelle des centres (0.10 grande éch., 0.11 couleur).
  vec3 voronoiBorder(vec2 p, float ts) {
    vec2  ip     = floor(p);
    vec2  fp     = fract(p);
    float minD   = 50.0;
    vec2  minOff = vec2(0.0);
    vec2  minVec = vec2(0.0, 1.0);

    // Passe 1 — cellule la plus proche
    for (int jj = -1; jj <= 1; jj++) {
      for (int ii = -1; ii <= 1; ii++) {
        vec2 off    = vec2(float(ii), float(jj));
        vec2 center = voroHash(ip + off);
        center = 0.5 + 0.5 * sin(uTime * ts + 6.28318 * center);
        center += off;
        vec2  r = center - fp;
        float d = dot(r, r);
        if (d < minD) { minD = d; minOff = off; minVec = r; }
      }
    }

    // Passe 2 — distance au bord de Voronoï (formule iquilezles)
    float borderD = 50.0;
    for (int jj = -2; jj <= 2; jj++) {
      for (int ii = -2; ii <= 2; ii++) {
        vec2 off    = minOff + vec2(float(ii), float(jj));
        vec2 center = voroHash(ip + off);
        center = 0.5 + 0.5 * sin(uTime * ts + 6.28318 * center);
        center += off;
        vec2 r = center - fp;
        borderD = min(borderD, dot(0.5 * (minVec + r), normalize(r - minVec)));
      }
    }

    float dist = sqrt(minD);
    vec2  dir  = dist > 0.001 ? minVec / dist : vec2(0.0, 1.0);
    return vec3(borderD, dir);
  }

  // ── Hash scalaire robuste (P_Malin / "Where the River Goes") ────────────
  float flowHash(float p) {
    vec2 p2 = fract(vec2(p) * vec2(4.438975, 3.972973));
    p2 += dot(p2.yx, p2.xy + 19.19);
    return fract(p2.x * p2.y);
  }

  // ── Hash 2D depuis float — décalage UV aléatoire par cycle ───────────────
  // Casse la répétition visible à chaque boucle de 1/tCycle secondes.
  vec2 flowHash2(float p) {
    vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  // ── Smooth noise avec dérivées analytiques ───────────────────────────────
  // Retourne vec3(dNoise/dx, dNoise/dy, valeur).
  // Les dérivées sont exactes (Hermite cubite), pas des différences finies.
  vec3 smoothNoiseDXY(vec2 p) {
    vec2  ip = floor(p);
    vec2  fp = fract(p);
    float n  = ip.x + ip.y * 57.0;
    float a  = flowHash(n       );
    float b  = flowHash(n +  1.0);
    float c  = flowHash(n + 57.0);
    float d  = flowHash(n + 58.0);
    vec2  t  = fp * fp * (3.0 - 2.0 * fp);
    vec2  dt = fp * (6.0 - 6.0 * fp);
    float u = t.x,  v  = t.y;
    float du = dt.x, dv = dt.y;
    float val = a + (b-a)*u + (c-a)*v + (a-b+d-c)*u*v;
    float dx  = (b-a)*du + (a-b+d-c)*du*v;
    float dy  = (c-a)*dv + (a-b+d-c)*u*dv;
    return vec3(dx, dy, val);
  }

  // ── FBM avec advection de flow (P_Malin) ─────────────────────────────────
  // p    : UV monde de départ
  // flow : vecteur de courant (décalage progressif par octave)
  // ps   : persistance (0.75 = décroissance douce)
  // df   : domain warping (0.18 = léger — évite les artefacts géométriques)
  // Retourne vec3(dFBM/dx, dFBM/dy, valeur) / poids total.
  // L'alternance (* −0.75) crée des méandres plutôt qu'une direction unique.
  vec3 fbmFlowDXY(vec2 p, vec2 flow, float ps, float df) {
    vec3  f   = vec3(0.0);
    float tot = 0.0;
    float a   = 1.0;
    for (int i = 0; i < 4; i++) {
      p    += flow;
      flow *= -0.75;
      vec3 v = smoothNoiseDXY(p);
      f    += v * a;
      p    += v.xy * df;
      p    *= 2.0;
      tot  += a;
      a    *= ps;
    }
    return f / tot;
  }

  // voronoi() supprimé — remplacé par voronoiBorder() (deux passes, voir ci-dessus)

  void main() {
    vec2 p = vWorldPosition.xz;

    // ── 1. Normales de vague (dérivées finies) ──────────────────────────────
    // Même formule que le vertex shader : clapotis résiduel minimum 0.18 à la rive.
    float shoreWaveF = mix(0.18, 1.0, smoothstep(0.0, 0.65, vShoreDepth));
    float eps = 0.12;
    float hL  = waveH(p - vec2(eps, 0.0)) * shoreWaveF;
    float hR  = waveH(p + vec2(eps, 0.0)) * shoreWaveF;
    float hU  = waveH(p + vec2(0.0, eps)) * shoreWaveF;
    float hD  = waveH(p - vec2(0.0, eps)) * shoreWaveF;
    vec3 waveNorm = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));

    // ── 2. Voronoï grande échelle → direction de courant + borderD ──────────
    // Cellules ~5 unités monde (~5 hexagones) : masses d'eau et courants.
    // Dérive très lente (0.010 / 0.007) : courants quasi-stables à l'écran.
    vec3  vB1     = voronoiBorder(p / 5.0 + vec2(uTime * 0.010, uTime * 0.007), 0.10);
    vec2  voroDir = vB1.yz;    // direction normalisée fragment → centre de cellule
    float borderD1 = vB1.x;    // ≈ 0 aux bords de masses d'eau, ≈ 0.4 au cœur

    // ── 2b. FBM advecté par courant — double sample P_Malin ─────────────────
    // Deux samples décalés de 0.5 en temps, crossfadés pour éliminer l'artefact
    // de "glissement" visible à la jonction de chaque cycle.
    // Cycle ≈ 24 s (tCycle = uTime * 0.042).
    float tCycle    = uTime * 0.042;
    float t0        = fract(tCycle);
    float t1        = fract(tCycle + 0.5);
    float o0        = t0 - 0.5;               // oscillation −0.5 → +0.5
    float o1        = t1 - 0.5;
    vec2  seed0     = flowHash2(floor(tCycle));
    vec2  seed1     = flowHash2(floor(tCycle + 0.5));

    float flowStr   = 0.44;                    // amplitude du décalage de flow par octave
    vec3  dxy0      = fbmFlowDXY(p * 1.4 + seed0, voroDir * o0 * flowStr, 0.75, 0.18);
    vec3  dxy1      = fbmFlowDXY(p * 1.4 + seed1, voroDir * o1 * flowStr, 0.75, 0.18);
    float fbmBlend  = abs(t0 - 0.5) * 2.0;    // 0 au centre du cycle, 1 en bord
    vec3  dxy       = mix(dxy0, dxy1, fbmBlend);

    // Magnitude de la normale FBM : réduite là où le courant est faible
    float flowMag   = 2.8 / (1.0 + dot(voroDir, voroDir) * 2.0);
    vec3  flowNorm  = normalize(vec3(-dxy.x * flowMag, 1.0, -dxy.y * flowMag));

    // Normale finale : 48 % vague sinusoïdale (cohérence avec vertex displacement)
    //                + 52 % FBM advecté par courant (méandres organiques)
    vec3 wNorm = normalize(waveNorm * 0.48 + flowNorm * 0.52);

    // ── 3. Fresnel ──────────────────────────────────────────────────────────
    vec3  vDir  = normalize(cameraPosition - vWorldPosition);
    float NdotV = max(dot(wNorm, vDir), 0.0);
    float fresnel = (1.0 - NdotV) * 0.55;

    // ── 4. Voronoï couleur — bords précis (Xuan Yang) ───────────────────────
    // Cellules ~2.8 unités : variation de teinte entre les masses d'eau.
    // borderD2 ≈ 0 au bord de cellule, ≈ 0.4 au cœur.
    // Modulation : bords = plus sombre (eau profonde entre deux courants),
    //              cœur  = plus clair (courant de surface). Lignes nettes vs
    //              ancien gradient radial flou de voronoi().
    vec3  vB2      = voronoiBorder(p / 2.8 + vec2(uTime * 0.018, uTime * 0.011), 0.11);
    float borderD2 = vB2.x;
    float voroColor = (smoothstep(0.0, 0.40, borderD2) - 0.5) * 0.65;

    // ── 5. Bathymétrie (courbe douce → gradient visible même en rivière) ────
    // vShoreDepth : 0 = rive, 1 = mer ouverte (calculé CPU sur 2 anneaux).
    // pow(depth, 0.6) : courbe concave, plus réactive aux faibles valeurs.
    // Une rivière (vShoreDepth ≈ 0.2–0.4) atteint déjà depth ≈ 0.40–0.60
    // soit finalT ≈ 0.40–0.60 → mélange visible deep↔shallow.
    float depth  = pow(clamp(vShoreDepth, 0.0, 1.0), 0.6);
    float t      = 1.0 - depth;   // 0 = profond (deep), 1 = rive (shallow)
    float finalT = clamp(t + voroColor, 0.02, 0.96);

    // ── 6. Couleur de base ───────────────────────────────────────────────────
    vec3 base = mix(uDeepColor, uShallowColor, finalT);

    // ── 7. Ombrage directionnel ─────────────────────────────────────────────
    vec3  lightDir    = normalize(vec3(0.6, 1.0, 0.4));
    float diffuse     = max(dot(wNorm, lightDir), 0.0);
    // Plage élargie [0.78, 1.22] : les courants Voronoï créent un relief d'ombrage plus marqué.
    float shadeFactor = 0.78 + diffuse * 0.44;
    base = clamp(base * shadeFactor, 0.0, 1.0);

    // ── 8. Specular (crêtes de vague + reflets de courant) ──────────────────
    vec3  halfDir = normalize(vDir + lightDir);
    float spec    = pow(max(dot(wNorm, halfDir), 0.0), 14.0) * 0.14;
    base = clamp(base + spec * mix(vec3(0.70, 0.85, 1.0), uShallowColor, 0.45), 0.0, 1.0);

    // ── 9. Reflet Fresnel teinté ─────────────────────────────────────────────
    base += fresnel * mix(uDeepColor, uShallowColor, 0.82) * 0.50;

    // ── 10. Correction gamma ─────────────────────────────────────────────────
    base = pow(clamp(base, 0.0, 1.0), vec3(0.88));

    gl_FragColor = vec4(base, uOpacity);
  }
`;
