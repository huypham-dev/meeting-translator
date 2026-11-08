import type { ProviderSettings } from "./settings";
import type { CaptionState, SourceLanguage, StatusUpdate, TranscriptResult } from "./types";

/**
 * Every message that flows between popup <-> background <-> offscreen <-> content script.
 * Centralized here so no part of the codebase uses raw string literals for message types.
 */
export const MessageType = {
  START_TRANSLATION: "START_TRANSLATION",
  STOP_TRANSLATION: "STOP_TRANSLATION",
  GET_STATUS: "GET_STATUS",

  // background -> offscreen
  INIT_CAPTURE: "INIT_CAPTURE",
  STOP_CAPTURE: "STOP_CAPTURE",
  // popup -> offscreen (extension pages receive each other's runtime messages directly)
  SET_SOURCE_LANGUAGE: "SET_SOURCE_LANGUAGE",

  // offscreen -> background
  OFFSCREEN_READY: "OFFSCREEN_READY",

  // bidirectional status/data
  STATUS_UPDATE: "STATUS_UPDATE",
  TRANSCRIPT_UPDATE: "TRANSCRIPT_UPDATE",
  TRANSLATION_UPDATE: "TRANSLATION_UPDATE",
  CLEAR_CAPTION: "CLEAR_CAPTION",

  // content script -> background: "Ask AI about current meeting" sidebar
  ASK_AI: "ASK_AI",
  SUMMARIZE_MEETING: "SUMMARIZE_MEETING",

  // background -> content script: a new translation session just began
  MEETING_STARTED: "MEETING_STARTED",
} as const;

export type ExtensionMessage =
  | { type: typeof MessageType.START_TRANSLATION; payload?: { context?: string } }
  | { type: typeof MessageType.STOP_TRANSLATION }
  | { type: typeof MessageType.GET_STATUS }
  | { type: typeof MessageType.INIT_CAPTURE; payload: { streamId: string; tabId: number; context?: string; settings: ProviderSettings } }
  | { type: typeof MessageType.STOP_CAPTURE }
  | { type: typeof MessageType.SET_SOURCE_LANGUAGE; payload: { language: SourceLanguage } }
  | { type: typeof MessageType.OFFSCREEN_READY }
  | { type: typeof MessageType.STATUS_UPDATE; payload: StatusUpdate }
  | { type: typeof MessageType.TRANSCRIPT_UPDATE; payload: TranscriptResult }
  | { type: typeof MessageType.TRANSLATION_UPDATE; payload: CaptionState }
  | { type: typeof MessageType.CLEAR_CAPTION }
  | { type: typeof MessageType.ASK_AI; payload: { question: string; transcriptContext: string } }
  | { type: typeof MessageType.SUMMARIZE_MEETING; payload: { transcript: string } }
  | { type: typeof MessageType.MEETING_STARTED };

export function isExtensionMessage(msg: unknown): msg is ExtensionMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    typeof (msg as { type: unknown }).type === "string"
  );
}
