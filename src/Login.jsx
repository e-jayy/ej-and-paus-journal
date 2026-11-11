import { useState } from "react";
import { backend } from "./backend";
import { NOTEBOOK_TITLE } from "./config";

export default function Login() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const demo = backend.mode === "demo";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (demo) {
        await backend.signIn(name.trim());
      } else if (mode === "signin") {
        await backend.signIn(email.trim(), password);
      } else {
        const { needsConfirmation } = await backend.signUp(
          email.trim(),
          password,
          name.trim(),
        );
        if (needsConfirmation) {
          setInfo("Check your inbox and click the confirmation link, then sign in here.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="paper-screen">
      <form className="paper-card" onSubmit={submit}>
        <div className="tape" aria-hidden />
        <h1>{NOTEBOOK_TITLE}</h1>
        <p className="handwritten">
          {demo
            ? "Demo mode: this only syncs between tabs in this browser."
            : mode === "signin"
              ? "Just the two of us in here."
              : "First time? Make your key to the notebook."}
        </p>

        {(demo || mode === "signup") && (
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
        )}

        {!demo && (
          <>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus={mode === "signin"}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                required
              />
            </label>
          </>
        )}

        {error && <p className="msg error">{error}</p>}
        {info && <p className="msg info">{info}</p>}

        <button className="btn" disabled={busy}>
          {busy ? "One sec…" : demo || mode === "signin" ? "Open the notebook" : "Create account"}
        </button>

        {!demo && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
            }}
          >
            {mode === "signin" ? "First time here? Create an account" : "Already have an account? Sign in"}
          </button>
        )}
      </form>
    </div>
  );
}
