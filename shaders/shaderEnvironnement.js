/**
 * shaderEnvironnement.js — Shaders GLSL de l'environnement visuel.
 *
 * Utilisé par visualEnvironment.js.
 *
 * Exports :
 *   colorGradingVertexShader    — pass-through UV standard
 *   colorGradingFragmentShader  — étalonnage colorimétrique complet (LUT, palette, dither)
 *   domeCielVertexShader        — dome sphérique (worldPosition)
 *   domeCielFragmentShader      — gradient ciel bas/haut
 */

// ─── Color Grading ────────────────────────────────────────────────────────────

/** Vertex shader pass-through (identique pour color grading et full-screen quads). */
export const colorGradingVertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader étalonnage colorimétrique.
 *
 * Uniforms :
 *   tDiffuse sampler2D, uEnabled float, uBrightness float, uContrast float,
 *   uSaturation float, uVibrance float, uHue float, uGamma float,
 *   uBlackLevel float, uWhiteLevel float,
 *   uRgb vec3, uRgbCurve vec3,
 *   uPaletteSize float, uPaletteColors vec3[40], uPaletteDither float,
 *   uPixelSize float
 *
 * Varying : vUv
 */
export const colorGradingFragmentShader = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uEnabled;
  uniform float uBrightness;
  uniform float uContrast;
  uniform float uSaturation;
  uniform float uVibrance;
  uniform float uHue;
  uniform float uGamma;
  uniform float uBlackLevel;
  uniform float uWhiteLevel;
  uniform vec3 uRgb;
  uniform vec3 uRgbCurve;
  uniform float uPaletteSize;
  uniform vec3 uPaletteColors[40];
  uniform float uPaletteDither;
  uniform float uPixelSize;
  varying vec2 vUv;

  // Conversion linéaire ↔ sRGB (approximation gamma 2.2)
  vec3 toSRGB(vec3 c)   { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
  vec3 toLinear(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(2.2)); }

  // Dithering ordonné Bayer 4×4
  float bayer4x4(vec2 p) {
    float x = mod(floor(p.x), 4.0);
    float y = mod(floor(p.y), 4.0);
    float r0 = mix(mix( 0.0, 8.0, step(1.0,x)), mix( 2.0,10.0, step(3.0,x)), step(2.0,x));
    float r1 = mix(mix(12.0, 4.0, step(1.0,x)), mix(14.0, 6.0, step(3.0,x)), step(2.0,x));
    float r2 = mix(mix( 3.0,11.0, step(1.0,x)), mix( 1.0, 9.0, step(3.0,x)), step(2.0,x));
    float r3 = mix(mix(15.0, 7.0, step(1.0,x)), mix(13.0, 5.0, step(3.0,x)), step(2.0,x));
    float v  = mix(mix(r0, r1, step(1.0,y)), mix(r2, r3, step(3.0,y)), step(2.0,y));
    return v / 15.0 - 0.5;
  }

  vec3 applyHue(vec3 color, float angle) {
    float s = sin(angle * 6.28318530718);
    float c = cos(angle * 6.28318530718);
    mat3 hueRotation = mat3(
      0.299 + 0.701 * c + 0.168 * s, 0.587 - 0.587 * c + 0.330 * s, 0.114 - 0.114 * c - 0.497 * s,
      0.299 - 0.299 * c - 0.328 * s, 0.587 + 0.413 * c + 0.035 * s, 0.114 - 0.114 * c + 0.292 * s,
      0.299 - 0.300 * c + 1.250 * s, 0.587 - 0.588 * c - 1.050 * s, 0.114 + 0.886 * c - 0.203 * s
    );
    return clamp(hueRotation * color, 0.0, 1.0);
  }

  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    vec3 color = texel.rgb;

    if (uEnabled > 0.5) {
      color = (color - vec3(uBlackLevel)) / max(vec3(0.001), vec3(uWhiteLevel - uBlackLevel));
      color = clamp(color, 0.0, 1.0);

      color = applyHue(color, uHue);
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      vec3 gray = vec3(luma);

      color = mix(gray, color, uSaturation);

      float maxChannel = max(color.r, max(color.g, color.b));
      float minChannel = min(color.r, min(color.g, color.b));
      float colorfulness = maxChannel - minChannel;
      color = mix(color, mix(gray, color, 1.0 + uVibrance), 1.0 - colorfulness);

      color = (color - 0.5) * uContrast + 0.5 + uBrightness;
      color *= uRgb;
      color = pow(max(color, vec3(0.0)), max(vec3(0.01), uRgbCurve));
      color = pow(max(color, vec3(0.0)), vec3(1.0 / max(0.01, uGamma)));
      color = clamp(color, 0.0, 1.0);

      // ── Quantification palette rétro (CGA / EGA / Amiga) ──────────────────
      if (uPaletteSize > 0.5) {
        vec3 srgbColor = toSRGB(color);

        float dist1 = 9.0, dist2 = 9.0;
        vec3 best1 = srgbColor, best2 = srgbColor;
        for (int i = 0; i < 40; i++) {
          vec3 diff = srgbColor - uPaletteColors[i];
          float d = dot(diff, diff);
          if (d < dist1) {
            dist2 = dist1; best2 = best1;
            dist1 = d;     best1 = uPaletteColors[i];
          } else if (d < dist2) {
            dist2 = d; best2 = uPaletteColors[i];
          }
        }

        vec3 chosen = best1;
        if (uPaletteDither > 0.001 && dist2 < 8.0) {
          vec3 dir = best2 - best1;
          float len2 = dot(dir, dir);
          float t = clamp(dot(srgbColor - best1, dir) / max(0.0001, len2), 0.0, 1.0);
          vec3 stableColor = floor(srgbColor * 255.0 + 0.5) / 255.0;
          float b = fract(sin(dot(stableColor, vec3(127.1, 311.7, 74.4))) * 43758.5453);
          chosen = (b < t * uPaletteDither) ? best2 : best1;
        }

        color = toLinear(chosen);
      }
    }

    gl_FragColor = vec4(color, texel.a);
  }
`;

// ─── Dôme ciel ────────────────────────────────────────────────────────────────

/** Vertex shader du dôme environnemental (passe la position monde). */
export const domeCielVertexShader = /* glsl */`
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader du dôme ciel (gradient bas → haut).
 *
 * Uniforms : uTopColor vec3, uBottomColor vec3, uOpacity float
 * Varying  : vWorldPosition
 */
export const domeCielFragmentShader = /* glsl */`
  uniform vec3 uTopColor;
  uniform vec3 uBottomColor;
  uniform float uOpacity;
  varying vec3 vWorldPosition;
  void main() {
    float h = normalize(vWorldPosition).y * 0.5 + 0.5;
    vec3 color = mix(uBottomColor, uTopColor, smoothstep(0.0, 1.0, h));
    gl_FragColor = vec4(color, uOpacity);
  }
`;
