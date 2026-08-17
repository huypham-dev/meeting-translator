import type { CaptionState, StatusUpdate, TranscriptResult } from "./types";

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

  // offscreen -> background
  OFFSCREEN_READY: "OFFSCREEN_READY",

  // bidirectional status/data
  STATUS_UPDATE: "STATUS_UPDATE",
  TRANSCRIPT_UPDATE: "TRANSCRIPT_UPDATE",
  TRANSLATION_UPDATE: "TRANSLATION_UPDATE",
  CLEAR_CAPTION: "CLEAR_CAPTION",
} as const;

export type ExtensionMessage =
  | { type: typeof MessageType.START_TRANSLATION }
  | { type: typeof MessageType.STOP_TRANSLATION }
  | { type: typeof MessageType.GET_STATUS }
  | { type: typeof MessageType.INIT_CAPTURE; payload: { streamId: string; tabId: number } }
  | { type: typeof MessageType.STOP_CAPTURE }
  | { type: typeof MessageType.OFFSCREEN_READY }
  | { type: typeof MessageType.STATUS_UPDATE; payload: StatusUpdate }
  | { type: typeof MessageType.TRANSCRIPT_UPDATE; payload: TranscriptResult }
  | { type: typeof MessageType.TRANSLATION_UPDATE; payload: CaptionState }
  | { type: typeof MessageType.CLEAR_CAPTION };

export function isExtensionMessage(msg: unknown): msg is ExtensionMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    typeof (msg as { type: unknown }).type === "string"
  );
}
