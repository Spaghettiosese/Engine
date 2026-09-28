// WGSL shader sources for the WebGPU backend (webgpu.js). They mirror the GLSL in
// shaders.js: the same procedural materials, skin shading, light profiles, cascaded soft
// shadows, sky, bloom and tone mapping, so a scene looks the same on either backend.
//
// Conventions: matrices come from the engine in GL form. The camera and shadow-pass
// matrices are uploaded pre-multiplied by a clip fix (z from [-1,1] to [0,1]); shadow
// lookups use the plain GL matrix and remap by hand, with v flipped for texture space.

const FRAME = /* wgsl */ `
struct Frame {
  viewProj: mat4x4f, shadowVP: mat4x4f, shadowVP2: mat4x4f, view: mat4x4f,
  camPos: vec4f,   // w: time
  sunDir: vec4f,   // w: ambient
  sunColor: vec4f, // w: fog density
  skyColor: vec4f, // w: fog height
  ground: vec4f,   // w: shadow texel (near)
  horizon: vec4f,  // w: shadow softness (PCSS scale, 0 = plain PCF)
  zenith: vec4f,   // w: far cascade on
  fogColor: vec4f, // w: light count
  misc: vec4f,     // x shadows on, y shadow texel (far), z wetness, w rain
  screen: vec4f,   // width, height, particle scale, 0
  lightPos: array<vec4f, 16>, lightColor: array<vec4f, 16>, lightSpot: array<vec4f, 16>, lightExtra: array<vec4f, 16>,
};
struct Draw {
  model: mat4x4f, local: mat4x4f,
  base: vec4f,   // rgb, opacity
  pat: vec4f,    // pattern rgb, pattern strength
  em: vec4f,     // emissive rgb, sheen
  mtl: vec4f,    // metallic, roughness, pattern scale, bump
  flags: vec4f,  // pattern, skinned, double sided, shading
  flags2: vec4f, // has map, has normal map, normal scale, instance pattern offset
};
`;

const VERTEX = /* wgsl */ `
struct VIn {
  @location(0) pos: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f,
  @location(3) joints: vec4f, @location(4) weights: vec4f, @location(5) rest: vec3f,
  @location(6) i0: vec4f, @location(7) i1: vec4f, @location(8) i2: vec4f, @location(9) i3: vec4f,
};
fn m3(m: mat4x4f) -> mat3x3f { return mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz); }
fn skin(v: VIn) -> mat4x4f {
  return v.weights.x * joints[u32(v.joints.x)] + v.weights.y * joints[u32(v.joints.y)] + v.weights.z * joints[u32(v.joints.z)] + v.weights.w * joints[u32(v.joints.w)];
}
`;

const NOISE = /* wgsl */ `
fn hash13(p0: vec3f) -> f32 { var p = fract(p0 * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
fn hash12(p: vec2f) -> f32 { var p3 = fract(vec3f(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
fn hash33(p0: vec3f) -> vec3f { var p = fract(p0 * vec3f(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
fn vnoise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3f(1, 0, 0)), u.x), mix(hash13(i + vec3f(0, 1, 0)), hash13(i + vec3f(1, 1, 0)), u.x), u.y),
             mix(mix(hash13(i + vec3f(0, 0, 1)), hash13(i + vec3f(1, 0, 1)), u.x), mix(hash13(i + vec3f(0, 1, 1)), hash13(i + vec3f(1, 1, 1)), u.x), u.y), u.z);
}
fn fbm(p0: vec3f) -> f32 { var p = p0; var a = 0.5; var s = 0.0; for (var i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
fn voronoi(p: vec3f) -> vec2f {
  let i = floor(p); let f = fract(p); var d1 = 8.0; var d2 = 8.0;
  for (var z = -1; z <= 1; z++) { for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let g = vec3f(f32(x), f32(y), f32(z)); let r = g + hash33(i + g) - f; let d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  } } }
  return vec2f(sqrt(d1), sqrt(d2));
}
fn fmod(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
`;

