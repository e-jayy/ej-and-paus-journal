// ✏️ Personal touches — edit these before you deploy.

export const NOTEBOOK_TITLE = "EJ and Pau's Journal";

// The birthday card that appears every time the notebook is opened.
// Set SHOW_BIRTHDAY_CARD to false to turn it off.
export const SHOW_BIRTHDAY_CARD = true;
// The card is an image kept in the private Supabase "media" bucket at this
// path (NOT in this public repo). Upload it in Supabase: Storage → media.
export const BIRTHDAY_CARD_IMAGE_PATH = "birthday-card.jpg";
// Only used if the card image can't be loaded:
export const BIRTHDAY_NAME = "my love :33";
export const BIRTHDAY_MESSAGE =
  "I made us a journal that lives online, so we can keep " +
  "writing, drawing and sticking things in it wherever we are. " +
  "Every page from here on is ours.";
export const BIRTHDAY_SIGNATURE = "— me";

// The two people who can open the notebook. Signing in asks
// "When is our anniversary?" and the date you pick decides who you are.
// These email addresses are internal account names, never emailed. The dates
// are deliberately NOT in this file (the repo is public): each person's
// password is derived from their date, see anniversaryPassword() below.
export const PEOPLE = [
  {
    name: "Paula",
    email: "paula@our-notebook.example.com",
    color: { background: "#ffd6e0", stroke: "#e64980" },
  },
  {
    name: "E-Jay",
    email: "ejay@our-notebook.example.com",
    color: { background: "#d0ebff", stroke: "#1c7ed6" },
  },
];

/** The account password for a given anniversary date, e.g. 13 Jan → "our-anniversary-01-13". */
export const anniversaryPassword = (month, day) =>
  `our-anniversary-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// The journal cover shown after signing in ("Press any button to open our
// journal"). The photo lives in the private Supabase "media" bucket at this
// path, NOT in this repo, so it stays private. Upload it in Supabase:
// Storage → media → Upload file.
export const COVER_IMAGE_PATH = "journal-cover.jpg";
export const COVER_TITLE = "EJ & Pau's Journal";

// The notebook's handwriting font (free for personal use, so it's kept in the
// private "media" bucket rather than this public repo). Loaded after sign-in.
export const HANDWRITING_FONT_PATH = "Mostlove Beauty.ttf";
export const HANDWRITING_FONT_NAME = "Mostlove Beauty";

// Largest photo / video / GIF you can upload, in megabytes.
// Supabase's free plan caps single files at 50 MB.
export const MAX_UPLOAD_MB = 50;

// Cursor colours handed out to each person.
export const CURSOR_COLORS = [
  { background: "#ffd6e0", stroke: "#e64980" },
  { background: "#d0ebff", stroke: "#1c7ed6" },
  { background: "#d3f9d8", stroke: "#2f9e44" },
  { background: "#fff3bf", stroke: "#e67700" },
  { background: "#e5dbff", stroke: "#7048e8" },
];
