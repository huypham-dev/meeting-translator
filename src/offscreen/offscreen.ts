import { createLogger } from "@/shared/logger";
import { isExtensionMessage, MessageType, type ExtensionMessage } from "@/shared/messages";
import type { ProviderSettings } from "@/shared/settings";
import { PCM_CHUNK_MS, PCM_SAMPLE_RATE, type CaptionState } from "@/shared/types";
import { DeepgramSTTProvider } from "@/services/stt/deepgram";
import type { StreamingSTTProvider } from "@/services/stt/types";
import { createTranslationProvider } from "@/services/translation/providers";
import { IncrementalTranslator } from "@/services/translation/incremental-translator";
import { WORKLET_PROCESSOR_NAME, WORKLET_URL } from "./audio-worklet";

const log = createLogger("Audio");
const sttLog = createLogger("STT");

const SOURCE_LANGUAGE = "en";
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

function sendToBackground(message: ExtensionMessage) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Background may not have a listener attached at this exact instant; safe to ignore.
  });
}

function reportStatus(status: "starting" | "listening" | "error", message?: string) {
  sendToBackground({ type: MessageType.STATUS_UPDATE, payload: { status, message } });
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

  try {
    sttProvider = new DeepgramSTTProvider({
      apiKey: settings.deepgramApiKey,
      sampleRate: PCM_SAMPLE_RATE,
      language: SOURCE_LANGUAGE,
    });

    const provider = createTranslationProvider(settings.translationProvider, {
      openAiApiKey: settings.openAiApiKey,
      context,
    });
    translator = new IncrementalTranslator(provider, SOURCE_LANGUAGE, TARGET_LANGUAGE);

    translator.onUpdate((state: CaptionState) => {
      sendToBackground({ type: MessageType.TRANSLATION_UPDATE, payload: state });
    });

    sttProvider.onTranscript((result) => {
      sendToBackground({ type: MessageType.TRANSCRIPT_UPDATE, payload: result });
      translator?.update(result.text, result.isFinal);
    });

    sttProvider.onError((error) => {
      sttLog.error(error.message);
      reportStatus("error", `STT error: ${error.message}`);
    });

    sttProvider.onClose(() => {
      if (!stopping) {
        sttLog.warn("STT connection closed unexpectedly");
        reportStatus("error", "STT connection lost");
      }
    });

    await sttProvider.connect();
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
