/**
 * shaderCiel.js — Shaders GLSL du ciel volumétrique avec nuages.
 *
 * Approche : sphère atmosphérique centrée sous la caméra (cameraPosition.y − 450, r=500).
 * La caméra est à l'intérieur de la sphère → chaque rayon sort par la surface opposée.
 * Seuls les rayons montants (rd.y ≥ 0.02) ray-marchent la couche nuageuse.
 * Guard pos.y < 1.0 : stoppe la marche avant de descendre sous le plateau de jeu.
 *
 * Uniforms exposés :
 *   uTime        — temps animé (secondes)
 *   uSunDir      — direction normalisée vers le soleil (vec3)
 *   uSkyZenith   — couleur ciel au zénith (vec3)
 *   uSkyHorizon  — couleur ciel à l'horizon (vec3)
 *   uSunColor    — teinte de l'halo solaire (vec3)
 *   uCoverage    — couverture nuageuse 0–1 (float, défaut 0.42)
 *   uEnabled     — 0.0 = ciel uni, 1.0 = nuages actifs (float)
 *
 * Exports :
 *   cloudVertexShader    — vertex shader (passe vWorldPos)
 *   cloudFragmentShader  — fragment shader complet
 */

// ─── Vertex ─────────────────────────────────────────────────────────────────

