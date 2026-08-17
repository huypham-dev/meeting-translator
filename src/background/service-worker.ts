import { createLogger } from "@/shared/logger";
import { isExtensionMessage, MessageType, type ExtensionMessage } from "@/shared/messages";
import type { TranslationStatus } from "@/shared/types";

const log = createLogger("Background");

const OFFSCREEN_DOCUMENT_PATH = "src/offscreen/offscreen.html";
const MEET_URL_PATTERN = "https://meet.google.com/*";

// Cached in-memory, but always backed by chrome.storage.session: MV3 service
// workers can be killed and restarted mid-session (e.g. after ~30s idle),
// which would otherwise silently lose track of which tab to caption.
let currentTabId: number | null = null;

async function getCurrentTabId(): Promise<number | null> {
  if (currentTabId !== null) return currentTabId;
  const stored = await chrome.storage.session.get(["tabId"]);
  currentTabId = (stored.tabId as number | undefined) ?? null;
  return currentTabId;
}

async function setCurrentTabId(tabId: number | null): Promise<void> {
  currentTabId = tabId;
  await chrome.storage.session.set({ tabId });
}

async function getStatus(): Promise<{ status: TranslationStatus; message?: string }> {
  const stored = await chrome.storage.session.get(["status", "message"]);
  return {
    status: (stored.status as TranslationStatus) ?? "idle",
    message: stored.message as string | undefined,
  };
}

async function setStatus(status: TranslationStatus, message?: string): Promise<void> {
  await chrome.storage.session.set({ status, message });
  broadcast({ type: MessageType.STATUS_UPDATE, payload: { status, message } });
  log.log("status ->", status, message ?? "");
}

function broadcast(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // No receiver currently listening (e.g. popup closed) - safe to ignore.
  });
}

async function hasOffscreenDocument(): Promise<boolean> {
  if ("getContexts" in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    return contexts.length > 0;
  }
  return chrome.offscreen.hasDocument();
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capture Google Meet tab audio and stream it to a speech-to-text service for live captions.",
  });
}

async function closeOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

async function findMeetTab(): Promise<chrome.tabs.Tab | null> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.url?.startsWith("https://meet.google.com/")) {
    return activeTab;
  }

  const meetTabs = await chrome.tabs.query({ url: MEET_URL_PATTERN });
  return meetTabs[0] ?? null;
}

async function startTranslation(): Promise<void> {
  const { status } = await getStatus();
  if (status === "starting" || status === "listening") {
    log.warn("startTranslation called while already", status);
    return;
  }

  await setStatus("starting");

  const tab = await findMeetTab();
  if (!tab?.id) {
    await setStatus("error", "Open a Google Meet call first, then click Start.");
    return;
  }

  await setCurrentTabId(tab.id);

  try {
    await ensureOffscreenDocument();

    const streamId = await new Promise<string>((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
        if (chrome.runtime.lastError || !id) {
          reject(new Error(chrome.runtime.lastError?.message ?? "Failed to get tab capture stream id"));
          return;
        }
        resolve(id);
      });
    });

    const response = await chrome.runtime.sendMessage({
      type: MessageType.INIT_CAPTURE,
      payload: { streamId, tabId: tab.id },
    } satisfies ExtensionMessage);

    if (!response?.ok) {
      throw new Error(response?.error ?? "Offscreen document failed to start capture");
    }
    // Final "listening" status is reported by the offscreen document once the
    // STT WebSocket confirms connection - see STATUS_UPDATE handling below.
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("startTranslation failed:", message);
    await setStatus("error", message);
    await stopTranslation();
  }
}

async function stopTranslation(): Promise<void> {
  await setStatus("stopping");

  try {
    if (await hasOffscreenDocument()) {
      await chrome.runtime.sendMessage({ type: MessageType.STOP_CAPTURE } satisfies ExtensionMessage);
    }
  } catch (err) {
    log.warn("Error signaling offscreen to stop:", err);
  }

  await closeOffscreenDocument();

  const tabId = await getCurrentTabId();
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { type: MessageType.CLEAR_CAPTION }).catch(() => {
      // Content script may already be gone (tab closed/navigated) - ignore.
    });
  }

  await setCurrentTabId(null);
  await setStatus("idle");
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) return undefined;

  switch (message.type) {
    case MessageType.START_TRANSLATION:
      startTranslation().then(() => sendResponse({ ok: true }));
      return true;

    case MessageType.STOP_TRANSLATION:
      stopTranslation().then(() => sendResponse({ ok: true }));
      return true;

    case MessageType.GET_STATUS:
      getStatus().then((s) => sendResponse(s));
      return true;

    case MessageType.STATUS_UPDATE:
      setStatus(message.payload.status, message.payload.message);
      return undefined;

    case MessageType.TRANSLATION_UPDATE:
      getCurrentTabId().then((tabId) => {
        if (!tabId) return;
        chrome.tabs.sendMessage(tabId, message).catch((err) => {
          log.warn("Failed to deliver caption to content script:", err);
        });
      });
      return undefined;

    case MessageType.OFFSCREEN_READY:
      log.log("Offscreen document reported ready");
      return undefined;

    default:
      return undefined;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getCurrentTabId().then((current) => {
    if (tabId === current) {
      log.log("Google Meet tab closed, stopping translation");
      stopTranslation();
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.set({ status: "idle" satisfies TranslationStatus });
});
