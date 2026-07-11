var Q = Object.defineProperty;
var T = (a, i, t) => i in a ? Q(a, i, { enumerable: !0, configurable: !0, writable: !0, value: t }) : a[i] = t;
var n = (a, i, t) => T(a, typeof i != "symbol" ? i + "" : i, t);
import * as s from "three";
const x = (a) => {
  let i;
  const t = /* @__PURE__ */ new Set(), e = (o, p) => {
    const v = typeof o == "function" ? o(i) : o;
    if (!Object.is(v, i)) {
      const M = i;
      i = p ?? (typeof v != "object" || v === null) ? v : Object.assign({}, i, v), t.forEach((P) => P(i, M));
    }
  }, r = () => i, u = { setState: e, getState: r, getInitialState: () => d, subscribe: (o) => (t.add(o), () => t.delete(o)) }, d = i = a(e, r, u);
  return u;
}, V = ((a) => a ? x(a) : x), C = V((a, i) => ({
  emitters: {},
  shouldEmit: !0,
  registerEmitter: (t, e) => {
    if (i().emitters[t]) {
      console.warn(`Emitter ${t} already exists`);
      return;
    }
    a((r) => (r.emitters[t] = e, r));
  },
  unregisterEmitter: (t) => {
    a((e) => (delete e.emitters[t], e));
  },
  emit: (t, e, r) => {
    const l = i().emitters[t];
    if (!l) {
      console.warn(`Emitter ${t} not found`);
      return;
    }
    l(e, r);
  }
})), h = new s.Vector3(), f = new s.Quaternion(), b = new s.Euler(), g = new s.Euler(), w = new s.Vector3();
class W extends s.Object3D {
  constructor(t, e = {}, r, l = !1, c = !0) {
    super();
    n(this, "settings");
    n(this, "emitted", 0);
    n(this, "elapsedTime", 0);
    n(this, "currentTime", 0);
    n(this, "shouldEmit");
    n(this, "emitterName");
    n(this, "localDirection");
    n(this, "store");
    this.emitterName = t, this.localDirection = l, this.shouldEmit = c, this.store = r || C.getState(), this.settings = {
      duration: e.duration ?? 1,
      nbParticles: e.nbParticles ?? 1e3,
      spawnMode: e.spawnMode ?? "time",
      loop: e.loop ?? !1,
      delay: e.delay ?? 0,
      colorStart: e.colorStart ?? ["white", "skyblue"],
      colorEnd: e.colorEnd ?? [],
      particlesLifetime: e.particlesLifetime ?? [0.1, 1],
      speed: e.speed ?? [5, 20],
      size: e.size ?? [0.1, 1],
      startPositionMin: e.startPositionMin ?? [-1, -1, -1],
      startPositionMax: e.startPositionMax ?? [1, 1, 1],
      startRotationMin: e.startRotationMin ?? [0, 0, 0],
      startRotationMax: e.startRotationMax ?? [0, 0, 0],
      rotationSpeedMin: e.rotationSpeedMin ?? [0, 0, 0],
      rotationSpeedMax: e.rotationSpeedMax ?? [0, 0, 0],
      directionMin: e.directionMin ?? [0, 0, 0],
      directionMax: e.directionMax ?? [0, 0, 0]
    };
  }
  randFloat(t, e) {
    return Math.random() * (e - t) + t;
  }
  randInt(t, e) {
    return Math.floor(Math.random() * (e - t + 1)) + t;
  }
  stopEmitting() {
    this.shouldEmit = !1;
  }
  startEmitting(t = !1) {
    t && (this.emitted = 0, this.elapsedTime = 0), this.shouldEmit = !0;
  }
  emitAtPos(t, e = !1) {
    if (this.settings.spawnMode !== "burst") {
      console.error("This function is meant to be used with burst spawn mode only.");
      return;
    }
    const r = this.settings.nbParticles - this.emitted;
    e && (this.emitted = 0, this.elapsedTime = 0), t && this.position.copy(t), this.updateWorldMatrix(!0, !0), this.matrixWorld.decompose(h, f, w), b.setFromQuaternion(f), g.setFromQuaternion(f), this.store.emit(this.emitterName, r, () => {
      var o;
      const c = this.randFloat(this.settings.size[0], this.settings.size[1]), u = this.settings.colorStart[this.randInt(0, this.settings.colorStart.length - 1)], d = new s.Vector3(
        this.randFloat(this.settings.directionMin[0], this.settings.directionMax[0]),
        this.randFloat(this.settings.directionMin[1], this.settings.directionMax[1]),
        this.randFloat(this.settings.directionMin[2], this.settings.directionMax[2])
      );
      return this.localDirection && d.applyQuaternion(f), {
        position: [
          h.x + this.randFloat(this.settings.startPositionMin[0], this.settings.startPositionMax[0]),
          h.y + this.randFloat(this.settings.startPositionMin[1], this.settings.startPositionMax[1]),
          h.z + this.randFloat(this.settings.startPositionMin[2], this.settings.startPositionMax[2])
        ],
        direction: [d.x, d.y, d.z],
        scale: [c, c, c],
        rotation: [
          g.x + this.randFloat(this.settings.startRotationMin[0], this.settings.startRotationMax[0]),
          g.y + this.randFloat(this.settings.startRotationMin[1], this.settings.startRotationMax[1]),
          g.z + this.randFloat(this.settings.startRotationMin[2], this.settings.startRotationMax[2])
        ],
        rotationSpeed: [
          this.randFloat(this.settings.rotationSpeedMin[0], this.settings.rotationSpeedMax[0]),
          this.randFloat(this.settings.rotationSpeedMin[1], this.settings.rotationSpeedMax[1]),
          this.randFloat(this.settings.rotationSpeedMin[2], this.settings.rotationSpeedMax[2])
        ],
        lifetime: [
          this.currentTime,
          this.randFloat(this.settings.particlesLifetime[0], this.settings.particlesLifetime[1])
        ],
        colorStart: u,
        colorEnd: (o = this.settings.colorEnd) != null && o.length ? this.settings.colorEnd[this.randInt(0, this.settings.colorEnd.length - 1)] : u,
        speed: [this.randFloat(this.settings.speed[0], this.settings.speed[1])]
      };
    });
  }
  update(t, e) {
    if (this.currentTime = t, this.emitted < this.settings.nbParticles || this.settings.loop) {
      if (!this.shouldEmit)
        return;
      const l = (this.settings.spawnMode === "burst" ? this.settings.nbParticles : Math.max(
        0,
        Math.floor(
          (this.elapsedTime - this.settings.delay) / this.settings.duration * this.settings.nbParticles
        )
      )) - this.emitted;
      l > 0 && this.elapsedTime >= this.settings.delay && (this.updateWorldMatrix(!0, !0), this.matrixWorld.decompose(h, f, w), b.setFromQuaternion(f), g.setFromQuaternion(f), this.store.emit(this.emitterName, l, () => {
        var p;
        const u = this.randFloat(this.settings.size[0], this.settings.size[1]), d = this.settings.colorStart[this.randInt(0, this.settings.colorStart.length - 1)], o = new s.Vector3(
          this.randFloat(this.settings.directionMin[0], this.settings.directionMax[0]),
          this.randFloat(this.settings.directionMin[1], this.settings.directionMax[1]),
          this.randFloat(this.settings.directionMin[2], this.settings.directionMax[2])
        );
        return this.localDirection && o.applyQuaternion(f), {
          position: [
            h.x + this.randFloat(this.settings.startPositionMin[0], this.settings.startPositionMax[0]),
            h.y + this.randFloat(this.settings.startPositionMin[1], this.settings.startPositionMax[1]),
            h.z + this.randFloat(this.settings.startPositionMin[2], this.settings.startPositionMax[2])
          ],
          direction: [o.x, o.y, o.z],
          scale: [u, u, u],
          rotation: [
            g.x + this.randFloat(this.settings.startRotationMin[0], this.settings.startRotationMax[0]),
            g.y + this.randFloat(this.settings.startRotationMin[1], this.settings.startRotationMax[1]),
            g.z + this.randFloat(this.settings.startRotationMin[2], this.settings.startRotationMax[2])
          ],
          rotationSpeed: [
            this.randFloat(this.settings.rotationSpeedMin[0], this.settings.rotationSpeedMax[0]),
            this.randFloat(this.settings.rotationSpeedMin[1], this.settings.rotationSpeedMax[1]),
            this.randFloat(this.settings.rotationSpeedMin[2], this.settings.rotationSpeedMax[2])
          ],
          lifetime: [
            t,
            this.randFloat(this.settings.particlesLifetime[0], this.settings.particlesLifetime[1])
          ],
          colorStart: d,
          colorEnd: (p = this.settings.colorEnd) != null && p.length ? this.settings.colorEnd[this.randInt(0, this.settings.colorEnd.length - 1)] : d,
          speed: [this.randFloat(this.settings.speed[0], this.settings.speed[1])]
        };
      }), this.emitted += l);
    }
    this.elapsedTime += e;
  }
  updateSettings(t) {
    Object.assign(this.settings, t);
  }
  restart() {
    this.emitted = 0, this.elapsedTime = 0;
  }
}
const k = `
#define PI 3.1415926535897932384626433832795
// Linear
float easeLinear(float t) 
{

    return t;
    
}

// --------- Power1 ---------
float easeInPower1(float t) {
    return t;
}

float easeOutPower1(float t) {
    return 1.0 - (1.0 - t);
}

float easeInOutPower1(float t) {
    return t;
}

// --------- Power2 ---------
float easeInPower2(float t) {
    return t * t;
}

float easeOutPower2(float t) {
    return 1.0 - pow(1.0 - t, 2.0);
}

float easeInOutPower2(float t) {
    return t < 0.5
        ? 2.0 * t * t
        : 1.0 - pow(-2.0 * t + 2.0, 2.0) / 2.0;
}

// --------- Power3 ---------
float easeInPower3(float t) {
    return t * t * t;
}

float easeOutPower3(float t) {
    return 1.0 - pow(1.0 - t, 3.0);
}

float easeInOutPower3(float t) {
    return t < 0.5
        ? 4.0 * t * t * t
        : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
}

// --------- Power4 ---------
float easeInPower4(float t) {
    return t * t * t * t;
}

float easeOutPower4(float t) {
    return 1.0 - pow(1.0 - t, 4.0);
}

float easeInOutPower4(float t) {
    return t < 0.5
        ? 8.0 * t * t * t * t
        : 1.0 - pow(-2.0 * t + 2.0, 4.0) / 2.0;
}

// Quad
float easeInQuad(float t) {
    return t * t;
}

float easeOutQuad(float t) {
    return t * (2.0 - t);
}

float easeInOutQuad(float t) {
    return t < 0.5 
        ? 2.0 * t * t 
        : -1.0 + (4.0 - 2.0 * t) * t;
}

// Cubic
float easeInCubic(float t) {
    return t * t * t;
}

float easeOutCubic(float t) {
    float t1 = t - 1.0;
    return 1.0 + t1 * t1 * t1;
}

float easeInOutCubic(float t) {
    return t < 0.5
        ? 4.0 * t * t * t
        : (t - 1.0) * (2.0 * t - 2.0) * (2.0 * t - 2.0) + 1.0;
}

// Quart
float easeInQuart(float t) {
    return t * t * t * t;
}

float easeOutQuart(float t) {
    float t1 = t - 1.0;
    return 1.0 - t1 * t1 * t1 * t1;
}

float easeInOutQuart(float t) {
    float t1 = t - 1.0;
    return t < 0.5
        ? 8.0 * t * t * t * t
        : 1.0 - 8.0 * t1 * t1 * t1 * t1;
}

// Quint
float easeInQuint(float t) {
    return t * t * t * t * t;
}

float easeOutQuint(float t) {
    float t1 = t - 1.0;
    return 1.0 + t1 * t1 * t1 * t1 * t1;
}

float easeInOutQuint(float t) {
    float t1 = t - 1.0;
    return t < 0.5
        ? 16.0 * t * t * t * t * t
        : 1.0 + 16.0 * t1 * t1 * t1 * t1 * t1;
}

// Sine
float easeInSine(float t) {
    return -1.0 * cos(t * PI * 0.5) + 1.0;
}

float easeOutSine(float t) {
    return sin(t * PI * 0.5);
}

float easeInOutSine(float t) {
    return -0.5 * (cos(PI * t) - 1.0);
}

// Expo
float easeInExpo(float t) {
    return t == 0.0 ? 0.0 : pow(2.0, 10.0 * (t - 1.0));
}

float easeOutExpo(float t) {
    return t == 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * t);
}

float easeInOutExpo(float t) {
    if (t == 0.0 || t == 1.0) return t;
    
    return t < 0.5
        ? 0.5 * pow(2.0, (20.0 * t) - 10.0)
        : 0.5 * (-pow(2.0, (-20.0 * t) + 10.0) + 2.0);
}

// Circ
float easeInCirc(float t) {
    return -1.0 * (sqrt(1.0 - t * t) - 1.0);
}

float easeOutCirc(float t) {
    float t1 = t - 1.0;
    return sqrt(1.0 - t1 * t1);
}

float easeInOutCirc(float t) {
    float t1 = 2.0 * t;
    float t2 = t1 - 2.0;
    return t < 0.5
        ? -0.5 * (sqrt(1.0 - t1 * t1) - 1.0)
        : 0.5 * (sqrt(1.0 - t2 * t2) + 1.0);
}

// Elastic
float easeInElastic(float t) {
    if (t == 0.0 || t == 1.0) return t;
    return -pow(2.0, 10.0 * (t - 1.0)) * sin((t - 1.075) * (2.0 * PI) / 0.3);
}

float easeOutElastic(float t) {
    if (t == 0.0 || t == 1.0) return t;
    return pow(2.0, -10.0 * t) * sin((t - 0.075) * (2.0 * PI) / 0.3) + 1.0;
}

float easeInOutElastic(float t) {
    if (t < 0.5) {
        return -0.5 * pow(2.0, 20.0 * t - 10.0) * 
               sin((20.0 * t - 11.125) * (2.0 * PI) / 4.5);
    }
    return pow(2.0, -20.0 * t + 10.0) * 
           sin((20.0 * t - 11.125) * (2.0 * PI) / 4.5) * 0.5 + 1.0;
}

// Back
float easeInBack(float t) {
    float s = 1.70158;
    return t * t * ((s + 1.0) * t - s);
}

float easeOutBack(float t) {
    float s = 1.70158;
    float t1 = t - 1.0;
    return t1 * t1 * ((s + 1.0) * t1 + s) + 1.0;
}

float easeInOutBack(float t) {
    float s = 1.70158 * 1.525;
    t *= 2.0;
    if (t < 1.0) {
        return 0.5 * (t * t * ((s + 1.0) * t - s));
    }
    t -= 2.0;
    return 0.5 * (t * t * ((s + 1.0) * t + s) + 2.0);
}

// Bounce
float easeOutBounce(float t) {
    if (t < 1.0 / 2.75) {
        return 7.5625 * t * t;
    } else if (t < 2.0 / 2.75) {
        t -= 1.5 / 2.75;
        return 7.5625 * t * t + 0.75;
    } else if (t < 2.5 / 2.75) {
        t -= 2.25 / 2.75;
        return 7.5625 * t * t + 0.9375;
    } else {
        t -= 2.625 / 2.75;
        return 7.5625 * t * t + 0.984375;
    }
}

float easeInBounce(float t) {
    return 1.0 - easeOutBounce(1.0 - t);
}

float easeInOutBounce(float t) {
    return t < 0.5
        ? (1.0 - easeOutBounce(1.0 - 2.0 * t)) * 0.5
        : (1.0 + easeOutBounce(2.0 * t - 1.0)) * 0.5;
}

float applyEasing(float t, int easingId) {
    if (easingId == 0) return easeLinear(t);
    else if (easingId == 1) return easeInPower1(t);
    else if (easingId == 2) return easeOutPower1(t);
    else if (easingId == 3) return easeInOutPower1(t);
    else if (easingId == 4) return easeInPower2(t);
    else if (easingId == 5) return easeOutPower2(t);
    else if (easingId == 6) return easeInOutPower2(t);
    else if (easingId == 7) return easeInPower3(t);
    else if (easingId == 8) return easeOutPower3(t);
    else if (easingId == 9) return easeInOutPower3(t);
    else if (easingId == 10) return easeInPower4(t);
    else if (easingId == 11) return easeOutPower4(t);
    else if (easingId == 12) return easeInOutPower4(t);
    else if (easingId == 13) return easeInQuad(t);
    else if (easingId == 14) return easeOutQuad(t);
    else if (easingId == 15) return easeInOutQuad(t);
    else if (easingId == 16) return easeInCubic(t);
    else if (easingId == 17) return easeOutCubic(t);
    else if (easingId == 18) return easeInOutCubic(t);
    else if (easingId == 19) return easeInQuart(t);
    else if (easingId == 20) return easeOutQuart(t);
    else if (easingId == 21) return easeInOutQuart(t);
    else if (easingId == 22) return easeInQuint(t);
    else if (easingId == 23) return easeOutQuint(t);
    else if (easingId == 24) return easeInOutQuint(t);
    else if (easingId == 25) return easeInSine(t);
    else if (easingId == 26) return easeOutSine(t);
    else if (easingId == 27) return easeInOutSine(t);
    else if (easingId == 28) return easeInExpo(t);
    else if (easingId == 29) return easeOutExpo(t);
    else if (easingId == 30) return easeInOutExpo(t);
    else if (easingId == 31) return easeInCirc(t);
    else if (easingId == 32) return easeOutCirc(t);
    else if (easingId == 33) return easeInOutCirc(t);
    else if (easingId == 34) return easeInElastic(t);
    else if (easingId == 35) return easeOutElastic(t);
    else if (easingId == 36) return easeInOutElastic(t);
    else if (easingId == 37) return easeInBack(t);
    else if (easingId == 38) return easeOutBack(t);
    else if (easingId == 39) return easeInOutBack(t);
    else if (easingId == 40) return easeInBounce(t);
    else if (easingId == 41) return easeOutBounce(t);
    else if (easingId == 42) return easeInOutBounce(t);
    // fallback
    return t;
}

`;
var F = /* @__PURE__ */ ((a) => (a[a.Square = 0] = "Square", a[a.Circular = 1] = "Circular", a))(F || {}), z = /* @__PURE__ */ ((a) => (a.StretchBillboard = "stretchBillboard", a.Billboard = "billboard", a.Mesh = "mesh", a))(z || {});
const S = [
  "easeLinear",
  "easeInPower1",
  "easeOutPower1",
  "easeInOutPower1",
  "easeInPower2",
  "easeOutPower2",
  "easeInOutPower2",
  "easeInPower3",
  "easeOutPower3",
  "easeInOutPower3",
  "easeInPower4",
  "easeOutPower4",
  "easeInOutPower4",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInQuart",
  "easeOutQuart",
  "easeInOutQuart",
  "easeInQuint",
  "easeOutQuint",
  "easeInOutQuint",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
  "easeInCirc",
  "easeOutCirc",
  "easeInOutCirc",
  "easeInElastic",
  "easeOutElastic",
  "easeInOutElastic",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "easeInBounce",
  "easeOutBounce",
  "easeInOutBounce"
], y = new s.Vector3(), I = new s.Euler(), O = new s.Quaternion(), E = new s.Vector3(1, 1, 1), A = new s.Matrix4(), m = new s.Color();
class H {
  constructor(i, t = {}, e, r, l) {
    n(this, "mesh");
    n(this, "material");
    n(this, "settings");
    n(this, "cursor", 0);
    n(this, "lastCursor", 0);
    n(this, "needsUpdate", !1);
    n(this, "name");
    n(this, "store");
    n(this, "clock");
    n(this, "attributeArrays");
    this.name = i, this.store = e || C.getState(), this.clock = new s.Clock(), this.settings = {
      nbParticles: t.nbParticles ?? 1e3,
      intensity: t.intensity ?? 1,
      renderMode: t.renderMode ?? z.Mesh,
      stretchScale: t.stretchScale ?? 1,
      fadeSize: t.fadeSize ?? [0.1, 0.9],
      fadeAlpha: t.fadeAlpha ?? [0, 1],
      gravity: t.gravity ?? [0, 0, 0],
      frustumCulled: t.frustumCulled ?? !0,
      appearance: t.appearance ?? F.Square,
      easeFunction: t.easeFunction ?? "easeLinear",
      blendingMode: t.blendingMode ?? s.AdditiveBlending,
      shadingHooks: t.shadingHooks ?? {},
      side: t.side ?? s.FrontSide,
      depthTest: t.depthTest ?? !0
    };
    const c = l || new s.PlaneGeometry(0.5, 0.5);
    this.attributeArrays = {
      instanceColor: new Float32Array(this.settings.nbParticles * 3),
      instanceColorEnd: new Float32Array(this.settings.nbParticles * 3),
      instanceDirection: new Float32Array(this.settings.nbParticles * 3),
      instanceLifetime: new Float32Array(this.settings.nbParticles * 2),
      instanceSpeed: new Float32Array(this.settings.nbParticles * 1),
      instanceRotationSpeed: new Float32Array(this.settings.nbParticles * 3)
    }, this.material = this.createMaterial(r), this.mesh = new s.InstancedMesh(
      c,
      this.material,
      this.settings.nbParticles
    ), this.mesh.frustumCulled = this.settings.frustumCulled, this.setupAttributes(), this.store.registerEmitter(i, this.emit.bind(this));
  }
  createMaterial(i) {
    const t = S.indexOf(this.settings.easeFunction), e = {
      STRETCH_BILLBOARD_MODE: this.settings.renderMode === "stretchBillboard",
      BILLBOARD_MODE: this.settings.renderMode === "billboard",
      MESH_MODE: this.settings.renderMode === "mesh"
    };
    return i && (e.USE_ALPHAMAP = !0), new s.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: this.settings.intensity },
        uStretchScale: { value: this.settings.stretchScale },
        uFadeSize: { value: this.settings.fadeSize },
        uFadeAlpha: { value: this.settings.fadeAlpha },
        uGravity: { value: this.settings.gravity },
        uAppearanceMode: { value: this.settings.appearance },
        alphaMap: { value: i || null },
        uEasingFunction: { value: t }
      },
      defines: e,
      vertexShader: (
        /*glsl*/
        `
${k}
mat4 rotationX(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat4(
      1,  0,  0,  0,
      0,  c, -s,  0,
      0,  s,  c,  0,
      0,  0,  0,  1
  );
}

mat4 rotationY(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat4(
        c,  0,  s,  0,
        0,  1,  0,  0,
      -s,  0,  c,  0,
        0,  0,  0,  1
  );
}

mat4 rotationZ(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat4(
      c, -s,  0,  0,
      s,  c,  0,  0,
      0,  0,  1,  0,
      0,  0,  0,  1
  );
}

vec3 billboard(vec2 v, mat4 view) {
  vec3 up = vec3(view[0][1], view[1][1], view[2][1]);
  vec3 right = vec3(view[0][0], view[1][0], view[2][0]);
  vec3 p = right * v.x + up * v.y;
  return p;
}

uniform float uTime;
uniform vec2 uFadeSize;
uniform vec3 uGravity;
uniform float uStretchScale;
uniform int uEasingFunction;

${this.settings.shadingHooks.customUniforms || ""}

varying vec2 vUv;
varying vec3 vColor;
varying vec3 vColorEnd;
varying float vProgress;

${this.settings.shadingHooks.customVaryings || ""}

attribute float instanceSpeed;
attribute vec3 instanceRotationSpeed;
attribute vec3 instanceDirection;
attribute vec3 instanceColor;
attribute vec3 instanceColorEnd;
attribute vec2 instanceLifetime;

${this.settings.shadingHooks.vertexBeforeMain || ""}

void main() {
  float startTime = instanceLifetime.x;
  float duration = instanceLifetime.y;
  float age = uTime - startTime;

  age = instanceSpeed < 0.0 ? duration - (uTime - startTime) : uTime - startTime;
  float progress = clamp(age / duration, 0.0, 1.0);
  vProgress = applyEasing(progress, uEasingFunction);

  if (progress < 0.0 || progress >= 1.0) {
    vProgress = progress;
    gl_Position = vec4(vec3(9999.0), 1.0);
    return;
  }

  float scale = smoothstep(0.0, uFadeSize.x, vProgress) * smoothstep(1.01, uFadeSize.y, vProgress);

  vec3 normalizedDirection = length(instanceDirection) > 0.0 ? normalize(instanceDirection) : vec3(0.0);
  vec3 gravityForce = 0.5 * uGravity * (age * age);
  float easedAge = vProgress * duration;
  vec3 offset = normalizedDirection * easedAge * instanceSpeed;
  offset += gravityForce;

  vec3 rotationSpeed = instanceRotationSpeed * age;
  mat4 rotX = rotationX(rotationSpeed.x);
  mat4 rotY = rotationY(rotationSpeed.y);
  mat4 rotZ = rotationZ(rotationSpeed.z);
  mat4 rotationMatrix = rotZ * rotY * rotX;

  vec4 mvPosition;
  #ifdef MESH_MODE
    vec4 startPosition = modelMatrix * instanceMatrix * rotationMatrix * vec4(position * scale, 1.0);
    vec3 instancePosition = startPosition.xyz;
    vec3 finalPosition = instancePosition + offset;
    mvPosition = modelViewMatrix * vec4(finalPosition, 1.0);
  #endif
  #ifdef BILLBOARD_MODE
    vec3 instancePosition = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz + offset;
    vec3 localZ = normalize(cameraPosition - instancePosition);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 localX = normalize(cross(worldUp, localZ));
    vec3 localY = cross(localZ, localX);
    mat3 billboardMatrix = mat3(localX, localY, localZ);
    float scaleX = length(instanceMatrix[0].xyz);
    float scaleY = length(instanceMatrix[1].xyz);
    float scaleZ = length(instanceMatrix[2].xyz);
    vec3 instanceScale = vec3(scaleX, scaleY, scaleZ);

    // Extract initial Z rotation from instanceMatrix
    float initialRotZ = atan(instanceMatrix[0].y / scaleX, instanceMatrix[0].x / scaleX);
    mat4 initialRotZMatrix = rotationZ(initialRotZ);

    // Combine initial rotation with dynamic rotation
    mat3 finalMatrix = billboardMatrix * mat3(initialRotZMatrix * rotationMatrix);
    vec3 finalRight = finalMatrix[0] * instanceScale * scale;
    vec3 finalUp = finalMatrix[1] * instanceScale * scale;
    vec3 vertexWorldPos = instancePosition + finalRight * position.x + finalUp * position.y;
    mvPosition = viewMatrix * vec4(vertexWorldPos, 1.0);
  #endif
  #ifdef STRETCH_BILLBOARD_MODE
    vec3 particleWorldPos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz + offset;
    vec3 worldVelocity = normalizedDirection * instanceSpeed + uGravity * age;
    float currentSpeed = length(worldVelocity);
    if (currentSpeed < 0.001) {
      vec3 instancePositionBillboard = particleWorldPos;
      vec3 camUpWorld = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
      vec3 eyeVecBillboard = normalize(cameraPosition - instancePositionBillboard);
      vec3 bLocalX = normalize(cross(camUpWorld, eyeVecBillboard));
      if (length(bLocalX) < 0.001) {
        bLocalX = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
      }
      vec3 bLocalY = normalize(cross(eyeVecBillboard, bLocalX));
      mat3 billboardBasis = mat3(bLocalX, bLocalY, eyeVecBillboard);
      float instScaleX = length(instanceMatrix[0].xyz);
      float instScaleY = length(instanceMatrix[1].xyz);
      mat3 rotatedBillboardBasis = billboardBasis * mat3(rotationMatrix);
      vec3 finalRight = rotatedBillboardBasis[0] * instScaleX * scale;
      vec3 finalUp = rotatedBillboardBasis[1] * instScaleY * scale;
      vec3 vertexWorldPos = instancePositionBillboard + finalRight * position.x + finalUp * position.y;
      mvPosition = viewMatrix * vec4(vertexWorldPos, 1.0);
    } else { 
      vec3 eyeVector = normalize(cameraPosition - particleWorldPos);
      vec3 tangent = normalize(worldVelocity); 
      vec3 projectedTangent = tangent - dot(tangent, eyeVector) * eyeVector;
      vec3 particlePlaneUp;
      vec3 particlePlaneRight; 
      if (length(projectedTangent) < 0.001) {
        particlePlaneUp = tangent;
        vec3 camUpWorld = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
        particlePlaneRight = normalize(cross(particlePlaneUp, camUpWorld));
        if (length(particlePlaneRight) < 0.001) {
          vec3 camRightWorld = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
          particlePlaneRight = normalize(cross(particlePlaneUp, camRightWorld));
        }
      } else {
        particlePlaneUp = normalize(projectedTangent);
        particlePlaneRight = normalize(cross(particlePlaneUp, eyeVector));
      }
      float baseWidth = length(instanceMatrix[0].xyz);
      float baseLength = length(instanceMatrix[1].xyz);
      float wid = baseWidth * scale;
      float len = baseLength * scale * (1.0 + currentSpeed * uStretchScale);
      float zAngle = instanceRotationSpeed.z * age;
      mat2 spinMatrix = mat2(cos(zAngle), -sin(zAngle), sin(zAngle), cos(zAngle));
      vec2 localSpunPos = spinMatrix * position.xy;
      vec3 worldSpaceVertexOffset = particlePlaneRight * localSpunPos.x * wid + particlePlaneUp * localSpunPos.y * len;
      vec3 finalVertexPos = particleWorldPos + worldSpaceVertexOffset;
      mvPosition = viewMatrix * vec4(finalVertexPos, 1.0);
    }
  #endif


  ${this.settings.shadingHooks.vertexBeforeOutput || ""}
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  vColor = instanceColor;
  vColorEnd = instanceColorEnd;
}
`
      ),
      fragmentShader: (
        /*glsl*/
        `
uniform float uTime;
uniform float uIntensity;
uniform vec2 uFadeAlpha;
uniform sampler2D alphaMap;
uniform int uAppearanceMode;

${this.settings.shadingHooks.customUniforms || ""}

varying vec3 vColor;
varying vec3 vColorEnd;
varying float vProgress;
varying vec2 vUv;

${this.settings.shadingHooks.customVaryings || ""}

${this.settings.shadingHooks.fragmentBeforeMain || ""}

void main() {
  if (vProgress < 0.0 || vProgress > 1.0) {
    discard;
  }
  vec3 finalColor = mix(vColor, vColorEnd, vProgress);
  finalColor *= uIntensity;

  float alpha = smoothstep(0.0, uFadeAlpha.x, vProgress) * smoothstep(1.01, uFadeAlpha.y, vProgress);

  #ifdef USE_ALPHAMAP
    vec2 uv = vUv;
    vec4 tex = texture2D(alphaMap, uv);
    alpha = tex.a * alpha;
  #else
    if(uAppearanceMode == 1){
      vec2 center = vec2(0.5);
      float dist = distance(vUv, center);
      if(dist > 0.5){
        discard;
      }
    }
  #endif
  ${this.settings.shadingHooks.fragmentBeforeOutput || ""}
  gl_FragColor = vec4(finalColor, alpha);
}`
      ),
      transparent: !0,
      blending: this.settings.blendingMode,
      depthWrite: !1,
      side: this.settings.side,
      depthTest: this.settings.depthTest
    });
  }
  setupAttributes() {
    const i = this.mesh.geometry;
    i.setAttribute(
      "instanceColor",
      new s.InstancedBufferAttribute(this.attributeArrays.instanceColor, 3)
    ), i.setAttribute(
      "instanceColorEnd",
      new s.InstancedBufferAttribute(
        this.attributeArrays.instanceColorEnd,
        3
      )
    ), i.setAttribute(
      "instanceDirection",
      new s.InstancedBufferAttribute(
        this.attributeArrays.instanceDirection,
        3
      )
    ), i.setAttribute(
      "instanceLifetime",
      new s.InstancedBufferAttribute(
        this.attributeArrays.instanceLifetime,
        2
      )
    ), i.setAttribute(
      "instanceSpeed",
      new s.InstancedBufferAttribute(this.attributeArrays.instanceSpeed, 1)
    ), i.setAttribute(
      "instanceRotationSpeed",
      new s.InstancedBufferAttribute(
        this.attributeArrays.instanceRotationSpeed,
        3
      )
    ), i.attributes.instanceColor.setUsage(s.DynamicDrawUsage), i.attributes.instanceColorEnd.setUsage(s.DynamicDrawUsage), i.attributes.instanceDirection.setUsage(s.DynamicDrawUsage), i.attributes.instanceLifetime.setUsage(s.DynamicDrawUsage), i.attributes.instanceSpeed.setUsage(s.DynamicDrawUsage), i.attributes.instanceRotationSpeed.setUsage(s.DynamicDrawUsage);
  }
  emit(i, t) {
    const e = this.mesh.geometry.getAttribute(
      "instanceColor"
    ), r = this.mesh.geometry.getAttribute(
      "instanceColorEnd"
    ), l = this.mesh.geometry.getAttribute(
      "instanceDirection"
    ), c = this.mesh.geometry.getAttribute(
      "instanceLifetime"
    ), u = this.mesh.geometry.getAttribute(
      "instanceSpeed"
    ), d = this.mesh.geometry.getAttribute(
      "instanceRotationSpeed"
    );
    for (let o = 0; o < i; o++) {
      this.cursor >= this.settings.nbParticles && (this.cursor = 0);
      const {
        scale: p,
        rotation: v,
        rotationSpeed: M,
        position: P,
        direction: B,
        lifetime: R,
        colorStart: U,
        colorEnd: D,
        speed: L
      } = t();
      y.set(...P), I.set(...v), (this.settings.renderMode === "billboard" || this.settings.renderMode === "stretchBillboard") && (I.x = 0, I.y = 0), O.setFromEuler(I), E.set(...p), A.compose(y, O, E), this.mesh.setMatrixAt(this.cursor, A), m.set(U), e.set([m.r, m.g, m.b], this.cursor * 3), m.set(D), r.set(
        [m.r, m.g, m.b],
        this.cursor * 3
      ), l.set(B, this.cursor * 3), c.set(R, this.cursor * 2), u.set(L, this.cursor), d.set(M, this.cursor * 3), this.cursor++, this.cursor = this.cursor % this.settings.nbParticles;
    }
    this.mesh.instanceMatrix.needsUpdate = !0, e.needsUpdate = !0, r.needsUpdate = !0, l.needsUpdate = !0, c.needsUpdate = !0, u.needsUpdate = !0, d.needsUpdate = !0, this.needsUpdate = !0;
  }
  update(i) {
    const t = i ?? this.clock.getElapsedTime();
    this.material.uniforms.uTime.value = t, this.material.uniforms.uIntensity.value = this.settings.intensity, this.material.uniforms.uStretchScale.value = this.settings.stretchScale, this.material.uniforms.uFadeSize.value = this.settings.fadeSize, this.material.uniforms.uFadeAlpha.value = this.settings.fadeAlpha, this.material.uniforms.uGravity.value = this.settings.gravity, this.material.uniforms.uAppearanceMode.value = this.settings.appearance, this.material.uniforms.uEasingFunction.value = S.indexOf(
      this.settings.easeFunction
    ), this.needsUpdate && (this.updateAttributeRanges(), this.needsUpdate = !1);
  }
  updateAttributeRanges() {
    [
      this.mesh.instanceMatrix,
      this.mesh.geometry.getAttribute("instanceColor"),
      this.mesh.geometry.getAttribute("instanceColorEnd"),
      this.mesh.geometry.getAttribute("instanceDirection"),
      this.mesh.geometry.getAttribute("instanceLifetime"),
      this.mesh.geometry.getAttribute("instanceSpeed"),
      this.mesh.geometry.getAttribute("instanceRotationSpeed")
    ].forEach((t) => {
      const e = t;
      e.clearUpdateRanges(), this.lastCursor > this.cursor ? (e.addUpdateRange(0, this.cursor * e.itemSize), e.addUpdateRange(
        this.lastCursor * e.itemSize,
        this.settings.nbParticles * e.itemSize - this.lastCursor * e.itemSize
      )) : e.addUpdateRange(
        this.lastCursor * e.itemSize,
        this.cursor * e.itemSize - this.lastCursor * e.itemSize
      ), e.needsUpdate = !0;
    }), this.lastCursor = this.cursor;
  }
  getMesh() {
    return this.mesh;
  }
  updateSettings(i) {
    Object.assign(this.settings, i);
  }
  dispose() {
    this.store.unregisterEmitter(this.name), this.mesh.geometry.dispose(), this.material.dispose();
  }
}
export {
  F as AppearanceMode,
  z as RenderMode,
  W as VFXEmitter,
  W as VFXEmitterCore,
  H as VFXParticles,
  H as VFXParticlesCore,
  C as vfxStore
};
