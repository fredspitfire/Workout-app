#!/bin/sh
# Add-on entrypoint: translate HA add-on options (/data/options.json) into the
# env vars the app expects, then launch the adapter-node server.
set -e

CONFIG=/data/options.json
DATA_DIR=/share/coach

mkdir -p "$DATA_DIR/backups"

export NODE_ENV=production
export HOST=0.0.0.0
export PORT=3000
export DATABASE_URL="file:$DATA_DIR/coach.db"
export BACKUP_DIR="$DATA_DIR/backups"

# Pull user-set options (all optional). Only export when non-empty so the app's
# own defaults apply otherwise.
if [ -f "$CONFIG" ]; then
	origin="$(jq -r '.origin // empty' "$CONFIG")"
	key="$(jq -r '.anthropic_api_key // empty' "$CONFIG")"
	retention="$(jq -r '.backup_retention // empty' "$CONFIG")"
	hour="$(jq -r '.backup_hour // empty' "$CONFIG")"
	[ -n "$origin" ] && export ORIGIN="$origin"
	[ -n "$key" ] && export ANTHROPIC_API_KEY="$key"
	[ -n "$retention" ] && export BACKUP_RETENTION="$retention"
	[ -n "$hour" ] && export BACKUP_HOUR="$hour"
fi

if [ ! -f "$DATA_DIR/coach.db" ]; then
	echo "[coach] NOTE: no database at $DATA_DIR/coach.db yet."
	echo "[coach]   Copy your existing coach.db into  \\\\<home-assistant>\\share\\coach\\"
	echo "[coach]   (Samba) before using the app, or it will start with no tables."
	echo "[coach]   See the add-on Documentation tab."
fi

if [ -z "$ORIGIN" ]; then
	echo "[coach] WARNING: the 'origin' option is empty."
	echo "[coach]   Set it to the EXACT URL you open the app at"
	echo "[coach]   (e.g. http://<ha-ip>:3000  or  https://coach.example.duckdns.org),"
	echo "[coach]   or form submissions (generate/log/tweak) will be rejected with 403."
fi

echo "[coach] starting on port $PORT  (db=$DATABASE_URL, origin=${ORIGIN:-unset})"
exec node build
