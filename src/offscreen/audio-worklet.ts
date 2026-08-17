/**
 * The actual AudioWorkletProcessor lives at `public/worklets/audio-processor.js`
 * (plain JS, not bundled) because AudioWorklet modules are loaded at runtime
 * via `audioContext.audioWorklet.addModule(url)` as standalone scripts and
 * can't be part of the normal Vite/Rollup module graph.
 *
 * This module just centralizes the constants both sides (worklet + offscreen)
 * need to agree on.
 */
export const WORKLET_URL = "worklets/audio-processor.js";
export const WORKLET_PROCESSOR_NAME = "pcm-downsampler";
