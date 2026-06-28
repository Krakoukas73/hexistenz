/**
 * shadersEffects.js — GLSL shaders pour les effets visuels de Hexistenz.
 *
 * Ce fichier centralise tous les shaders GLSL du projet pour faciliter
 * la maintenance et la réutilisation.
 *
 * Exports actuels :
 *   grassBladeVertexShader   — spine Bezier cubique + vent value-noise
 *   grassBladeFragmentShader — shading gradient + diffuse + translucidité
 */

// ─────────────────────────────────────────────────────────────────────────────
// GRASS BLADE — Brins de prairie (Cubic Bezier Grass)
//
// Traduction du shader ShaderToy "Cubic Bezier Grass" (altunenes, 2026, MIT)
// https://www.shadertoy.com/view/lslGR8
//
// Vertex  : spine Bezier cubique (eB), vent value-noise Dave Hoskins (wd),
//           taper, rounded-normal trick, courbure monde.
// Fragment: gradient ShaderToy render() — base/mid/tip + diffuse + translucidité.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vertex shader d'un brin de prairie.
 *
 * Attributs per-instance (InstancedBufferAttribute) :
 *   aOffset    vec2  — position XZ du pied du brin dans l'espace local tuile
 *   aYaw       float — angle de face (direction de penchement)
 *   aHeight    float — scale hauteur
 *   aWidth     float — scale largeur
 *   aTilt      float — BLADE_TILT (penchement avant)
 *   aBend      float — BLADE_BEND (courbure)
 *   aPhase     float — phase vent 0-1 (×2π dans wd())
 *   aColorMix  float — variation couleur cluster 0-1
 *
 * Uniforms attendus :
 *   uTime, uWindStrength, uWindSpeed, uWindSway,
 *   uGlobalHeight, uWorldCurvatureEnabled
 *
 * Varyings produits :
 *   vT        float — position normalisée 0→1 le long du brin
 *   vColorMix float — repassé au fragment
 *   vNormal   vec3  — normal arrondi (rounded-normal trick ShaderToy)
 */
