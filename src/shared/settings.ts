/** User-provided provider settings, kept in chrome.storage.local (never bundled). */
export interface ProviderSettings {
  deepgramApiKey: string;
  openAiApiKey: string;
  translationProvider: "mymemory" | "openai";
}

const SETTINGS_STORAGE_KEY = "providerSettings";

const DEFAULTS: ProviderSettings = {
  deepgramApiKey: "",
  openAiApiKey: "",
  translationProvider: "mymemory",
};

export async function getProviderSettings(): Promise<ProviderSettings> {
  const stored = await chrome.storage.local.get([SETTINGS_STORAGE_KEY]);
  return { ...DEFAULTS, ...(stored[SETTINGS_STORAGE_KEY] as Partial<ProviderSettings> | undefined) };
}

export async function saveProviderSettings(settings: ProviderSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}