export const MAIN_WGSL = /* wgsl */ `
diagnostic(off, derivative_uniformity);
${FRAME}
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowMap2: texture_depth_2d;
@group(0) @binding(3) var cmp: sampler_comparison;
@group(1) @binding(0) var<uniform> D: Draw;
@group(2) @binding(0) var<storage, read> joints: array<mat4x4f>;
@group(3) @binding(0) var texSampler: sampler;
@group(3) @binding(1) var mapTex: texture_2d<f32>;
@group(3) @binding(2) var normalTex: texture_2d<f32>;
${VERTEX}
${NOISE}
const PI = 3.14159265;

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f,
  @location(3) rest: vec3f, @location(4) restN: vec3f, @location(5) shadow: vec4f,
};

@vertex fn vs(v: VIn) -> VOut {
  var lp = D.local * vec4f(v.pos, 1.0);
  var ln = m3(D.local) * v.normal;
  if (D.flags.y > 0.5) { let s = skin(v); lp = s * lp; ln = m3(s) * ln; }
  let inst = mat4x4f(v.i0, v.i1, v.i2, v.i3);
  let wp = D.model * inst * lp;
  let n = normalize(m3(D.model) * m3(inst) * ln);
  var o: VOut;
  o.world = wp.xyz; o.normal = n; o.uv = v.uv;
  o.rest = v.rest + v.i3.xyz * 0.731 * D.flags2.w; // instances get their own pattern offset
  o.restN = v.normal;
  o.shadow = F.shadowVP * vec4f(wp.xyz + n * 0.02, 1.0);
  o.clip = F.viewProj * wp;
  return o;
}

struct Surf { albedo: vec3f, rough: f32, metal: f32, h: f32, bump: f32, ao: f32 };

fn aaFade(c: f32) -> f32 { return 1.0 - smoothstep(0.18, 0.55, c); }
fn weave2(p: vec2f, fw: f32) -> vec2f {
  let c = floor(p); let f = fract(p);
  let ch = fmod(c.x + c.y, 2.0);
  let th = mix(sin(f.y * PI), sin(f.x * PI), ch);
  let a = aaFade(fw);
  return vec2f(mix(0.6, th, a), a);
}
fn twill2(p: vec2f, fw: f32) -> f32 { let d = fract(p.x + p.y * 0.5); let t = smoothstep(0.0, 0.35, d) * smoothstep(1.0, 0.6, d); return mix(0.55, t, aaFade(fw)); }
fn plaid2(p: vec2f, fw: f32) -> vec4f {
  let q = fract(p);
  let e = clamp(fw * 1.5, 0.004, 0.05);
  let wide = smoothstep(vec2f(0.0), vec2f(e), q) * (1.0 - smoothstep(vec2f(0.30), vec2f(0.30 + e), q));
  let thin = smoothstep(vec2f(0.55), vec2f(0.55 + e), q) * (1.0 - smoothstep(vec2f(0.585), vec2f(0.585 + e), q));
  let dark = smoothstep(vec2f(0.10), vec2f(0.10 + e), q) * (1.0 - smoothstep(vec2f(0.20), vec2f(0.20 + e), q));
  return vec4f(max(wide.x, wide.y), wide.x * wide.y, max(thin.x, thin.y), max(dark.x, dark.y));
}

fn pattern(s0: Surf, vRest: vec3f, vRestN: vec3f, vUV: vec2f, vWorld: vec3f) -> Surf {
  var s = s0;
  let P = i32(D.flags.x + 0.5); let scale = D.mtl.z; let k = D.pat.w; let pc = D.pat.rgb;
  let rp = vRest * scale;
  let fw = length(fwidth(vRest)) * scale;
  var w = pow(abs(normalize(vRestN)), vec3f(6.0)); w /= (w.x + w.y + w.z);
  if (P == 1) {
    let a = weave2(rp.zy, fw) * w.x + weave2(rp.xz, fw) * w.y + weave2(rp.xy, fw) * w.z;
    let n = fbm(rp * 0.02);
    s.h = a.x * 0.5; s.bump = 0.25 * a.y;
    s.albedo *= mix(1.0, 0.86 + 0.18 * a.x + 0.16 * (n - 0.5), k);
  } else if (P == 2) {
    let t = twill2(rp.zy, fw) * w.x + twill2(rp.xz, fw) * w.y + twill2(rp.xy, fw) * w.z;
    let n = fbm(rp * 0.04);
    let fade = smoothstep(0.45, 0.8, fbm(rp * 0.006 + 3.0));
    let weft = mix(s.albedo, vec3f(0.8, 0.83, 0.88), 0.3);
    s.albedo = mix(s.albedo, weft, (1.0 - t) * 0.35 * k);
    s.albedo *= 1.0 + (fade * 0.12 + (n - 0.5) * 0.14) * k;
    s.h = t * 0.5; s.bump = 0.25 * aaFade(fw);
  } else if (P == 3) {
    let v = voronoi(rp);
    let g = aaFade(fw * 1.5);
    let grain = mix(0.6, smoothstep(0.0, 0.3, v.y - v.x), g);
    let m = fbm(rp * 0.03);
    let wr = 1.0 - abs(fbm(rp * 0.012 + 5.0) * 2.0 - 1.0);
    let crease = smoothstep(0.82, 0.98, wr);
    s.albedo *= mix(1.0, (0.93 + 0.07 * grain) * (0.84 + 0.32 * m) * (1.0 - 0.2 * crease), k);
    s.albedo = mix(s.albedo, pc, smoothstep(0.55, 0.85, fbm(rp * 0.02 + 2.0)) * 0.35 * k);
    s.rough = clamp(s.rough + (m - 0.5) * 0.25 + crease * 0.1 - (1.0 - grain) * 0.05, 0.05, 1.0);
    s.h = grain * 0.2 * g - crease * 0.6 + m * 0.1; s.bump = 0.3;
  } else if (P == 4) {
    let n = vnoise(vec3f(vUV.x * 3.0, vUV.y * scale * 60.0, 0.0));
    let g = aaFade(length(fwidth(vUV)) * scale * 60.0);
    let sc = smoothstep(0.93, 1.0, vnoise(rp * 9.0));
    s.albedo *= 0.9 + 0.16 * mix(0.5, n, g);
    s.rough = clamp(s.rough + (n - 0.5) * 0.12 * g + sc * 0.25, 0.04, 1.0);
    s.h = n * 0.3 * g; s.bump = 0.2;
  } else if (P == 5) {
    let r = length(rp.xz) + fbm(rp * vec3f(1.0, 0.3, 1.0)) * 0.6;
    let ring = fract(r * 6.0);
    let grain = fbm(rp * vec3f(12.0, 1.5, 12.0));
    let g = aaFade(fw * 12.0);
    s.albedo = mix(s.albedo, pc, (smoothstep(0.2, 0.9, ring) * 0.55 + grain * 0.3 * g) * k);
    s.h = ring * 0.3 + grain * 0.4 * g; s.bump = 0.3;
  } else if (P == 6) {
    let m = fbm(rp * 2.0);
    let g = aaFade(fw * 20.0);
    let pores = vnoise(rp * 20.0);
    s.albedo *= 0.95 + 0.1 * m;
    s.albedo = mix(s.albedo, pc, smoothstep(0.45, 0.75, fbm(rp * 1.2 + 7.0)) * 0.22 * k);
    s.h = pores * 0.12 * g + m * 0.1; s.bump = 0.2;
    s.rough = clamp(s.rough + (pores - 0.5) * 0.08 * g, 0.2, 1.0);
  } else if (P == 7) {
    let a = plaid2(rp.zy, fw) * w.x + plaid2(rp.xz, fw) * w.y + plaid2(rp.xy, fw) * w.z;
    var c = s.albedo;
    c = mix(c, pc, a.x * 0.55 * k);
    c = mix(c, pc * 0.5, a.y * 0.6 * k);
    c = mix(c, pc * 0.35, a.w * 0.5 * k);
    c = mix(c, vec3f(0.85, 0.82, 0.74), a.z * 0.45 * k);
    let wv = weave2(rp.zy * 64.0, fw * 64.0) * w.x + weave2(rp.xz * 64.0, fw * 64.0) * w.y + weave2(rp.xy * 64.0, fw * 64.0) * w.z;
    s.albedo = c * (0.95 + 0.07 * wv.x);
    s.h = wv.x * 0.4; s.bump = 0.2 * wv.y;
  } else if (P == 8) {
    let x = vUV.x * scale;
    let st = smoothstep(0.35, 0.5, fract(x)) * (1.0 - smoothstep(0.85, 1.0, fract(x)));
    s.albedo = mix(s.albedo, pc, st * k * aaFade(length(fwidth(vUV)) * scale));
    s.h = st * 0.5; s.bump = 0.4;
  } else if (P == 9) {
    let c = floor(rp);
    s.albedo = mix(s.albedo, pc, fmod(c.x + c.y + c.z, 2.0) * k);
  } else if (P == 10) {
    let wp = vec3f(vWorld.x, 0.0, vWorld.z) * scale;
    let n = fbm(wp * 0.35);
    let n2 = fbm(wp * 2.5 + 4.0);
    let v = voronoi(wp * 3.0);
    var pebble = 1.0 - smoothstep(0.0, 0.35, v.x);
    pebble *= step(0.72, hash13(floor(wp * 3.0)));
    let tracks = smoothstep(0.35, 0.6, fbm(wp * vec3f(0.05, 0.0, 1.4)));
    s.albedo = mix(s.albedo, pc, smoothstep(0.35, 0.7, n) * k);
    s.albedo *= 0.8 + 0.4 * n2;
    s.albedo = mix(s.albedo, s.albedo * 1.25 + 0.04, pebble * 0.8);
    s.albedo *= 1.0 - tracks * 0.12;
    s.h = n2 * 0.5 + pebble * 0.6; s.bump = 1.0;
    s.rough = 0.9 - pebble * 0.25;
  } else if (P == 11) {
    let g = aaFade(fw * 8.0);
    let n = fbm(rp * 8.0);
    s.albedo *= 0.88 + 0.22 * mix(0.5, n, g) + (fbm(rp * 0.8) - 0.5) * 0.25;
    s.h = n * 0.4 * g; s.bump = 0.25;
  } else if (P == 12) {
    let f = length(fwidth(vUV)) * scale * 40.0;
    let g = aaFade(f);
    let n = mix(0.5, vnoise(vec3f(vUV.x * scale * 40.0, vUV.y * 3.0, 0.0)), g);
    s.albedo *= 0.75 + 0.45 * n;
    s.h = n; s.bump = 0.3 * g; s.rough = clamp(s.rough - n * 0.2, 0.2, 1.0);
  } else if (P == 14) {
    let g = aaFade(fw * 6.0);
    let streak = fbm(vec3f(rp.x * 6.0, rp.y * 6.0, rp.z * 0.35));
    let fig = fract((rp.x * 1.2 + rp.y * 1.6) * 3.0 + fbm(rp * vec3f(1.5, 1.5, 0.25)) * 2.5);
    let pore = vnoise(vec3f(rp.x * 40.0, rp.y * 40.0, rp.z * 2.0));
    s.albedo = mix(s.albedo, pc, (smoothstep(0.35, 0.8, streak) * 0.55 + smoothstep(0.55, 1.0, fig) * 0.3 * g) * k);
    s.albedo *= 0.94 + 0.1 * mix(0.5, pore, g);
    s.rough = clamp(s.rough + (streak - 0.5) * 0.2, 0.1, 1.0);
    s.h = streak * 0.25 + pore * 0.08 * g; s.bump = 0.15;
  } else if (P == 15) {
    var y = rp.y + select(0.0, rp.z, vRestN.y > 0.7 || vRestN.y < -0.7);
    var along = select(rp.x, rp.z, abs(vRestN.x) > abs(vRestN.z));
    if (abs(vRestN.y) > 0.7) { y = rp.z; along = rp.x; }
    let row = floor(y);
    let fy = fract(y);
    let seam = smoothstep(0.0, 0.05, fy) * (1.0 - smoothstep(0.93, 1.0, fy));
    let board = hash12(vec2f(row, 3.1));
    let endj = step(0.97, fract(along * 0.35 + board * 7.0));
    let grain = fbm(vec3f(along * 0.8, y * 14.0, board * 10.0));
    let g = aaFade(fw * 3.0);
    s.albedo *= mix(1.0, (0.78 + 0.35 * board) * (0.86 + 0.3 * grain * g), k);
    s.albedo = mix(s.albedo, pc, (1.0 - seam) * 0.8 * k + endj * 0.5 * k);
    s.h = seam * 0.6 + grain * 0.2 * g - endj * 0.4; s.bump = 0.45;
    s.rough = clamp(s.rough + (board - 0.5) * 0.2, 0.2, 1.0);
  } else if (P == 16) {
    var p2 = rp.xy;
    if (w.x > max(w.y, w.z)) { p2 = rp.zy; } else if (w.y > w.z) { p2 = rp.xz; }
    var b = vec2f(p2.x * 0.5, p2.y);
    b.x += 0.5 * fmod(floor(b.y), 2.0);
    let f = fract(b); let c = floor(b);
    let e = clamp(fw * 1.5, 0.02, 0.2);
    let mortar = smoothstep(0.0, e + 0.04, f.x) * smoothstep(0.0, e + 0.08, f.y) * (1.0 - smoothstep(1.0 - e - 0.04, 1.0, f.x)) * (1.0 - smoothstep(1.0 - e - 0.08, 1.0, f.y));
    let tone = hash12(c);
    s.albedo *= mix(1.0, 0.72 + 0.45 * tone + 0.1 * (fbm(rp * 3.0) - 0.5), k);
    s.albedo = mix(pc, s.albedo, mortar);
    s.h = mortar * 0.7 + fbm(rp * 6.0) * 0.1; s.bump = 0.6;
    s.rough = mix(0.95, s.rough, mortar);
  } else if (P == 17) {
    let xz = abs(vRestN.x) > abs(vRestN.z);
    var p2 = select(vec2f(rp.x, rp.y), vec2f(rp.z, rp.y), xz);
    if (abs(vRestN.y) > 0.3) { p2 = vec2f(select(rp.x, rp.z, xz), rp.y + select(rp.z, rp.x, xz)); }
    p2.x += 0.5 * fmod(floor(p2.y), 2.0);
    let f = fract(p2); let c = floor(p2);
    let edge = smoothstep(0.0, 0.12, f.y) * smoothstep(0.0, 0.06, min(f.x, 1.0 - f.x));
    let tone = hash12(c + 7.0);
    s.albedo *= mix(1.0, (0.7 + 0.5 * tone) * (0.55 + 0.45 * edge), k);
    s.h = f.y * 0.8 + edge * 0.2; s.bump = 0.55;
  } else if (P == 18) {
    let n = fbm(rp * 1.5); let n2 = fbm(rp * 9.0 + 3.0);
    let stain = smoothstep(0.45, 0.8, fbm(vec3f(rp.x * 0.4, rp.y * 1.6, rp.z * 0.4) + 11.0));
    s.albedo *= mix(1.0, 0.88 + 0.22 * n + 0.08 * n2, k);
    s.albedo = mix(s.albedo, pc, stain * 0.35 * k * smoothstep(0.6, 0.0, fract(vRest.y * 0.4)));
    s.h = n * 0.6 + n2 * 0.4; s.bump = 0.7;
  } else if (P == 19) {
    let p2 = select(rp.xy, rp.zy, abs(vRestN.x) > abs(vRestN.z));
    let f = fract(p2);
    let mull = 1.0 - smoothstep(0.03, 0.06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    s.albedo = mix(s.albedo, pc, mull);
    s.rough = mix(0.05, 0.7, mull); s.metal = mix(0.4, 0.0, mull);
    s.ao = 1.0 - mull;
  } else if (P == 20) {
    let a = select(rp.x, rp.z, abs(vRestN.x) > abs(vRestN.z));
    let wave = sin(a * 6.2831);
    let rust = smoothstep(0.5, 0.8, fbm(rp * 0.3 + 5.0));
    s.albedo = mix(s.albedo, pc, rust * k);
    s.metal = mix(s.metal, 0.1, rust); s.rough = mix(s.rough, 0.9, rust);
    s.h = wave * 0.5 + 0.5; s.bump = 0.5 * aaFade(fw);
  } else if (P == 13) {
    let r = length(vRestN.xy);
    let z = vRestN.z;
    let iris = step(0.0, z) * (1.0 - smoothstep(0.5, 0.56, r));
    let pupil = step(0.0, z) * (1.0 - smoothstep(0.22, 0.26, r));
    let ang = atan2(vRestN.y, vRestN.x);
    let irisC = pc * (0.7 + 0.5 * vnoise(vec3f(ang * 6.0, r * 20.0, 0.0)));
    s.albedo = mix(s.albedo, irisC, iris);
    s.albedo = mix(s.albedo, vec3f(0.02), pupil);
    s.rough = 0.06;
  }
  return s;
}

fn perturb(N: vec3f, p: vec3f, h: f32, strength: f32) -> vec3f {
  let dpdx_ = dpdx(p); let dpdy_ = dpdy(p);
  let dhdx = dpdx(h); let dhdy = dpdy(h);
  let r1 = cross(dpdy_, N); let r2 = cross(N, dpdx_);
  let det = dot(dpdx_, r1);
  if (abs(det) < 1e-10) { return N; }
  let grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * N - strength * grad);
}

// weather (puddles and rain ripples), as in shaders.js WET
fn puddleMask(wp: vec3f, n: vec3f) -> f32 {
  let wet = F.misc.z;
  if (wet <= 0.0) { return 0.0; }
  let up = smoothstep(0.8, 0.97, n.y);
  let q = vec3f(wp.x, 0.0, wp.z);
  let m = fbm(q * 0.42) + 0.15 * fbm(q * 2.7 + 5.0);
  let th = 0.8 - wet * 0.3;
  return up * smoothstep(th, th + 0.035, m);
}
fn rainRipples(p: vec2f, t: f32) -> vec2f {
  var acc = vec2f(0.0);
  for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) {
    let c = floor(p) + vec2f(f32(i), f32(j));
    let h = hash12(c);
    let o = c + vec2f(hash12(c + 3.1), hash12(c + 7.7));
    let ph = fract(t * 0.85 + h);
    let d = p - o; let r = length(d);
    let x = (r - ph * 0.8) * 16.0;
    let wv = exp(-x * x) * (1.0 - ph) * sin((r - ph * 0.8) * 60.0);
    acc += select(vec2f(0.0), d / r, r > 1e-4) * wv;
  } }
  return acc;
}

fn shadowUV(sp: vec4f) -> vec3f { let p = sp.xyz / sp.w; return vec3f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5, p.z * 0.5 + 0.5); }
fn outside(sc: vec3f) -> bool { return sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0; }
fn farShadow(world: vec3f, N: vec3f) -> f32 {
  let sc = shadowUV(F.shadowVP2 * vec4f(world + N * 0.08, 1.0));
  if (outside(sc)) { return 1.0; }
  let bias = 0.0006 + 0.0012 * (1.0 - max(dot(N, F.sunDir.xyz), 0.0));
  var s = 0.0;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    s += textureSampleCompareLevel(shadowMap2, cmp, sc.xy + vec2f(f32(x), f32(y)) * F.misc.y * 1.2, sc.z - bias);
  } }
  return s / 9.0;
}
var<private> TAPS: array<vec2f, 12> = array<vec2f, 12>(vec2f(-0.326, -0.406), vec2f(-0.840, -0.074), vec2f(-0.696, 0.457), vec2f(-0.203, 0.621), vec2f(0.962, -0.195), vec2f(0.473, -0.480),
                             vec2f(0.519, 0.767), vec2f(0.185, -0.893), vec2f(0.507, 0.064), vec2f(0.896, 0.412), vec2f(-0.322, -0.933), vec2f(-0.792, -0.598));
fn nearShadow(sh: vec4f, N: vec3f, frag: vec2f) -> f32 {
  let sc = shadowUV(sh);
  let texel = F.ground.w;
  let bias = 0.0008 + 0.0015 * (1.0 - max(dot(N, F.sunDir.xyz), 0.0));
  let ang = hash12(frag) * 6.2831;
  let R = mat2x2f(cos(ang), sin(ang), -sin(ang), cos(ang));
  var radius = 2.2;
  if (F.horizon.w > 0.0) {
    // PCSS: blocker search sets the penumbra width, so contact shadows stay sharp
    let size = vec2f(textureDimensions(shadowMap));
    var bsum = 0.0; var bn = 0.0;
    for (var i = 0; i < 12; i++) {
      let uv = clamp(sc.xy + R * TAPS[i] * texel * 14.0, vec2f(0.0), vec2f(0.9999));
      let d = textureLoad(shadowMap, vec2i(uv * size), 0);
      if (d < sc.z - bias) { bsum += d; bn += 1.0; }
    }
    if (bn < 0.5) { return 1.0; }
    radius = clamp((sc.z - bsum / bn) * F.horizon.w / texel, 1.2, 16.0);
  }
  var s = 0.0;
  for (var i = 0; i < 12; i++) { s += textureSampleCompareLevel(shadowMap, cmp, sc.xy + R * TAPS[i] * texel * radius, sc.z - bias); }
  return s / 12.0;
}
fn shadowFactor(sh: vec4f, world: vec3f, N: vec3f, frag: vec2f) -> f32 {
  if (F.misc.x < 0.5) { return 1.0; }
  let sc = shadowUV(sh);
  let inNear = !outside(sc);
  if (F.zenith.w < 0.5) { return select(1.0, nearShadow(sh, N, frag), inNear); }
  if (!inNear) { return farShadow(world, N); }
  let edge = min(min(sc.x, 1.0 - sc.x), min(sc.y, 1.0 - sc.y));
  let kk = smoothstep(0.0, 0.1, edge);
  if (kk >= 1.0) { return nearShadow(sh, N, frag); }
  return mix(farShadow(world, N), nearShadow(sh, N, frag), kk);
}

fn lightShape(i: i32, Ll: vec3f, d2: f32) -> f32 {
  let r = F.lightPos[i].w;
  let q = d2 / (r * r);
  let win = clamp(1.0 - q * q, 0.0, 1.0);
  let X = F.lightExtra[i];
  var att = select(win * win / (d2 + 1.0), win * win / max(d2, 0.01), X.z > 0.5);
  let prof = i32(X.x + 0.5);
  if (F.lightColor[i].w > 0.5) {
    let cd = dot(-Ll, F.lightSpot[i].xyz); let outer = F.lightSpot[i].w;
    if (prof == 1) {
      let u = (1.0 - cd) / max(1.0 - outer, 1e-4);
      let ring = (u - 0.55) / 0.09;
      att *= select(exp(-u * u * 7.0) + 0.35 * exp(-ring * ring) + 0.16 * (1.0 - smoothstep(0.7, 1.0, u)), 0.0, u > 1.0);
    } else if (prof == 3) { att *= smoothstep(outer, outer + 0.006, cd); }
    else { att *= smoothstep(outer, mix(outer, 1.0, 0.35), cd); }
  } else if (prof == 2) { att *= mix(1.0, 0.3, smoothstep(0.15, 0.85, -Ll.y)); }
  return att;
}

fn skyAt(d: vec3f) -> vec3f {
  let t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  var c = mix(F.ground.rgb * 0.9, F.horizon.rgb, smoothstep(0.35, 0.5, t));
  return mix(c, F.zenith.rgb, smoothstep(0.5, 0.95, t));
}
fn envBRDF(F0: vec3f, r: f32, NoV: f32) -> vec3f {
  let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022); let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
  let rr = r * c0 + c1; let a004 = min(rr.x * rr.x, exp2(-9.28 * NoV)) * rr.x + rr.y;
  let AB = vec2f(-1.04, 1.04) * a004 + rr.zw;
  return F0 * AB.x + AB.y;
}

@fragment fn fs(inp: VOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  var N = normalize(inp.normal);
  let V = normalize(F.camPos.xyz - inp.world);
  if (D.flags.z > 0.5 && !front) { N = -N; }
  let shading = i32(D.flags.w + 0.5);
  if (shading == 2) { return vec4f(D.base.rgb, D.base.w); }
  var s = Surf(D.base.rgb, D.mtl.y, D.mtl.x, 0.0, 0.0, 1.0);
  if (D.flags2.x > 0.5) { s.albedo *= textureSample(mapTex, texSampler, inp.uv).rgb; }
  if (D.flags2.y > 0.5) {
    let dp1 = dpdx(inp.world); let dp2 = dpdy(inp.world); let du1 = dpdx(inp.uv); let du2 = dpdy(inp.uv);
    let dp2p = cross(dp2, N); let dp1p = cross(N, dp1);
    let T = dp2p * du1.x + dp1p * du2.x; let B = dp2p * du1.y + dp1p * du2.y;
    let inv = inverseSqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
    var tn = textureSample(normalTex, texSampler, inp.uv).xyz * 2.0 - 1.0; tn = vec3f(tn.xy * D.flags2.z, tn.z);
    N = normalize(mat3x3f(T * inv, B * inv, N) * tn);
  }
  if (D.flags.x > 0.5) { s = pattern(s, inp.rest, inp.restN, inp.uv, inp.world); }
  var pud = 0.0;
  let wet = F.misc.z;
  if (wet > 0.0 && shading != 1) {
    let damp = wet * (0.5 + 0.5 * smoothstep(-0.3, 0.7, N.y));
    pud = puddleMask(inp.world, N);
    s.albedo *= mix(1.0, 0.6, damp * (1.0 - s.metal) * 0.8);
    s.rough = mix(s.rough, s.rough * 0.45, damp);
    s.rough = mix(s.rough, 0.02, pud); s.albedo *= 1.0 - 0.3 * pud; s.bump *= 1.0 - pud;
  }
  if (s.bump > 0.0 && D.mtl.w > 0.0) { N = perturb(N, inp.world, s.h, s.bump * D.mtl.w * 0.02); }
  if (pud > 0.0 && F.misc.w > 0.0) { let rp = rainRipples(inp.world.xz * 2.6, F.camPos.w); N = normalize(N + vec3f(rp.x, 0.0, rp.y) * 0.35 * F.misc.w * pud); }
  let NoV = max(dot(N, V), 1e-4);

  if (shading == 1) { // studio solid
    let L1 = normalize(vec3f(0.4, 0.8, 0.5)); let L2 = normalize(vec3f(-0.6, 0.3, -0.4));
    let d = max(dot(N, L1), 0.0) * 0.75 + max(dot(N, L2), 0.0) * 0.25 + 0.25 + 0.15 * N.y;
    let rim = pow(1.0 - NoV, 3.0) * 0.25;
    let spec = pow(max(dot(N, normalize(L1 + V)), 0.0), 40.0) * 0.25 * (1.0 - s.rough);
    return vec4f(s.albedo * d + rim + spec, D.base.w);
  }

  let sh = shadowFactor(inp.shadow, inp.world, N, inp.clip.xy);
  let L = F.sunDir.xyz;
  let H = normalize(L + V);
  let NoL = max(dot(N, L), 0.0); let NoH = max(dot(N, H), 0.0); let VoH = max(dot(V, H), 0.0);
  let a = max(s.rough * s.rough, 0.002); let a2 = a * a;
  let dd = NoH * NoH * (a2 - 1.0) + 1.0;
  let Dg = a2 / (PI * dd * dd);
  let kr = (s.rough + 1.0) * (s.rough + 1.0) / 8.0;
  let G = (NoL / (NoL * (1.0 - kr) + kr)) * (NoV / (NoV * (1.0 - kr) + kr));
  let F0 = mix(vec3f(0.04), s.albedo, s.metal);
  let Fr = F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
  var spec = Dg * G * Fr / max(4.0 * NoL * NoV, 1e-4);
  let kd = (1.0 - Fr) * (1.0 - s.metal);
  var diffuse = kd * s.albedo / PI;
  var wrapL = vec3f(NoL);
  if (i32(D.flags.x + 0.5) == 6) { // skin: subsurface scattering approximation
    let wv = vec3f(0.62, 0.32, 0.24); let nl = vec3f(dot(N, L));
    wrapL = max((nl + wv) / (1.0 + wv), vec3f(0.0)) * mix(vec3f(1.0), vec3f(1.0, 0.94, 0.9), 1.0 - NoL);
    let back = pow(clamp(dot(V, -normalize(L + N * 0.35)), 0.0, 1.0), 3.5);
    diffuse += s.albedo * vec3f(1.0, 0.28, 0.14) * back * 0.55 / PI;
    var a2s = max(s.rough * s.rough * 0.3, 0.002); a2s *= a2s;
    let d2s = NoH * NoH * (a2s - 1.0) + 1.0;
    let D2 = a2s / (PI * d2s * d2s);
    spec = spec * 0.85 + D2 * G * Fr * 0.15 / max(4.0 * NoL * NoV, 1e-4);
  }
  var color = (diffuse * wrapL + spec * NoL) * F.sunColor.rgb * sh;
  let n = i32(F.fogColor.w + 0.5);
  for (var i = 0; i < 16; i++) {
    if (i >= n) { break; }
    let Lv = F.lightPos[i].xyz - inp.world;
    let d2 = dot(Lv, Lv); let r = F.lightPos[i].w;
    if (d2 > r * r) { continue; }
    let Ll = Lv * inverseSqrt(max(d2, 1e-6));
    let att = lightShape(i, Ll, d2);
    let nl = max(dot(N, Ll), 0.0);
    if (nl <= 0.0 || att <= 0.0) { continue; }
    let Hl = normalize(Ll + V);
    let nh = max(dot(N, Hl), 0.0);
    let dl = nh * nh * (a2 - 1.0) + 1.0;
    let Dl = a2 / (PI * dl * dl);
    let Fl = F0 + (1.0 - F0) * pow(1.0 - max(dot(V, Hl), 0.0), 5.0);
    color += (kd * s.albedo / PI + Dl * Fl * 0.25 * G) * F.lightColor[i].rgb * att * nl;
  }
  let amb = F.sunDir.w;
  let hemi = mix(F.ground.rgb, F.skyColor.rgb, N.y * 0.5 + 0.5);
  let ao = (0.55 + 0.45 * clamp(N.y * 0.5 + 0.6, 0.0, 1.0)) * s.ao;
  color += kd * s.albedo * hemi * amb * ao;
  let R = reflect(-V, N);
  let env = mix(skyAt(R), hemi, s.rough);
  color += env * envBRDF(F0, s.rough, NoV) * amb * ao * mix(0.6, 1.0, sh);
  let Lf = normalize(vec3f(-L.x, 0.35, -L.z));
  color += kd * s.albedo * max(dot(N, Lf), 0.0) * vec3f(0.25, 0.3, 0.4) * 0.35;
  let rim = pow(1.0 - NoV, 4.0);
  color += (D.em.w * s.albedo + vec3f(0.06)) * rim * F.sunColor.rgb * 0.35 * (0.4 + 0.6 * sh);
  color += D.em.rgb;
  let dist = length(F.camPos.xyz - inp.world);
  var fogAmt = dist * F.sunColor.w;
  let fh = F.skyColor.w;
  if (fh > 0.0) {
    let h0 = max(F.camPos.y, 0.0); let h1 = max(inp.world.y, 0.0); let dh = h1 - h0;
    let integ = select((exp(-fh * h0) - exp(-fh * h1)) / (fh * dh), exp(-fh * h0), abs(dh) < 1e-3);
    fogAmt *= 1.0 + 1.2 * integ;
  }
  let fog = 1.0 - exp(-pow(max(fogAmt, 0.0), 1.4));
  color = mix(color, F.fogColor.rgb, clamp(fog, 0.0, 1.0));
  return vec4f(color, D.base.w);
}
`;