export const cloudVertexShader = /* glsl */`
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// ─── Fragment ────────────────────────────────────────────────────────────────

export const cloudFragmentShader = /* glsl */`
  precision mediump float;

  uniform float uTime;
  uniform vec3  uSunDir;
  uniform vec3  uSkyZenith;
  uniform vec3  uSkyHorizon;
  uniform vec3  uSunColor;
  uniform float uCoverage;   // 0 = ciel clair, 1 = couvert
  uniform float uEnabled;    // 0.0 = bypass

  varying vec3 vWorldPos;

  // ── Constantes ─────────────────────────────────────────────────────────────
  #define PI         3.14159265359
  #define STEPS      25
  #define ABSORPTION 1.030725
  #define THICKNESS  15.0
  #define FBM_FREQ   2.76434

  // ── Value noise (IQ hash) — identique au Shadertoy source ────────────────
  // Retourne [0,1] sans crêtes ni artefacts de signe → nuages doux et ronds
  float hashIQ(float n) { return fract(sin(n) * 753.5453123); }

  float valueNoise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + p.y * 157.0 + 113.0 * p.z;
    return mix(
      mix(mix(hashIQ(n +   0.0), hashIQ(n +   1.0), f.x),
          mix(hashIQ(n + 157.0), hashIQ(n + 158.0), f.x), f.y),
      mix(mix(hashIQ(n + 113.0), hashIQ(n + 114.0), f.x),
          mix(hashIQ(n + 270.0), hashIQ(n + 271.0), f.x), f.y), f.z);
  }

  // ── FBM nuages (4 octaves — value noise) ─────────────────────────────────
  float fbm(vec3 pos, float lacunarity) {
    vec3 p = pos;
    float t  = 0.51749673 * valueNoise(p); p *= lacunarity;
    t += 0.25584929 * valueNoise(p); p *= lacunarity;
    t += 0.12527603 * valueNoise(p); p *= lacunarity;
    t += 0.06255931 * valueNoise(p);
    return t;
  }

  // ── Intersection sphère ───────────────────────────────────────────────────
  float sphereIntersect(vec3 ro, vec3 rd, vec3 center, float radius) {
    vec3  rc  = center - ro;
    float tca = dot(rc, rd);
    float d2  = dot(rc, rc) - tca * tca;
    if (d2 > radius * radius) return -1.0;
    float thc = sqrt(radius * radius - d2);
    float t0  = tca - thc;
    float t1  = tca + thc;
    if (t0 < 0.0) t0 = t1;
    return t0 < 0.0 ? -1.0 : t0;
  }

  // ── Densité nuageuse en un point ─────────────────────────────────────────
  // Reproduction fidèle de la fonction density() du Shadertoy source.
  float density(vec3 pos) {
    vec3 p = pos * 0.026202 + vec3(0.0, 0.0, -uTime * 0.09450); // taille −10 % (fréq ×1.111) | vitesse −10 % (−10% supplémentaire taille)
    float dens = fbm(p, FBM_FREQ);
    float cov  = 1.0 - uCoverage;
    dens *= smoothstep(cov, cov + 0.05, dens);
    return clamp(dens, 0.0, 1.0);
  }

  // ── Éclairage approximatif (exponentiel — Shadertoy original) ────────────
  float fakeLight(float h) {
    return exp(h) / 1.75;
  }

  // ── Rendu de la couche nuageuse (sphère atmosphérique) ───────────────────
  // Sphère centrée 100 u sous la caméra, r=120. Caméra à l'intérieur.
  // Guard rd.y < 0.01 : pas de nuages sous l'horizon de la grille.
  vec4 renderClouds(vec3 ro, vec3 rd) {
    // Nuages uniquement au-dessus de l'horizon (rays montants)
    if (rd.y < 0.01) return vec4(0.0);

    vec3  atmCenter = vec3(ro.x, ro.y - 100.0, ro.z);
    float tHit = sphereIntersect(ro, rd, atmCenter, 120.0);
    if (tHit < 0.0) return vec4(0.0);

    float marchStep = THICKNESS / float(STEPS);
    vec3  dirStep   = rd / rd.y * marchStep;  // original Shadertoy
    vec3  pos       = ro + rd * tHit;

    float T = 1.0, alpha = 0.0;
    vec3  C = vec3(0.0);

    for (int i = 0; i < STEPS; i++) {
      float h    = float(i) / float(STEPS);
      float dens = density(pos);
      float Ti   = exp(-ABSORPTION * dens * marchStep);
      T *= Ti;
      if (T < 0.01) break;
      C     += T * fakeLight(h) * dens * marchStep;
      alpha += (1.0 - Ti) * (1.0 - alpha);
      pos   += dirStep;
    }

    return vec4(C, alpha);
  }

  // ── Couleur de ciel de fond (gradient + halo solaire) ─────────────────────
  vec3 skyColor(vec3 rd) {
    float upFactor  = clamp(rd.y * 1.4, 0.0, 1.0);
    vec3  sky       = mix(uSkyHorizon, uSkyZenith, upFactor);
    float sunDotV   = dot(rd, uSunDir);
    // Disque solaire + halo large
    sky += uSunColor * min(pow(max(sunDotV, 0.0), 1500.0) * 5.0, 1.0);
    sky += uSunColor * min(pow(max(sunDotV, 0.0),   10.0) * 0.6, 1.0);
    // Sous l'horizon de la grille : désaturation progressive → quasi N/B
    // clamp(-rd.y * 10) → desat=1 dès rd.y=-0.10 (10° sous l'horizon)
    float desat = clamp(-rd.y * 10.0, 0.0, 1.0);
    float lum   = dot(sky, vec3(0.299, 0.587, 0.114));
    sky = mix(sky, vec3(lum * 0.85), desat);
    return sky;
  }

  void main() {
    vec3 rd = normalize(vWorldPos - cameraPosition);

    // Bypass : ciel uni si nuages désactivés
    if (uEnabled < 0.5) {
      gl_FragColor = vec4(skyColor(rd), 1.0);
      return;
    }

    vec3  sky = skyColor(rd);
    vec4  cld = renderClouds(cameraPosition, rd);

    // Mix exact du Shadertoy source : col = mix(sky, cld.rgb/(eps+cld.a), cld.a)
    vec3 col = mix(sky, cld.rgb / (0.000001 + cld.a), cld.a);

    gl_FragColor = vec4(col, 1.0);
  }
`;
