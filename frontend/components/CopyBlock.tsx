"use client";

import { useEffect, useRef, useState } from "react";

export function CopyBlock({
  label,
  text,
  copyText,
  onRevise,
  revising,
  removing,
}: {
  label: string;
  text: string;
  copyText?: string;
  onRevise?: (
    selection: { text: string; start: number },
    instruction: string,
    remove?: boolean,
  ) => Promise<boolean>;
  revising?: boolean;
  removing?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [sel, setSel] = useState<{
    text: string;
    start: number;
    x: number;
    y: number;
    above: boolean;
  } | null>(null);
  const [note, setNote] = useState("");
  const preRef = useRef<HTMLPreElement>(null);
  const popRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSel(null);
    setNote("");
  }, [text]);

  useEffect(() => {
    if (!sel) return;
    noteRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !revising && !removing) {
        setSel(null);
        setNote("");
      }
    }
    function onDown(e: MouseEvent) {
      if (revising || removing) return;
      const target = e.target as Node;
      if (popRef.current?.contains(target) || preRef.current?.contains(target)) return;
      setSel(null);
      setNote("");
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [sel, revising, removing]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText ?? text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function capture() {
    if (!onRevise || !preRef.current) return;
    const host = preRef.current.parentElement;
    const picked = window.getSelection();
    if (!host || !picked || picked.rangeCount === 0) return;
    if (picked.isCollapsed || !picked.toString().trim()) {
      setSel(null);
      setNote("");
      return;
    }
    const range = picked.getRangeAt(0);
    if (!preRef.current.contains(range.commonAncestorContainer)) return;
    const selected = picked.toString();
    const before = range.cloneRange();
    before.selectNodeContents(preRef.current);
    before.setEnd(range.startContainer, range.startOffset);
    const hostBox = host.getBoundingClientRect();
    const rect = range.getBoundingClientRect();
    const width = Math.min(360, host.clientWidth - 16);
    const above = rect.bottom + 220 > window.innerHeight;
    setSel({
      text: selected,
      start: before.toString().length,
      x: Math.max(8, Math.min(rect.left - hostBox.left, host.clientWidth - width - 8)),
      y: above ? rect.top - hostBox.top - 8 : rect.bottom - hostBox.top + 8,
      above,
    });
    setNote("");
  }

  return (
    <div className="copy-block" aria-label={label}>
      <div className="row" style={{ marginBottom: "0.5rem" }}>
        <strong>{label}</strong>
      </div>
      {text ? (
        <pre ref={preRef} onMouseUp={capture} onKeyUp={capture}>
          {text}
        </pre>
      ) : (
        <p className="muted empty" style={{ padding: "1rem 0" }}>
          Nothing to copy yet.
        </p>
      )}
      {sel && onRevise && (
        <form
          ref={popRef}
          className={`revise-pop${sel.above ? " above" : ""}`}
          style={{ left: sel.x, top: sel.y }}
          role="dialog"
          aria-label="Revise highlighted text"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!note.trim() || revising || removing) return;
            const ok = await onRevise(
              { text: sel.text, start: sel.start },
              note.trim(),
            );
            if (ok) {
              setSel(null);
              setNote("");
            }
          }}
        >
          <p className="muted">“{sel.text.slice(0, 180)}”</p>
          <label htmlFor={`revise-${label.replace(/\s+/g, "-").toLowerCase()}`}>
            What should change?
          </label>
          <textarea
            id={`revise-${label.replace(/\s+/g, "-").toLowerCase()}`}
            ref={noteRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Restyle this part, break it into a new paragraph, rewrite the draft, or remove it."
            aria-label="What should change in this draft"
          />
          <div className="row">
            <button
              type="submit"
              className="primary"
              disabled={!!revising || !!removing || !note.trim()}
              aria-label="Revise the highlighted text"
            >
              {revising ? "Revising…" : "Revise"}
            </button>
            <button
              type="button"
              disabled={!!revising || !!removing}
              aria-label="Remove the highlighted text"
              onClick={async () => {
                if (!sel || revising || removing) return;
                const ok = await onRevise(
                  { text: sel.text, start: sel.start },
                  "Remove this highlighted text.",
                  true,
                );
                if (ok) {
                  setSel(null);
                  setNote("");
                }
              }}
            >
              {removing ? "Removing…" : "Remove"}
            </button>
            <button
              type="button"
              disabled={!!revising || !!removing}
              aria-label="Close revision note"
              onClick={() => {
                setSel(null);
                setNote("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <button
        type="button"
        className="copy-btn primary"
        onClick={copy}
        disabled={!text}
        aria-label={`Copy ${label}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
