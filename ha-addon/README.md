# Training Coach — HA add-on

Self-hosted personal training coach, packaged as a Home Assistant add-on for HA OS.

**Install:** Settings → Add-ons → Store → ⋮ → Repositories → add
`https://github.com/fredspitfire/Workout-app`, then install **Training Coach**.

Full setup (seeding the DB, configuration, HTTPS for the Android home-screen PWA)
is on the add-on's **Documentation** tab — see [DOCS.md](DOCS.md).

- Data + nightly backups live on `share/coach/` (Samba-accessible, HA-backed).
- Exposes the web UI on port `3000`; front it with a reverse proxy for HTTPS.
- Set `origin` to the exact URL you use, or form submissions return 403.
