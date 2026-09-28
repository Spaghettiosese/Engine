// WebGPU backend. Renders the same scenes as the WebGL2 Renderer (renderer.js) with the
// same materials, lights, cascaded soft shadows, sky, particles, bloom and grading, and
// adds what WebGPU makes cheap:
//  - one uniform buffer per frame for every draw (dynamic offsets): a draw is a few
//    commands, with no per-uniform calls
//  - GPU frustum culling: instanced meshes are culled by a compute pass that writes the
//    surviving instances and the indirect draw arguments, so a forest of 10k instances
//    costs one dispatch and one indirect draw
//  - automatic instancing: meshes that share geometry and material are drawn together
//  - skinning from storage buffers, mipmapped sRGB textures
// SSAO and volumetric light (sun shafts, lamp glow, flashlight beams) run as half-res
// passes on the depth buffer. Screen-space reflections, contact shadows, DOF and the
// editor-only overlays and picking are WebGL2-only for now; pages that need them ask
// createRenderer() for WebGL2.
import { Renderer } from './renderer.js';
import { mat4, hexToRGB, srgbToLinear } from './math.js';
import * as W from './wgsl.js';

const IDENTITY = mat4.create();
// GL clip space (z in [-1,1]) to WebGPU clip space (z in [0,1])
const CLIP_FIX = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1]);
const DRAW_FLOATS = 64; // 256-byte stride (dynamic uniform offset alignment)
const FRAME_FLOATS = 104 + 4 * 64;
const SAMPLES = 4;
const HDR = 'rgba16float';
const DEPTH = 'depth24plus';
const GBU = () => GPUBufferUsage;

const matCache = new WeakMap();
function matColors(m) {
  const key = m.color + m.emissive + m.emissiveStrength + m.patternColor;
  let c = matCache.get(m);
  if (!c || c.key !== key) {
    c = { key, base: srgbToLinear(hexToRGB(m.color)), pat: srgbToLinear(hexToRGB(m.patternColor)), em: srgbToLinear(hexToRGB(m.emissive)).map((v) => v * m.emissiveStrength) };
    matCache.set(m, c);
  }
  return c;
}

