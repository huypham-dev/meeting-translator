import { useEffect, useRef, useState } from "react";
import { isExtensionMessage, MessageType } from "@/shared/messages";
import { SHOW_SOURCE_STORAGE_KEY } from "@/shared/types";

/** Most caption lines on screen at once, like Google Meet's own captions. */
const MAX_LINES = 3;
/** Silence after the last update before every remaining line fades out. */
const IDLE_FADE_MS = 4000;
/** Must match the opacity transition on .caption-line in styles.css. */
const FADE_MS = 600;

interface Line {
  id: number;
  source: string;
  translated: string;
  live: boolean;
  fading: boolean;
}

let nextId = 0;

/**
 * Interim translations get rewritten wholesale by the provider. To keep the
 * text from jumping, the part already on screen is never edited: when the new
 * text doesn't extend it, only the words beyond what is shown are appended.
 * The final translation replaces everything once the sentence is done.
 */
function appendOnly(shown: string, next: string): string {
  if (!shown || next.startsWith(shown)) return next;
  const shownWords = shown.split(/\s+/);
  const nextWords = next.split(/\s+/);
  if (nextWords.length <= shownWords.length) return shown;
  return [...shownWords, ...nextWords.slice(shownWords.length)].join(" ");
}

export function CaptionOverlay() {
  const [lines, setLines] = useState<Line[]>([]);
  const [showSource, setShowSource] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    chrome.storage.local.get([SHOW_SOURCE_STORAGE_KEY]).then((stored) => {
      setShowSource(stored[SHOW_SOURCE_STORAGE_KEY] === true);
    });
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (SHOW_SOURCE_STORAGE_KEY in changes) {
        setShowSource(changes[SHOW_SOURCE_STORAGE_KEY].newValue === true);
      }
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, []);

  useEffect(() => {
    const removeFaded = () => setLines((prev) => prev.filter((l) => !l.fading));

    const scheduleIdleFade = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        setLines((prev) => prev.map((l) => ({ ...l, fading: true })));
        setTimeout(removeFaded, FADE_MS);
      }, IDLE_FADE_MS);
    };

    const listener = (message: unknown) => {
      if (!isExtensionMessage(message)) return;

      if (message.type === MessageType.TRANSLATION_UPDATE) {
        const { source, translated, isFinal } = message.payload;
        if (!translated.trim()) return;

        setLines((prev) => {
          const current = prev.find((l) => l.live);
          let next: Line[];

          if (isFinal) {
            const finished: Line = {
              id: current?.id ?? nextId++,
              source,
              translated,
              live: false,
              fading: false,
            };
            next = current ? prev.map((l) => (l.live ? finished : l)) : [...prev, finished];
          } else if (current) {
            next = prev.map((l) =>
              l.live ? { ...l, source, translated: appendOnly(l.translated, translated) } : l
            );
          } else {
            next = [...prev, { id: nextId++, source, translated, live: true, fading: false }];
          }

          // Fade the oldest lines beyond the cap, then drop them after the transition.
          const visible = next.filter((l) => !l.fading);
          const overflow = visible.length - MAX_LINES;
          if (overflow > 0) {
            const doomed = new Set(visible.slice(0, overflow).map((l) => l.id));
            setTimeout(removeFaded, FADE_MS);
            next = next.map((l) => (doomed.has(l.id) ? { ...l, fading: true } : l));
          }
          return next;
        });
        scheduleIdleFade();
      }

      if (message.type === MessageType.CLEAR_CAPTION) {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        setLines([]);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  const visible = lines.some((l) => !l.fading);

  return (
    <div className={`caption-container ${visible ? "visible" : ""}`}>
      <div className="caption-box">
        {lines.map((line) => (
          <div
            key={line.id}
            className={`caption-line${line.live ? " live" : ""}${line.fading ? " fading" : ""}`}
          >
            {showSource && <div className="caption-source">{line.source}</div>}
            {/* Keyed on the final flag so the interim -> final swap replays the cross-fade. */}
            <div key={line.live ? "interim" : "final"} className={line.live ? undefined : "caption-final"}>
              {line.translated}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