export const SHADOW_WGSL = /* wgsl */ `
${FRAME}
struct ShadowFrame { vp: mat4x4f };
@group(0) @binding(0) var<uniform> SF: ShadowFrame;
@group(1) @binding(0) var<uniform> D: Draw;
@group(2) @binding(0) var<storage, read> joints: array<mat4x4f>;
${VERTEX}
@vertex fn vs(v: VIn) -> @builtin(position) vec4f {
  var lp = D.local * vec4f(v.pos, 1.0);
  if (D.flags.y > 0.5) { lp = skin(v) * lp; }
  return SF.vp * D.model * mat4x4f(v.i0, v.i1, v.i2, v.i3) * lp;
}
`;

export const FULLSCREEN = /* wgsl */ `
struct FSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) ndc: vec2f };
@vertex fn fsv(@builtin(vertex_index) i: u32) -> FSOut {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: FSOut; o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0); o.uv = vec2f(p.x, 1.0 - p.y); o.ndc = p * 2.0 - 1.0; return o;
}
`;

export const SKY_WGSL = /* wgsl */ `
${FULLSCREEN}
${NOISE}
struct Sky {
  invViewProj: mat4x4f,
  sunDir: vec4f,    // w: mode (1 = editor gradient)
  sunColor: vec4f,  // w: clouds
  horizon: vec4f,   // w: time
  zenith: vec4f,    // w: night
  ground: vec4f, moonDir: vec4f, top: vec4f, bottom: vec4f,
};
@group(0) @binding(0) var<uniform> S: Sky;
@fragment fn fs(inp: FSOut) -> @location(0) vec4f {
  if (S.sunDir.w > 0.5) { return vec4f(mix(S.bottom.rgb, S.top.rgb, inp.ndc.y * 0.5 + 0.5), 1.0); }
  let a = S.invViewProj * vec4f(inp.ndc, -1.0, 1.0);
  let b = S.invViewProj * vec4f(inp.ndc, 1.0, 1.0);
  let d = normalize(b.xyz / b.w - a.xyz / a.w);
  let t = d.y; let time = S.horizon.w; let night = S.zenith.w;
  var c = mix(S.horizon.rgb, S.zenith.rgb, pow(smoothstep(0.0, 0.8, t), 0.6));
  c = mix(c, S.ground.rgb * 0.8, smoothstep(0.0, -0.15, t));
  let sd = max(dot(d, S.sunDir.xyz), 0.0);
  c += S.sunColor.rgb * (pow(sd, 900.0) * 20.0 + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.12);
  let az = atan2(d.z, d.x);
  let ridge = 0.035 + 0.05 * fbm(vec3f(az * 2.2, 0.0, 1.0)) + 0.06 * smoothstep(0.55, 0.75, fbm(vec3f(az * 1.3, 4.0, 2.0)));
  let mesa = smoothstep(ridge + 0.002, ridge - 0.002, t) * step(-0.02, t);
  c = mix(c, mix(S.horizon.rgb * 0.62, vec3f(0.45, 0.3, 0.25), 0.5), mesa * 0.85);
  if (night > 0.0 && t > 0.0) {
    let st = hash13(floor(d * 380.0));
    let star = smoothstep(0.9965, 1.0, st) * (0.6 + 0.4 * sin(time * 3.0 + st * 80.0));
    c += vec3f(0.9, 0.95, 1.0) * star * 2.5 * night * smoothstep(0.0, 0.25, t);
    let band = fbm(d * 6.0) * smoothstep(0.35, 0.0, abs(dot(d, normalize(vec3f(0.3, 0.2, 1.0)))));
    c += vec3f(0.25, 0.28, 0.4) * band * 0.25 * night;
    let md = max(dot(d, S.moonDir.xyz), 0.0);
    let disc = smoothstep(0.99965, 0.99975, md);
    let craters = 0.85 + 0.15 * fbm(d * 400.0);
    c += vec3f(0.95, 0.96, 1.0) * (disc * 3.0 * craters + pow(md, 60.0) * 0.25) * night;
  }
  if (S.sunColor.w > 0.5 && t > 0.0) {
    let cp = d.xz / (t + 0.15) * 1.2 + vec2f(time * 0.01, 0.0);
    let cl = smoothstep(0.5, 0.85, fbm(vec3f(cp, 0.0) * 1.5));
    var cc = mix(vec3f(1.0, 0.95, 0.9), S.sunColor.rgb, 0.3) * (0.9 + 0.3 * pow(sd, 4.0));
    cc = mix(cc, vec3f(0.08, 0.09, 0.13), night);
    c = mix(c, cc, cl * smoothstep(0.0, 0.25, t) * 0.8);
  }
  return vec4f(c, 1.0);
}
`;

