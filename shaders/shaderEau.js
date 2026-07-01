/**
 * shaderEau.js — Eau « cute cartoon » + écume voronoï animée (portée de Danil).
 *
 * Surface posée par waterSurfaceOverlay.js. Attributs :
 *   aShoreDist : distance MONDE au contour (champ continu) → profondeur + bande d'écume
 *   aSteep     : profil de rive [0=abrupt,1=doux] → longueur du dégradé + portée d'écume
 *
 * Écume : voronoï lissé animé d'Inigo Quilez (https://www.shadertoy.com/view/ldB3zc)
 * tel que réutilisé par Danil (https://www.shadertoy.com/view/wldcW2), porté en
 * world-space et masqué par la proximité du rivage. Palette blue→white de Danil.
 *
 * Le vertex injecte ${WORLD_CURVATURE_SHADER}.
 */

export function waterVertexShaderTemplate(worldCurvatureGlsl) {
  return /* glsl */`
    attribute float aShoreDist;
    attribute float aSteep;

    varying vec3  vWorldPosition;
    varying float vShoreDist;
    varying float vSteep;

    uniform float uTime;

    ${worldCurvatureGlsl}

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vec2 p = worldPos.xz;

      float waveDamp = smoothstep(0.0, 0.35, aShoreDist);
      float wave = (sin(p.x * 1.8 + uTime * 1.05) + sin(p.y * 2.3 - uTime * 1.30)) * 0.5;

      vec3 transformed = position;
      transformed.y += wave * 0.022 * waveDamp;

      vec4 displaced = modelMatrix * vec4(transformed, 1.0);
      displaced = dorfromantikApplyWorldCurvature(displaced);
      vWorldPosition = displaced.xyz;
      vShoreDist = aShoreDist;
      vSteep = aSteep;

      gl_Position = projectionMatrix * viewMatrix * displaced;
    }
  `;
}

/**
 * Écume voronoï partagée (eau + traînée bateau) — helpers IQ / Danil
 * (ldB3zc, XdXGW8) + foamPattern(wp, time, scale). Exporté pour réutilisation.
 */
export const FOAM_GLSL = /* glsl */`
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  // Voronoï lissé animé (IQ) — 3×3 (suffisant grâce au lissage w).
  vec2 voronoi(in vec2 x, float w, float time) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    vec2 m = vec2(8.0, 0.0);
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      o = 0.5 + 0.5 * sin(time + 6.2831 * o);
      float d = length(g - f + o);
      float h = smoothstep(0.0, 1.0, 0.5 + 0.5 * (m.x - d) / w);
      m.x = mix(m.x, d, h) - h * (1.0 - h) * w / (1.0 + 3.0 * w);
      m.y = mix(m.y, 0.75, h) - h * (1.0 - h) * w / (1.0 + 3.0 * w);
    }
    return m;
  }

  float noise2(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(hash22(i + vec2(0,0)), f - vec2(0,0)),
                   dot(hash22(i + vec2(1,0)), f - vec2(1,0)), u.x),
               mix(dot(hash22(i + vec2(0,1)), f - vec2(0,1)),
                   dot(hash22(i + vec2(1,1)), f - vec2(1,1)), u.x), u.y);
  }

  // Texture d'écume de Danil (https://www.shadertoy.com/view/wldcW2) :
  // produit de DEUX voronoï sur le canal VALEUR (.y). Le produit (~0.25..0.56)
  // chute aux bords de cellules → réseau de formes blanches connectées une fois
  // seuillé (Danil seuille td.y vers 0.478). Animé, world-space.
  float foamTex(vec2 wp, float scale, float time) {
    vec2 p = wp * scale;
    float a = voronoi(p * vec2(1.0, 0.5),       0.51, time * 0.15).y;
    float b = voronoi(p * vec2(0.5, 0.5) + 3.0, 0.51, time * 0.08).y;
    return a * b;
  }

  // Masque d'écume à bord net : écume là où la texture est SOUS le seuil 'thr'.
  // thr ≈ coverage (↑ = plus d'écume) ; 'sharp' = largeur de transition.
  float foamPattern(vec2 wp, float time, float scale, float cov, float density, float sharp) {
    float tex = foamTex(wp, scale, time);
    float thr = density * clamp(cov, 0.0, 1.0);
    return 1.0 - smoothstep(thr, thr + sharp, tex);
  }
`;

