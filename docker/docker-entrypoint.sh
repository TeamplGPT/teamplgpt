#!/bin/bash

# Check if STORAGE_DIR is set
if [ -z "$STORAGE_DIR" ]; then
    echo "================================================================"
    echo "⚠️  ⚠️  ⚠️  WARNING: STORAGE_DIR environment variable is not set! ⚠️  ⚠️  ⚠️"
    echo ""
    echo "Not setting this will result in data loss on container restart since"
    echo "the application will not have a persistent storage location."
    echo "It can also result in weird errors in various parts of the application."
    echo ""
    echo "Please run the container with the official docker command at"
    echo "https://docs.anythingllm.com/installation-docker/quickstart"
    echo ""
    echo "⚠️  ⚠️  ⚠️  WARNING: STORAGE_DIR environment variable is not set! ⚠️  ⚠️  ⚠️"
    echo "================================================================"
fi

# Initialize bundled agent-skills if not present in mounted storage
SKILLS_SRC="/app/server/storage-defaults-plugins/agent-skills"
SKILLS_DST="/app/server/storage/plugins/agent-skills"

# Bundled skills list — must match image contents.
# Update this array when adding/removing bundled skills from server/storage/plugins/agent-skills/.
BUNDLED_SKILLS=(
  "_shared"
  "hr-attendance"
  "hr-personnel"
  "hr-salary"
  "hr-year-end-tax"
  "hr-approval"
  "hr-certificate"
  "hr-welfare"
)

# Helper: read "version" field from plugin.json (returns "unknown" if missing/unreadable)
read_skill_version() {
  local path="$1/plugin.json"
  [ -f "$path" ] || { echo "unknown"; return; }
  local v
  v=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$path" 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  [ -z "$v" ] && v="unknown"
  echo "$v"
}

if [ -d "$SKILLS_SRC" ]; then
  mkdir -p "$SKILLS_DST"

  # --- Block A: Initialize (only if missing) ---
  # Preserves user modifications for non-bundled (custom) skills.
  for skill_dir in "$SKILLS_SRC"/*/; do
    skill_name=$(basename "$skill_dir")
    if [ ! -d "$SKILLS_DST/$skill_name" ]; then
      cp -r "$skill_dir" "$SKILLS_DST/$skill_name"
      echo "Initialized agent-skill: $skill_name"
    fi
  done

  # --- Block B: Forced sync for bundled skills (always overwrite) ---
  # Image is the single source of truth for skills in BUNDLED_SKILLS.
  # Disable by setting FORCE_BUNDLED_SKILL_SYNC=false.
  if [ "${FORCE_BUNDLED_SKILL_SYNC:-true}" = "false" ]; then
    echo "Skipping forced bundled skill sync (disabled by env)"
  else
    for name in "${BUNDLED_SKILLS[@]}"; do
      src="$SKILLS_SRC/$name"
      dst="$SKILLS_DST/$name"
      if [ ! -d "$src" ]; then
        echo "Warning: bundled skill $name not found in defaults, skipping"
        continue
      fi
      old_ver=$(read_skill_version "$dst")
      new_ver=$(read_skill_version "$src")
      if rm -rf "$dst" 2>/dev/null && cp -r "$src" "$dst" 2>/dev/null; then
        echo "Forced sync bundled skill: $name ($old_ver -> $new_ver)"
      else
        echo "Error: failed to sync $name" >&2
      fi
    done
  fi
fi

{
  cd /app/server/ &&
    # Disable Prisma CLI telemetry (https://www.prisma.io/docs/orm/tools/prisma-cli#how-to-opt-out-of-data-collection)
    export CHECKPOINT_DISABLE=1 &&
    npx prisma generate --schema=./prisma/schema.prisma &&
    npx prisma migrate deploy --schema=./prisma/schema.prisma &&
    node /app/server/index.js
} &
{ node /app/collector/index.js; } &
wait -n
exit $?