/**
 * shaderChampBle.js — Shaders GLSL des brins de blé animés.
 *
 * Utilisé par fieldWheatOverlay.js.
 *
 * Exports :
 *   wheatVertexShader   — déplacement vent sinusoïdal + courbure monde
 *   wheatFragmentShader — gradient bas/haut/épi + variation colorMix
 */

/**
 * Vertex shader brin de blé.
 *
 * Attributs per-instance :
 *   aOffset vec2, aYaw float, aHeight float, aWidth float,
 *   aPhase float, aColorMix float, part float
 *
 * Uniforms :
 *   uTime, uWindStrength, uWindSpeed, uGlobalHeight,
 *   uWindDir vec2, uWorldCurvatureEnabled
 *
 * Varyings produits : vHeight, vPart, vColorMix
 */
export const wheatVertexShader = /* glsl */`
  attribute vec2  aOffset;
  attribute float aYaw;
  attribute float aHeight;
  attribute float aWidth;
  attribute float aPhase;
  attribute float aColorMix;
  attribute float part;

  uniform float uTime;
  uniform float uWindStrength;
  uniform float uWindSpeed;
  uniform float uGlobalHeight;
  uniform vec2  uWindDir;
  uniform float uWorldCurvatureEnabled;

  varying float vHeight;
  varying float vPart;
  varying float vColorMix;

  mat2 rot2(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
  }

  void main() {
    vec3 p = position;
    float h = clamp(p.y, 0.0, 1.15);

    // Scale hauteur et largeur par les attributs per-instance
    p.y  *= aHeight * uGlobalHeight;
    p.xz *= aWidth;

    // Rotation locale de chaque brin
    p.xz = rot2(aYaw) * p.xz;

    // Vent : deux fréquences déphasées pour éviter le balancement mécanique
    vec2  dir  = normalize(uWindDir);
    float wA = sin(uTime * uWindSpeed + aPhase + aOffset.x * 1.45 + aOffset.y * 0.85);
    float wB = sin(uTime * (uWindSpeed * 0.63) + aPhase * 0.47 + aOffset.y * 1.75);
    float bend = (wA * 0.72 + wB * 0.28) * uWindStrength * h * h;
    p.xz += dir * bend;
    // Petit twist latéral pour donner de la vie sans effet algue
    p.xz += vec2(-dir.y, dir.x) * wB * uWindStrength * 0.18 * h;

    // Offset monde (position du brin dans la tuile)
    p.xz += aOffset;

    vHeight   = h;
    vPart     = part;
    vColorMix = aColorMix;

    // Courbure monde (mode bouliste)
    vec4 worldPos = modelMatrix * vec4(p, 1.0);
    if (uWorldCurvatureEnabled > 0.5) {
      float dist2 = dot(worldPos.xz, worldPos.xz);
      worldPos.y -= min(240.0, dist2 / (2.0 * 22.0));
    }
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

/**
 * Fragment shader brin de blé.
 *
 * Uniforms : uBottomColor, uTopColor, uEarColor (vec3)
 * Varyings : vHeight, vPart, vColorMix
 */
export const wheatFragmentShader = /* glsl */`
  uniform vec3 uBottomColor;
  uniform vec3 uTopColor;
  uniform vec3 uEarColor;

  varying float vHeight;
  varying float vPart;
  varying float vColorMix;

  void main() {
    vec3 blade = mix(uBottomColor, uTopColor, smoothstep(0.0, 1.0, vHeight));
    blade = mix(blade, vec3(1.0, 0.74, 0.23), vColorMix * 0.22);
    vec3 col  = mix(blade, uEarColor, step(0.5, vPart));
    gl_FragColor = vec4(col, 1.0);
  }
`;
