import { useRef } from 'react';

// Renders `text` with highlight ranges ({ start, end, color }) and turns a
// mouse selection into a new range (or erases ranges it overlaps).
// The text is rendered verbatim with `white-space: pre-wrap`, so character
// offsets in the DOM match offsets in the source string.

function segments(text, highlights) {
  const cuts = new Set([0, text.length]);
  highlights.forEach((h) => { cuts.add(h.start); cuts.add(h.end); });
  const points = [...cuts].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (a === b) continue;
    let color = null;
    for (const h of highlights) if (h.start <= a && h.end >= b) color = h.color;
    out.push({ a, b, color });
  }
  return out;
}

export default function HighlightText({ text, highlights = [], tool, onChange, className = '' }) {
  const ref = useRef(null);

  const onMouseUp = () => {
    if (!tool || !onChange) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !ref.current) return;
    const range = sel.getRangeAt(0);
    if (!ref.current.contains(range.startContainer) || !ref.current.contains(range.endContainer)) return;
    const pre = document.createRange();
    pre.selectNodeContents(ref.current);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + range.toString().length;
    sel.removeAllRanges();
    if (end <= start) return;
    if (tool === 'erase') {
      onChange(highlights.filter((h) => h.end <= start || h.start >= end));
    } else {
      onChange([...highlights, { start, end, color: tool }]);
    }
  };

  return (
    <div ref={ref} className={`hl-text ${tool ? `tool-${tool}` : ''} ${className}`} onMouseUp={onMouseUp}>
      {segments(text, highlights).map((s) =>
        s.color ? <mark key={s.a} className={`hl-${s.color}`}>{text.slice(s.a, s.b)}</mark> : <span key={s.a}>{text.slice(s.a, s.b)}</span>,
      )}
    </div>
  );
}