export const PARTICLE_WGSL = /* wgsl */ `
${FRAME}
@group(0) @binding(0) var<uniform> F: Frame;
struct POut { @builtin(position) pos: vec4f, @location(0) col: vec4f, @location(1) q: vec2f };
var<private> CORNERS: array<vec2f, 6> = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) ps: vec4f, @location(1) col: vec4f) -> POut {
  let c = CORNERS[vi];
  var clip = F.viewProj * vec4f(ps.xyz, 1.0);
  let px = ps.w * F.screen.z / max(clip.w, 0.1); // diameter in pixels, as gl_PointSize
  clip = vec4f(clip.xy + c * vec2f(px / F.screen.x, px / F.screen.y) * clip.w, clip.zw);
  var o: POut; o.pos = clip; o.col = col; o.q = c; return o;
}
@fragment fn fs(inp: POut) -> @location(0) vec4f {
  let r = dot(inp.q, inp.q);
  if (r > 1.0) { discard; }
  let a = (1.0 - r) * (1.0 - r);
  return vec4f(inp.col.rgb, inp.col.a * a);
}
`;

export const LINE_WGSL = /* wgsl */ `
${FRAME}
@group(0) @binding(0) var<uniform> F: Frame;
@group(1) @binding(0) var<uniform> D: Draw;
struct LOut { @builtin(position) pos: vec4f, @location(0) col: vec4f };
@vertex fn vs(@location(0) p: vec3f, @location(1) col: vec4f) -> LOut { var o: LOut; o.pos = F.viewProj * vec4f(p, 1.0); o.col = col; return o; }
@fragment fn fs(inp: LOut) -> @location(0) vec4f { return vec4f(inp.col.rgb, inp.col.a * D.base.w); }
`;

