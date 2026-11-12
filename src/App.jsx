import { useCallback, useEffect, useState } from "react";
import { backend } from "./backend";
import Cover from "./Cover";
import { loadHandwritingFont } from "./privateFont";
import Login from "./Login";
import Notebook from "./Notebook";
import BirthdayCard from "./BirthdayCard";
import { CURSOR_COLORS, PEOPLE } from "./config";

function colorFor(id, email) {
  const person = PEOPLE.find((p) => p.email === email);
  if (person) return person.color;
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CURSOR_COLORS[h % CURSOR_COLORS.length];
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [member, setMember] = useState(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const openCover = useCallback(() => setCoverOpen(true), []);
  const [birthdayReplay, setBirthdayReplay] = useState(0);
  const [fontProblem, setFontProblem] = useState("");

  useEffect(() => {
    const onFail = (e) => setFontProblem(e.detail);
    window.addEventListener("handwriting-font-error", onFail);
    return () => window.removeEventListener("handwriting-font-error", onFail);
  }, []);
  const showBirthday = useCallback(() => setBirthdayReplay((n) => n + 1), []);

  useEffect(() => {
    backend.getUser().then(setUser);
    return backend.onAuthChange(setUser);
  }, []);

  useEffect(() => {
    setMember(null);
    if (user) loadHandwritingFont();
    setCoverOpen(false);
    if (!user) return;
    backend
      .isMember()
      .then(setMember)
      .catch((e) => {
        console.error(e);
        setMember(false);
      });
  }, [user?.id]);

  if (user === undefined || (user && member === null)) {
    return <div className="splash">Opening EJ and Pau's Journal…</div>;
  }

  if (!user) return <Login />;

  if (!member) {
    return (
      <div className="paper-screen">
        <div className="paper-card">
          <h1>Not on the guest list</h1>
          <p>
            You're signed in as <b>{user.email}</b>, but that email isn't one of the
            two allowed to open EJ and Pau's Journal.
          </p>
          <button className="btn" onClick={() => backend.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const me = { ...user, color: colorFor(user.id, user.email) };
  // The notebook loads underneath the cover, so it's ready the moment it opens.
  return (
    <>
      <Notebook user={me} onShowBirthday={showBirthday} />
      {coverOpen ? <BirthdayCard replay={birthdayReplay} /> : <Cover onOpen={openCover} />}
      {fontProblem && (
        <div className="font-problem" role="status" onClick={() => setFontProblem("")}>
          The handwriting font didn't load: {fontProblem} <small>(click to close)</small>
        </div>
      )}
    </>
  );
}
