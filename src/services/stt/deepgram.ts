import { createLogger } from "@/shared/logger";
import type { TranscriptResult } from "@/shared/types";
import type { STTProviderConfig, StreamingSTTProvider } from "./types";

const log = createLogger("STT");

const DEEPGRAM_URL = "wss://api.deepgram.com/v1/listen";

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
}

interface DeepgramResultsMessage {
  type: "Results";
  is_final: boolean;
  channel: {
    alternatives: DeepgramAlternative[];
  };
}

interface DeepgramMetadataMessage {
  type: "Metadata";
}

interface DeepgramErrorMessage {
  type?: string;
  error?: string;
  description?: string;
}

type DeepgramMessage = DeepgramResultsMessage | DeepgramMetadataMessage | DeepgramErrorMessage;

/**
 * Streaming STT provider backed by Deepgram's live transcription WebSocket API.
 * Auth uses the Sec-WebSocket-Protocol handshake (`["token", apiKey]`) since the
 * browser WebSocket API cannot set an Authorization header directly.
 */
export class DeepgramSTTProvider implements StreamingSTTProvider {
  private ws: WebSocket | null = null;
  private transcriptCallback: ((result: TranscriptResult) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private closeCallback: (() => void) | null = null;
  private readonly config: STTProviderConfig;

  constructor(config: STTProviderConfig) {
    this.config = config;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config.apiKey) {
        reject(new Error("Missing Deepgram API key"));
        return;
      }

      const params = new URLSearchParams({
        encoding: "linear16",
        sample_rate: String(this.config.sampleRate),
        channels: "1",
        interim_results: "true",
        punctuate: "true",
        smart_format: "true",
        endpointing: "300",
        language: this.config.language ?? "en",
        // nova-2 accepts language=vi but returned only empty results for Vietnamese speech;
        // nova-3 lists Vietnamese as a monolingual language. English keeps the known-good nova-2.
        model: this.config.language === "vi" ? "nova-3" : "nova-2",
      });

      const url = `${DEEPGRAM_URL}?${params.toString()}`;

      let socket: WebSocket;
      try {
        socket = new WebSocket(url, ["token", this.config.apiKey]);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      socket.binaryType = "arraybuffer";

      const onOpen = () => {
        log.log("Deepgram WebSocket connected");
        socket.removeEventListener("error", onOpenError);
        resolve();
      };

      const onOpenError = () => {
        reject(new Error("Failed to connect to Deepgram (check API key / network)"));
      };

      socket.addEventListener("open", onOpen, { once: true });
      socket.addEventListener("error", onOpenError, { once: true });

      socket.addEventListener("message", (event: MessageEvent) => {
        this.handleMessage(event);
      });

      socket.addEventListener("error", () => {
        log.error("Deepgram WebSocket error");
        this.errorCallback?.(new Error("Deepgram WebSocket error"));
      });

      socket.addEventListener("close", (event: CloseEvent) => {
        log.log("Deepgram WebSocket closed", event.code, event.reason);
        this.closeCallback?.();
      });

      this.ws = socket;
    });
  }

  private handleMessage(event: MessageEvent) {
    if (typeof event.data !== "string") return;

    let msg: DeepgramMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if ("error" in msg && msg.error) {
      log.error("Deepgram error message", msg.error, msg.description);
      this.errorCallback?.(new Error(msg.description ?? msg.error));
      return;
    }

    if (!("channel" in msg) || msg.type !== "Results") return;

    const alt = msg.channel?.alternatives?.[0];
    if (!alt || !alt.transcript) return;

    this.transcriptCallback?.({
      text: alt.transcript,
      isFinal: msg.is_final,
      confidence: alt.confidence,
    });
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(chunk);
  }

  onTranscript(callback: (result: TranscriptResult) => void): void {
    this.transcriptCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  onClose(callback: () => void): void {
    this.closeCallback = callback;
  }

  close(): void {
    if (!this.ws) return;
    try {
      if (this.ws.readyState === WebSocket.OPEN) {
        // Tells Deepgram to flush + finalize before closing the socket.
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      this.ws.close();
    } catch (err) {
      log.warn("Error closing Deepgram socket", err);
    }
    this.ws = null;
  }
}
