import { useEffect, useState } from "react";
import { isExtensionMessage, MessageType } from "@/shared/messages";
import { SHOW_SOURCE_STORAGE_KEY, type TranslationStatus } from "@/shared/types";

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

const CONTEXT_STORAGE_KEY = "translationContext";

export function Popup() {
  const [status, setStatus] = useState<TranslationStatus>("idle");
  const [message, setMessage] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState("");
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: MessageType.GET_STATUS }).then((res) => {
      if (res?.status) {
        setStatus(res.status);
        setMessage(res.message);
      }
    });

    chrome.storage.local.get([SHOW_SOURCE_STORAGE_KEY]).then((stored) => {
      setShowSource(stored[SHOW_SOURCE_STORAGE_KEY] === true);
    });

    chrome.storage.local.get([CONTEXT_STORAGE_KEY]).then((stored) => {
      if (typeof stored[CONTEXT_STORAGE_KEY] === "string") {
        setContext(stored[CONTEXT_STORAGE_KEY]);
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

  const handleContextChange = (value: string) => {
    setContext(value);
    chrome.storage.local.set({ [CONTEXT_STORAGE_KEY]: value });
  };

  const handleShowSourceChange = (value: boolean) => {
    setShowSource(value);
    chrome.storage.local.set({ [SHOW_SOURCE_STORAGE_KEY]: value });
  };

  const handleClick = () => {
    setBusy(true);
    if (isListening) {
      chrome.runtime.sendMessage({ type: MessageType.STOP_TRANSLATION }).finally(() => setBusy(false));
    } else {
      const trimmed = context.trim();
      chrome.runtime
        .sendMessage({
          type: MessageType.START_TRANSLATION,
          payload: trimmed ? { context: trimmed } : undefined,
        })
        .finally(() => setBusy(false));
    }
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

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: "#9a9a9e", display: "block", marginBottom: 4 }}>
          Context / thuật ngữ (tuỳ chọn)
        </label>
        <textarea
          value={context}
          onChange={(e) => handleContextChange(e.target.value)}
          disabled={isListening}
          placeholder="VD: cuộc họp sprint planning, tên: An, Bình; dự án: Falcon"
          rows={3}
          style={{
            width: "100%",
            resize: "vertical",
            fontSize: 12,
            fontFamily: "inherit",
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid #3a3a3e",
            background: isListening ? "#1c1c1e" : "#2c2c2e",
            color: "#fff",
            boxSizing: "border-box",
          }}
        />
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 13,
          marginBottom: 14,
          cursor: "pointer",
        }}
      >
        <span>Hiện tiếng Anh gốc</span>
        <input
          type="checkbox"
          checked={showSource}
          onChange={(e) => handleShowSourceChange(e.target.checked)}
        />
      </label>

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
        onClick={() => chrome.runtime.openOptionsPage()}
        style={{
          width: "100%",
          marginBottom: 10,
          padding: "8px 0",
          borderRadius: 10,
          border: "1px solid #3a3a3e",
          background: "transparent",
          color: "#f2f2f2",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Settings (API keys)
      </button>

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