export const grassBladeVertexShader = /* glsl */`
  attribute vec2  aOffset;    // position XZ du pied du brin dans la tuile
  attribute float aYaw;       // angle de face (direction de penchement)
  attribute float aHeight;    // scale hauteur per-instance
  attribute float aWidth;     // scale largeur per-instance
  attribute float aTilt;      // BLADE_TILT per-instance
  attribute float aBend;      // BLADE_BEND per-instance
  attribute float aPhase;     // phase vent (0-1 → ×2π dans wd())
  attribute float aColorMix;  // variation couleur cluster (0-1)

  uniform float uTime;
  uniform float uWindStrength;
  uniform float uWindSpeed;
  uniform float uWindSway;
  uniform float uGlobalHeight;
  uniform float uWorldCurvatureEnabled;

  varying float vT;
  varying float vColorMix;
  varying vec3  vNormal;

  // ── Hash & noise (Dave Hoskins, identiques au ShaderToy) ──────────────
  float h12(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(h12(i),             h12(i + vec2(1,0)), f.x),
      mix(h12(i + vec2(0,1)), h12(i + vec2(1,1)), f.x),
      f.y
    );
  }

  mat2 rot2(float a) { float s = sin(a), c = cos(a); return mat2(c,-s,s,c); }

  void main() {
    // t = position normalisée le long du brin (0 = sol, 1 = pointe)
    float t = clamp(position.y, 0.0, 1.0);
    float u = 1.0 - t;

    float h = aHeight * uGlobalHeight;

    // Direction de face du brin (XZ)
    vec3 fw = vec3(sin(aYaw), 0.0, cos(aYaw));

    // Offset de largeur des deux strips croisés (appliqué après rotation)
    vec2 wOff = rot2(aYaw) * position.xz * aWidth;

    // ── Vent (ShaderToy wd()) ────────────────────────────────────────────
    vec2 noiseUV = aOffset * 0.8
                 + vec2(uTime * uWindSpeed, uTime * uWindSpeed * 0.4);
    float sw = sin(uTime * 2.0 + aPhase * 6.28318) * uWindSway;
    vec3 wind = vec3(
      (vn(noiseUV)             - 0.5) * uWindStrength + sw,
      0.0,
      (vn(noiseUV + vec2(7.3)) - 0.5) * uWindStrength + sw * 0.4
    ) * h;   // scalé par hauteur réelle (ShaderToy : w = wd()*h)

    // ── Control points Bezier (ShaderToy sB()) ───────────────────────────
    float tl = aTilt * h;
    float bd = aBend * h;
    vec3 p0 = vec3(0.0);
    vec3 p1 = vec3(0.0, h * 0.35, 0.0) + fw * (tl * 0.05) + wind * 0.15;
    vec3 p2 = vec3(0.0, h * 0.72, 0.0) + fw * (tl * 0.55 + bd * 0.6) + wind * 0.55;
    vec3 p3 = vec3(0.0, h,         0.0) + fw * tl + wind;

    // ── Évaluation Bezier cubique (ShaderToy eB()) ───────────────────────
    vec3 spine = u*u*u*p0 + 3.0*u*u*t*p1 + 3.0*u*t*t*p2 + t*t*t*p3;

    // Tangente (dérivée du Bezier)
    vec3 tg = normalize(
      3.0*u*u*(p1-p0) + 6.0*u*t*(p2-p1) + 3.0*t*t*(p3-p2)
    );

    // Taper (ShaderToy eB() tp)
    float tp = pow(1.0 - t, 1.6)
             * smoothstep(1.0, 0.92, t)
             * (smoothstep(0.0, 0.05, t) * 0.3 + 0.7);

    // Position finale = spine + offset largeur tapered
    vec3 p = spine + vec3(wOff.x, 0.0, wOff.y) * tp;
    p.xz += aOffset;

    // ── Rounded normal (ShaderToy trick) ─────────────────────────────────
    vec3 wDir  = normalize(cross(tg, fw));
    vec3 flatN = normalize(cross(wDir, tg));
    float side = (abs(position.x) > abs(position.z))
               ? sign(position.x) : sign(position.z);
    vNormal = normalize(flatN + wDir * side * 0.65);

    vT        = t;
    vColorMix = aColorMix;

    // ── Courbure monde (mode bouliste) ───────────────────────────────────
    vec4 worldPos = modelMatrix * vec4(p, 1.0);
    if (uWorldCurvatureEnabled > 0.5) {
      float dist2 = dot(worldPos.xz, worldPos.xz);
      worldPos.y -= min(240.0, dist2 / (2.0 * 22.0));
    }
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

/**
 * Fragment shader d'un brin de prairie.
 *
 * Uniforms attendus :
 *   uBottomColor vec3
 *   uMidColor    vec3
 *   uTipColor    vec3
 *   uSunDir      vec3
 *
 * Varyings consommés :
 *   vT, vColorMix, vNormal
 */
export const grassBladeFragmentShader = /* glsl */`
  uniform vec3  uBottomColor;
  uniform vec3  uMidColor;
  uniform vec3  uTipColor;
  uniform vec3  uSunDir;

  varying float vT;
  varying float vColorMix;
  varying vec3  vNormal;

  void main() {
    // Couleur de base du cluster (variation inter-brins via aColorMix)
    vec3 clusterCol = mix(uBottomColor, uMidColor, vColorMix * 0.6);

    // Gradient ShaderToy render() :
    // bC = mix(c*0.25, c*1.35 + tint, smoothstep(0,1,t)) * mix(0.35, 1, t)
    vec3 bC = mix(
      clusterCol * 0.25,
      clusterCol * 1.35 + vec3(0.05, 0.10, 0.02),
      smoothstep(0.0, 1.0, vT)
    ) * mix(0.35, 1.0, vT);

    // Pointe : teinte légèrement plus claire / jaune-vert
    bC = mix(bC, uTipColor, smoothstep(0.78, 1.0, vT) * 0.45);

    // Diffuse (ShaderToy : df = dot(N, SUN_DIR))
    float df = clamp(dot(normalize(vNormal), uSunDir), 0.0, 1.0);

    // Translucidité pointe (ShaderToy : tr = smoothstep(0.3, 0.95, ht.v))
    float tr = smoothstep(0.3, 0.95, vT);

    // Assemblage final
    vec3 col = bC * (0.55 + 0.70 * df)
             + vec3(0.55, 0.85, 0.25) * tr * 0.22;

    gl_FragColor = vec4(col, 1.0);
  }
`;
