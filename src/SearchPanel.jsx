import { useEffect, useMemo, useRef, useState } from "react";
import { pagesMeta } from "./pages";

const formatDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

/**
 * Find pages by date. Pick a day (or tick "Whole month") to see the pages
 * from then; with no date picked it lists every dated page, oldest first.
 */
export default function SearchPanel({ frames, numbers, onGo, onClose }) {
  const [date, setDate] = useState("");
  const [wholeMonth, setWholeMonth] = useState(false);
  const panelRef = useRef(null);

  // Every page that has a date, with its title and page number.
  const datedPages = useMemo(() => {
    const out = [];
    for (const f of frames) {
      const n = Number(f.id.slice(7));
      const meta = pagesMeta(f);
      for (const side of ["L", "R"]) {
        const p = meta[side];
        if (!p?.date) continue;
        out.push({
          n,
          side,
          date: p.date,
          title: p.title || "",
          number: numbers.get(`${n}-${side}`),
        });
      }
    }
    return out.sort((a, b) => (a.date === b.date ? a.number - b.number : a.date < b.date ? -1 : 1));
  }, [frames, numbers]);

  const results = !date
    ? datedPages
    : datedPages.filter((p) =>
        wholeMonth ? p.date.slice(0, 7) === date.slice(0, 7) : p.date === date,
      );

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) && !e.target.closest(".search-toggle")) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  const monthName = date
    ? new Date(`${date.slice(0, 7)}-01T00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "";

  return (
    <div className="search-panel" ref={panelRef} role="dialog" aria-label="Search pages by date">
      <div className="search-head">
        <h2>Find a page</h2>
        <button className="search-close" onClick={onClose} aria-label="Close search">
          ×
        </button>
      </div>

      <div className="search-controls">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker();
            } catch {}
          }}
          aria-label="Date to search for"
        />
        <label className="search-month">
          <input
            type="checkbox"
            checked={wholeMonth}
            onChange={(e) => setWholeMonth(e.target.checked)}
          />
          Whole month
        </label>
        {date && (
          <button className="search-clear" onClick={() => setDate("")}>
            Show all
          </button>
        )}
      </div>

      <p className="search-summary">
        {!date
          ? datedPages.length
            ? `All ${datedPages.length} dated page${datedPages.length === 1 ? "" : "s"}, oldest first`
            : "No pages have a date yet. Add one at the top of a page."
          : results.length
            ? `${results.length} page${results.length === 1 ? "" : "s"} from ${wholeMonth ? monthName : formatDate(date)}`
            : `Nothing from ${wholeMonth ? monthName : formatDate(date)}`}
      </p>

      <ul className="search-results">
        {results.map((p) => (
          <li key={`${p.n}-${p.side}`}>
            <button
              onClick={() => {
                onGo(p.n);
                onClose();
              }}
            >
              <span className="result-title">{p.title || "Untitled"}</span>
              <span className="result-meta">
                {formatDate(p.date)} · page {p.number}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
