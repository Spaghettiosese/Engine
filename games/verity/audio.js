// All sound is synthesised with WebAudio — ambience, music, foley, voices.
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8 };
    this.tts = true;
    this.amb = null;
    this.ambName = '';
    this.musicMode = '';
    this.musicTimer = 0;
    this.heart = 0; // 0..1 heartbeat intensity
    this.heartTimer = 0;
    this.rain = 0;
    this.rainTimer = 0;
    this.radioMusic = false;
    this.radioStep = 0;
    this.radioTimer = 0;
    this.voice = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.vol.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.mus = ctx.createGain(); this.mus.gain.value = 0.55; this.mus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.9; this.ambBus.connect(this.master);
    // reverb
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.rev = ctx.createConvolver(); this.rev.buffer = ir;
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.5;
    this.rev.connect(this.revGain); this.revGain.connect(this.master);
    // noise buffers
    const nlen = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const wd = this.white.getChannelData(0);
    for (let i = 0; i < nlen; i++) wd[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const bd = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < nlen; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    // distortion curve for jumpscares
    this.dist = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); }
    this.dist.curve = curve;
    this.dist.connect(this.sfx);
    if (this.pendingAmb) { const a = this.pendingAmb; this.pendingAmb = null; this.setAmbience(a); }
  }

  setMaster(v) { this.vol.master = v; if (this.master) this.master.gain.value = v; }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  tone(o) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = this.t + (o.at || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f || 440, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slide), t0 + (o.dur || 0.2));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.a ?? 0.005, dur = o.dur ?? 0.2, r = o.r ?? 0.1, v = o.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.setValueAtTime(v, t0 + Math.max(a, dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = g;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; g.connect(f); node = f; }
    osc.connect(g);
    node.connect(o.dest || this.sfx);
    if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; node.connect(s); s.connect(this.rev); }
    osc.start(t0); osc.stop(t0 + dur + 0.05);
    return osc;
  }

  noise(o) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = this.t + (o.at || 0);
    const src = ctx.createBufferSource();
    src.buffer = o.brown ? this.brown : this.white;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.slideF) f.frequency.exponentialRampToValueAtTime(o.slideF, t0 + (o.dur || 0.2));
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const a = o.a ?? 0.005, dur = o.dur ?? 0.2, r = o.r ?? dur * 0.6, v = o.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.setValueAtTime(v, t0 + Math.max(a, dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || this.sfx);
    if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(this.rev); }
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------ ambience
  setAmbience(name) {
    if (!this.ctx) { this.pendingAmb = name; return; }
    if (name === this.ambName) return;
    this.ambName = name;
    const ctx = this.ctx;
    if (this.amb) {
      const old = this.amb;
      old.gain.gain.setTargetAtTime(0.0001, this.t, 0.4);
      setTimeout(() => { for (const n of old.nodes) { try { n.stop ? n.stop() : null; } catch (e) { /* stopped */ } try { n.disconnect(); } catch (e) { /* ok */ } } }, 2500);
    }
    const gain = ctx.createGain(); gain.gain.value = 0.0001; gain.connect(this.ambBus);
    const nodes = [gain];
    const osc = (type, f, v, lp) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = v;
      o.connect(g);
      if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; g.connect(fl); fl.connect(gain); nodes.push(fl); }
      else g.connect(gain);
      o.start(); nodes.push(o, g);
      return o;
    };
    const nz = (type, f, q, v, brown, lfo) => {
      const s = ctx.createBufferSource(); s.buffer = brown ? this.brown : this.white; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = v;
      s.connect(fl); fl.connect(g); g.connect(gain);
      if (lfo) {
        const l = ctx.createOscillator(); l.frequency.value = lfo; const lg = ctx.createGain(); lg.gain.value = v * 0.6;
        l.connect(lg); lg.connect(g.gain); l.start(); nodes.push(l, lg);
      }
      s.start(0, Math.random()); nodes.push(s, fl, g);
    };
    let target = 0.5;
    switch (name) {
      case 'school':
        osc('sine', 120, 0.02); osc('sine', 240, 0.006); nz('lowpass', 380, 0.5, 0.05, true); target = 0.6; break;
      case 'outside':
        nz('bandpass', 500, 0.4, 0.05, false, 0.07); nz('lowpass', 200, 0.5, 0.08, true); target = 0.5; break;
      case 'car':
        osc('sawtooth', 38, 0.05, 160); osc('sawtooth', 41, 0.04, 160); nz('lowpass', 320, 0.7, 0.12, true); nz('bandpass', 900, 0.4, 0.015, false); target = 0.7; break;
      case 'house':
        osc('sine', 60, 0.012); nz('lowpass', 250, 0.5, 0.025, true); target = 0.5; break;
      case 'houseDark':
        osc('sawtooth', 55, 0.03, 180); osc('sawtooth', 55.6, 0.03, 180); osc('sine', 36, 0.05);
        nz('lowpass', 150, 0.6, 0.06, true, 0.05); nz('highpass', 2500, 0.3, 0.03, false); target = 0.65; break;
      case 'garage':
        osc('sine', 48, 0.04); nz('lowpass', 200, 0.5, 0.06, true); nz('highpass', 2500, 0.3, 0.035, false); target = 0.6; break;
      case 'tape':
        osc('sine', 50, 0.015); nz('highpass', 3200, 0.5, 0.02, false); nz('lowpass', 180, 0.5, 0.05, true); target = 0.55; break;
      case 'title':
        osc('sawtooth', 43.65, 0.03, 140); osc('sawtooth', 43.9, 0.03, 140); nz('lowpass', 200, 0.5, 0.05, true, 0.03); target = 0.6; break;
      case 'mc':
        nz('bandpass', 700, 0.3, 0.012, false, 0.05); target = 0.4; break;
      case 'mcCorrupt':
        osc('sawtooth', 32.7, 0.05, 120); osc('sawtooth', 34.6, 0.05, 120); osc('sine', 207.6, 0.008); nz('lowpass', 120, 0.8, 0.07, true, 0.2); target = 0.7; break;
      case 'finale':
        osc('sawtooth', 41.2, 0.04, 150); osc('sawtooth', 43.7, 0.035, 150); osc('sine', 82.4, 0.015); nz('lowpass', 160, 0.6, 0.05, true, 0.08); target = 0.65; break;
      case 'warm':
        osc('sine', 60, 0.008); nz('lowpass', 300, 0.5, 0.02, true); target = 0.5; break;
      default: target = 0.0001;
    }
    gain.gain.setTargetAtTime(target, this.t, 0.8);
    this.amb = { gain, nodes };
  }

  setMusic(mode) { this.musicMode = mode; this.musicTimer = 0.5; }

  // Called every frame
  update(dt) {
    if (!this.ctx) return;
    // generative music
    if (this.musicMode) {
      this.musicTimer -= dt;
      if (this.musicTimer <= 0) this.musicNote();
    }
    if (this.heart > 0.02) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        const v = 0.15 + this.heart * 0.5;
        this.tone({ f: 58, type: 'sine', dur: 0.12, vol: v, a: 0.005, r: 0.1 });
        this.tone({ f: 52, type: 'sine', dur: 0.14, vol: v * 0.8, at: 0.2, r: 0.1 });
        this.heartTimer = 1.2 - this.heart * 0.75;
      }
    }
    if (this.rain > 0) {
      this.rainTimer -= dt;
      if (this.rainTimer <= 0) {
        this.rainTimer = 0.02 + Math.random() * 0.05;
        this.noise({ f: 2500 + Math.random() * 4000, q: 4, dur: 0.02, vol: 0.02 * this.rain, type: 'bandpass' });
      }
    }
    if (this.radioMusic) {
      this.radioTimer -= dt;
      if (this.radioTimer <= 0) {
        this.radioTimer = 0.17;
        const pat = [72, 76, 79, 76, 74, 77, 81, 77, 71, 74, 79, 74, 72, 76, 84, 79];
        const bass = [48, 48, 45, 45, 43, 43, 48, 48];
        const n = pat[this.radioStep % pat.length];
        this.tone({ f: NOTE(n), type: 'square', dur: 0.12, vol: 0.02, lp: 1800 });
        if (this.radioStep % 2 === 0) this.tone({ f: NOTE(bass[(this.radioStep / 2) % bass.length]), type: 'triangle', dur: 0.3, vol: 0.05, lp: 600 });
        if (this.radioStep % 4 === 0) this.noise({ f: 120, type: 'lowpass', dur: 0.1, vol: 0.08, brown: true });
        if (this.radioStep % 4 === 2) this.noise({ f: 6000, type: 'highpass', dur: 0.05, vol: 0.02 });
        this.radioStep++;
      }
    }
  }

  musicNote() {
    const m = this.musicMode;
    if (m === 'mcDay') {
      const scale = [60, 62, 64, 67, 69, 72, 74, 76, 79];
      const n = scale[Math.floor(Math.random() * scale.length)];
      this.piano(NOTE(n), 0.07);
      if (Math.random() < 0.35) this.piano(NOTE(n - 12), 0.05);
      if (Math.random() < 0.15) { this.piano(NOTE(n + 4), 0.04, 0.25); }
      this.musicTimer = 0.45 + Math.random() * 1.3;
    } else if (m === 'mcNight') {
      const scale = [57, 60, 62, 64, 67, 69];
      const n = scale[Math.floor(Math.random() * scale.length)];
      this.piano(NOTE(n), 0.06);
      if (Math.random() < 0.4) this.piano(NOTE(n - 12), 0.05, 0.4);
      this.musicTimer = 1.1 + Math.random() * 1.8;
    } else if (m === 'mcCorrupt') {
      const n = [61, 62, 67, 68][Math.floor(Math.random() * 4)];
      this.piano(NOTE(n) * 0.97, 0.06, 0, -40);
      this.musicTimer = 1.8 + Math.random() * 2;
    } else if (m === 'title') {
      // music-box Verity jingle, slowed and slightly off
      const mel = [76, 79, 84, 79, 81, 79, 0, 0, 76, 79, 84, 86, 84, 0, 0, 0];
      this.tStep = (this.tStep || 0) + 1;
      const n = mel[this.tStep % mel.length];
      if (n) this.musicBox(NOTE(n) * (1 - 0.006 * Math.sin(this.tStep)));
      this.musicTimer = 0.42;
    } else if (m === 'warm') {
      const chords = [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]];
      this.wStep = ((this.wStep ?? -1) + 1) % chords.length;
      for (const n of chords[this.wStep]) this.piano(NOTE(n), 0.035, 0);
      this.piano(NOTE(chords[this.wStep][0] - 12), 0.05);
      this.musicTimer = 2.4;
    } else this.musicTimer = 1;
  }

  piano(f, vol = 0.06, at = 0, detune = 0) {
    this.tone({ f, type: 'triangle', dur: 2.2, vol, a: 0.004, r: 2.0, at, detune, dest: this.mus, rev: 0.6 });
    this.tone({ f: f * 2, type: 'sine', dur: 1.2, vol: vol * 0.25, a: 0.004, r: 1.1, at, detune, dest: this.mus, rev: 0.4 });
  }

  musicBox(f) {
    this.tone({ f, type: 'sine', dur: 1.4, vol: 0.05, a: 0.002, r: 1.3, dest: this.mus, rev: 0.8 });
    this.tone({ f: f * 3, type: 'sine', dur: 0.4, vol: 0.012, a: 0.002, r: 0.35, dest: this.mus, rev: 0.8 });
  }

  // --------------------------------------------------------------- sfx
  step(surface = 'wood', vol = 1) {
    const f = { wood: 700, carpet: 350, tile: 1600, grass: 900, concrete: 1300, gravel: 2200, mc: 800, flesh: 300 }[surface] || 800;
    this.noise({ f: f * (0.85 + Math.random() * 0.3), q: 1.2, dur: 0.07, vol: 0.09 * vol, type: 'bandpass' });
    this.tone({ f: 70 + Math.random() * 20, type: 'sine', dur: 0.06, vol: 0.08 * vol });
    if (surface === 'wood' && Math.random() < 0.08) this.tone({ f: 300, slide: 240, type: 'sawtooth', dur: 0.25, vol: 0.012, lp: 900 });
    if (surface === 'flesh') this.noise({ f: 200, q: 3, dur: 0.15, vol: 0.06, type: 'lowpass' });
  }

  monsterStep(dist) {
    const v = Math.max(0, 1 - dist / 16);
    if (v <= 0) return;
    this.tone({ f: 48, type: 'sine', dur: 0.2, vol: 0.25 * v });
    this.noise({ f: 250, q: 2, dur: 0.12, vol: 0.12 * v, type: 'lowpass', brown: true });
  }

  door(open = true) {
    this.tone({ f: open ? 190 : 150, slide: open ? 120 : 210, type: 'sawtooth', dur: 0.55, vol: 0.035, lp: 1200, rev: 0.2 });
    this.noise({ f: 180, type: 'lowpass', dur: 0.12, vol: 0.18, brown: true, at: open ? 0 : 0.4 });
  }

  slam() {
    this.noise({ f: 300, type: 'lowpass', dur: 0.35, vol: 0.6, brown: true, rev: 0.4 });
    this.tone({ f: 55, type: 'sine', dur: 0.3, vol: 0.4 });
  }

  locked() {
    this.noise({ f: 2400, q: 6, dur: 0.05, vol: 0.12 });
    this.noise({ f: 1800, q: 6, dur: 0.05, vol: 0.1, at: 0.08 });
  }

  unlock() {
    this.noise({ f: 3000, q: 8, dur: 0.04, vol: 0.12 });
    this.tone({ f: 900, type: 'square', dur: 0.03, vol: 0.03, at: 0.05 });
  }

  bell() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = this.t;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1180;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 28; const lg = ctx.createGain(); lg.gain.value = 0.05;
    lfo.connect(lg); lg.connect(g.gain);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 2;
    o.connect(g); g.connect(f); f.connect(this.sfx);
    o.start(t0); lfo.start(t0); o.stop(t0 + 2.6); lfo.stop(t0 + 2.6);
  }

  buzz() {
    for (let i = 0; i < 2; i++) this.tone({ f: 170, type: 'square', dur: 0.28, vol: 0.05, lp: 400, at: i * 0.4 });
  }

  blip(pitch = 600) {
    this.tone({ f: pitch * (0.95 + Math.random() * 0.1), type: 'square', dur: 0.035, vol: 0.022, lp: 2400 });
  }

  pop() {
    this.tone({ f: 380, slide: 1100, type: 'sine', dur: 0.14, vol: 0.2 });
    this.noise({ f: 3000, dur: 0.03, vol: 0.08 });
  }

  jingle(corrupt = 0) {
    const mel = [76, 79, 84, 79, 81, 84];
    const sp = 0.13 * (1 + corrupt * 1.5);
    mel.forEach((n, i) => {
      const f = NOTE(n - corrupt * 7) * (1 - corrupt * 0.03 * i);
      this.tone({ f, type: 'triangle', dur: 0.35 + corrupt, vol: 0.08, at: i * sp, rev: 0.4 });
      this.tone({ f: f * 2, type: 'sine', dur: 0.2, vol: 0.02, at: i * sp });
    });
  }

  chime() { [72, 76, 79, 84].forEach((n, i) => this.tone({ f: NOTE(n), type: 'sine', dur: 0.5, vol: 0.05, at: i * 0.08, rev: 0.5 })); }

  achievement() { [79, 84, 88].forEach((n, i) => this.tone({ f: NOTE(n), type: 'square', dur: 0.15, vol: 0.03, at: i * 0.09, lp: 3000 })); }

  breakBlock() {
    this.noise({ f: 900 + Math.random() * 600, q: 0.8, dur: 0.14, vol: 0.2 });
    this.tone({ f: 90, type: 'sine', dur: 0.08, vol: 0.12 });
  }

  hitBlock() { this.noise({ f: 700 + Math.random() * 400, q: 1, dur: 0.05, vol: 0.08 }); }

  placeBlock() { this.noise({ f: 500, type: 'lowpass', dur: 0.08, vol: 0.2 }); }

  pickup() { this.tone({ f: 700, slide: 1400, type: 'sine', dur: 0.08, vol: 0.06 }); }

  jumpscare() {
    if (!this.ctx) return;
    this.noise({ f: 1500, q: 0.3, dur: 1.2, vol: 0.9, type: 'bandpass', dest: this.dist });
    for (const f of [110, 117, 164, 233, 311]) this.tone({ f, type: 'sawtooth', dur: 1.3, vol: 0.18, dest: this.dist, slide: f * 0.7 });
    this.tone({ f: 40, type: 'sine', dur: 1.5, vol: 0.6 });
  }

  stinger() {
    this.tone({ f: 38, type: 'sine', dur: 2.5, vol: 0.5, r: 2.2 });
    this.noise({ f: 90, type: 'lowpass', dur: 2.0, vol: 0.4, brown: true, rev: 0.6 });
    for (const f of [1244, 1318, 1397]) this.tone({ f, type: 'sawtooth', dur: 1.8, vol: 0.02, lp: 4000, rev: 0.8, slide: f * 0.96 });
  }

  whoosh() { this.noise({ f: 300, slideF: 2400, q: 1, dur: 0.5, vol: 0.15 }); }

  thunder() {
    this.noise({ f: 2000, type: 'lowpass', dur: 0.3, vol: 0.4, slideF: 300 });
    this.noise({ f: 140, type: 'lowpass', dur: 3.5, vol: 0.55, brown: true, a: 0.05, r: 3.2, rev: 0.6, at: 0.1 });
  }

  breath(holding = false) {
    this.noise({ f: holding ? 700 : 1300, q: 0.8, dur: 0.9, vol: 0.035, a: 0.3, r: 0.5, type: 'bandpass' });
  }

  gasp() { this.noise({ f: 1500, q: 0.6, dur: 0.5, vol: 0.15, a: 0.02, r: 0.4 }); }

  click() { this.noise({ f: 4000, q: 4, dur: 0.02, vol: 0.08 }); }

  key() { this.noise({ f: 3000 + Math.random() * 1500, q: 3, dur: 0.025, vol: 0.05 }); }

  pcBoot() { [60, 67, 72, 76].forEach((n, i) => this.tone({ f: NOTE(n), type: 'triangle', dur: 1.4, vol: 0.05, at: i * 0.12, rev: 0.4 })); }

  glitch() {
    for (let i = 0; i < 6; i++) this.tone({ f: 80 + Math.random() * 2000, type: 'square', dur: 0.04, vol: 0.05, at: i * 0.035 });
    this.noise({ f: 4000, type: 'highpass', dur: 0.2, vol: 0.08 });
  }

  staticBurst(dur = 0.6, vol = 0.12) { this.noise({ f: 3000, q: 0.3, dur, vol, type: 'bandpass' }); }

  boil(dur = 1.5) {
    for (let i = 0; i < dur * 12; i++) this.tone({ f: 150 + Math.random() * 300, slide: 400 + Math.random() * 400, type: 'sine', dur: 0.05, vol: 0.03, at: Math.random() * dur });
  }

  knock(n = 3) { for (let i = 0; i < n; i++) this.noise({ f: 220, type: 'lowpass', dur: 0.12, vol: 0.5, brown: true, at: i * 0.32, rev: 0.3 }); }

  breaker(fail = false) {
    this.noise({ f: 400, type: 'lowpass', dur: 0.15, vol: 0.5, brown: true });
    this.tone({ f: 70, type: 'square', dur: 0.08, vol: 0.12, lp: 300 });
    if (fail) this.tone({ f: 60, type: 'sawtooth', dur: 0.6, vol: 0.1, lp: 300, at: 0.1 });
  }

  powerDown() {
    this.tone({ f: 120, slide: 18, type: 'sawtooth', dur: 1.5, vol: 0.12, lp: 500 });
    this.noise({ f: 200, type: 'lowpass', dur: 0.4, vol: 0.4, brown: true });
  }

  powerUp() { this.tone({ f: 30, slide: 120, type: 'sawtooth', dur: 1.2, vol: 0.08, lp: 600 }); this.tone({ f: 60, type: 'sine', dur: 1.5, vol: 0.05, at: 0.6 }); }

  carDoor() { this.noise({ f: 250, type: 'lowpass', dur: 0.25, vol: 0.5, brown: true }); this.noise({ f: 2500, q: 4, dur: 0.04, vol: 0.08 }); }

  paper() { this.noise({ f: 4000, q: 0.5, dur: 0.18, vol: 0.05, type: 'highpass' }); }

  radioTune() { this.noise({ f: 1500, slideF: 3500, q: 2, dur: 0.6, vol: 0.06 }); this.tone({ f: 2000, slide: 800, type: 'sine', dur: 0.5, vol: 0.01 }); }

  radioVoice(dur = 1.2) {
    for (let i = 0; i < dur * 8; i++) this.noise({ f: 600 + Math.random() * 1000, q: 3, dur: 0.1, vol: 0.025, at: i * 0.12 + Math.random() * 0.03 });
  }

  crack() { this.noise({ f: 2600, q: 1, dur: 0.12, vol: 0.4 }); this.noise({ f: 700, q: 1, dur: 0.4, vol: 0.2, at: 0.05 }); }

  shatter() { for (let i = 0; i < 10; i++) this.noise({ f: 3000 + Math.random() * 4000, q: 5, dur: 0.1, vol: 0.12, at: Math.random() * 0.4 }); this.noise({ f: 800, dur: 0.5, vol: 0.3 }); }

  // --------------------------------------------------------------- speech
  speak(text, style = {}) {
    if (!this.tts || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
    try {
      const clean = text.replace(/[:;]-?\)/g, '').replace(/[~^*_]/g, '').replace(/\[[^\]]*\]/g, '').replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim();
      if (!clean) return false;
      const u = new SpeechSynthesisUtterance(clean);
      u.pitch = style.pitch ?? 1.6;
      u.rate = style.rate ?? 1.05;
      u.volume = style.volume ?? 0.9;
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) {
        const pref = voices.find((v) => /Samantha|Zira|Google US English|Jenny|Aria|female/i.test(v.name) && /^en/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
        if (pref) u.voice = pref;
      }
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  stopSpeak() { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
}
