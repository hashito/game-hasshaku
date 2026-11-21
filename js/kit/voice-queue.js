/* game-kit 1d506003: js/voice-queue.js — edit in game-kit and run tools/kit-sync.js */
// One voice at a time (standard 1.20.0, from 水無瀬病院 2nd play test #3: 「声が被るのが頻発します。優先度を考えて声を重複しないようにして」).
// Every spoken line of a game (the talk window, the protagonist's thoughts, a partner's hint, an idle remark, a radio call) goes through ONE
// channel. A line has a priority: 'story' (3: the talk window, a scripted moment) > 'hint' (2: thoughts, answers, a partner's "go here")
// > 'idle' (1: chatter, a waiting partner's remark). While a line plays:
//   - a higher priority line cuts it (stopped at once) and plays;
//   - a story line also cuts another story line (the talk window goes on to its next line);
//   - anything else waits in a short queue (hint 4 s, story 6 s) and plays when the voice before it has ended; an idle line is dropped
//     (o.wait to change how long a line may wait; a line that waited too long is dropped: its subtitle has gone by).
// ctx.voiceLine(src, preset, { prio: 'hint' }) and ctx.playVoice(src, preset, { prio }) both go through it; ctx.voiceBusy() -> 0..3
// (a game skips an idle line, subtitle and all, while someone speaks: if (ctx.voiceBusy() < 2) ...).
// VoiceQueue is pure (an injected clock, start() returns a handle { stop(), done: Promise }) - test/voice-queue.test.mjs.
export const PRIO = { idle: 1, hint: 2, story: 3 };
export const WAIT = { 1: 0, 2: 4, 3: 6 };   // seconds a line may wait for the voice before it
export const prioOf = (p) => (typeof p === 'number' ? p : PRIO[p] || PRIO.hint);

export class VoiceQueue {
  constructor({ now = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000) } = {}) {
    this.now = now; this.cur = null; this.waiting = []; this.log = [];   // log: { at, prio, what: 'play' | 'cut' | 'wait' | 'drop' }
  }
  /** start: () => handle | null (handle.stop(), handle.done: a Promise that resolves when the line ended). Returns a handle for the caller. */
  request(start, o = {}) {
    const prio = prioOf(o.prio), item = { start, prio, until: this.now() + (o.wait ?? WAIT[prio] ?? 4), h: null, stopped: false, id: o.id || '' };
    const outer = { stop: () => this.stop(item), get playing() { return !!item.h && !item.stopped; }, prio };
    const c = this.cur;
    if (!c) this.play(item);
    else if (prio > c.prio || (prio === PRIO.story && c.prio === PRIO.story) || o.cut) { this.note(item, 'cut'); this.stop(c); this.play(item); }
    else if ((o.wait ?? WAIT[prio]) > 0) { this.waiting.push(item); this.waiting.sort((a, b) => b.prio - a.prio); this.note(item, 'wait'); }
    else { item.stopped = true; this.note(item, 'drop'); }
    return outer;
  }
  play(item) {
    this.cur = item; let h = null;
    try { h = item.start(); } catch (e) { h = null; }
    item.h = h; this.note(item, 'play');
    if (!h) { this.cur = null; this.next(); return; }
    const end = () => { if (this.cur === item) { this.cur = null; this.next(); } };
    if (h.done && h.done.then) h.done.then(end, end); else setTimeout(end, (h.sec || 3) * 1000);
  }
  stop(item) {
    if (!item || item.stopped) return;
    item.stopped = true;
    try { item.h && item.h.stop && item.h.stop(); } catch (e) { /* already stopped */ }
    const i = this.waiting.indexOf(item); if (i >= 0) this.waiting.splice(i, 1);
    if (this.cur === item) { this.cur = null; this.next(); }
  }
  next() {
    if (this.cur) return;
    const t = this.now();
    while (this.waiting.length) {
      const it = this.waiting.shift(); if (it.stopped) continue;
      if (t > it.until) { it.stopped = true; this.note(it, 'drop'); continue; }
      this.play(it); return;
    }
  }
  busy() { return this.cur && !this.cur.stopped ? this.cur.prio : 0; }
  clear() { for (const it of [...this.waiting]) this.stop(it); if (this.cur) this.stop(this.cur); }
  note(item, what) { this.log.push({ at: +this.now().toFixed(2), prio: item.prio, what, id: item.id }); if (this.log.length > 200) this.log.shift(); }
}