export class GPURenderer {
  static get supported() { return typeof navigator !== 'undefined' && !!navigator.gpu; }
  static async create(canvas, opts = {}) {
    if (!GPURenderer.supported) throw new Error('WebGPU is not available in this browser.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter.');
    const device = await adapter.requestDevice();
    device.pushErrorScope('validation');
    const r = new GPURenderer(canvas, device, opts);
    await r._checkShaders();
    const err = await device.popErrorScope();
    if (err) { device.destroy(); throw new Error('WebGPU setup failed: ' + err.message); }
    let reported = 0; // runtime validation errors: report the first few, not one per frame
    device.addEventListener('uncapturederror', (e) => { if (reported++ < 5) console.error('WebGPU:', e.error.message); });
    device.lost.then((i) => console.error('WebGPU device lost:', i.reason, i.message));
    r.adapter = adapter; // keep the adapter alive (some browsers drop the instance with it)
    r._attach(); // only now touch the canvas, so a failure above leaves it free for WebGL2
    return r;
  }
  constructor(canvas, device, { pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2), shadowSize = 2048, offscreen = !!globalThis.__SF_OFFSCREEN } = {}) {
    this.backend = 'webgpu';
    this.canvas = canvas; this.device = device; this.pixelRatio = pixelRatio;
    // offscreen: render into our own texture instead of the canvas (headless test browsers
    // can't present WebGPU canvases); snapshot() reads it back
    this.offscreen = offscreen;
    this.format = offscreen ? 'rgba8unorm' : navigator.gpu.getPreferredCanvasFormat();
    this.shadowSize = shadowSize; this.shadowSize2 = Math.max(1024, shadowSize >> 1);
    this.stats = { drawCalls: 0, triangles: 0, culled: 0, gpuMs: 0, cpuMs: 0, scale: 1, lod: 0, batched: 0, gpuCulled: 0, instances: 0 };
    this.time = 0; this.width = 0; this.height = 0;
    // same settings object as the WebGL2 renderer; effects this backend lacks are ignored
    this.settings = {
      bloom: true, bloomStrength: 0.22, bloomThreshold: 1.1, vignette: 0.35, grain: 0.012, exposure: 1.0, fxaa: false, ssao: true, godRays: true, culling: true,
      ssr: true, ssrStrength: 1, ssrMaxRoughness: 0.5, volumetrics: true, contactShadows: true, softShadows: true,
      saturation: 1.06, contrast: 1.04, temperature: 0, sharpen: 0.18, aberration: 0.35,
      renderScale: 1, adaptiveResolution: false, targetFps: 55, minScale: 0.5, sortDraws: true,
      dofFocus: 8, dofAperture: 0, dofMaxBlur: 12, shadowCascades: true,
      autoInstancing: true, gpuCulling: true,
    };
    this.lightU = { pos: new Float32Array(64), col: new Float32Array(64), spot: new Float32Array(64), extra: new Float32Array(64) };
    this.shadowVP = mat4.create(); this.shadowVP2 = mat4.create();
    this._frameT = []; this._scaleT = 0;
    this.geoCache = new WeakMap(); this.skinCache = new WeakMap(); this.texCache = new WeakMap(); this.matTexCache = new WeakMap(); this.instCache = new WeakMap();
    this._init();
  }

  // ------------------------------------------------------------------ setup
  _attach() { globalThis.__sfGPU = this; if (this.offscreen) return; this.context = this.canvas.getContext('webgpu'); this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' }); }
  _module(code, label) { const m = this.device.createShaderModule({ code, label }); (this._modules ||= []).push(m); return m; }
  async _checkShaders() {
    for (const m of this._modules) {
      if (!m.getCompilationInfo) continue;
      const info = await m.getCompilationInfo();
      const errs = info.messages.filter((x) => x.type === 'error');
      if (errs.length) throw new Error(`WGSL error in ${m.label}: ` + errs.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join('; '));
    }
  }
  _init() {
    const d = this.device, U = GBU(), S = GPUShaderStage;
    const bgl = (entries, label) => d.createBindGroupLayout({ entries, label });
    this.bglFrame = bgl([
      { binding: 0, visibility: S.VERTEX | S.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: S.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 2, visibility: S.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 3, visibility: S.FRAGMENT, sampler: { type: 'comparison' } },
    ], 'frame');
    this.bglDraw = bgl([{ binding: 0, visibility: S.VERTEX | S.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 256 } }], 'draw');
    this.bglJoints = bgl([{ binding: 0, visibility: S.VERTEX, buffer: { type: 'read-only-storage' } }], 'joints');
    this.bglTex = bgl([
      { binding: 0, visibility: S.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 1, visibility: S.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: S.FRAGMENT, texture: { sampleType: 'float' } },
    ], 'textures');
    this.bglShadow = bgl([{ binding: 0, visibility: S.VERTEX, buffer: { type: 'uniform' } }], 'shadow frame');
    this.bglUni = bgl([{ binding: 0, visibility: S.VERTEX | S.FRAGMENT, buffer: { type: 'uniform' } }], 'uniform');
    this.bglBloom = bgl([
      { binding: 0, visibility: S.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: S.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: S.FRAGMENT, sampler: { type: 'filtering' } },
    ], 'bloom');
    this.bglPost = bgl([
      { binding: 0, visibility: S.FRAGMENT, buffer: { type: 'uniform' } },
      ...[1, 2, 3, 4].map((binding) => ({ binding, visibility: S.FRAGMENT, texture: { sampleType: 'float' } })),
      { binding: 5, visibility: S.FRAGMENT, sampler: { type: 'filtering' } },
    ], 'post');
    this.bglMip = bgl([{ binding: 0, visibility: S.FRAGMENT, texture: { sampleType: 'float' } }, { binding: 1, visibility: S.FRAGMENT, sampler: { type: 'filtering' } }], 'mip');
    this.bglCull = bgl([
      { binding: 0, visibility: S.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: S.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: S.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: S.COMPUTE, buffer: { type: 'storage' } },
    ], 'cull');

    this.bglFX = bgl([
      { binding: 0, visibility: S.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: S.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 2, visibility: S.FRAGMENT, texture: { sampleType: 'depth', multisampled: true } },
      ...[3, 4, 5, 6].map((binding) => ({ binding, visibility: S.FRAGMENT, texture: { sampleType: 'float' } })),
      { binding: 7, visibility: S.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 8, visibility: S.FRAGMENT, sampler: { type: 'comparison' } },
      { binding: 9, visibility: S.FRAGMENT, sampler: { type: 'filtering' } },
    ], 'screen effects');
    this.mods = {
      fx: this._module(W.FX_WGSL, 'screen effects'),
      main: this._module(W.MAIN_WGSL, 'main'), shadow: this._module(W.SHADOW_WGSL, 'shadow'), sky: this._module(W.SKY_WGSL, 'sky'),
      particle: this._module(W.PARTICLE_WGSL, 'particles'), line: this._module(W.LINE_WGSL, 'lines'), bloom: this._module(W.BLOOM_WGSL, 'bloom'),
      post: this._module(W.POST_WGSL, 'post'), cull: this._module(W.CULL_WGSL, 'cull'), mip: this._module(W.MIP_WGSL, 'mip'),
    };
    const layout = (...b) => d.createPipelineLayout({ bindGroupLayouts: b });
    this.layMain = layout(this.bglFrame, this.bglDraw, this.bglJoints, this.bglTex);
    this.layShadow = layout(this.bglShadow, this.bglDraw, this.bglJoints);
    this.pipes = new Map();

    // vertex layout: position, normal, uv, joints, weights, rest position, instance matrix
    const f = (loc, fmt, off = 0) => ({ shaderLocation: loc, format: fmt, offset: off });
    this.vbLayout = [
      { arrayStride: 12, attributes: [f(0, 'float32x3')] }, { arrayStride: 12, attributes: [f(1, 'float32x3')] }, { arrayStride: 8, attributes: [f(2, 'float32x2')] },
      { arrayStride: 16, attributes: [f(3, 'float32x4')] }, { arrayStride: 16, attributes: [f(4, 'float32x4')] }, { arrayStride: 12, attributes: [f(5, 'float32x3')] },
      { arrayStride: 64, stepMode: 'instance', attributes: [f(6, 'float32x4', 0), f(7, 'float32x4', 16), f(8, 'float32x4', 32), f(9, 'float32x4', 48)] },
    ];
    const ms = { count: SAMPLES };
    const depthOn = { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less-equal' };
    const blendAlpha = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
    const blendAdd = { color: { srcFactor: 'src-alpha', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
    this.pipeSky = d.createRenderPipeline({
      layout: layout(this.bglUni), vertex: { module: this.mods.sky, entryPoint: 'fsv' },
      fragment: { module: this.mods.sky, entryPoint: 'fs', targets: [{ format: HDR }] },
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'always' }, multisample: ms,
    });
    const partLayout = [{ arrayStride: 32, stepMode: 'instance', attributes: [f(0, 'float32x4', 0), f(1, 'float32x4', 16)] }];
    const partPipe = (blend) => d.createRenderPipeline({
      layout: layout(this.bglFrame), vertex: { module: this.mods.particle, entryPoint: 'vs', buffers: partLayout },
      fragment: { module: this.mods.particle, entryPoint: 'fs', targets: [{ format: HDR, blend }] },
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less-equal' }, multisample: ms,
    });
    this.pipePart = partPipe(blendAlpha); this.pipePartAdd = partPipe(blendAdd);
    const linePipe = (depth) => d.createRenderPipeline({
      layout: layout(this.bglFrame, this.bglDraw), primitive: { topology: 'line-list' },
      vertex: { module: this.mods.line, entryPoint: 'vs', buffers: [{ arrayStride: 28, attributes: [f(0, 'float32x3', 0), f(1, 'float32x4', 12)] }] },
      fragment: { module: this.mods.line, entryPoint: 'fs', targets: [{ format: HDR, blend: blendAlpha }] },
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: depth ? 'less-equal' : 'always' }, multisample: ms,
    });
    this.pipeLine = linePipe(true); this.pipeLineTop = linePipe(false);
    this.pipeBloom = d.createRenderPipeline({ layout: layout(this.bglBloom), vertex: { module: this.mods.bloom, entryPoint: 'fsv' }, fragment: { module: this.mods.bloom, entryPoint: 'fs', targets: [{ format: HDR }] } });
    this.pipePost = d.createRenderPipeline({ layout: layout(this.bglPost), vertex: { module: this.mods.post, entryPoint: 'fsv' }, fragment: { module: this.mods.post, entryPoint: 'fs', targets: [{ format: this.format }] } });
    this.pipeCull = d.createComputePipeline({ layout: layout(this.bglCull), compute: { module: this.mods.cull, entryPoint: 'main' } });
    this.blendAlpha = blendAlpha;
    const layFX = layout(this.bglFX);
    const fxPipe = (entryPoint, format) => d.createRenderPipeline({ layout: layFX, vertex: { module: this.mods.fx, entryPoint: 'fsv' }, fragment: { module: this.mods.fx, entryPoint, targets: [{ format }] } });
    this.pipeFX = { gdepth: fxPipe('gdepth', HDR), ssao: fxPipe('ssao', 'rgba8unorm'), aoblur: fxPipe('aoblur', 'rgba8unorm'), volume: fxPipe('volume', HDR), volblur: fxPipe('volblur', HDR), composite: fxPipe('composite', HDR) };
    this.fxBuf = d.createBuffer({ size: 64 * 4 + 16 * 4 + 16 * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.fxData = new Float32Array(144);
    // SSAO hemisphere kernel, denser near the centre (same as the WebGL2 renderer)
    for (let i = 0; i < 16; i++) {
      let v; do { v = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random()]; } while (Math.hypot(...v) > 1 || Math.hypot(...v) < 0.1);
      const k = 0.1 + 0.9 * (i / 16) ** 2; this.fxData.set(v.map((x) => x * k), 80 + i * 4);
    }
    this.dummyMS = d.createTexture({ size: [1, 1], format: DEPTH, sampleCount: SAMPLES, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });

    // shared resources
    this.frameBuf = d.createBuffer({ size: FRAME_FLOATS * 4, usage: U.UNIFORM | U.COPY_DST });
    this.frameData = new Float32Array(FRAME_FLOATS);
    this.skyBuf = d.createBuffer({ size: 64 + 8 * 16, usage: U.UNIFORM | U.COPY_DST });
    this.skyBG = d.createBindGroup({ layout: this.bglUni, entries: [{ binding: 0, resource: { buffer: this.skyBuf } }] });
    this.shadowBufs = [0, 1].map(() => d.createBuffer({ size: 64, usage: U.UNIFORM | U.COPY_DST }));
    this.shadowBGs = this.shadowBufs.map((b) => d.createBindGroup({ layout: this.bglShadow, entries: [{ binding: 0, resource: { buffer: b } }] }));
    const depthTex = (s) => d.createTexture({ size: [s, s], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.shadowTex = depthTex(this.shadowSize); this.shadowTex2 = depthTex(this.shadowSize2);
    this.cmpSampler = d.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
    this.linear = d.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.frameBG = d.createBindGroup({ layout: this.bglFrame, entries: [
      { binding: 0, resource: { buffer: this.frameBuf } }, { binding: 1, resource: this.shadowTex.createView() },
      { binding: 2, resource: this.shadowTex2.createView() }, { binding: 3, resource: this.cmpSampler },
    ] });
    this.drawCap = 0; this._growDraws(1024);
    this.identityJoints = this._buffer(new Float32Array(IDENTITY), U.STORAGE);
    this.jointsBG0 = d.createBindGroup({ layout: this.bglJoints, entries: [{ binding: 0, resource: { buffer: this.identityJoints } }] });
    this.identityInst = this._buffer(new Float32Array(IDENTITY), U.VERTEX);
    const px = (rgba) => { const t = d.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }); d.queue.writeTexture({ texture: t }, new Uint8Array(rgba), { bytesPerRow: 4 }, [1, 1]); return t; };
    this.white = px([255, 255, 255, 255]); this.flatNormal = px([128, 128, 255, 255]);
    this.repeatSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 8 });
    this.clampSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 8 });
    this.texBG0 = this._texBG(null, null, this.repeatSampler);
    this.partBuf = null; this.lineBuf = null;
    this.bloomBuf = d.createBuffer({ size: 256 * 12, usage: U.UNIFORM | U.COPY_DST });
    this.postBuf = d.createBuffer({ size: 96, usage: U.UNIFORM | U.COPY_DST });
  }
  _buffer(data, usage) {
    const b = this.device.createBuffer({ size: Math.max(16, (data.byteLength + 3) & ~3), usage: usage | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(b, 0, data.buffer, data.byteOffset, data.byteLength & ~3 || data.byteLength);
    return b;
  }
  _growDraws(n) {
    if (n <= this.drawCap) return;
    this.drawCap = Math.max(n, this.drawCap * 2);
    this.drawBuf?.destroy();
    this.drawBuf = this.device.createBuffer({ size: this.drawCap * 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.drawData = new Float32Array(this.drawCap * DRAW_FLOATS);
    this.drawBG = this.device.createBindGroup({ layout: this.bglDraw, entries: [{ binding: 0, resource: { buffer: this.drawBuf, size: 256 } }] });
  }
  _pipe(kind, cull, blend) {
    const key = kind + cull + blend;
    let p = this.pipes.get(key);
    if (p) return p;
    const d = this.device;
    if (kind === 'shadow') {
      p = d.createRenderPipeline({
        layout: this.layShadow, vertex: { module: this.mods.shadow, entryPoint: 'vs', buffers: this.vbLayout },
        primitive: { cullMode: cull }, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less-equal', depthBias: 3, depthBiasSlopeScale: 1.5 },
      });
    } else {
      p = d.createRenderPipeline({
        layout: this.layMain, vertex: { module: this.mods.main, entryPoint: 'vs', buffers: this.vbLayout },
        fragment: { module: this.mods.main, entryPoint: 'fs', targets: [{ format: HDR, blend: blend ? this.blendAlpha : undefined }] },
        primitive: { cullMode: cull }, depthStencil: { format: DEPTH, depthWriteEnabled: !blend, depthCompare: 'less-equal' }, multisample: { count: SAMPLES },
      });
    }
    this.pipes.set(key, p);
    return p;
  }

  // ------------------------------------------------------------------ targets
  resize() {
    const c = this.canvas, pr = this.pixelRatio * (this.settings.renderScale || 1);
    const w = Math.max(1, Math.round((c.clientWidth || c.width) * pr)), h = Math.max(1, Math.round((c.clientHeight || c.height) * pr));
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h; c.width = w; c.height = h;
    const d = this.device, T = GPUTextureUsage;
    for (const t of this._targets || []) t.destroy();
    const tex = (tw, th, format, usage, sampleCount = 1) => d.createTexture({ size: [Math.max(1, tw), Math.max(1, th)], format, usage, sampleCount });
    this.msColor = tex(w, h, HDR, T.RENDER_ATTACHMENT, SAMPLES);
    this.msDepth = tex(w, h, DEPTH, T.RENDER_ATTACHMENT | T.TEXTURE_BINDING, SAMPLES);
    this.hdrTex = tex(w, h, HDR, T.RENDER_ATTACHMENT | T.TEXTURE_BINDING);
    const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2), cw = Math.max(1, bw >> 1), ch = Math.max(1, bh >> 1), dw = Math.max(1, bw >> 2), dh = Math.max(1, bh >> 2);
    const rt = (a, b) => tex(a, b, HDR, T.RENDER_ATTACHMENT | T.TEXTURE_BINDING);
    this.b1 = rt(bw, bh); this.b2 = rt(bw, bh); this.c1 = rt(cw, ch); this.c2 = rt(cw, ch); this.d1 = rt(dw, dh); this.d2 = rt(dw, dh);
    const gw = Math.max(1, w >> 1), gh = Math.max(1, h >> 1);
    this.gTex = rt(gw, gh); this.ao1 = tex(gw, gh, 'rgba8unorm', T.RENDER_ATTACHMENT | T.TEXTURE_BINDING); this.ao2 = tex(gw, gh, 'rgba8unorm', T.RENDER_ATTACHMENT | T.TEXTURE_BINDING);
    this.vol1 = rt(gw, gh); this.vol2 = rt(gw, gh); this.compTex = rt(w, h);
    this._targets = [this.msColor, this.msDepth, this.hdrTex, this.b1, this.b2, this.c1, this.c2, this.d1, this.d2, this.gTex, this.ao1, this.ao2, this.vol1, this.vol2, this.compTex];
    const fxBG = ({ ms = this.dummyMS, g = this.white, src = this.white, src2 = this.white, src3 = this.white }) => d.createBindGroup({ layout: this.bglFX, entries: [
      { binding: 0, resource: { buffer: this.fxBuf } }, { binding: 1, resource: { buffer: this.frameBuf } }, { binding: 2, resource: ms.createView() },
      { binding: 3, resource: g.createView() }, { binding: 4, resource: src.createView() }, { binding: 5, resource: src2.createView() }, { binding: 6, resource: src3.createView() },
      { binding: 7, resource: this.shadowTex.createView() }, { binding: 8, resource: this.cmpSampler }, { binding: 9, resource: this.linear },
    ] });
    this.fxBG = {
      gdepth: fxBG({ ms: this.msDepth }), ssao: fxBG({ g: this.gTex }), aoblur: fxBG({ g: this.gTex, src: this.ao1 }),
      volume: fxBG({ g: this.gTex }), volblur: fxBG({ g: this.gTex, src: this.vol1 }), composite: fxBG({ src: this.ao2, src2: this.hdrTex, src3: this.vol2 }),
    };
    this.fxTarget = { gdepth: this.gTex, ssao: this.ao1, aoblur: this.ao2, volume: this.vol1, volblur: this.vol2, composite: this.compTex };
    if (this.offscreen) { this.outTex = tex(w, h, this.format, T.RENDER_ATTACHMENT | T.COPY_SRC); this._targets.push(this.outTex); }
    // bloom chain: [source, target, texel, pass]
    const steps = [[this.compTex, this.b1, [2 / w, 2 / h], 0]];
    for (let i = 0; i < 2; i++) steps.push([this.b1, this.b2, [1 / bw, 0], 1], [this.b2, this.b1, [0, 1 / bh], 1]);
    steps.push([this.b1, this.c1, [1 / bw, 1 / bh], 2], [this.c1, this.c2, [1 / cw, 0], 1], [this.c2, this.c1, [0, 1 / ch], 1]);
    steps.push([this.c1, this.d1, [1 / cw, 1 / ch], 2], [this.d1, this.d2, [1 / dw, 0], 1], [this.d2, this.d1, [0, 1 / dh], 1]);
    this.bloomSteps = steps.map(([src, dst, texel, pass], i) => ({
      dst, texel, pass, offset: i * 256,
      bg: d.createBindGroup({ layout: this.bglBloom, entries: [{ binding: 0, resource: { buffer: this.bloomBuf, offset: i * 256, size: 16 } }, { binding: 1, resource: src.createView() }, { binding: 2, resource: this.linear }] }),
    }));
    this.postBG = d.createBindGroup({ layout: this.bglPost, entries: [
      { binding: 0, resource: { buffer: this.postBuf } }, { binding: 1, resource: this.compTex.createView() }, { binding: 2, resource: this.b1.createView() },
      { binding: 3, resource: this.c1.createView() }, { binding: 4, resource: this.d1.createView() }, { binding: 5, resource: this.linear },
    ] });
  }

  // ------------------------------------------------------------------ resources
  _geo(g) {
    let c = this.geoCache.get(g);
    const n = g.vertexCount;
    if (c && c.version === g.version && c.nv === n) return c;
    if (c) for (const b of c.bufs) b.destroy();
    const U = GPUBufferUsage.VERTEX, f32 = (a) => (a instanceof Float32Array ? a : Float32Array.from(a));
    let w = g.weights;
    if (!w || w.length !== n * 4) { w = new Float32Array(n * 4); for (let i = 0; i < n; i++) w[i * 4] = 1; }
    const bufs = [
      this._buffer(f32(g.positions), U), this._buffer(f32(g.normals), U), this._buffer(f32(g.uvs && g.uvs.length === n * 2 ? g.uvs : new Float32Array(n * 2)), U),
      this._buffer(f32(g.joints && g.joints.length === n * 4 ? g.joints : new Float32Array(n * 4)), U), this._buffer(f32(w), U),
      this._buffer(f32(g.rest && g.rest.length === n * 3 ? g.rest : g.positions), U),
    ];
    const idx = g.indices instanceof Uint32Array ? g.indices : Uint32Array.from(g.indices);
    const ibo = this._buffer(idx, GPUBufferUsage.INDEX);
    c = { bufs: [...bufs, ibo], vbs: bufs, ibo, count: idx.length, version: g.version, nv: n };
    this.geoCache.set(g, c);
    return c;
  }
  _joints(sk) {
    let e = this.skinCache.get(sk);
    const bytes = sk.joints.byteLength;
    if (!e || e.size < bytes) {
      e?.buf.destroy();
      const buf = this.device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      e = { buf, size: bytes, version: -1, bg: this.device.createBindGroup({ layout: this.bglJoints, entries: [{ binding: 0, resource: { buffer: buf } }] }) };
      this.skinCache.set(sk, e);
    }
    if (e.version !== sk.version) { this.device.queue.writeBuffer(e.buf, 0, sk.joints.buffer, sk.joints.byteOffset, bytes); e.version = sk.version; }
    return e.bg;
  }
  // GPU texture for an engine Texture: sRGB or linear, with a mip chain built on the GPU
  _gpuTexture(t) {
    let e = this.texCache.get(t);
    if (e && e.version === t.version) return e.tex;
    e?.tex.destroy();
    const d = this.device, img = t.image, w = img.width, h = img.height;
    const format = t.srgb ? 'rgba8unorm-srgb' : 'rgba8unorm';
    const mips = t.mipmaps ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
    const tex = d.createTexture({ size: [w, h], format, mipLevelCount: mips, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    if (img.data) d.queue.writeTexture({ texture: tex }, img.data, { bytesPerRow: w * 4 }, [w, h]);
    else d.queue.copyExternalImageToTexture({ source: img }, { texture: tex }, [w, h]);
    if (mips > 1) this._mipmaps(tex, format, mips);
    this.texCache.set(t, { tex, version: t.version });
    return tex;
  }
  _mipmaps(tex, format, mips) {
    const d = this.device;
    this.mipPipes ||= {};
    const pipe = this.mipPipes[format] ||= d.createRenderPipeline({ layout: d.createPipelineLayout({ bindGroupLayouts: [this.bglMip] }), vertex: { module: this.mods.mip, entryPoint: 'fsv' }, fragment: { module: this.mods.mip, entryPoint: 'fs', targets: [{ format }] } });
    const enc = d.createCommandEncoder();
    for (let i = 1; i < mips; i++) {
      const bg = d.createBindGroup({ layout: this.bglMip, entries: [{ binding: 0, resource: tex.createView({ baseMipLevel: i - 1, mipLevelCount: 1 }) }, { binding: 1, resource: this.linear }] });
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView({ baseMipLevel: i, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
    }
    d.queue.submit([enc.finish()]);
  }
  _texBG(map, normalMap, sampler) {
    return this.device.createBindGroup({ layout: this.bglTex, entries: [
      { binding: 0, resource: sampler }, { binding: 1, resource: (map ? this._gpuTexture(map) : this.white).createView() },
      { binding: 2, resource: (normalMap ? this._gpuTexture(normalMap) : this.flatNormal).createView() },
    ] });
  }
  _matTex(m) {
    if (!m.map && !m.normalMap) return this.texBG0;
    const key = (m.map ? m.map.version + ':' : '-') + (m.normalMap ? m.normalMap.version : '-');
    let e = this.matTexCache.get(m);
    if (!e || e.key !== key || e.map !== m.map || e.normalMap !== m.normalMap) {
      const repeat = (m.map || m.normalMap).repeat !== false;
      e = { key, map: m.map, normalMap: m.normalMap, bg: this._texBG(m.map, m.normalMap, repeat ? this.repeatSampler : this.clampSampler) };
      this.matTexCache.set(m, e);
    }
    return e.bg;
  }
  // instance buffers for InstancedMesh (+ the compacted copy and indirect args for GPU culling)
  _inst(m) {
    const d = this.device, U = GPUBufferUsage;
    let e = this.instCache.get(m);
    const bytes = m.instanceMatrices.byteLength;
    if (!e || e.bytes < bytes) {
      if (e) { e.src.destroy(); e.dst.destroy(); }
      const src = d.createBuffer({ size: bytes, usage: U.VERTEX | U.STORAGE | U.COPY_DST });
      const dst = d.createBuffer({ size: bytes, usage: U.VERTEX | U.STORAGE });
      const args = e?.args || d.createBuffer({ size: 20, usage: U.INDIRECT | U.STORAGE | U.COPY_DST | U.COPY_SRC });
      const cullBuf = e?.cullBuf || d.createBuffer({ size: 176, usage: U.UNIFORM | U.COPY_DST });
      const bg = d.createBindGroup({ layout: this.bglCull, entries: [{ binding: 0, resource: { buffer: cullBuf } }, { binding: 1, resource: { buffer: src } }, { binding: 2, resource: { buffer: dst } }, { binding: 3, resource: { buffer: args } }] });
      e = { src, dst, args, cullBuf, bg, bytes, version: -1 };
      this.instCache.set(m, e);
    }
    if (e.version !== m.instanceVersion) { d.queue.writeBuffer(e.src, 0, m.instanceMatrices.buffer, m.instanceMatrices.byteOffset, bytes); e.version = m.instanceVersion; }
    return e;
  }

  // ------------------------------------------------------------------ per-draw data
  _writeDraw(i, model, local, m, o = {}) {
    const D = this.drawData, b = i * DRAW_FLOATS;
    D.set(model, b); D.set(local, b + 16);
    if (m) {
      const c = matColors(m);
      D[b + 32] = c.base[0]; D[b + 33] = c.base[1]; D[b + 34] = c.base[2]; D[b + 35] = o.opacity ?? m.opacity;
      D[b + 36] = c.pat[0]; D[b + 37] = c.pat[1]; D[b + 38] = c.pat[2]; D[b + 39] = m.patternStrength;
      D[b + 40] = c.em[0]; D[b + 41] = c.em[1]; D[b + 42] = c.em[2]; D[b + 43] = m.sheen;
      D[b + 44] = m.metallic; D[b + 45] = m.roughness; D[b + 46] = m.patternScale; D[b + 47] = m.bump;
      D[b + 48] = m.patternIndex; D[b + 49] = o.skinned ? 1 : 0; D[b + 50] = m.doubleSided ? 1 : 0; D[b + 51] = o.shading ?? 0;
      D[b + 52] = m.map ? 1 : 0; D[b + 53] = m.normalMap ? 1 : 0; D[b + 54] = m.normalScale ?? 1; D[b + 55] = o.instOffset ? 1 : 0;
    } else {
      D.fill(0, b + 32, b + 56); D[b + 35] = o.opacity ?? 1;
    }
  }
  _meshDraw(i, m, shading) {
    const skinned = !!(m.skeleton && m.skinRoot);
    this._writeDraw(i, skinned ? m.skinRoot.world : m.world, skinned ? m.local : IDENTITY, m.material, { skinned, shading, instOffset: !!m.instanceMatrices });
  }

  // ------------------------------------------------------------------ main render
  render(scene, camera, o = {}) {
    const t0 = performance.now(), d = this.device;
    // frame pacing: never queue more than two frames on the GPU (keeps input latency low,
    // and stops a slow GPU from building an endless backlog)
    if ((this._inflight || 0) >= 2) { this.stats.skipped = (this.stats.skipped || 0) + 1; return; }
    this._adapt(t0);
    this.resize();
    const st = this.stats;
    st.drawCalls = 0; st.triangles = 0; st.lod = 0; st.batched = 0; st.instances = 0;
    this._camPos = camera.position;
    this.time += 1 / 60;
    const env = scene.environment;
    const shading = o.shading || 'rendered';
    const lit = shading === 'rendered' || shading === 'material' || shading === 'toon';
    const shadeMode = { rendered: 0, material: 0, toon: 0, solid: 1, flat: 2, wireframe: 1, normals: 1, ghost: 1 }[shading] ?? 0;
    scene.updateWorld();
    camera.update(this.width / this.height);
    const meshes = this.collect(scene);
    const shadows = lit && o.shadows !== false && shading !== 'material';
    const cascade = shadows && this.settings.shadowCascades !== false && env.shadowFar !== 0;
    if (shadows) this._computeShadowVP(env);
    this._farFrame = (this._farFrame || 0) + 1;
    const doFar = cascade && (this._farFrame % 2 === 1 || !this._farReady);
    if (doFar) this._computeShadowVP(env, env.shadowFar || env.shadowRadius * 4, this.shadowVP2, this.shadowSize2);

    const planes = this._frustum(camera.viewProj);
    const visible = this.settings.culling ? meshes.filter((m) => this._visible(m, planes)) : meshes;
    st.culled = meshes.length - visible.length;

    // one draw record per mesh (shared by the shadow and main passes)
    const slot = new Map(); let n = 0;
    const need = (m) => { if (!slot.has(m)) slot.set(m, n++); };
    const casters = shadows ? meshes.filter((m) => m.castShadow && !(m.material && m.material.opacity < 0.5)) : [];
    const sc = env.shadowCenter;
    const nearCasters = casters.filter((m) => { const s = this._sphere(m); return Math.hypot(s.c[0] - sc[0], s.c[1] - sc[1], s.c[2] - sc[2]) - s.r <= env.shadowRadius * 1.8; });
    const farR = (env.shadowFar || env.shadowRadius * 4) * 1.8;
    const farCasters = doFar ? casters.filter((m) => { const s = this._sphere(m); return Math.hypot(s.c[0] - sc[0], s.c[1] - sc[1], s.c[2] - sc[2]) - s.r <= farR; }) : [];
    for (const m of nearCasters) need(m); for (const m of farCasters) need(m); for (const m of visible) need(m);

    // automatic instancing: static meshes sharing geometry + material become one draw
    const autoInst = this.settings.autoInstancing;
    const groupsFor = (list) => {
      const out = [], groups = new Map();
      for (const m of list) {
        if (!autoInst || m.instanceMatrices || m.skeleton || m.lods || !m.material || m.material.opacity < 1 || m.userData.shading !== undefined) { out.push(m); continue; }
        const k = m.geometry; let g = groups.get(k);
        if (!g) { g = new Map(); groups.set(k, g); }
        let arr = g.get(m.material); if (!arr) { arr = []; g.set(m.material, arr); }
        arr.push(m);
      }
      for (const g of groups.values()) for (const arr of g.values()) { if (arr.length === 1) out.push(arr[0]); else out.push({ batch: arr }); }
      return out;
    };
    const lists = { near: groupsFor(nearCasters), far: groupsFor(farCasters), main: null };
    let opaque = visible.filter((m) => !(m.material.opacity < 1));
    const transparent = visible.filter((m) => m.material.opacity < 1);
    lists.main = groupsFor(opaque);
    if (this.settings.sortDraws) lists.main.sort((a, b) => this._matKey((a.batch ? a.batch[0] : a).material) - this._matKey((b.batch ? b.batch[0] : b).material));
    // batch instance buffers (world matrices), written once per frame
    const allBatches = [...lists.near, ...lists.far, ...lists.main].filter((x) => x.batch);
    let instFloats = 0;
    for (const x of allBatches) { x._off = instFloats; instFloats += x.batch.length * 16; slot.set(x, n++); }
    if (instFloats) {
      if (!this.batchData || this.batchData.length < instFloats) { this.batchData = new Float32Array(Math.max(instFloats, (this.batchData?.length || 0) * 2)); this.batchBuf?.destroy(); this.batchBuf = d.createBuffer({ size: this.batchData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }); }
      for (const x of allBatches) x.batch.forEach((m, i) => this.batchData.set(m.world, x._off + i * 16));
      d.queue.writeBuffer(this.batchBuf, 0, this.batchData.buffer, 0, instFloats * 4);
    }
    const extra = (o.lines?.length || 0);
    this._growDraws(n + extra + 1);
    for (const [m, i] of slot) {
      if (m.batch) { const r = m.batch[0]; this._writeDraw(i, IDENTITY, IDENTITY, r.material, { shading: m.batch[0].userData.shading ?? shadeMode }); continue; }
      this._meshDraw(i, m, m.userData.shading ?? shadeMode);
    }
    let lineSlot = n;

    // frame uniforms
    const F = this.frameData, nLights = lit ? this._gatherLights(camera, env) : 0;
    const vpFix = mat4.multiply(mat4.create(), CLIP_FIX, camera.viewProj);
    F.set(vpFix, 0); F.set(this.shadowVP, 16); F.set(this.shadowVP2, 32); F.set(camera.view, 48);
    const put = (off, v, w) => { F[off] = v[0]; F[off + 1] = v[1]; F[off + 2] = v[2]; F[off + 3] = w; };
    const sunI = env.sunIntensity;
    put(64, camera.position, this.time); put(68, env.sunDirection, env.ambient); put(72, env.sunColor.map((v) => v * sunI), o.fog === false ? 0 : env.fogDensity);
    put(76, env.skyColor, o.fog === false ? 0 : env.fogHeight || 0); put(80, env.groundColor, 1 / this.shadowSize);
    const soft = shadows && this.settings.softShadows ? env.shadowSoftness ?? 2.5 : 0;
    put(84, env.horizonColor, soft > 0 ? 3 * Math.tan((soft * Math.PI) / 180) : 0); put(88, env.zenithColor, cascade && (this._farReady || doFar) ? 1 : 0);
    put(92, env.fogColor, nLights); put(96, [shadows ? 1 : 0, 1 / this.shadowSize2, lit ? env.wetness || 0 : 0], env.rain || 0); put(100, [this.width, this.height, this.height * 0.8], 0);
    F.set(this.lightU.pos, 104); F.set(this.lightU.col, 168); F.set(this.lightU.spot, 232); F.set(this.lightU.extra, 296);
    d.queue.writeBuffer(this.frameBuf, 0, F);
    const sfix = (vp) => mat4.multiply(mat4.create(), CLIP_FIX, vp);
    d.queue.writeBuffer(this.shadowBufs[0], 0, sfix(this.shadowVP)); if (doFar) d.queue.writeBuffer(this.shadowBufs[1], 0, sfix(this.shadowVP2));
    // sky
    const editorBg = o.background === 'editor' || (!lit && o.background !== 'sky');
    const sky = new Float32Array(16 + 32);
    sky.set(camera.invViewProj, 0);
    const sput = (off, v, w) => { sky[off] = v[0]; sky[off + 1] = v[1]; sky[off + 2] = v[2]; sky[off + 3] = w; };
    sput(16, env.sunDirection, editorBg ? 1 : 0); sput(20, env.sunColor.map((v) => v * 1.2), env.clouds ? 1 : 0); sput(24, env.horizonColor, this.time); sput(28, env.zenithColor, env.night || 0);
    sput(32, env.groundColor, 0); sput(36, env.moonDirection || [0, 1, 0], 0); sput(40, srgbToLinear([0.24, 0.24, 0.25]), 0); sput(44, srgbToLinear([0.16, 0.16, 0.17]), 0);
    d.queue.writeBuffer(this.skyBuf, 0, sky);

    const enc = d.createCommandEncoder();
    // GPU culling for instanced meshes drawn from the camera
    const gpuCull = this.settings.gpuCulling;
    const culledInst = new Set();
    if (gpuCull) {
      const cp = enc.beginComputePass();
      cp.setPipeline(this.pipeCull);
      for (const x of lists.main) {
        if (!x.instanceMatrices || !x.count) continue;
        const e = this._inst(x), g = x.geometry, c = this._geo(g);
        if (!g._bs || g._bs.v !== g.version) { const b = g.bounds(); g._bs = { v: g.version, c: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2], r: Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2 }; }
        const u = new Float32Array(44), ui = new Uint32Array(u.buffer);
        planes.forEach((p, k) => u.set(p, k * 4)); u.set(x.world, 20); u.set([...g._bs.c, g._bs.r], 36); ui[40] = x.count;
        d.queue.writeBuffer(e.cullBuf, 0, u);
        d.queue.writeBuffer(e.args, 0, new Uint32Array([c.count, 0, 0, 0, 0]));
        cp.setBindGroup(0, e.bg); cp.dispatchWorkgroups(Math.ceil(x.count / 64));
        culledInst.add(x);
      }
      cp.end();
    }

    // geometry and skin uploads happen lazily inside draw()
    const draw = (pass, x, shadow) => {
      const i = slot.get(x);
      pass.setBindGroup(1, this.drawBG, [i * 256]);
      const r = x.batch ? x.batch[0] : x;
      pass.setBindGroup(2, r.skeleton && r.skinRoot ? this._joints(r.skeleton) : this.jointsBG0);
      if (!shadow) pass.setBindGroup(3, this._matTex(r.material));
      const g = r.lods && !x.batch ? this._lod(r) : r.geometry, c = this._geo(g);
      for (let k = 0; k < 6; k++) pass.setVertexBuffer(k, c.vbs[k]);
      pass.setIndexBuffer(c.ibo, 'uint32');
      if (x.batch) {
        pass.setVertexBuffer(6, this.batchBuf, x._off * 4, x.batch.length * 64);
        pass.drawIndexed(c.count, x.batch.length); st.batched += x.batch.length - 1; st.triangles += (c.count / 3) * x.batch.length;
      } else if (x.instanceMatrices) {
        if (!x.count) return;
        const e = this._inst(x);
        if (!shadow && culledInst.has(x)) { pass.setVertexBuffer(6, e.dst); pass.drawIndexedIndirect(e.args, 0); }
        else { pass.setVertexBuffer(6, e.src); pass.drawIndexed(c.count, x.count); }
        st.instances += x.count; st.triangles += (c.count / 3) * x.count;
      } else { pass.setVertexBuffer(6, this.identityInst); pass.drawIndexed(c.count); st.triangles += c.count / 3; }
      st.drawCalls++;
    };

    // shadow passes
    const shadowPass = (tex, bg, list) => {
      const pass = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: tex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      pass.setBindGroup(0, bg);
      for (const x of list) { const r = x.batch ? x.batch[0] : x; pass.setPipeline(this._pipe('shadow', r.material?.doubleSided ? 'none' : 'back', false)); draw(pass, x, true); }
      pass.end();
    };
    if (shadows) {
      shadowPass(this.shadowTex, this.shadowBGs[0], lists.near);
      if (doFar) { shadowPass(this.shadowTex2, this.shadowBGs[1], lists.far); this._farReady = true; }
    }
    const shadowCalls = st.drawCalls; st.drawCalls = 0; st.triangles = 0;

    // screen effects need the depth buffer after the main pass
    const volAmt = env.volumetric ?? 0;
    const fx = lit && !camera.ortho && shading === 'rendered';
    const useAO = lit && env.ao !== false && this.settings.ssao && !camera.ortho && shading !== 'toon';
    const useVol = fx && this.settings.volumetrics && volAmt > 0;
    const needG = useAO || useVol;
    // main pass
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: this.msColor.createView(), resolveTarget: this.hdrTex.createView(), loadOp: 'clear', storeOp: 'discard', clearValue: [0.1, 0.1, 0.1, 1] }],
      depthStencilAttachment: { view: this.msDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: needG ? 'store' : 'discard' },
    });
    pass.setPipeline(this.pipeSky); pass.setBindGroup(0, this.skyBG); pass.draw(3);
    pass.setBindGroup(0, this.frameBG);
    for (const x of lists.main) { const r = x.batch ? x.batch[0] : x; pass.setPipeline(this._pipe('main', r.material.doubleSided ? 'none' : 'back', false)); draw(pass, x, false); }
    for (const m of transparent) { pass.setPipeline(this._pipe('main', 'none', true)); draw(pass, m, false); }
    // particles: alpha-blended systems first, additive (fire) on top
    const systems = (Array.isArray(o.particles) ? o.particles : o.particles ? [o.particles] : []).filter((ps) => ps && ps.count).sort((a, b) => (a.additive ? 1 : 0) - (b.additive ? 1 : 0));
    if (systems.length) {
      const total = systems.reduce((a, ps) => a + ps.count * 32, 0);
      if (!this.partBuf || this.partBuf.size < total) { this.partBuf?.destroy(); this.partBuf = d.createBuffer({ size: Math.max(total, 65536), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }); }
      let off = 0;
      for (const ps of systems) {
        d.queue.writeBuffer(this.partBuf, off, ps.data.buffer, ps.data.byteOffset, ps.count * 32);
        pass.setPipeline(ps.additive ? this.pipePartAdd : this.pipePart);
        pass.setVertexBuffer(0, this.partBuf, off, ps.count * 32); pass.draw(6, ps.count);
        off += ps.count * 32; st.drawCalls++;
      }
    }
    if (o.lines && o.lines.length) {
      const total = o.lines.reduce((a, L) => a + (L.data?.byteLength || 0), 0);
      if (total) {
        if (!this.lineBuf || this.lineBuf.size < total) { this.lineBuf?.destroy(); this.lineBuf = d.createBuffer({ size: Math.max(total, 65536), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }); }
        let off = 0;
        for (const L of o.lines) {
          if (!L.data || !L.data.length) continue;
          this._writeDraw(lineSlot, IDENTITY, IDENTITY, null, { opacity: L.alpha ?? 1 });
          d.queue.writeBuffer(this.lineBuf, off, L.data.buffer, L.data.byteOffset, L.data.byteLength);
          pass.setPipeline(L.depthTest === false ? this.pipeLineTop : this.pipeLine); pass.setBindGroup(1, this.drawBG, [lineSlot * 256]);
          pass.setVertexBuffer(0, this.lineBuf, off, L.data.byteLength); pass.draw(L.data.length / 7);
          off += L.data.byteLength; lineSlot++;
        }
      }
    }
    pass.end();
    d.queue.writeBuffer(this.drawBuf, 0, this.drawData.buffer, 0, lineSlot * 256);

    // SSAO, volumetric light, composite into the HDR frame
    {
      const X = this.fxData, th = Math.tan(camera.fov / 2);
      X.set(mat4.invert(mat4.create(), vpFix), 0); X.set(camera.view, 16); X.set(camera.proj, 32); X.set(mat4.invert(mat4.create(), camera.view), 48);
      X.set([th * camera.aspect, th, env.aoRadius ?? 0.5, env.aoIntensity ?? 1.4], 64);
      X.set([env.volumeDensity ?? 0.035, env.fogHeight || 0.15, volAmt * (env.sunShafts ?? 1), volAmt * (env.lampGlow ?? 1) * 1.6], 68);
      X.set([env.volumeDistance ?? 60, env.anisotropy ?? 0.6, this.time, shadows ? 1 : 0], 72);
      X.set([useAO ? 1 : 0, env.aoStrength ?? 1, useVol ? 1 : 0, 0], 76);
      d.queue.writeBuffer(this.fxBuf, 0, X);
      const run = (name) => {
        const p = enc.beginRenderPass({ colorAttachments: [{ view: this.fxTarget[name].createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
        p.setPipeline(this.pipeFX[name]); p.setBindGroup(0, this.fxBG[name]); p.draw(3); p.end();
      };
      if (needG) run('gdepth');
      if (useAO) { run('ssao'); run('aoblur'); }
      if (useVol) { run('volume'); run('volblur'); }
      run('composite');
    }
    // bloom
    const bloom = this.settings.bloom && lit;
    const S = this.settings;
    if (bloom) {
      const bu = new Float32Array(this.bloomSteps.length * 64);
      this.bloomSteps.forEach((s, i) => bu.set([s.texel[0], s.texel[1], S.bloomThreshold, s.pass], i * 64));
      d.queue.writeBuffer(this.bloomBuf, 0, bu);
      for (const s of this.bloomSteps) {
        const p = enc.beginRenderPass({ colorAttachments: [{ view: s.dst.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
        p.setPipeline(this.pipeBloom); p.setBindGroup(0, s.bg); p.draw(3); p.end();
      }
    }
    // post: tone mapping, grading, bloom, god rays, vignette, grain
    const tmp = S.temperature || 0;
    let rays = 0, sunUV = [0.5, 0.5];
    if (bloom && S.godRays && (env.godRays || 0) > 0) {
      const sp = [0, 1, 2].map((k) => camera.position[k] + env.sunDirection[k] * 500), M = camera.viewProj;
      const cw = M[3] * sp[0] + M[7] * sp[1] + M[11] * sp[2] + M[15];
      if (cw > 0) {
        const cx = (M[0] * sp[0] + M[4] * sp[1] + M[8] * sp[2] + M[12]) / cw, cy = (M[1] * sp[0] + M[5] * sp[1] + M[9] * sp[2] + M[13]) / cw;
        sunUV = [cx * 0.5 + 0.5, 0.5 - cy * 0.5];
        rays = env.godRays * Math.max(0, 1 - Math.max(0, Math.max(Math.abs(cx), Math.abs(cy)) - 1) * 1.5);
      }
    }
    const rc = env.rayColor || [1, 0.85, 0.6];
    d.queue.writeBuffer(this.postBuf, 0, new Float32Array([
      (env.exposure ?? 1) * S.exposure, lit ? S.vignette : 0, lit ? S.grain : 0, this.time,
      bloom ? S.bloomStrength : 0, lit ? S.saturation : 1, lit ? S.contrast : 1, lit ? S.sharpen : 0,
      ...(lit ? [1 + 0.12 * tmp, 1 + 0.02 * tmp, 1 - 0.12 * tmp] : [1, 1, 1]), lit ? S.aberration : 0,
      1 / this.width, 1 / this.height, rays * 1.6, 0, sunUV[0], sunUV[1], 0, 0, rc[0], rc[1], rc[2], 0,
    ]));
    if (!bloom) for (const t of [this.b1, this.c1, this.d1]) { const p = enc.beginRenderPass({ colorAttachments: [{ view: t.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] }); p.end(); }
    const post = enc.beginRenderPass({ colorAttachments: [{ view: (this.offscreen ? this.outTex : this.context.getCurrentTexture()).createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    post.setPipeline(this.pipePost); post.setBindGroup(0, this.postBG); post.draw(3); post.end();
    d.queue.submit([enc.finish()]);
    this._inflight = (this._inflight || 0) + 1;
    d.queue.onSubmittedWorkDone().then(() => this._inflight--);
    st.shadowDrawCalls = shadowCalls;
    st.cpuMs = performance.now() - t0;
  }

  // How many instances survived GPU culling last frame (async: reads the indirect args back).
  async readCulledCount(mesh) {
    const e = this.instCache.get(mesh);
    if (!e) return null;
    const d = this.device, rb = d.createBuffer({ size: 20, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(e.args, 0, rb, 0, 20); d.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const v = new Uint32Array(rb.getMappedRange().slice(0)); rb.unmap(); rb.destroy();
    return v[1];
  }
  // Read the last frame back as a 2D canvas (screenshots, thumbnails, tests). Re-runs the
  // final post pass into a copyable texture, so it works whatever the page compositor does.
  async snapshot() {
    const d = this.device, w = this.width, h = this.height, bpr = Math.ceil((w * 4) / 256) * 256;
    const tex = this.offscreen ? this.outTex : d.createTexture({ size: [w, h], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const buf = d.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = d.createCommandEncoder();
    if (!this.offscreen) { const p = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] }); p.setPipeline(this.pipePost); p.setBindGroup(0, this.postBG); p.draw(3); p.end(); }
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
    d.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange()), img = new ImageData(w, h), bgra = this.format.startsWith('bgra');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * bpr + x * 4, o = (y * w + x) * 4;
      img.data[o] = src[i + (bgra ? 2 : 0)]; img.data[o + 1] = src[i + 1]; img.data[o + 2] = src[i + (bgra ? 0 : 2)]; img.data[o + 3] = 255;
    }
    buf.unmap(); buf.destroy(); if (!this.offscreen) tex.destroy();
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }
  // Editor tools (GPU picking, overlays) need the WebGL2 renderer.
  pick() { return 0; }
  drawLines() {}
  destroy() { this.device.destroy(); }
}

// shared, backend-independent helpers (scene walk, culling spheres, LOD, lights, shadow fit)
for (const k of ['collect', '_lod', '_sphere', '_skelSphere', '_frustum', '_visible', '_gatherLights', '_computeShadowVP', '_matKey', '_adapt']) GPURenderer.prototype[k] = Renderer.prototype[k];

// Pick a backend: 'webgpu', 'webgl2' or 'auto' (WebGPU when the browser has it, unless the
// page needs a WebGL2-only feature). ?backend=webgl2 / ?backend=webgpu in the URL overrides.
export async function createRenderer(canvas, opts = {}) {
  let want = opts.backend || 'auto';
  try { const q = new URLSearchParams(location.search).get('backend'); if (q) want = q; } catch { /* no location */ }
  if (want !== 'webgl2' && GPURenderer.supported) {
    try { return await GPURenderer.create(canvas, opts); } catch (e) { if (want === 'webgpu') throw e; console.warn('WebGPU unavailable, using WebGL2:', e.message); }
  }
  const r = new Renderer(canvas, opts);
  r.backend = 'webgl2';
  return r;
}
