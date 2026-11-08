/** User-provided provider settings, kept in chrome.storage.local (never bundled). */
export interface ProviderSettings {
  deepgramApiKey: string;
  openAiApiKey: string;
  translationProvider: "mymemory" | "openai";
  /** Translate to Vietnamese and show captions. Off = notes only (transcript, no translation). */
  translateEnabled: boolean;
  /** Mix the user's own microphone into the audio sent to STT. */
  includeMic: boolean;
}

const SETTINGS_STORAGE_KEY = "providerSettings";

const DEFAULTS: ProviderSettings = {
  deepgramApiKey: "",
  openAiApiKey: "",
  translationProvider: "mymemory",
  translateEnabled: true,
  includeMic: false,
};

/** Users sometimes paste a whole `.env` line (`NAME=value`) or a quoted value; keep only the key. */
export function normalizeApiKey(raw: string): string {
  const withoutName = raw.trim().replace(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, "");
  return withoutName.trim().replace(/^["']|["']$/g, "").trim();
}

export async function getProviderSettings(): Promise<ProviderSettings> {
  const stored = await chrome.storage.local.get([SETTINGS_STORAGE_KEY]);
  const settings = { ...DEFAULTS, ...(stored[SETTINGS_STORAGE_KEY] as Partial<ProviderSettings> | undefined) };
  return {
    ...settings,
    deepgramApiKey: normalizeApiKey(settings.deepgramApiKey),
    openAiApiKey: normalizeApiKey(settings.openAiApiKey),
  };
}

/** Merge a partial update into the latest stored settings (safe when popup and options are both open). */
export async function patchProviderSettings(patch: Partial<ProviderSettings>): Promise<ProviderSettings> {
  const next = { ...(await getProviderSettings()), ...patch };
  await saveProviderSettings(next);
  return next;
}

export async function saveProviderSettings(settings: ProviderSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}
