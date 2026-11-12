import { useState } from "react";
import { backend } from "./backend";
import { NOTEBOOK_TITLE } from "./config";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// Days per month (February allows 29 so a leap-day anniversary still works).
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export default function Login() {
  const demo = backend.mode === "demo";

  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);

  const maxDay = month ? DAYS_IN[month - 1] : 31;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (demo) await backend.signIn(name.trim());
      else await backend.signInWithAnniversary(Number(month), Number(day));
    } catch (err) {
      setError(err.message || String(err));
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="paper-screen">
      <form className="paper-card" onSubmit={submit}>
        <div className="tape" aria-hidden />
        <h1>{NOTEBOOK_TITLE}</h1>

        {demo ? (
          <>
            <p className="handwritten">Demo mode: this only syncs between tabs in this browser.</p>
            <label>
              Your name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Shown next to your cursor"
                required
                autoFocus
              />
            </label>
          </>
        ) : (
          <fieldset className={`anniversary${shake ? " shake" : ""}`} key={shake}>
            <legend className="handwritten question">When is our anniversary?</legend>
            <div className="date-row">
              <label>
                <span className="sr-only">Month</span>
                <select
                  value={month}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setMonth(m);
                    if (day > DAYS_IN[m - 1]) setDay("");
                  }}
                  required
                  autoFocus
                >
                  <option value="" disabled>
                    Month
                  </option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Day</span>
                <select value={day} onChange={(e) => setDay(Number(e.target.value))} required>
                  <option value="" disabled>
                    Day
                  </option>
                  {Array.from({ length: maxDay }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
        )}

        {error && (
          <p className="msg error" role="alert">
            {error}
          </p>
        )}

        <button className="btn" disabled={busy}>
          {busy ? "Checking…" : "Open EJ and Pau's Journal"}
        </button>
      </form>
    </div>
  );
}
