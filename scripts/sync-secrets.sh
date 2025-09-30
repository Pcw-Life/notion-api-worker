#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage: $0 [--from-env|--from-1password-env]
  --from-env                Read .env and set each key as a Cloudflare secret
  --from-1password-env      Read secrets from environment (loaded by 1Password action)
Environment variables:
  OP_SERVICE_ACCOUNT_TOKEN   Prefer service account if set
  OP_CONNECT_HOST            Fallback Connect host
  OP_CONNECT_TOKEN           Fallback Connect token
  SECRETS_MAP                Override secrets map path
  DRY_RUN=1                  Print actions without writing secrets
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage; exit 0
fi

MODE_FROM_ENV=0
MODE_FROM_1PASSWORD_ENV=0
if [[ "${1:-}" == "--from-env" ]]; then
  MODE_FROM_ENV=1
elif [[ "${1:-}" == "--from-1password-env" ]]; then
  MODE_FROM_1PASSWORD_ENV=1
fi

MAP_FILE="${SECRETS_MAP:-secrets.map.json}"
if [[ "${GITHUB_REF_NAME:-}" == "staging" && -z "${SECRETS_MAP:-}" && -f "secrets.map.staging.json" ]]; then
  MAP_FILE="secrets.map.staging.json"
fi

ensure_tools() {
  command -v wrangler >/dev/null 2>&1 || npm i -g wrangler >/dev/null 2>&1
  command -v jq >/dev/null 2>&1 || { echo "jq not found" >&2; exit 1; }
}

put_secret() {
  local key="$1" val="$2"
  if [[ -n "${DRY_RUN:-}" && "$DRY_RUN" != "0" ]]; then
    echo "[DRY_RUN] would set secret: $key"
  else
    printf "%s" "$val" | wrangler secret put "$key" --quiet
    echo "Synced $key"
    sleep 0.15
  fi
}

sync_from_env() {
  if [[ ! -f .env ]]; then
    echo ".env not found" >&2; exit 1
  fi
  # shellcheck disable=SC2046
  set -a; source .env; set +a
  while IFS='=' read -r k v; do
    [[ -z "$k" || "$k" =~ ^# ]] && continue
    k_trim="${k%% *}"; v_trim="${!k_trim:-}"
    [[ -z "$v_trim" ]] && continue
    put_secret "$k_trim" "$v_trim"
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env || true)
}

sync_from_1password_env() {
  # Secrets are already loaded into environment by 1Password action
  # Read the secrets map to know which keys to sync
  [[ -f "$MAP_FILE" ]] || { echo "Missing $MAP_FILE" >&2; exit 1; }

  for KEY in $(jq -r 'keys[]' "$MAP_FILE"); do
    # Get the value from environment variable (loaded by 1Password action)
    VALUE="${!KEY:-}"
    if [[ -z "$VALUE" ]]; then
      echo "Warning: $KEY not found in environment (may not be loaded by 1Password action)" >&2
      continue
    fi
    put_secret "$KEY" "$VALUE"
  done
}

sync_from_1password() {
  if [[ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]]; then
    export OP_SERVICE_ACCOUNT_TOKEN
  elif [[ -n "${OP_CONNECT_HOST:-}" && -n "${OP_CONNECT_TOKEN:-}" ]]; then
    export OP_CONNECT_HOST OP_CONNECT_TOKEN
  else
    echo "Provide OP_SERVICE_ACCOUNT_TOKEN or OP_CONNECT_HOST+OP_CONNECT_TOKEN" >&2; exit 1
  fi
  command -v op >/dev/null 2>&1 || { echo "1Password CLI (op) not found" >&2; exit 1; }
  [[ -f "$MAP_FILE" ]] || { echo "Missing $MAP_FILE" >&2; exit 1; }

  for KEY in $(jq -r 'keys[]' "$MAP_FILE"); do
    OP_PATH=$(jq -r --arg k "$KEY" '.[$k]' "$MAP_FILE")
    [[ -z "$OP_PATH" || "$OP_PATH" == "null" ]] && { echo "Skip $KEY"; continue; }
    VALUE=$(op read "$OP_PATH")
    [[ -z "$VALUE" ]] && { echo "Empty value for $KEY ($OP_PATH)" >&2; exit 1; }
    put_secret "$KEY" "$VALUE"
  done
}

ensure_tools
if [[ $MODE_FROM_ENV -eq 1 ]]; then
  sync_from_env
elif [[ $MODE_FROM_1PASSWORD_ENV -eq 1 ]]; then
  sync_from_1password_env
else
  sync_from_1password
fi

echo "Secrets sync complete."
