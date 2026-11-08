import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { getProviderSettings, normalizeApiKey, patchProviderSettings, type ProviderSettings } from "@/shared/settings";

const field: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #3a3a3e",
  background: "#2c2c2e",
  color: "#fff",
  fontSize: 14,
  fontFamily: "inherit",
};

const label: CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 };
const hint: CSSProperties = { fontSize: 12, color: "#9a9a9e", margin: "4px 0 0", lineHeight: 1.4 };

export function Options() {
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [micError, setMicError] = useState("");

  useEffect(() => {
    getProviderSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  const update = (patch: Partial<ProviderSettings>) => {
    setSaved(false);
    setSettings({ ...settings, ...patch });
  };

  // Offscreen documents cannot show a permission prompt, so ask here once.
  const toggleMic = async (enabled: boolean) => {
    setMicError("");
    if (enabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        setMicError("Microphone permission was denied. Allow it for this extension in Chrome site settings.");
        return;
      }
    }
    update({ includeMic: enabled });
    void patchProviderSettings({ includeMic: enabled });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    patchProviderSettings({
      deepgramApiKey: normalizeApiKey(settings.deepgramApiKey),
      openAiApiKey: normalizeApiKey(settings.openAiApiKey),
      translationProvider: settings.translationProvider,
    }).then(() => setSaved(true));
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 520, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Meet Live Translator settings</h1>
      <p style={{ ...hint, marginBottom: 24 }}>
        Your keys are stored only in this browser and are sent only to the provider they belong to.
      </p>

      <div style={{ marginBottom: 20 }}>
        <label htmlFor="deepgram" style={label}>
          Deepgram API key (required)
        </label>
        <input
          id="deepgram"
          type="password"
          autoComplete="off"
          value={settings.deepgramApiKey}
          onChange={(e) => update({ deepgramApiKey: e.target.value })}
          style={field}
        />
        <p style={hint}>
          Used for speech-to-text. Tab audio is streamed to Deepgram while you translate. Get a key at
          console.deepgram.com.
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label htmlFor="provider" style={label}>
          Translation provider
        </label>
        <select
          id="provider"
          value={settings.translationProvider}
          onChange={(e) => update({ translationProvider: e.target.value as ProviderSettings["translationProvider"] })}
          style={field}
        >
          <option value="mymemory">MyMemory (free, no key)</option>
          <option value="openai">OpenAI (better quality, needs key)</option>
        </select>
        <p style={hint}>Caption text is sent to the provider you choose to be translated.</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label htmlFor="openai" style={label}>
          OpenAI API key (optional)
        </label>
        <input
          id="openai"
          type="password"
          autoComplete="off"
          value={settings.openAiApiKey}
          onChange={(e) => update({ openAiApiKey: e.target.value })}
          style={field}
        />
        <p style={hint}>
          Needed for the OpenAI translation provider, Ask AI, and meeting summaries. Transcript text is sent to
          OpenAI only when you use those features.
        </p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.includeMic}
            onChange={(e) => void toggleMic(e.target.checked)}
          />
          Include my microphone
        </label>
        <p style={hint}>
          Adds your own voice to the transcript and notes. It is mixed into the same Deepgram stream, so speakers are
          not labelled. Use headphones to avoid the mic re-capturing the meeting audio.
        </p>
        {micError && <p style={{ ...hint, color: "#ff453a" }}>{micError}</p>}
      </div>

      <button
        type="submit"
        style={{
          padding: "10px 20px",
          borderRadius: 10,
          border: "none",
          background: "#0a84ff",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Save
      </button>
      {saved && (
        <span role="status" style={{ marginLeft: 12, fontSize: 13, color: "#34c759" }}>
          Saved
        </span>
      )}
    </form>
  );
}