export const BLOOM_WGSL = /* wgsl */ `
${FULLSCREEN}
struct Bloom { texel: vec2f, threshold: f32, pass_: f32 };
@group(0) @binding(0) var<uniform> B: Bloom;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
@fragment fn fs(inp: FSOut) -> @location(0) vec4f {
  let uv = inp.uv;
  if (B.pass_ < 0.5) {
    var c = vec3f(0.0);
    for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) { c += textureSampleLevel(src, smp, uv + vec2f(f32(x), f32(y)) * B.texel, 0.0).rgb; } }
    c /= 9.0;
    let l = max(c.r, max(c.g, c.b));
    return vec4f(c * max(l - B.threshold, 0.0) / max(l, 1e-4), 1.0);
  }
  if (B.pass_ > 1.5) {
    let c = textureSampleLevel(src, smp, uv + B.texel * vec2f(-0.5, -0.5), 0.0).rgb + textureSampleLevel(src, smp, uv + B.texel * vec2f(0.5, -0.5), 0.0).rgb
          + textureSampleLevel(src, smp, uv + B.texel * vec2f(-0.5, 0.5), 0.0).rgb + textureSampleLevel(src, smp, uv + B.texel * vec2f(0.5, 0.5), 0.0).rgb;
    return vec4f(c * 0.25, 1.0);
  }
  var c = textureSampleLevel(src, smp, uv, 0.0).rgb * 0.227;
  c += (textureSampleLevel(src, smp, uv + B.texel * 1.385, 0.0).rgb + textureSampleLevel(src, smp, uv - B.texel * 1.385, 0.0).rgb) * 0.316;
  c += (textureSampleLevel(src, smp, uv + B.texel * 3.231, 0.0).rgb + textureSampleLevel(src, smp, uv - B.texel * 3.231, 0.0).rgb) * 0.070;
  return vec4f(c, 1.0);
}
`;

