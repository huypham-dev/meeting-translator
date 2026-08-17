import { useEffect, useState } from "react";
import { isExtensionMessage, MessageType } from "@/shared/messages";

/** Finalized lines kept on screen, oldest dropped first; plus 1 live (in-progress) line. */
const MAX_HISTORY_LINES = 4;

export function CaptionOverlay() {
  const [history, setHistory] = useState<string[]>([]);
  const [live, setLive] = useState("");

  useEffect(() => {
    const listener = (message: unknown) => {
      if (!isExtensionMessage(message)) return;

      if (message.type === MessageType.TRANSLATION_UPDATE) {
        const { translated, isFinal } = message.payload;

        if (isFinal) {
          setHistory((prev) => [...prev, translated].filter(Boolean).slice(-MAX_HISTORY_LINES));
          setLive("");
        } else {
          setLive(translated);
        }
      }

      if (message.type === MessageType.CLEAR_CAPTION) {
        setHistory([]);
        setLive("");
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const lines = live ? [...history, live] : history;
  const visible = lines.length > 0;

  return (
    <div className={`caption-container ${visible ? "visible" : ""}`}>
      <div className="caption-box">
        {lines.map((line, i) => (
          <div key={i} className={i === lines.length - 1 && live ? "caption-line live" : "caption-line"}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
