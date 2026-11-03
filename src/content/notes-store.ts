import { isExtensionMessage, MessageType } from "@/shared/messages";
import { MEETING_STORAGE_PREFIX, type Meeting } from "@/shared/types";

/**
 * Persistent meeting notes. Each Meeting (one Start -> Stop) is saved under its
 * own chrome.storage.local key after every finalized sentence, so closing the
 * tab mid-meeting loses nothing. Only the source language is kept (no
 * translation). Independent of transcript-store, which feeds Ask AI from RAM.
 */
const meetings = new Map<string, Meeting>();
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());

let currentId: string | null = null;

/** Notes are only recorded while this switch is on (off by default). */
const RECORD_ENABLED_KEY = "notesRecordEnabled";
let recordEnabled = false;

const keyOf = (id: string) => `${MEETING_STORAGE_PREFIX}${id}`;

/** Newest first. */
export function getMeetings(): Meeting[] {
  return [...meetings.values()].sort((a, b) => b.startedAt - a.startedAt);
}

/** The meeting still being recorded in this tab, if any. */
export function getRecordingMeetingId(): string | null {
  return currentId;
}

export function isRecordingEnabled(): boolean {
  return recordEnabled;
}

export function setRecordingEnabled(enabled: boolean): void {
  recordEnabled = enabled;
  if (!enabled && currentId) endMeeting();
  notify();
  void chrome.storage.local.set({ [RECORD_ENABLED_KEY]: enabled });
}

export function subscribeNotes(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function save(meeting: Meeting): void {
  meetings.set(meeting.id, meeting);
  notify();
  void chrome.storage.local.set({ [keyOf(meeting.id)]: meeting });
}

function startMeeting(): Meeting {
  const now = Date.now();
  const meeting: Meeting = { id: `${now}`, title: document.title.trim() || "Meeting", startedAt: now, lines: [] };
  currentId = meeting.id;
  save(meeting);
  return meeting;
}

function endMeeting(): void {
  const meeting = currentId ? meetings.get(currentId) : undefined;
  currentId = null;
  if (meeting) save({ ...meeting, endedAt: Date.now() });
}

export function renameMeeting(id: string, name: string): void {
  const meeting = meetings.get(id);
  if (!meeting) return;
  const trimmed = name.trim();
  save({ ...meeting, name: trimmed || undefined });
}

export function deleteMeeting(id: string): void {
  if (id === currentId) return;
  meetings.delete(id);
  notify();
  void chrome.storage.local.remove(keyOf(id));
}

export function setMeetingSummary(id: string, text: string): void {
  const meeting = meetings.get(id);
  if (meeting) save({ ...meeting, summary: { text, generatedAt: Date.now() } });
}

// Load saved meetings, then keep in sync with writes from other tabs.
chrome.storage.local.get(null).then((all) => {
  recordEnabled = all[RECORD_ENABLED_KEY] === true;
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(MEETING_STORAGE_PREFIX) && !meetings.has((value as Meeting).id)) {
      meetings.set((value as Meeting).id, value as Meeting);
    }
  }
  notify();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  let changed = false;
  for (const [key, change] of Object.entries(changes)) {
    if (key === RECORD_ENABLED_KEY) {
      recordEnabled = change.newValue === true;
      if (!recordEnabled && currentId) endMeeting();
      changed = true;
      continue;
    }
    if (!key.startsWith(MEETING_STORAGE_PREFIX)) continue;
    const id = key.slice(MEETING_STORAGE_PREFIX.length);
    // The recording meeting is owned by this tab's in-memory copy.
    if (id === currentId) continue;
    if (change.newValue) meetings.set(id, change.newValue as Meeting);
    else meetings.delete(id);
    changed = true;
  }
  if (changed) notify();
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isExtensionMessage(message)) return;

  if (message.type === MessageType.MEETING_STARTED) {
    if (currentId) endMeeting();
    if (!recordEnabled) return;
    startMeeting();
  }

  if (message.type === MessageType.TRANSLATION_UPDATE && message.payload.isFinal) {
    const text = message.payload.source.trim();
    if (!recordEnabled || !text) return;
    // Content script may have loaded after Start (page reload): begin a meeting lazily.
    const meeting = (currentId && meetings.get(currentId)) || startMeeting();
    save({ ...meeting, lines: [...meeting.lines, { text, timestamp: Date.now() }] });
  }

  if (message.type === MessageType.CLEAR_CAPTION) endMeeting();
});

const pad = (n: number) => String(n).padStart(2, "0");

export function formatMeetingDate(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function meetingLabel(m: Meeting): string {
  return m.name ?? `${m.title} · ${formatMeetingDate(m.startedAt)}`;
}

export function transcriptText(m: Meeting): string {
  return m.lines
    .map((l) => `[${pad(new Date(l.timestamp).getHours())}:${pad(new Date(l.timestamp).getMinutes())}] ${l.text}`)
    .join("\n");
}

export function meetingToMarkdown(m: Meeting): string {
  const parts = [`# ${meetingLabel(m)}`, `Started ${formatMeetingDate(m.startedAt)} · ${m.lines.length} sentences`];
  if (m.summary) parts.push("## Summary", m.summary.text.replace(/^#{2}\s/gm, "### "));
  parts.push("## Transcript", transcriptText(m) || "(empty)");
  return parts.join("\n\n") + "\n";
}

export function downloadMeeting(m: Meeting): string {
  const filename =
    meetingLabel(m)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "meeting";
  const url = URL.createObjectURL(new Blob([meetingToMarkdown(m)], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.md`;
  a.click();
  URL.revokeObjectURL(url);
  return `${filename}.md`;
}