export const POST_WGSL = /* wgsl */ `
${FULLSCREEN}
struct Post {
  a: vec4f,     // exposure, vignette, grain, time
  b: vec4f,     // bloom strength, saturation, contrast, sharpen
  white: vec4f, // rgb, aberration
  c: vec4f,     // texel x, texel y, god rays, 0
  sun: vec4f,   // sun uv, 0, 0
  ray: vec4f,
};
@group(0) @binding(0) var<uniform> P: Post;
@group(0) @binding(1) var color: texture_2d<f32>;
@group(0) @binding(2) var bloom1: texture_2d<f32>;
@group(0) @binding(3) var bloom2: texture_2d<f32>;
@group(0) @binding(4) var bloom3: texture_2d<f32>;
@group(0) @binding(5) var smp: sampler;
fn aces(x: vec3f) -> vec3f { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0)); }
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.299, 0.587, 0.114)); }
fn tex(t: texture_2d<f32>, uv: vec2f) -> vec3f { return textureSampleLevel(t, smp, uv, 0.0).rgb; }
@fragment fn fs(inp: FSOut) -> @location(0) vec4f {
  let uv = inp.uv; let texel = P.c.xy;
  var c = tex(color, uv);
  if (P.white.w > 0.0) { let off = (uv - 0.5) * P.white.w * 0.004; c = vec3f(tex(color, uv + off).r, c.g, tex(color, uv - off).b); }
  if (P.b.w > 0.0) {
    let nb = tex(color, uv + vec2f(texel.x, 0.0)) + tex(color, uv - vec2f(texel.x, 0.0)) + tex(color, uv + vec2f(0.0, texel.y)) + tex(color, uv - vec2f(0.0, texel.y));
    c = max(c + (c - nb * 0.25) * P.b.w / (1.0 + luma(c)), vec3f(0.0));
  }
  c += (tex(bloom1, uv) + tex(bloom2, uv) * 0.9 + tex(bloom3, uv) * 0.8) * P.b.x;
  if (P.c.z > 0.0) {
    let dir = (uv - P.sun.xy) / 40.0;
    var q = uv; var decay = 1.0; var acc = vec3f(0.0);
    for (var i = 0; i < 40; i++) { q -= dir; acc += tex(bloom1, q) * decay; decay *= 0.955; }
    c += acc / 40.0 * P.c.z * P.ray.rgb;
  }
  c *= P.white.rgb;
  c = aces(c * P.a.x);
  let l = luma(c);
  c = mix(vec3f(l), c, P.b.y);
  c = clamp((c - 0.5) * P.b.z + 0.5, vec3f(0.0), vec3f(1.0));
  c = pow(c, vec3f(1.0 / 2.2));
  let q = uv - 0.5;
  c *= 1.0 - dot(q, q) * P.a.y;
  let n = fract(sin(dot(uv * 1000.0 + P.a.w, vec2f(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * P.a.z;
  return vec4f(c, 1.0);
}
`;

