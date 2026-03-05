// src/SoundManager.js
// Audio playback (SYSTEM layer).
//
// Responsibilities:
// - Load sound assets during preload() (via loadSound)
// - Play sounds by key (SFX/music)
// - Provide a simple abstraction so gameplay code never touches audio directly
//
// Non-goals:
// - Does NOT subscribe to EventBus directly (Game wires events → play())
// - Does NOT decide when events happen (WORLD logic emits events)
// - Does NOT manage UI
//
// Architectural notes:
// - Game connects EventBus events (leaf:collected, player:damaged, etc.) to SoundManager.play().
// - This keeps audio concerns isolated from gameplay and supports easy swapping/muting.

export class SoundManager {
  constructor() {
    this.sfx = {};
  }

  load(name, path) {
    // Load with callback so we can mark readiness and optionally auto-start loops.
    try {
      const sf = loadSound(
        path,
        () => {
          try {
            sf._ready = true;
            if (sf._playWhenReady && typeof sf.loop === "function") {
              try {
                sf.loop();
              } catch (e) {}
            }
          } catch (e) {}
        },
        (err) => {
          // ignore load errors for robustness
        },
      );
      this.sfx[name] = sf;
    } catch (e) {
      // If loadSound throws synchronously, store a placeholder
      this.sfx[name] = null;
    }
  }

  play(name) {
    // Play preloaded sound if available, otherwise synthesize a short tone.
    const s = this.sfx[name];
    if (s && typeof s.play === "function") {
      try {
        s.play();
        return;
      } catch (e) {
        // fall through to synth fallback
      }
    }

    // Unlock audio if needed (p5 helper)
    if (typeof userStartAudio === "function") userStartAudio();

    // Simple WebAudio fallback tone mapping
    const freqMap = {
      leaf: 880,
      hurt: 220,
      die: 120,
      win: 1200,
      hit: 520,
      jump: 660,
    };

    const freq = freqMap[name] ?? 600;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(ctx.destination);
      const now = ctx.currentTime;
      // quick attack, exponential decay
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      o.start(now);
      o.stop(now + 0.25);
      // close context after sound finishes
      setTimeout(() => {
        try {
          ctx.close();
        } catch (e) {}
      }, 300);
    } catch (err) {
      // give up silently if AudioContext unavailable
    }
  }

  // Play a sound in loop mode (for background music)
  playLoop(name) {
    const s = this.sfx[name];
    if (s) {
      try {
        if (s._ready) {
          if (typeof s.loop === "function") {
            s.loop();
            return;
          }
          if (typeof s.play === "function") {
            s.play();
            return;
          }
        } else {
          // Not ready yet: mark to auto-loop when ready
          s._playWhenReady = true;
          return;
        }
      } catch (e) {
        // fall through to synth fallback
      }
    }

    // If no file, attempt a very simple continuous synth (best-effort)
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 440;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(ctx.destination);
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.15, now + 0.05);
      o.start(now);
      // store for stop
      this._loopOsc = { ctx, o, g };
    } catch (err) {}
  }

  stop(name) {
    const s = this.sfx[name];
    if (s) {
      try {
        s._playWhenReady = false;
        if (typeof s.stop === "function") {
          s.stop();
          return;
        }
      } catch (e) {}
    }

    if (this._loopOsc) {
      try {
        this._loopOsc.o.stop();
        this._loopOsc.ctx.close();
      } catch (e) {}
      this._loopOsc = null;
    }
  }
}