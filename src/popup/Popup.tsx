import { useEffect, useState } from "react";
import { isExtensionMessage, MessageType } from "@/shared/messages";
import type { TranslationStatus } from "@/shared/types";

const STATUS_LABEL: Record<TranslationStatus, string> = {
  idle: "Ready",
  starting: "Starting...",
  listening: "● Listening",
  error: "Error",
  stopping: "Stopping...",
};

const STATUS_COLOR: Record<TranslationStatus, string> = {
  idle: "#9a9a9e",
  starting: "#f5c518",
  listening: "#34c759",
  error: "#ff453a",
  stopping: "#9a9a9e",
};

export function Popup() {
  const [status, setStatus] = useState<TranslationStatus>("idle");
  const [message, setMessage] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_STATUS }).then((res) => {
      if (res?.status) {
        setStatus(res.status);
        setMessage(res.message);
      }
    });

    const listener = (msg: unknown) => {
      if (!isExtensionMessage(msg)) return;
      if (msg.type === MessageType.STATUS_UPDATE) {
        setStatus(msg.payload.status);
        setMessage(msg.payload.message);
        setBusy(false);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const isListening = status === "listening" || status === "starting";

  const handleClick = () => {
    setBusy(true);
    const type = isListening ? MessageType.STOP_TRANSLATION : MessageType.START_TRANSLATION;
    chrome.runtime.sendMessage({ type }).finally(() => setBusy(false));
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Meet Live Translator</div>
      <div style={{ fontSize: 12, color: "#9a9a9e", marginBottom: 14 }}>English → Vietnamese</div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          marginBottom: 14,
          color: STATUS_COLOR[status],
        }}
      >
        <span>{STATUS_LABEL[status]}</span>
      </div>

      {status === "error" && message && (
        <div
          style={{
            fontSize: 12,
            color: "#ff453a",
            background: "rgba(255,69,58,0.12)",
            borderRadius: 8,
            padding: "8px 10px",
            marginBottom: 14,
          }}
        >
          {message}
        </div>
      )}

      <button
        onClick={handleClick}
        disabled={busy || status === "stopping"}
        style={{
          width: "100%",
          padding: "10px 0",
          borderRadius: 10,
          border: "none",
          fontSize: 14,
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
          background: isListening ? "#ff453a" : "#0a84ff",
          color: "#fff",
          opacity: busy || status === "stopping" ? 0.6 : 1,
        }}
      >
        {isListening ? "Stop" : "Start Translation"}
      </button>
    </div>
  );
}
