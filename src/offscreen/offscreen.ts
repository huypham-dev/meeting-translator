import { createLogger } from "@/shared/logger";
import { isExtensionMessage, MessageType, type ExtensionMessage } from "@/shared/messages";
import type { ProviderSettings } from "@/shared/settings";
import { PCM_CHUNK_MS, PCM_SAMPLE_RATE, type CaptionState, type SourceLanguage } from "@/shared/types";
import { DeepgramSTTProvider } from "@/services/stt/deepgram";
import type { StreamingSTTProvider } from "@/services/stt/types";
import { createTranslationProvider } from "@/services/translation/providers";
import { IncrementalTranslator } from "@/services/translation/incremental-translator";
import { WORKLET_PROCESSOR_NAME, WORKLET_URL } from "./audio-worklet";

const log = createLogger("Audio");
const sttLog = createLogger("STT");

const TARGET_LANGUAGE = "vi";

let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let micStream: MediaStream | null = null;
let micSourceNode: MediaStreamAudioSourceNode | null = null;
let sttProvider: StreamingSTTProvider | null = null;
let translator: IncrementalTranslator | null = null;
let stopping = false;
// Kept so a language switch can reconnect STT without a new INIT_CAPTURE.
let currentSettings: ProviderSettings | null = null;
let currentContext: string | undefined;
let languageSwitchId = 0;

function sendToBackground(message: ExtensionMessage) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Background may not have a listener attached at this exact instant; safe to ignore.
  });
}

function reportStatus(status: "starting" | "listening" | "error", message?: string) {
  sendToBackground({ type: MessageType.STATUS_UPDATE, payload: { status, message } });
}

/**
 * Opens the STT socket for `language` and wires its results to the background.
 * English is translated to Vietnamese (when Translate is on). Vietnamese is
 * notes-only: the source text is forwarded with an empty translation, which the
 * overlay skips, while notes and Ask AI only need the source.
 */
async function openStt(language: SourceLanguage, settings: ProviderSettings, context?: string): Promise<void> {
  const stt = new DeepgramSTTProvider({
    apiKey: settings.deepgramApiKey,
    sampleRate: PCM_SAMPLE_RATE,
    language,
  });
  sttProvider = stt;

  let activeTranslator: IncrementalTranslator | null = null;
  if (settings.translateEnabled && language === "en") {
    const provider = createTranslationProvider(settings.translationProvider, {
      openAiApiKey: settings.openAiApiKey,
      context,
    });
    activeTranslator = new IncrementalTranslator(provider, language, TARGET_LANGUAGE);
    activeTranslator.onUpdate((state: CaptionState) => {
      sendToBackground({ type: MessageType.TRANSLATION_UPDATE, payload: { ...state, language } });
    });
  }
  translator = activeTranslator;

  // After a language switch the old socket may still deliver a message or close:
  // ignore anything that is not from the current provider.
  stt.onTranscript((result) => {
    if (sttProvider !== stt) return;
    sendToBackground({ type: MessageType.TRANSCRIPT_UPDATE, payload: result });
    if (activeTranslator) {
      activeTranslator.update(result.text, result.isFinal);
    } else if (result.text.trim()) {
      sendToBackground({
        type: MessageType.TRANSLATION_UPDATE,
        payload: { source: result.text.trim(), translated: "", isFinal: result.isFinal, language },
      });
    }
  });

  stt.onError((error) => {
    if (sttProvider !== stt) return;
    sttLog.error(error.message);
    reportStatus("error", `STT error: ${error.message}`);
  });

  stt.onClose(() => {
    if (!stopping && sttProvider === stt) {
      sttLog.warn("STT connection closed unexpectedly");
      reportStatus("error", "STT connection lost");
    }
  });

  await stt.connect();
}

