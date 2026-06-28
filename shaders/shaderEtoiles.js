/**
 * shaderEtoiles.js — Shaders GLSL du champ d'étoiles (starUniverse).
 *
 * Utilisé par stable/starUniverse.js.
 * Points GPU (THREE.Points) avec scintillement animé.
 *
 * Exports :
 *   starVertexShader   — position + taille + calcul de pulsation
 *   starFragmentShader — disque doux avec halo
 */

/**
 * Vertex shader étoiles.
 *
 * Attributs : aColor vec3, aSize float, aPhase float, aTwinkle float
 * Uniforms  : uTime float, uPixelRatio float
 * Varyings  : vColor vec3, vTwinkle float
 */
export const starVertexShader = /* glsl */`
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  attribute float aTwinkle;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float pulse = 0.55 + 0.45 * sin(uTime * aTwinkle + aPhase);
    vTwinkle = pulse;
    vColor = aColor * pulse;
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Fragment shader étoiles.
 *
 * Varyings : vColor vec3, vTwinkle float
 * Discard hors disque unité ; halo doux centré.
 */
export const starFragmentShader = /* glsl */`
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vec2 p = gl_PointCoord - vec2(0.5);
    float d = length(p);
    if (d > 0.5) discard;

    float core = smoothstep(0.50, 0.05, d);
    float halo = smoothstep(0.50, 0.18, d) * 0.45;
    vec3 color = vColor * (core + halo) * (0.65 + 0.35 * vTwinkle);
    gl_FragColor = vec4(color, 1.0);
  }
`;
