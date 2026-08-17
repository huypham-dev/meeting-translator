import type { TranscriptResult } from "@/shared/types";

export interface StreamingSTTProvider {
  connect(): Promise<void>;
  sendAudio(chunk: ArrayBuffer): void;
  onTranscript(callback: (result: TranscriptResult) => void): void;
  onError(callback: (error: Error) => void): void;
  onClose(callback: () => void): void;
  close(): void;
}

export interface STTProviderConfig {
  apiKey: string;
  sampleRate: number;
  language?: string;
}
