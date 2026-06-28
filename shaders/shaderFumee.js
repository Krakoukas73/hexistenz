/**
 * shaderFumee.js — Fumée volumétrique pour Hexistenz.
 *
 * v4 : Gaussian pur (plus de tube creux → plus d'anneaux),
 *      évasement réel avec la hauteur, turbulence plus visible,
 *      animation plus rapide.
 */

export const SMOKE_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SMOKE_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;       // depth buffer de la scène (beautyRenderTarget)
  uniform float     uTime;
  uniform vec3      uCamPos;
  uniform mat4      uProjInv;
  uniform mat4      uCamWorld;
  uniform mat4      uViewMat;     // camera.matrixWorldInverse
  uniform mat4      uProjMat;     // camera.projectionMatrix
  uniform vec3      uSmokePos[48];
  uniform float     uSmokeCount;
  uniform float     uLocoCount;   // nb de locos en tête du tableau (scale ×1.14)
  uniform float     uHasDepth;    // 1.0 si tDepth est valide, 0.0 sinon

  varying vec2 vUv;

  // Slab world-Y du volume de fumée
  #define SMOKE_Y_BASE  (-0.05)
  #define SMOKE_Y_TOP    1.3

  // ── Bruit de valeur procédural ───────────────────────────────────────────────

  float hash13(vec3 p) {
    p  = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float v000 = hash13(i);
    float v100 = hash13(i + vec3(1,0,0));
    float v010 = hash13(i + vec3(0,1,0));
    float v110 = hash13(i + vec3(1,1,0));
    float v001 = hash13(i + vec3(0,0,1));
    float v101 = hash13(i + vec3(1,0,1));
    float v011 = hash13(i + vec3(0,1,1));
    float v111 = hash13(i + vec3(1,1,1));
    return mix(
      mix(mix(v000,v100,f.x), mix(v010,v110,f.x), f.y),
      mix(mix(v001,v101,f.x), mix(v011,v111,f.x), f.y),
      f.z
    );
  }

  vec2 valueNoise2(vec3 p) {
    return vec2(valueNoise(p), valueNoise(p + vec3(31.41, 27.18, 53.58)));
  }

  // Turbulence 4 octaves (4 suffit, 5ème octave invisible à cette échelle)
  vec2 turbulence(vec3 p) {
    vec2  t = vec2(0.0);
    float w = 1.0;
    for (int i = 0; i < 4; i++) {
      t += abs(valueNoise2(p)) * w;
      w *= 0.5;
      p *= 2.8;
    }
    return t - vec2(0.94);   // centrage empirique pour 4 octaves
  }

  // Dérive turbulente animée — amplitude croît avec la hauteur
  vec2 phaseShift(vec3 q) {
    float g = q.y * 0.18 + 0.025;   // +60% amplitude → dérive plus visible
    vec3  p = vec3(
      q.x * 4.0 + uTime * 0.36,     // fréquence + vitesse horizontale ×1.6
      q.y * 2.0 - uTime * 0.88,     // remontée du bruit ×1.6
      q.z * 4.0 + uTime * 0.15
    );
    return g * turbulence(p);
  }

  // ── Densité d'une source ──────────────────────────────────────────────────────
  //
  //  Gaussian évasé — pas de tube creux → pas d'anneaux.
  //  sigma(y) : étroit à la base, large au sommet.

  // s = facteur d'échelle : 1.14 pour locos, 0.86 pour maisons
  float densityFromSource(vec3 p, vec3 src, float s) {
    vec3 q = p - src;

    float height   = 0.68 * s;
    float precull  = 0.101 * s * s;   // (rayon_ref * s)²
    float sigBase  = 0.034 * s;
    float sigSlope = 0.136 * s;
    float baseF    = 0.051 * s;

    if (q.y < 0.0 || q.y > height) return 0.0;
    if (dot(q.xz, q.xz) > precull) return 0.0;

    vec2 drift = phaseShift(q);
    vec2 qd    = q.xz + drift;

    float sigma  = sigBase + q.y * sigSlope;
    float sigma2 = sigma * sigma;
    float col    = exp(-dot(qd, qd) / sigma2);

    float topFade  = pow(max(0.0, 1.0 - q.y / height), 1.8);
    float baseFade = smoothstep(0.0, baseF, q.y);

    return col * topFade * baseFade;
  }

  float density(vec3 p) {
    float d = 0.0;
    for (int i = 0; i < 48; i++) {
      if (float(i) >= uSmokeCount) break;
      float s = float(i) < uLocoCount ? 1.14 : 0.86;
      d += densityFromSource(p, uSmokePos[i], s);
    }
    return d;
  }

  // ── Ray-march linéaire borné au slab Y ──────────────────────────────────────

  vec4 march(vec3 O, vec3 D, float tMin, float tMax) {
    const int STEPS = 48;
    float sz    = (tMax - tMin) / float(STEPS);   // taille d'un pas (sz ≠ builtin step())
    vec4  accum = vec4(0.0);

    // Matrice monde→clip précalculée une fois pour le depth test
    mat4 worldToClip = uProjMat * uViewMat;

    for (int i = 0; i < STEPS; i++) {
      float t   = tMin + (float(i) + 0.5) * sz;
      vec3  pos = O + t * D;

      // ── Depth test : occulter la fumée derrière la géométrie de scène ──
      if (uHasDepth > 0.5) {
        vec4  clipPos  = worldToClip * vec4(pos, 1.0);
        vec3  ndc      = clipPos.xyz / clipPos.w;
        float stepZ    = ndc.z * 0.5 + 0.5;                   // profondeur du pas [0,1]
        float sceneZ   = texture2D(tDepth, ndc.xy * 0.5 + 0.5).r;
        if (stepZ > sceneZ + 0.001) continue;                  // pas derrière la scène
      }

      float dens = density(pos) * sz * 5.5;
      dens = clamp(dens, 0.0, 1.0);

      // Teinte : gris légèrement bleuté en bas, blanc cassé en haut
      float hf  = clamp(pos.y / 0.68, 0.0, 1.0);
      vec3  col = mix(vec3(0.70, 0.74, 0.78), vec3(0.88, 0.88, 0.88), hf);

      accum.rgb += col * dens * (1.0 - accum.a);
      accum.a   += dens       * (1.0 - accum.a);

      if (accum.a > 0.92) break;
    }
    return accum;
  }

  // ── Reconstruction du rayon ──────────────────────────────────────────────────

  vec3 getRayDir(vec2 uv) {
    vec4 clip  = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    vec4 vDir  = uProjInv * clip;
    vDir.xyz  /= vDir.w;
    vDir.w     = 0.0;
    return normalize((uCamWorld * vDir).xyz);
  }

  // ── Main ─────────────────────────────────────────────────────────────────────

  void main() {
    vec4 sceneColor = texture2D(tDiffuse, vUv);

    if (uSmokeCount < 1.0) {
      gl_FragColor = sceneColor;
      return;
    }

    vec3 D = getRayDir(vUv);
    vec3 O = uCamPos;

    // Intersection rayon × slab Y
    float tMin, tMax;
    const float Y_BASE = SMOKE_Y_BASE;
    const float Y_TOP  = SMOKE_Y_TOP;

    if (abs(D.y) > 0.0001) {
      float tA = (Y_BASE - O.y) / D.y;
      float tB = (Y_TOP  - O.y) / D.y;
      tMin = max(0.05, min(tA, tB));
      tMax = max(tA, tB);
    } else {
      if (O.y < Y_BASE || O.y > Y_TOP) {
        gl_FragColor = sceneColor;
        return;
      }
      tMin = 0.05;
      tMax = 60.0;
    }

    if (tMin >= tMax || tMax < 0.05) {
      gl_FragColor = sceneColor;
      return;
    }

    vec4 smoke = march(O, D, tMin, tMax);

    gl_FragColor = vec4(smoke.rgb + sceneColor.rgb * (1.0 - smoke.a), 1.0);
  }
`;
