// Sounds of this game: synthesized (WebAudio) Hasshaku "po… po, po", knocks on the fusuma,
// a scrape, the salt, a short sting, and the stage beds: recorded loops (assets/audio, Issue #1) with a synthesized fallback, muffled behind closed doors (W9).
// Everything plays through the standard audio's context and master gain (js/kit/audio.js), so the volume setting applies.
export function createSound(ctx) {
  const A = () => ctx.audio && ctx.audio.ctx;
  const out = () => (ctx.audio && ctx.audio.master) || (A() && A().destination);
  const S = { bed: null, quiet: () => ctx.calm };
  const pan = (ac, p) => { const n = ac.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p || 0)); return n; };
  const env = (ac, g, t, a, peak, hold, rel) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel); };
  const noiseBuf = (ac, sec = 1) => { const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };

  // "po": a hollow low voice, not quite a man's, not quite a bird's
  function po(o = {}) {
    const ac = A(); if (!ac) return;
    const t0 = ac.currentTime + 0.02, vol = (o.vol ?? 0.5) * (S.quiet() ? 0.5 : 1);
    const p = pan(ac, o.pan); p.connect(out());
    const beats = [0, 0.75, 1.05];
    for (const dt of beats) {
      const t = t0 + dt, osc = ac.createOscillator(), osc2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(118, t); osc.frequency.exponentialRampToValueAtTime(92, t + 0.22);
      osc2.type = 'sine'; osc2.frequency.setValueAtTime(236, t); osc2.frequency.exponentialRampToValueAtTime(170, t + 0.2);
      f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 2.4;
      env(ac, g, t, 0.02, vol, 0.06, 0.24);
      osc.connect(f); osc2.connect(f); f.connect(g); g.connect(p);
      osc.start(t); osc2.start(t); osc.stop(t + 0.5); osc2.stop(t + 0.5);
    }
  }
  function knock(o = {}) {
    const ac = A(); if (!ac) return;
    const n = o.n ?? 3, t0 = ac.currentTime + 0.02, p = pan(ac, o.pan ?? 0.3); p.connect(out());
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.36 + Math.random() * 0.08), src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = noiseBuf(ac, 0.2); f.type = 'lowpass'; f.frequency.value = 520; env(ac, g, t, 0.003, (o.vol ?? 0.7), 0.01, 0.16);
      src.connect(f); f.connect(g); g.connect(p); src.start(t);
      const thump = ac.createOscillator(), tg = ac.createGain(); thump.frequency.setValueAtTime(95, t); thump.frequency.exponentialRampToValueAtTime(55, t + 0.12); env(ac, tg, t, 0.003, (o.vol ?? 0.7) * 0.8, 0.02, 0.12); thump.connect(tg); tg.connect(p); thump.start(t); thump.stop(t + 0.3);
    }
  }
  function scrape(o = {}) {
    const ac = A(); if (!ac) return;
    const t = ac.currentTime + 0.02, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), p = pan(ac, o.pan); p.connect(out());
    src.buffer = noiseBuf(ac, 1.2); f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(500, t + 1.0); f.Q.value = 3;
    env(ac, g, t, 0.15, (o.vol ?? 0.25), 0.5, 0.4); src.connect(f); f.connect(g); g.connect(p); src.start(t);
  }
  function salt() {
    const ac = A(); if (!ac) return;
    const t = ac.currentTime + 0.02, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf(ac, 0.8); f.type = 'highpass'; f.frequency.value = 3200; env(ac, g, t, 0.05, 0.16, 0.35, 0.3);
    src.connect(f); f.connect(g); g.connect(out()); src.start(t);
  }
  function sting() {
    const ac = A(); if (!ac) return;
    const t = ac.currentTime + 0.02, vol = S.quiet() ? 0.15 : 0.32;
    for (const fr of [311, 329.6, 466]) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = fr; env(ac, g, t, 0.01, vol / 3, 0.25, 0.9); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; o.connect(f); f.connect(g); g.connect(out()); o.start(t); o.stop(t + 1.4); }
  }
  // the night bed: insects (fast amplitude-modulated high tones) + wind (filtered noise). outdoors = 1, behind closed doors ~0.15
  function bed() {
    const ac = A(); if (!ac || S.bed) return S.bed;
    const g = ac.createGain(); g.gain.value = 0; g.connect(out());
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; lp.connect(g);
    const wind = ac.createBufferSource(); wind.buffer = noiseBuf(ac, 4); wind.loop = true; const wf = ac.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380; const wg = ac.createGain(); wg.gain.value = 0.12; wind.connect(wf); wf.connect(wg); wg.connect(lp); wind.start();
    const ins = ac.createGain(); ins.gain.value = 0.0; ins.connect(lp);
    for (const [fr, rate] of [[4200, 31], [4650, 27], [3900, 36]]) { const o = ac.createOscillator(); o.frequency.value = fr; const am = ac.createGain(); am.gain.value = 0; const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = rate; const lg = ac.createGain(); lg.gain.value = 0.012; lfo.connect(lg); lg.connect(am.gain); o.connect(am); am.connect(ins); o.start(); lfo.start(); }
    // the van's engine (the ride): no music, only a low rumble of filtered noise and a faint 48 Hz hum, so the po, the knocks and the steps on the roof are what you hear
    const eng = ac.createGain(); eng.gain.value = 0; eng.connect(lp);
    const rum = ac.createBufferSource(); rum.buffer = noiseBuf(ac, 4); rum.loop = true; const rf = ac.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 140; const rg = ac.createGain(); rg.gain.value = 0.55; rum.connect(rf); rf.connect(rg); rg.connect(eng); rum.start();
    const hum = ac.createOscillator(); hum.frequency.value = 48; const hg = ac.createGain(); hg.gain.value = 0.06; hum.connect(hg); hg.connect(eng); hum.start();
    S.bed = { g, lp, ins, wg, eng };
    return S.bed;
  }
  // recorded beds (Issue #1, ACE-Step loops in assets/audio/, listed in its manifest.json): one per stage, the night bed has an indoor
  // (muffled) twin and the two cross-fade with outdoor / indoor. Until they are decoded (or if they fail) the synthesized bed plays.
  const BEDS = [['amb-dusk-village'], ['amb-night-insects', 'amb-night-indoor'], ['amb-night-insects', 'amb-night-indoor'], ['amb-dawn-fog'], []];   // L5 has no recorded bed: only the engine (feedback 2026-11-07: the van's music broke the mood)
  const BED_GAIN = 0.45;   // the beds sit under the voices, the po and the footsteps (they were too loud at 1)
  const loops = {}; let loopsAsked = false;
  function loadLoops() {
    const ac = A(); if (!ac || loopsAsked) return; loopsAsked = true;
    fetch('assets/audio/manifest.json').then((r) => r.json()).then((m) => Promise.all(Object.entries(m).filter(([id, v]) => v.loop).map(([id, v]) =>
      fetch(v.file).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((buf) => {
        const g = ac.createGain(); g.gain.value = 0; g.connect(out());
        const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(g); src.start(ac.currentTime, Math.random() * buf.duration);
        loops[id] = g;
      })))).catch(() => {});
  }
  // per frame: outdoors / indoors and the time of day (insects at dusk and night, fewer at dawn)
  function update(dt, o) {
    const b = bed(); if (!b) return;
    const ac = A(); const t = ac.currentTime;
    const vol = (ctx.settings ? ctx.settings.volume : 0.8) > 0 ? 1 : 0;
    loadLoops();
    const want = BEDS[o.level ?? 0] || [];
    if (want.length && want.every((id) => loops[id])) {
      for (const [id, g] of Object.entries(loops)) {
        const on = want[0] === id ? (want[1] && !o.outdoor ? 0 : 1) : want[1] === id && !o.outdoor ? 1 : 0;
        g.gain.setTargetAtTime(vol * on * BED_GAIN, t, 1.2);
      }
      b.g.gain.setTargetAtTime(0, t, 0.4);
      return;
    }
    if (!want.length) for (const g of Object.values(loops)) g.gain.setTargetAtTime(0, t, 1.2);   // nothing recorded wanted: the last stage's bed must not stay on
    b.g.gain.setTargetAtTime(vol * BED_GAIN * (o.outdoor ? 0.9 : 0.22), t, 0.4);
    b.lp.frequency.setTargetAtTime(o.outdoor ? 9000 : 700, t, 0.4);
    b.ins.gain.setTargetAtTime(o.insects ?? 1, t, 1.5);
    b.wg.gain.setTargetAtTime(o.wind ?? 0.12, t, 1.5);
    b.eng.gain.setTargetAtTime(o.engine ? 1 : 0, t, 0.6);
  }
  // the ending: the update stops with the play, so every bed is faded out here
  function silence() {
    const ac = A(); if (!ac) return; const t = ac.currentTime;
    for (const g of Object.values(loops)) g.gain.setTargetAtTime(0, t, 0.8);
    if (S.bed) S.bed.g.gain.setTargetAtTime(0, t, 0.8);
  }
  // the van's radio switching itself on (the ride, feedback 2026-11-01): crackling static that swells and cuts, the po buried in it
  function radio(o = {}) {
    const ac = A(); if (!ac) return;
    const t = ac.currentTime + 0.02, sec = o.sec ?? 3, vol = (o.vol ?? 0.22) * (S.quiet() ? 0.5 : 1);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), am = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    src.buffer = noiseBuf(ac, sec + 0.5); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.9;
    lfo.type = 'square'; lfo.frequency.value = 7.5; lg.gain.value = 0.45; am.gain.value = 0.55; lfo.connect(lg); lg.connect(am.gain);
    env(ac, g, t, 0.05, vol, sec - 0.4, 0.05);
    src.connect(f); f.connect(am); am.connect(g); g.connect(pan(ac, o.pan ?? -0.2)).connect(out());
    src.start(t); lfo.start(t); src.stop(t + sec + 0.2); lfo.stop(t + sec + 0.2);
    setTimeout(() => po({ vol: vol * 1.4, pan: o.pan ?? -0.2 }), sec * 450);
  }
  return { po, knock, scrape, salt, sting, radio, update, silence };
}