// GPU frustum culling for instanced meshes: each instance is tested against the camera
// frustum and survivors are compacted into a second buffer; the indirect draw arguments
// (instance count) are filled in by the same pass, so the CPU never sees the result.
export const CULL_WGSL = /* wgsl */ `
struct Cull { planes: array<vec4f, 5>, model: mat4x4f, sphere: vec4f, count: u32, p0: u32, p1: u32, p2: u32 };
@group(0) @binding(0) var<uniform> C: Cull;
@group(0) @binding(1) var<storage, read> src: array<mat4x4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<mat4x4f>;
@group(0) @binding(3) var<storage, read_write> args: array<atomic<u32>, 5>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= C.count) { return; }
  let m = C.model * src[i];
  let c = (m * vec4f(C.sphere.xyz, 1.0)).xyz;
  let s = max(length(m[0].xyz), max(length(m[1].xyz), length(m[2].xyz)));
  let r = C.sphere.w * s;
  for (var k = 0; k < 5; k++) { if (dot(C.planes[k].xyz, c) + C.planes[k].w < -r) { return; } }
  let slot = atomicAdd(&args[1], 1u);
  dst[slot] = src[i];
}
`;

export const MIP_WGSL = /* wgsl */ `
${FULLSCREEN}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@fragment fn fs(inp: FSOut) -> @location(0) vec4f { return textureSampleLevel(src, smp, inp.uv, 0.0); }
`;