export const waterFragmentShader = /* glsl */`
  varying vec3  vWorldPosition;
  varying float vShoreDist;
  varying float vSteep;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uFoamWidth;     // portée de la bande d'écume (m)
  uniform float uFoamScale;     // échelle du motif voronoï
  uniform float uFoamDensity;   // couverture d'écume rive (plafond)
  uniform float uFoamAmbient;   // seuil d'écume de surface (partout) — bas = épars
  uniform float uFoamSharp;     // netteté du bord
  uniform float uFoamSpeed;     // vitesse d'animation de l'écume
  uniform float uDeepDistance;
  uniform vec3  uDeepColor;
  uniform vec3  uShallowColor;
  uniform vec3  uFoamColor;
  uniform vec3  uSkyColor;

  ${FOAM_GLSL}

  void main() {
    vec2 p = vWorldPosition.xz;

    // ── Profondeur (dégradé resserré + profil variable) ─────────────────────
    float deepDist = uDeepDistance * mix(0.45, 1.7, vSteep);
    float depthT = smoothstep(0.0, deepDist, vShoreDist);
    vec3 base = mix(uShallowColor, uDeepColor, depthT);

    // ── Normales de vague (pour reflets/glints) ─────────────────────────────
    float eps = 0.16;
    float hL = (sin((p.x-eps)*1.8 + uTime*1.05) + sin(p.y*2.3 - uTime*1.30));
    float hR = (sin((p.x+eps)*1.8 + uTime*1.05) + sin(p.y*2.3 - uTime*1.30));
    float hD = (sin(p.x*1.8 + uTime*1.05) + sin((p.y-eps)*2.3 - uTime*1.30));
    float hU = (sin(p.x*1.8 + uTime*1.05) + sin((p.y+eps)*2.3 - uTime*1.30));
    vec3 n = normalize(vec3((hL - hR) * 0.07, 1.0, (hD - hU) * 0.07));
    vec3 vDir = normalize(cameraPosition - vWorldPosition);

    // ── Faux reflets ciel (Fresnel léger) + glints soleil ───────────────────
    float fres = pow(1.0 - max(dot(n, vDir), 0.0), 3.0);
    base = mix(base, uSkyColor, fres * 0.32);
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.35));
    vec3 halfDir  = normalize(vDir + lightDir);
    base += pow(max(dot(n, halfDir), 0.0), 60.0) * 0.45;

    // ── Écume Danil : texture unique, seuil qui monte de la surface vers la rive ─
    float tex = foamTex(p, uFoamScale, uTime * uFoamSpeed);
    float reach = uFoamWidth * mix(0.65, 1.6, vSteep);
    float cov = 1.0 - smoothstep(0.0, max(reach, 0.001), vShoreDist);  // 1 à la rive → 0
    float thr = mix(uFoamAmbient, uFoamDensity, cov);  // surface (subtil) → rive (dense)
    float foam = 1.0 - smoothstep(thr, thr + uFoamSharp, tex);
    base = mix(base, uFoamColor, foam);

    // ── Alpha (transparence affinée en P3) ──────────────────────────────────
    float alpha = uOpacity * mix(0.66, 1.0, depthT);
    alpha = max(alpha, foam);

    base = pow(clamp(base, 0.0, 1.0), vec3(0.9));
    gl_FragColor = vec4(base, clamp(alpha, 0.0, 1.0));
  }
`;
