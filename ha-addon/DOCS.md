# Training Coach — Home Assistant add-on

Runs your personal training coach as a container the HA Supervisor manages. The
app is a PWA, so once it's reachable you install it to your phone's home screen —
it launches full-screen, completely separate from the HA app.

## Install

1. **Settings → Add-ons → Add-on Store → ⋮ (top right) → Repositories.**
   Add: `https://github.com/fredspitfire/Workout-app` → **Add** → close.
2. The **Training Coach** add-on now appears in the store (bottom of the page).
   Open it → **Install**. First build takes a few minutes (it compiles the app).

## Seed your data (one time)

The database and nightly backups live on Home Assistant's **`share`** folder, so
they're reachable over Samba and included in HA backups.

- Using the **Samba share** add-on (or File Editor / SSH), create the folder
  `share/coach/` and copy your existing **`coach.db`** into it →
  `\\<home-assistant>\share\coach\coach.db`.
- This preserves all your training history. Skip it only if you're starting fresh
  (a fresh DB needs the schema + seed created first — run the project's
  `db:push` / `db:seed` / `import:*` scripts on a PC and copy the result in).

Nightly backups will appear in `share/coach/backups/` — copy those off the box
periodically for a true off-device copy.

## Configure

On the add-on **Configuration** tab:

| Option | What to set |
|---|---|
| `origin` | The **exact URL you open the app at.** For LAN access: `http://<ha-ip>:3000`. Behind a reverse proxy: the `https://…` URL. **Required** — if empty, form submits (generate / log / tweak) return 403. |
| `anthropic_api_key` | Your Anthropic API key. Enables AI exercise selection + natural-language tweaks; without it the app falls back to deterministic picks. Store the key here — never in a project file. |
| `backup_retention` | Nightly snapshots to keep (default 14). |
| `backup_hour` | Local hour (0–23) the nightly backup runs (default 3). |

**Start** the add-on. Check the **Log** tab — you should see
`[coach] starting on port 3000`.

## Put it on your Android home screen

Android's Chrome only offers the real **Install app** (its own window/icon) over
**HTTPS**. Two options:

- **Simplest (LAN only):** open `http://<ha-ip>:3000` in Chrome. You can "Add to
  Home screen," but it opens as a browser shortcut, not a standalone app.
- **Recommended (standalone PWA):** front the add-on with an HTTPS reverse proxy —
  the **Nginx Proxy Manager** add-on + a **DuckDNS** domain + Let's Encrypt (DNS
  challenge) gives a browser-trusted `https://coach.<you>.duckdns.org` pointing at
  the mini PC's LAN IP, with **no ports opened to the internet**. Point the proxy
  at `http://<ha-ip>:3000`, set this add-on's `origin` to the `https://…` URL,
  then open that URL in Chrome → **⋮ → Install app**. "Coach" lands on your home
  screen and launches full-screen.

A self-signed cert will **not** work (Chrome refuses to install a PWA from an
untrusted cert), and HA *ingress* isn't used here because its dynamic path breaks
the PWA's scope — a plain reverse proxy to port 3000 is the clean path.

## Updating

The image builds from the `main` branch. To pick up newer app code:
**Uninstall → Install** the add-on again (or bump the `version` in `config.yaml`
and Rebuild). Your data on `share/coach/` is untouched.

## Security notes

- Single-user app with no built-in login. On your **trusted LAN** that's fine.
  Before exposing it to the **internet**, put auth in front (e.g. Nginx Proxy
  Manager access lists / basic auth, or HA-authenticated access).
- Rotate the Anthropic key if it's ever been shared, and keep it only in this
  add-on's config (not in any file).
