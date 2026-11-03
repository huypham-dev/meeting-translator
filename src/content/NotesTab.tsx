import { useEffect, useState } from "react";
import { MessageType } from "@/shared/messages";
import type { Meeting } from "@/shared/types";
import {
  deleteMeeting,
  downloadMeeting,
  formatMeetingDate,
  getMeetings,
  getRecordingMeetingId,
  meetingLabel,
  renameMeeting,
  setMeetingSummary,
  subscribeNotes,
  transcriptText,
} from "./notes-store";

interface SummarizeResponse {
  ok: boolean;
  summary?: string;
  error?: string;
}

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Renders the model's "## Heading" + "- bullet" Markdown without a Markdown library. */
function SummaryView({ text }: { text: string }) {
  return (
    <div className="notes-summary">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) return <h4 key={i}>{line.slice(3)}</h4>;
        if (line.startsWith("- ")) return <div key={i} className="notes-bullet">{line.slice(2)}</div>;
        return line.trim() ? <div key={i}>{line}</div> : null;
      })}
    </div>
  );
}

function MeetingDetail({ meeting, onBack }: { meeting: Meeting; onBack: () => void }) {
  const [sub, setSub] = useState<"transcript" | "summary">("transcript");
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloaded, setDownloaded] = useState<string>();

  const recording = meeting.id === getRecordingMeetingId();

  const generate = () => {
    setSub("summary");
    setGenerating(true);
    setError(undefined);
    chrome.runtime
      .sendMessage({ type: MessageType.SUMMARIZE_MEETING, payload: { transcript: transcriptText(meeting) } })
      .then((res: SummarizeResponse) => {
        if (res?.ok && res.summary) setMeetingSummary(meeting.id, res.summary);
        else setError(res?.error ?? "Summary failed");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setGenerating(false));
  };

  const commitRename = () => {
    renameMeeting(meeting.id, draft);
    setRenaming(false);
  };

  return (
    <div className="notes-detail">
      <div className="notes-head">
        <button className="notes-link" onClick={onBack}>
          ← List
        </button>
        {renaming ? (
          <input
            className="askai-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={commitRename}
          />
        ) : (
          <>
            <div className="notes-name">{meetingLabel(meeting)}</div>
            <button
              className="notes-btn"
              onClick={() => {
                setDraft(meetingLabel(meeting));
                setRenaming(true);
              }}
            >
              Rename
            </button>
          </>
        )}
      </div>

      <div className="notes-meta">
        {meeting.lines.length} lines · {recording ? "recording" : `ended ${formatMeetingDate(meeting.endedAt ?? meeting.startedAt)}`}
      </div>

      <div className="notes-subtabs">
        <button className={`notes-pill${sub === "transcript" ? " on" : ""}`} onClick={() => setSub("transcript")}>
          Transcript
        </button>
        <button className={`notes-pill${sub === "summary" ? " on" : ""}`} onClick={() => setSub("summary")}>
          Summary
        </button>
      </div>

      <div className="askai-history">
        {sub === "transcript" ? (
          meeting.lines.length === 0 ? (
            <div className="askai-empty">No lines recorded yet.</div>
          ) : (
            meeting.lines.map((l, i) => (
              <div key={i} className="askai-transcript-row">
                <time>{formatTime(l.timestamp)}</time>
                <span>{l.text}</span>
              </div>
            ))
          )
        ) : generating ? (
          <div className="askai-empty">Generating summary…</div>
        ) : error ? (
          <div className="askai-error">{error}</div>
        ) : meeting.summary ? (
          <SummaryView text={meeting.summary.text} />
        ) : (
          <div className="askai-empty">No summary yet. Click Generate summary to create one from the transcript.</div>
        )}
      </div>

      <div className="notes-foot">
        <button className="askai-send" disabled={generating || meeting.lines.length === 0} onClick={generate}>
          {meeting.summary ? "Regenerate" : "Generate summary"}
        </button>
        <button className="notes-btn" onClick={() => setDownloaded(downloadMeeting(meeting))}>
          Download .md
        </button>
        {!recording &&
          (confirmDelete ? (
            <button
              className="notes-btn notes-danger"
              onClick={() => {
                deleteMeeting(meeting.id);
                onBack();
              }}
            >
              Confirm delete
            </button>
          ) : (
            <button className="notes-btn notes-danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ))}
      </div>
      {downloaded && <div className="notes-meta">Downloaded {downloaded}</div>}
    </div>
  );
}

export function NotesTab() {
  const [meetings, setMeetings] = useState(getMeetings);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => subscribeNotes(() => setMeetings(getMeetings())), []);

  const selected = meetings.find((m) => m.id === selectedId);
  if (selected) return <MeetingDetail key={selected.id} meeting={selected} onBack={() => setSelectedId(null)} />;

  const recordingId = getRecordingMeetingId();
  return (
    <div className="askai-history">
      {meetings.length === 0 && <div className="askai-empty">No meetings yet. Click Start to begin recording.</div>}
      {meetings.map((m) => (
        <button key={m.id} className="notes-row" onClick={() => setSelectedId(m.id)}>
          <span className="notes-row-text">
            <b>{meetingLabel(m)}</b>
            <small>{m.lines.length} lines</small>
          </span>
          {m.id === recordingId && <span className="notes-live">Recording</span>}
        </button>
      ))}
    </div>
  );
}
