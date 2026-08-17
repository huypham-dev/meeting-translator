/**
 * AudioWorkletProcessor: downmixes tab audio to mono, resamples it (linear
 * interpolation) from the AudioContext's native sample rate (typically 44.1k
 * or 48k) down to 16kHz, converts to signed PCM16, and posts ~100ms chunks
 * back to the main (offscreen) thread as transferable ArrayBuffers.
 *
 * This file is intentionally plain JS (not bundled) because AudioWorklet
 * modules are loaded at runtime via `audioContext.audioWorklet.addModule(url)`
 * and must be a standalone script.
 */
class PCMDownsamplerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetSampleRate || 16000;
    this.chunkSamples = Math.round((this.targetRate * (opts.chunkMs || 100)) / 1000);
    // `sampleRate` is a global provided by the AudioWorkletGlobalScope.
    this.ratio = sampleRate / this.targetRate;

    this.buffer = new Float32Array(0);
    this.pos = 0;
    this.outChunk = new Int16Array(this.chunkSamples);
    this.outFill = 0;
    this.active = true;

    this.port.onmessage = (event) => {
      if (event.data === "stop") {
        this.active = false;
      }
    };
  }

  process(inputs) {
    if (!this.active) return false;

    const input = inputs[0];
    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      return true;
    }

    const channels = input.length;
    const frameLen = input[0].length;
    let mono = input[0];

    if (channels > 1) {
      mono = new Float32Array(frameLen);
      for (let ch = 0; ch < channels; ch++) {
        const data = input[ch];
        for (let i = 0; i < frameLen; i++) {
          mono[i] += data[i] / channels;
        }
      }
    }

    const unreadStart = Math.floor(this.pos);
    const tail = this.buffer.subarray(Math.min(unreadStart, this.buffer.length));
    const merged = new Float32Array(tail.length + mono.length);
    merged.set(tail, 0);
    merged.set(mono, tail.length);
    this.pos -= unreadStart;
    this.buffer = merged;

    while (this.pos + 1 < this.buffer.length) {
      const idx = Math.floor(this.pos);
      const frac = this.pos - idx;
      const s0 = this.buffer[idx];
      const s1 = this.buffer[idx + 1];
      const sample = s0 + (s1 - s0) * frac;
      const clamped = Math.max(-1, Math.min(1, sample));

      this.outChunk[this.outFill++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

      if (this.outFill >= this.chunkSamples) {
        this.port.postMessage(this.outChunk.buffer, [this.outChunk.buffer]);
        this.outChunk = new Int16Array(this.chunkSamples);
        this.outFill = 0;
      }

      this.pos += this.ratio;
    }

    return true;
  }
}

registerProcessor("pcm-downsampler", PCMDownsamplerProcessor);