// Screen effects (half resolution): linear depth + normals rebuilt from the MSAA depth
// buffer, SSAO, volumetric light (sun shafts through the shadow map, lamp and flashlight
// beams in fog), depth-aware blurs and the composite that folds them into the HDR frame.
export const FX_WGSL = /* wgsl */ `
${FRAME}
${FULLSCREEN}
struct FX {
  invVP: mat4x4f, view: mat4x4f, proj: mat4x4f, invView: mat4x4f,
  tan: vec4f,   // tan x, tan y, AO radius, AO intensity
  vol: vec4f,   // density, fog height, sun scatter, light scatter
  vol2: vec4f,  // max distance, anisotropy, time, shadows on
  comp: vec4f,  // AO on, AO strength, volumetrics on, 0
  kernel: array<vec4f, 16>,
};
@group(0) @binding(0) var<uniform> X: FX;
@group(0) @binding(1) var<uniform> F: Frame;
@group(0) @binding(2) var depthMS: texture_depth_multisampled_2d;
@group(0) @binding(3) var gTex: texture_2d<f32>;
@group(0) @binding(4) var srcTex: texture_2d<f32>;
@group(0) @binding(5) var src2Tex: texture_2d<f32>;
@group(0) @binding(6) var src3Tex: texture_2d<f32>;
@group(0) @binding(7) var shadowMap: texture_depth_2d;
@group(0) @binding(8) var cmp: sampler_comparison;
@group(0) @binding(9) var smp: sampler;

fn h12(p: vec2f) -> f32 { var p3 = fract(vec3f(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
fn worldAt(px: vec2i) -> vec4f {
  let dims = vec2i(textureDimensions(depthMS));
  let q = clamp(px, vec2i(0), dims - 1);
  let z = textureLoad(depthMS, q, 0);
  let uv = (vec2f(q) + 0.5) / vec2f(dims);
  let h = X.invVP * vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, z, 1.0);
  return vec4f(h.xyz / h.w, select(1.0, 0.0, z >= 1.0));
}
// view-space normal (xyz) and linear depth (w, 0 = sky)
@fragment fn gdepth(inp: FSOut) -> @location(0) vec4f {
  let px = vec2i(inp.pos.xy * 2.0);
  let p = worldAt(px);
  if (p.w < 0.5) { return vec4f(0.0, 0.0, 1.0, 0.0); }
  let d = -(X.view * vec4f(p.xyz, 1.0)).z;
  let r = worldAt(px + vec2i(2, 0)).xyz; let l = worldAt(px - vec2i(2, 0)).xyz;
  let u = worldAt(px - vec2i(0, 2)).xyz; let dn = worldAt(px + vec2i(0, 2)).xyz;
  let dx = select(p.xyz - l, r - p.xyz, length(r - p.xyz) < length(p.xyz - l));
  let dy = select(p.xyz - u, dn - p.xyz, length(dn - p.xyz) < length(p.xyz - u));
  var n = normalize(cross(dx, dy));
  if (dot(n, F.camPos.xyz - p.xyz) < 0.0) { n = -n; }
  return vec4f(normalize((X.view * vec4f(n, 0.0)).xyz), d);
}
fn viewPos(uv: vec2f, d: f32) -> vec3f { return vec3f((uv.x * 2.0 - 1.0) * X.tan.x * d, (1.0 - uv.y * 2.0) * X.tan.y * d, -d); }
fn gAt(uv: vec2f) -> vec4f { let dims = vec2f(textureDimensions(gTex)); return textureLoad(gTex, vec2i(clamp(uv, vec2f(0.0), vec2f(0.9999)) * dims), 0); }
@fragment fn ssao(inp: FSOut) -> @location(0) vec4f {
  let g = textureLoad(gTex, vec2i(inp.pos.xy), 0);
  if (g.w <= 0.0) { return vec4f(1.0); }
  let p = viewPos(inp.uv, g.w); let n = normalize(g.xyz);
  let a = h12(inp.pos.xy) * 6.2831;
  let rv = vec3f(cos(a), sin(a), 0.0);
  let t = normalize(rv - n * dot(rv, n)); let b = cross(n, t);
  let TBN = mat3x3f(t, b, n);
  var occ = 0.0;
  for (var i = 0; i < 16; i++) {
    let sp = p + TBN * X.kernel[i].xyz * X.tan.z;
    let c = X.proj * vec4f(sp, 1.0);
    let uv = vec2f(c.x / c.w * 0.5 + 0.5, 0.5 - c.y / c.w * 0.5);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { continue; }
    let sd = gAt(uv).w;
    if (sd <= 0.0) { continue; }
    let range = smoothstep(0.0, 1.0, X.tan.z / abs(g.w - sd));
    occ += select(0.0, 1.0, sd < -sp.z - 0.02) * range;
  }
  return vec4f(vec3f(clamp(1.0 - occ / 16.0 * X.tan.w, 0.0, 1.0)), 1.0);
}
@fragment fn aoblur(inp: FSOut) -> @location(0) vec4f {
  let q = vec2i(inp.pos.xy); let dims = vec2i(textureDimensions(gTex));
  let d0 = textureLoad(gTex, q, 0).w; var sum = 0.0; var wsum = 0.0;
  for (var y = -2; y <= 2; y++) { for (var x = -2; x <= 2; x++) {
    let s = clamp(q + vec2i(x, y), vec2i(0), dims - 1);
    let w = 1.0 / (1.0 + abs(textureLoad(gTex, s, 0).w - d0) * 8.0);
    sum += textureLoad(srcTex, s, 0).r * w; wsum += w;
  } }
  return vec4f(vec3f(sum / max(wsum, 1e-4)), 1.0);
}
fn lightShape(i: i32, Ll: vec3f, d2: f32) -> f32 {
  let r = F.lightPos[i].w;
  let q = d2 / (r * r);
  let win = clamp(1.0 - q * q, 0.0, 1.0);
  let E = F.lightExtra[i];
  var att = select(win * win / (d2 + 1.0), win * win / max(d2, 0.01), E.z > 0.5);
  let prof = i32(E.x + 0.5);
  if (F.lightColor[i].w > 0.5) {
    let cd = dot(-Ll, F.lightSpot[i].xyz); let outer = F.lightSpot[i].w;
    if (prof == 1) {
      let u = (1.0 - cd) / max(1.0 - outer, 1e-4); let ring = (u - 0.55) / 0.09;
      att *= select(exp(-u * u * 7.0) + 0.35 * exp(-ring * ring) + 0.16 * (1.0 - smoothstep(0.7, 1.0, u)), 0.0, u > 1.0);
    } else if (prof == 3) { att *= smoothstep(outer, outer + 0.006, cd); }
    else { att *= smoothstep(outer, mix(outer, 1.0, 0.35), cd); }
  } else if (prof == 2) { att *= mix(1.0, 0.3, smoothstep(0.15, 0.85, -Ll.y)); }
  return att;
}
fn hg(c: f32, g: f32) -> f32 { let g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
@fragment fn volume(inp: FSOut) -> @location(0) vec4f {
  let d = textureLoad(gTex, vec2i(inp.pos.xy), 0).w;
  let maxD = X.vol2.x;
  let vd = normalize(vec3f((inp.uv.x * 2.0 - 1.0) * X.tan.x, (1.0 - inp.uv.y * 2.0) * X.tan.y, -1.0));
  let T = select(maxD, min(d, maxD), d > 0.0) / -vd.z;
  let dir = normalize((X.invView * vec4f(vd, 0.0)).xyz);
  let dt = T / 20.0; let j = h12(inp.pos.xy + fract(X.vol2.z) * 97.0);
  let sunDir = F.sunDir.xyz;
  let sunPhase = hg(dot(dir, sunDir), X.vol2.y) + 0.02;
  var acc = vec3f(0.0); var trans = 1.0;
  let n = i32(F.fogColor.w + 0.5);
  for (var i = 0; i < 20; i++) {
    let t = (f32(i) + j) * dt;
    let p = F.camPos.xyz + dir * t;
    let dens = X.vol.x * select(1.0, exp(-max(p.y, 0.0) * X.vol.y), X.vol.y > 0.0);
    var L = vec3f(0.0);
    if (X.vol.z > 0.0) {
      var lit = 1.0;
      if (X.vol2.w > 0.5) {
        let sp = F.shadowVP * vec4f(p, 1.0); let s3 = sp.xyz / sp.w;
        let sc = vec3f(s3.x * 0.5 + 0.5, 0.5 - s3.y * 0.5, s3.z * 0.5 + 0.5);
        if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) { lit = textureSampleCompareLevel(shadowMap, cmp, sc.xy, sc.z - 0.002); }
      }
      L += F.sunColor.rgb * lit * sunPhase * X.vol.z;
    }
    for (var k = 0; k < 16; k++) {
      if (k >= n) { break; }
      let Lv = F.lightPos[k].xyz - p; let d2 = dot(Lv, Lv); let r = F.lightPos[k].w;
      if (d2 > r * r) { continue; }
      let att = lightShape(k, Lv * inverseSqrt(max(d2, 1e-6)), d2 + select(0.3, 1.5, F.lightExtra[k].z > 0.5)) * select(1.0, 3.0, F.lightColor[k].w > 0.5);
      L += F.lightColor[k].rgb * att * X.vol.w * 0.08;
    }
    acc += L * dens * trans * dt;
    trans *= exp(-dens * dt);
  }
  return vec4f(acc, trans);
}
@fragment fn volblur(inp: FSOut) -> @location(0) vec4f {
  let q = vec2i(inp.pos.xy); let dims = vec2i(textureDimensions(gTex));
  let d0 = textureLoad(gTex, q, 0).w; var sum = vec4f(0.0); var wsum = 0.0;
  for (var y = -2; y <= 2; y++) { for (var x = -2; x <= 2; x++) {
    let s = clamp(q + vec2i(i32(f32(x) * 1.6), i32(f32(y) * 1.6)), vec2i(0), dims - 1);
    let w = exp(-f32(x * x + y * y) * 0.18) / (1.0 + abs(textureLoad(gTex, s, 0).w - d0) * 6.0);
    sum += textureLoad(srcTex, s, 0) * w; wsum += w;
  } }
  return sum / max(wsum, 1e-4);
}
@fragment fn composite(inp: FSOut) -> @location(0) vec4f {
  var c = textureSampleLevel(src2Tex, smp, inp.uv, 0.0).rgb;
  if (X.comp.x > 0.5) { c *= mix(1.0, textureSampleLevel(srcTex, smp, inp.uv, 0.0).r, 0.55 * X.comp.y); }
  if (X.comp.z > 0.5) { c += textureSampleLevel(src3Tex, smp, inp.uv, 0.0).rgb; }
  return vec4f(c, 1.0);
}
`;
