import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const GLOBAL_WIND_UNIFORMS = {
  uGlobalWindTime: { value: 0 },
  uGlobalWindDirection: { value: new THREE.Vector2(0.92, 0.38).normalize() }
};

const DEFAULT_WIND_OPTIONS = {
  strength: 0.045,
  speed: 1.35,
  frequency: 0.92,
  turbulence: 0.36,
  heightStart: 0.00,
  heightEnd: 0.30,
  gustStrength: 0.28,
  detailStrength: 0.18
};

export function updateGlobalWind(timeSeconds = 0) {
  GLOBAL_WIND_UNIFORMS.uGlobalWindTime.value = timeSeconds;
}

export function applyGlobalWindToObject(object, options = {}) {
  if (!object?.traverse) return object;

  object.traverse(child => {
    if (!child?.isMesh || !child.material) return;
    child.material = applyGlobalWindToMaterial(child.material, options);
  });

  return object;
}

export function applyGlobalWindToMaterial(material, options = {}) {
  if (Array.isArray(material)) return material.map(item => applyGlobalWindToMaterial(item, options));
  if (!material) return material;

  const windOptions = { ...DEFAULT_WIND_OPTIONS, ...options };
  const signature = makeWindSignature(windOptions);
  if (material.userData?.globalWindSignature === signature) return material;

  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousCustomProgramCacheKey = material.customProgramCacheKey?.bind(material);

  material.onBeforeCompile = shader => {
    previousOnBeforeCompile?.(shader);

    shader.uniforms.uGlobalWindTime = GLOBAL_WIND_UNIFORMS.uGlobalWindTime;
    shader.uniforms.uGlobalWindDirection = GLOBAL_WIND_UNIFORMS.uGlobalWindDirection;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
uniform float uGlobalWindTime;
uniform vec2 uGlobalWindDirection;

float globalWindHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float globalWindNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = globalWindHash(i);
  float b = globalWindHash(i + vec2(1.0, 0.0));
  float c = globalWindHash(i + vec2(0.0, 1.0));
  float d = globalWindHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float globalWindWave(vec2 p, float timeValue) {
  vec2 dir = normalize(uGlobalWindDirection);
  vec2 side = vec2(-dir.y, dir.x);
  float along = dot(p, dir);
  float across = dot(p, side);

  float broad = sin(along * ${windOptions.frequency.toFixed(4)} + timeValue * ${windOptions.speed.toFixed(4)});
  float gust = sin(along * ${(windOptions.frequency * 0.47).toFixed(4)} + across * 0.22 + timeValue * ${(windOptions.speed * 0.58).toFixed(4)});
  float ripple = sin(across * ${(windOptions.frequency * 2.90).toFixed(4)} + along * 0.18 - timeValue * ${(windOptions.speed * 1.71).toFixed(4)});
  float noise = globalWindNoise((p * ${(windOptions.frequency * 0.42).toFixed(4)}) + vec2(timeValue * ${(windOptions.speed * 0.07).toFixed(4)}, -timeValue * ${(windOptions.speed * 0.05).toFixed(4)})) * 2.0 - 1.0;

  return broad * 0.70
    + gust * ${(windOptions.gustStrength * windOptions.turbulence).toFixed(4)}
    + ripple * ${(windOptions.detailStrength * windOptions.turbulence).toFixed(4)}
    + noise * ${(0.20 * windOptions.turbulence).toFixed(4)};
}`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec4 gwWorld = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #else
    vec4 gwWorld = modelMatrix * vec4(position, 1.0);
  #endif
  float gwHeight = smoothstep(${windOptions.heightStart.toFixed(4)}, ${windOptions.heightEnd.toFixed(4)}, position.y);
  gwHeight = gwHeight * gwHeight * (3.0 - 2.0 * gwHeight);

  float gwWave = globalWindWave(gwWorld.xz, uGlobalWindTime);
  vec2 gwDir = normalize(uGlobalWindDirection);
  float gwBend = gwWave * ${windOptions.strength.toFixed(4)} * gwHeight;

  transformed.xz += gwDir * gwBend;
}`
    );

    material.userData.globalWindShader = shader;
  };

  material.customProgramCacheKey = () => `${previousCustomProgramCacheKey?.() ?? ''}|globalWind:${signature}`;
  material.userData.globalWindSignature = signature;
  material.needsUpdate = true;
  return material;
}

export function setGlobalWindDirection(x, z) {
  const length = Math.hypot(x, z) || 1;
  GLOBAL_WIND_UNIFORMS.uGlobalWindDirection.value.set(x / length, z / length);
}

function makeWindSignature(options) {
  return [
    options.strength,
    options.speed,
    options.frequency,
    options.turbulence,
    options.heightStart,
    options.heightEnd,
    options.gustStrength,
    options.detailStrength
  ].map(value => Number(value).toFixed(4)).join(':');
}
