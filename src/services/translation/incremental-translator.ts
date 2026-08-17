import { createLogger } from "@/shared/logger";
import type { CaptionState } from "@/shared/types";
import type { TranslationProvider } from "./types";

const log = createLogger("Translation");

const DEBOUNCE_MS = 150;

/**
 * Wraps a TranslationProvider to turn a stream of interim/final transcripts
 * into a single, continuously-updating caption.
 *
 * - Debounces bursts of interim transcripts (~150ms).
 * - Skips translation calls when the source text hasn't meaningfully changed.
 * - Uses a monotonically increasing version counter so a slow, stale
 *   response can never overwrite a newer caption ("last write wins" by
 *   request order, not response order).
 */
export class IncrementalTranslator {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRequestedText = "";
  private version = 0;
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

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    const run = () => this.translateAndEmit(trimmed, isFinal);

    if (isFinal) {
      // Finals should not wait behind the debounce window.
      run();
    } else {
      this.debounceTimer = setTimeout(run, DEBOUNCE_MS);
    }
  }

  private async translateAndEmit(text: string, isFinal: boolean) {
    if (text === this.lastRequestedText) return;
    this.lastRequestedText = text;

    const version = ++this.version;

    try {
      const translated = await this.provider.translate(text, this.sourceLanguage, this.targetLanguage);

      if (version !== this.version) {
        log.log("Discarding stale translation response");
        return;
      }

      this.updateCallback?.({ source: text, translated, isFinal });
    } catch (err) {
      log.error("Translation failed", err);
    }
  }

  reset(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.lastRequestedText = "";
    this.version++;
  }
}