/** Reconnects only the STT socket for a new spoken language; the audio pipeline keeps running. */
async function switchLanguage(language: SourceLanguage): Promise<void> {
  if (!audioContext || !currentSettings) return; // nothing is being captured
  const switchId = ++languageSwitchId;

  const previous = sttProvider;
  sttProvider = null;
  translator?.reset();
  translator = null;
  previous?.close();

  currentSettings = { ...currentSettings, sourceLanguage: language };
  try {
    await openStt(language, currentSettings, currentContext);
    reportStatus("listening");
  } catch (err) {
    // A newer switch superseded this one and closed its socket: not a real failure.
    if (switchId !== languageSwitchId) return;
    log.error("STT reconnect after language switch failed", err);
    reportStatus("error", err instanceof Error ? err.message : "Failed to reconnect to STT service");
    await stopCapture();
    throw err;
  }
}

async function startCapture(streamId: string, _tabId: number, settings: ProviderSettings, context?: string): Promise<void> {
  if (audioContext) {
    log.warn("Capture already active, stopping previous session first");
    await stopCapture();
  }

  stopping = false;
  reportStatus("starting");

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      } as unknown as MediaTrackConstraints,
      video: false,
    });
  } catch (err) {
    log.error("getUserMedia (tab capture) failed", err);
    reportStatus("error", "Failed to capture tab audio");
    throw err;
  }

  try {
    audioContext = new AudioContext();
    await audioContext.audioWorklet.addModule(chrome.runtime.getURL(WORKLET_URL));

    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    // Route captured audio back to the speakers so the user keeps hearing
    // the meeting; this is the *same* stream being tapped, so there's no
    // duplicate playback / echo introduced.
    sourceNode.connect(audioContext.destination);

    workletNode = new AudioWorkletNode(audioContext, WORKLET_PROCESSOR_NAME, {
      processorOptions: {
        targetSampleRate: PCM_SAMPLE_RATE,
        chunkMs: PCM_CHUNK_MS,
      },
    });

    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      sttProvider?.sendAudio(event.data);
    };

    sourceNode.connect(workletNode);

    // The user's own voice is not in the tab audio. Feed the mic into the same
    // worklet input (inputs are summed) but never to the speakers, to avoid echo.
    if (settings.includeMic) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        micSourceNode = audioContext.createMediaStreamSource(micStream);
        micSourceNode.connect(workletNode);
      } catch (err) {
        log.warn("Microphone unavailable, continuing with tab audio only", err);
      }
    }
  } catch (err) {
    log.error("AudioContext/AudioWorklet setup failed", err);
    reportStatus("error", "Audio processing pipeline failed to start");
    await stopCapture();
    throw err;
  }

  currentSettings = settings;
  currentContext = context;

  try {
    await openStt(settings.sourceLanguage, settings, context);
  } catch (err) {
    log.error("STT connection failed", err);
    reportStatus("error", err instanceof Error ? err.message : "Failed to connect to STT service");
    await stopCapture();
    throw err;
  }

  reportStatus("listening");
  log.log("Capture pipeline started");
}

async function stopCapture(): Promise<void> {
  stopping = true;
  currentSettings = null;
  currentContext = undefined;

  try {
    sttProvider?.close();
  } catch (err) {
    log.warn("Error closing STT provider", err);
  }
  sttProvider = null;

  translator?.reset();
  translator = null;

  if (workletNode) {
    try {
      workletNode.port.postMessage("stop");
      workletNode.disconnect();
    } catch {
      /* noop */
    }
    workletNode = null;
  }

  if (micSourceNode) {
    try {
      micSourceNode.disconnect();
    } catch {
      /* noop */
    }
    micSourceNode = null;
  }

  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }

  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch {
      /* noop */
    }
    sourceNode = null;
  }

  if (audioContext) {
    try {
      await audioContext.close();
    } catch {
      /* noop */
    }
    audioContext = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  log.log("Capture pipeline stopped, resources released");
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) return undefined;

  if (message.type === MessageType.INIT_CAPTURE) {
    startCapture(message.payload.streamId, message.payload.tabId, message.payload.settings, message.payload.context)
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    return true;
  }

  if (message.type === MessageType.SET_SOURCE_LANGUAGE) {
    switchLanguage(message.payload.language)
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    return true;
  }

  if (message.type === MessageType.STOP_CAPTURE) {
    stopCapture()
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    return true;
  }

  return undefined;
});

sendToBackground({ type: MessageType.OFFSCREEN_READY });
log.log("Offscreen document ready");
