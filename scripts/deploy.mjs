// Builds the site and publishes it to the gh-pages branch (GitHub Pages
// serves that branch). Supabase keys are read from .env.local at build time.
//
//   npm run deploy

import { execSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });
const out = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

if (!existsSync(".env.local")) {
  console.warn("\n⚠  No .env.local found: the site will be built in DEMO mode.\n");
}

const remote = out("git remote get-url origin");

run("npx vite build");
writeFileSync("dist/.nojekyll", "");

rmSync("dist/.git", { recursive: true, force: true });
try {
  const cwd = "dist";
  run("git init -q -b gh-pages", { cwd });
  run("git add -A", { cwd });
  run(`git commit -q -m "Deploy ${new Date().toISOString()}"`, { cwd });
  run(`git push -q --force "${remote}" gh-pages`, { cwd });
} finally {
  rmSync("dist/.git", { recursive: true, force: true });
}

console.log("\n✓ Published. GitHub Pages updates in about a minute.\n");
