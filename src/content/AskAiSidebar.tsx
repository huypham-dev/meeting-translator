import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageType } from "@/shared/messages";
import { NotesTab } from "./NotesTab";
import { getRecentTranscriptText, getTranscriptEntries, subscribeTranscript } from "./transcript-store";

interface QuickPrompt {
  label: string;
  question: string;
  contextMinutes: number;
}

const DEFAULT_CONTEXT_MINUTES = 8;

/** Context windows offered for typed questions; `Infinity` = the whole meeting. */
const SCOPE_OPTIONS = [
  { label: "Last 2 min", minutes: 2 },
  { label: "Last 8 min", minutes: DEFAULT_CONTEXT_MINUTES },
  { label: "Whole meeting", minutes: Infinity },
];

const QUICK_PROMPTS: QuickPrompt[] = [
  { label: "What does he mean?", question: "What does he mean by what was just said?", contextMinutes: DEFAULT_CONTEXT_MINUTES },
  { label: "What am I being asked to do?", question: "What am I being asked to do?", contextMinutes: DEFAULT_CONTEXT_MINUTES },
  { label: "Summarize the last 2 minutes", question: "Summarize the last 2 minutes of the meeting.", contextMinutes: 2 },
  { label: "Explain this in Vietnamese", question: "Explain what was just said in plain, simple Vietnamese.", contextMinutes: DEFAULT_CONTEXT_MINUTES },
];

interface QaEntry {
  id: number;
  question: string;
  answer?: string;
  error?: string;
  pending: boolean;
}

let nextId = 0;

type Tab = "history" | "ask" | "notes";

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

interface AskAiResponse {
  ok: boolean;
  answer?: string;
  error?: string;
}

export function AskAiSidebar() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<QaEntry[]>([]);
  const [tab, setTab] = useState<Tab>("history");
  const [scopeMinutes, setScopeMinutes] = useState(DEFAULT_CONTEXT_MINUTES);
  const [transcript, setTranscript] = useState(getTranscriptEntries);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeTranscript(() => setTranscript(getTranscriptEntries())), []);

  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, transcript, tab]);

  const ask = (question: string, contextMinutes = DEFAULT_CONTEXT_MINUTES) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    const id = nextId++;
    setTab("ask");
    setItems((prev) => [...prev, { id, question: trimmed, pending: true }]);
    setInput("");

    const transcriptContext = getRecentTranscriptText(contextMinutes);

    chrome.runtime
      .sendMessage({
        type: MessageType.ASK_AI,
        payload: { question: trimmed, transcriptContext },
      })
      .then((res: AskAiResponse) => {
        setItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? res?.ok
                ? { ...it, pending: false, answer: res.answer }
                : { ...it, pending: false, error: res?.error ?? "Ask AI failed" }
              : it
          )
        );
      })
      .catch((err: unknown) => {
        setItems((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, pending: false, error: err instanceof Error ? err.message : String(err) } : it
          )
        );
      });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(input, scopeMinutes);
  };

  return (
    <>
      <button className="askai-toggle" onClick={() => setOpen((o) => !o)} aria-label="Toggle Ask AI sidebar">
        {open ? "✕" : "AI"}
      </button>

      {open && (
        <div className="askai-panel">
          <div className="askai-header">Ask AI about current meeting</div>

          <div className="askai-tabs">
            <button className={`askai-tab${tab === "history" ? " on" : ""}`} onClick={() => setTab("history")}>
              History
            </button>
            <button className={`askai-tab${tab === "ask" ? " on" : ""}`} onClick={() => setTab("ask")}>
              Ask AI
            </button>
            <button className={`askai-tab${tab === "notes" ? " on" : ""}`} onClick={() => setTab("notes")}>
              Notes
            </button>
          </div>

          {tab === "ask" && (
            <div className="askai-quick-prompts">
              {QUICK_PROMPTS.map((p) => (
                <button key={p.label} className="askai-quick-btn" onClick={() => ask(p.question, p.contextMinutes)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {tab === "notes" ? (
            <NotesTab />
          ) : (
            <>
          <div className="askai-history" ref={historyRef}>
            {tab === "history" ? (
              transcript.length === 0 ? (
                <div className="askai-empty">Nothing translated yet.</div>
              ) : (
                transcript.map((e) => (
                  <div key={e.timestamp} className="askai-transcript-row">
                    <time>{formatTime(e.timestamp)}</time>
                    <span>{e.translated || e.source}</span>
                  </div>
                ))
              )
            ) : (
              <>
                {items.length === 0 && <div className="askai-empty">Ask anything about the ongoing meeting…</div>}
                {items.map((it) => (
                  <div key={it.id} className="askai-qa">
                    <div className="askai-question">{it.question}</div>
                    {it.pending && <div className="askai-answer askai-loading">…</div>}
                    {it.answer && <div className="askai-answer">{it.answer}</div>}
                    {it.error && <div className="askai-answer askai-error">{it.error}</div>}
                  </div>
                ))}
              </>
            )}
          </div>

          <form className="askai-form" onSubmit={handleSubmit}>
            {tab === "ask" && (
              <select
                className="askai-scope"
                value={String(scopeMinutes)}
                onChange={(e) => setScopeMinutes(Number(e.target.value))}
                aria-label="Context window for typed questions"
              >
                {SCOPE_OPTIONS.map((o) => (
                  <option key={o.label} value={String(o.minutes)}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <input
              className="askai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a question…"
            />
            <button type="submit" className="askai-send">
              Send
            </button>
          </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
