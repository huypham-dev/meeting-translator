import { createLogger } from "@/shared/logger";
import type { CaptionState } from "@/shared/types";
import type { TranslationProvider } from "./types";

const log = createLogger("Translation");

const THROTTLE_MS = 200;

/**
 * Wraps a TranslationProvider to turn a stream of interim/final transcripts
 * into a single, continuously-updating caption.
 *
 * - Throttles interim transcripts (at most one request per THROTTLE_MS, and at
 *   most one interim request in flight) so a slow provider never builds a queue.
 * - Skips translation calls when the source text hasn't changed.
 * - Every request gets an increasing version. A response is emitted only if it
 *   is newer than the last one emitted, so a late interim can never overwrite a
 *   newer caption, while a response that is merely not the latest still shows.
 *   (Dropping everything but the latest starves the caption during continuous
 *   speech, because new requests are issued faster than responses return.)
 * - Finals are sent immediately, even while an interim is in flight.
 */
export class IncrementalTranslator {
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private latestInterim = "";
  private lastRequestedText = "";
  private interimInFlight = false;
  private version = 0;
  private lastEmittedVersion = 0;
  private updateCallback: ((state: CaptionState) => void) | null = null;

  constructor(
    private readonly provider: TranslationProvider,
    private readonly sourceLanguage: string,
    private readonly targetLanguage: string
  ) {}

  onUpdate(callback: (state: CaptionState) => void): void {
    this.updateCallback = callback;
  }

  /** Feed a new transcript (interim or final) from the STT provider. */
  update(text: string, isFinal: boolean): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (isFinal) {
      if (this.throttleTimer) clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
      this.latestInterim = "";
      void this.translateAndEmit(trimmed, true);
      return;
    }

    this.latestInterim = trimmed;
    this.scheduleInterim();
  }

  private scheduleInterim(): void {
    if (this.throttleTimer || this.interimInFlight) return;
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      const text = this.latestInterim;
      if (text) void this.translateAndEmit(text, false);
    }, THROTTLE_MS);
  }

  private async translateAndEmit(text: string, isFinal: boolean) {
    if (!isFinal && text === this.lastRequestedText) return;
    this.lastRequestedText = text;

    const version = ++this.version;
    if (!isFinal) this.interimInFlight = true;

    try {
      const translated = await this.provider.translate(text, this.sourceLanguage, this.targetLanguage);

      if (version < this.lastEmittedVersion) {
        log.log("Discarding stale translation response");
        return;
      }
      this.lastEmittedVersion = version;

      this.updateCallback?.({ source: text, translated, isFinal });
    } catch (err) {
      log.error("Translation failed", err);
    } finally {
      if (!isFinal) {
        this.interimInFlight = false;
        // Speech moved on while this request was in flight: send the newest text.
        if (this.latestInterim && this.latestInterim !== this.lastRequestedText) this.scheduleInterim();
      }
    }
  }

  reset(): void {
    if (this.throttleTimer) clearTimeout(this.throttleTimer);
    this.throttleTimer = null;
    this.latestInterim = "";
    this.lastRequestedText = "";
    this.interimInFlight = false;
    this.version++;
    this.lastEmittedVersion = this.version;
  }
}
