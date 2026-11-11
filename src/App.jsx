import { useEffect, useState } from "react";
import { backend } from "./backend";
import Login from "./Login";
import Notebook from "./Notebook";
import BirthdayCard from "./BirthdayCard";
import { CURSOR_COLORS } from "./config";

function colorFor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CURSOR_COLORS[h % CURSOR_COLORS.length];
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [member, setMember] = useState(null);

  useEffect(() => {
    backend.getUser().then(setUser);
    return backend.onAuthChange(setUser);
  }, []);

  useEffect(() => {
    setMember(null);
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
    return <div className="splash">Opening the notebook…</div>;
  }

  if (!user) return <Login />;

  if (!member) {
    return (
      <div className="paper-screen">
        <div className="paper-card">
          <h1>Not on the guest list</h1>
          <p>
            You're signed in as <b>{user.email}</b>, but that email isn't one of the
            two allowed to open this notebook.
          </p>
          <button className="btn" onClick={() => backend.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const me = { ...user, color: colorFor(user.id) };
  return (
    <>
      <Notebook user={me} />
      <BirthdayCard />
    </>
  );
}
