# Repo Template — 1Password Connect Integration (Tree + Files)

This is the canonical, production-ready, template-safe bundle. It merges all prior updates and supports three setup options: 1Password Connect, 1Password Service Account, and local .env. All runtime values can be pulled securely from 1Password. Wrangler deploy uses no --var flags.

Below is the **full repo tree** based on your initial list, with **new files added for 1Password Connect** and an **updated GitHub Actions workflow**. New files are marked with `🆕` and updated files with `✏️`.

### Repository tree

```
.
├── .env.example
├── .gitignore
├── .github
│   └── workflows
│       └── deploy.yml
├── docs
│   └── [secrets.md](http://secrets.md)
├── package.json
├── scripts
│   └── [sync-secrets.sh](http://sync-secrets.sh)
├── [secrets.map](http://secrets.map).json
├── [secrets.map](http://secrets.map).staging.json
├── src
│   └── index.ts
├── tsconfig.json
├── wrangler.json
├── [README.md](http://README.md)
├── [liscense.md](http://liscense.md)
├── [contributing.md](http://contributing.md)
├── [issues.md](http://issues.md)
├── [discussions.md](http://discussions.md)
├── [sponsoring.md](http://sponsoring.md)
```

### .env.example

```
# Documentation only. Do not put real secrets here.
# Supported for local dev via: ./scripts/[sync-secrets.sh](http://sync-secrets.sh) --from-env
NOTION_TOKEN=
NOTION_DATABASE_ID=
NOTION_API_BASE=https://api.notion.com/v1
CLOUDFLARE_API_TOKEN=
```

### .gitignore

```
node_modules
.env
.dist
build
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-store
.DS_Store
```

### .github/workflows/deploy.yml

```yaml
name: Deploy

on:
  push:
    branches: [ "main" ]
  workflow_dispatch:
    inputs:
      dry_run:
        description: "DRY_RUN: sync secrets without writing"
        required: false
        default: "false"

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install 1Password CLI
        uses: 1password/install-cli-action@v1

      - name: Install dependencies
        run: |
          npm ci --ignore-scripts || npm i --ignore-scripts

      - name: Sync secrets from 1Password (SA preferred, Connect fallback)
        env:
          # Option 2: Service Account (preferred)
          OP_SERVICE_ACCOUNT_TOKEN: $ secrets.OP_SERVICE_ACCOUNT_TOKEN 
          # Option 1: Connect server (fallback)
          OP_CONNECT_HOST: $ secrets.OP_CONNECT_HOST 
          OP_CONNECT_TOKEN: $ secrets.OP_CONNECT_TOKEN 
          # Map selection (auto: staging branch -> staging map)
          SECRETS_MAP: $ github.ref_name == 'staging' && '[secrets.map](http://secrets.map).staging.json' || '[secrets.map](http://secrets.map).json' 
          # DRY_RUN from workflow input
          DRY_RUN: $ github.event.inputs.dry_run 
        run: |
          sudo apt-get update && sudo apt-get install -y jq
          bash scripts/[sync-secrets.sh](http://sync-secrets.sh)

      - name: Deploy (Cloudflare Workers)
        if: $ github.event.inputs.dry_run != 'true' && github.event.inputs.dry_run != '1' 
        env:
          CLOUDFLARE_API_TOKEN: $ secrets.CLOUDFLARE_API_TOKEN 
        run: |
          npx wrangler deploy
```

### docs/[secrets.md](http://secrets.md)

```markdown
# Secrets with 1Password (Connect, Service Account, or .env)

This template supports three options. Service Account (SA) is recommended for simplicity; Connect is supported; .env is for local/dev.

## Option 1: 1Password Connect (GitHub Actions)
1. Add repo secrets for Connect:
   - [Add OP_CONNECT_HOST](../../settings/secrets/actions/new)
   - [Add OP_CONNECT_TOKEN](../../settings/secrets/actions/new)
   Add each secret name exactly and paste the value.
2. Ensure your 1Password vault has items/fields for NOTION_TOKEN, NOTION_DATABASE_ID, NOTION_API_BASE, CLOUDFLARE_API_TOKEN.
3. Update [secrets.map](http://secrets.map).json to point to op://<vault>/<item>/<field> for each key.
4. Push to main. CI will sync secrets and deploy.

## Option 2: 1Password Service Account (GitHub Actions) — recommended
1. Create a 1Password Service Account with read access to the vault.
2. Add repo secret:
   - [Add OP_SERVICE_ACCOUNT_TOKEN](../../settings/secrets/actions/new)
3. Keep OP_CONNECT_* unset so SA is used.
4. Push to main.

## Option 3: .env (local/dev only)
1. Create a .env file with:
   NOTION_TOKEN=...
   NOTION_DATABASE_ID=...
   NOTION_API_BASE=https://api.notion.com/v1
   CLOUDFLARE_API_TOKEN=...
2. Run: ./scripts/[sync-secrets.sh](http://sync-secrets.sh) --from-env
3. Run: wrangler dev or wrangler deploy locally.

## Environments
- main uses [secrets.map](http://secrets.map).json
- staging branch uses [secrets.map](http://secrets.map).staging.json automatically, or set SECRETS_MAP to override.

## Security hardening
- Use a Cloudflare API token scoped only to Workers Deploy.
- Create a minimal Notion integration limited to required database/pages.
- Rotate secrets periodically and after contributor changes.
- Avoid logging secret-derived values.
- Protect main. Restrict workflow_dispatch.
- Pin Action versions or SHAs.
```

### scripts/[sync-secrets.sh](http://sync-secrets.sh)


```bash
#!/usr/bin/env bash
set -euo pipefail
usage() {
  cat <<USAGE
Usage: $0 [--from-env]
  --from-env       Read .env and set each key as a Cloudflare secret
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
if [[ "${1:-}" == "--from-env" ]]; then
  MODE_FROM_ENV=1
fi

MAP_FILE="${SECRETS_MAP:-[secrets.map](http://secrets.map).json}"
if [[ "${GITHUB_REF_NAME:-}" == "staging" && -z "${SECRETS_MAP:-}" && -f "[secrets.map](http://secrets.map).staging.json" ]]; then
  MAP_FILE="[secrets.map](http://secrets.map).staging.json"
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
else
  sync_from_1password
fi

echo "Secrets sync complete."
```

### [secrets.map](http://secrets.map).json

```json
{
  "NOTION_TOKEN": "op://<vault>/<item>/notion_token",
  "NOTION_DATABASE_ID": "op://<vault>/<item>/database_id",
  "NOTION_API_BASE": "op://<vault>/<item>/api_base",
  "CLOUDFLARE_API_TOKEN": "op://<vault>/<item>/cf_api_token"
}
```

### [secrets.map](http://secrets.map).staging.json

```json
{
  "NOTION_TOKEN": "op://<vault>/<staging-item>/notion_token",
  "NOTION_DATABASE_ID": "op://<vault>/<staging-item>/database_id",
  "NOTION_API_BASE": "op://<vault>/<staging-item>/api_base",
  "CLOUDFLARE_API_TOKEN": "op://<vault>/<staging-item>/cf_api_token"
}
```

### package.json

```json
{
  "name": "api-documentation-workflow",
  "version": "1.0.0",
  "description": "Cloudflare Worker workflow template that parses Notion pages and adds API entries",
  "type": "module",
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250224.0",
    "typescript": "^5.4.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"],
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

### wrangler.json

```json
{
  "name": "api-documentation-workflow",
  "main": "src/index.ts",
  "compatibility_date": "2025-08-26",
  "workflows": [
    {
      "name": "api-documentation-workflow",
      "binding": "API_WORKFLOW",
      "class_name": "APIDocumentationWorkflow"
    }
  ]
}
```

### src/index.ts

```tsx
import { WorkflowEntrypoint } from 'cloudflare:workers';

export interface Env {
  NOTION_TOKEN: string;          // Cloudflare secret
  NOTION_DATABASE_ID: string;    // Cloudflare secret
  NOTION_API_BASE: string;       // Cloudflare secret
}

async function fetchWithRetry(input: RequestInfo, init: RequestInit, attempts = 3, baseDelayMs = 250) {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(input, init);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)));
  }
  throw lastErr;
}

export class APIDocumentationWorkflow extends WorkflowEntrypoint<Env> {
  async run(event: any, step: any) {
    const pageId = event?.payload?.pageId;
    if (!pageId) throw new Error('Missing pageId in event payload');

    console.log(JSON.stringify({ step: 'start', pageId }));

    const pageContent = await [step.do](http://step.do)('fetch-page-content', async () => {
      const res = await fetchWithRetry(`${this.env.NOTION_API_BASE}/pages/${pageId}`, {
        headers: {
          Authorization: `Bearer ${this.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });
      return res.json();
    });

    const extractedAPIs = await [step.do](http://step.do)('parse-api-content', async () => {
      const parser = new APIDocumentationParser();
      return parser.parseContent(pageContent);
    });

    console.log(JSON.stringify({ step: 'parsed', count: extractedAPIs.length }));

    await [step.do](http://step.do)('update-api-database', async () => {
      for (const api of extractedAPIs) {
        const res = await fetchWithRetry(`${this.env.NOTION_API_BASE}/pages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.env.NOTION_TOKEN}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            parent: { database_id: this.env.NOTION_DATABASE_ID },
            properties: {
              Name: { title: [{ text: { content: [api.name](http://api.name) } }] },
              Method: { select: { name: api.method } },
              Endpoint: { rich_text: [{ text: { content: api.endpoint } }] },
              Status: { select: { name: 'Active' } },
              Description: { rich_text: [{ text: { content: api.description } }] }
            }
          })
        });
        if (!res.ok) throw new Error(`Notion create page failed: ${res.status}`);
      }
    });

    console.log(JSON.stringify({ step: 'done', pageId }));
  }
}

class APIDocumentationParser {
  parseContent(content: any) {
    const apis: any[] = [];
    const blocks = content?.blocks || [];
    let currentAPI: any | null = null;

    for (const block of blocks) {
      if (block.type === 'heading_1' || block.type === 'heading_2') {
        if (currentAPI) apis.push(currentAPI);
        currentAPI = {
          name: this.extractAPIName(block),
          method: this.extractMethod(block),
          endpoint: this.extractEndpoint(block),
          description: '',
          parameters: [],
          requestBody: null,
          responseFormat: null,
          authentication: null
        };
      }
      if (currentAPI && block.type === 'paragraph') {
        currentAPI.description += this.extractText(block);
      }
      if (currentAPI && block.type === 'code') {
        this.processCodeBlock(currentAPI, block);
      }
    }
    if (currentAPI) apis.push(currentAPI);
    return apis;
  }
  extractAPIName(block: any) {
    const text = this.extractText(block);
    return text.replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/i, '').trim();
  }
  extractMethod(block: any) {
    const text = this.extractText(block);
    const m = text.match(/^(GET|POST|PUT|DELETE|PATCH)\s+/i);
    return m ? m[1].toUpperCase() : 'GET';
  }
  extractEndpoint(block: any) {
    const text = this.extractText(block);
    const m = text.match(/\/([\w\/-]+)/);
    return m ? m[0] : '';
  }
  extractText(block: any) {
    if (block.text) return block.text;
    if (block.paragraph?.text) return [block.paragraph.text.map](http://block.paragraph.text.map)((t: any) => t.plain_text).join('');
    if (block.heading_1?.text) return block.heading_[1.text.map](http://1.text.map)((t: any) => t.plain_text).join('');
    if (block.heading_2?.text) return block.heading_[2.text.map](http://2.text.map)((t: any) => t.plain_text).join('');
    return '';
  }
  processCodeBlock(api: any, block: any) {
    const language = block.code.language;
    const text = [block.code.text.map](http://block.code.text.map)((t: any) => t.plain_text).join('');
    if (language === 'json' && text.includes('"parameters"')) {
      api.parameters = this.parseJSONParameters(text);
    } else if (language === 'json' && text.includes('"body"')) {
      api.requestBody = text;
    } else if (language === 'json') {
      api.responseFormat = text;
    }
  }
  parseJSONParameters(text: string) {
    try {
      const json = JSON.parse(text);
      return json.parameters || [];
    } catch {
      return [];
    }
  }
}
```

### Pull request draft

```markdown
Title: feat: scaffold template with 1Password Connect/Service Account/.env options, security hardening, and CI

Branch: initial_scaffold

Summary
- Adds TypeScript Cloudflare Worker template for Notion API documentation workflow
- Three setup options: 1Password Connect, 1Password Service Account, .env for local
- CI syncs secrets from 1Password and deploys via Wrangler (no --var flags)
- Includes security hardening, staging map selection, DRY_RUN support, retry/backoff

Includes
- .github/workflows/deploy.yml
- scripts/[sync-secrets.sh](http://sync-secrets.sh)
- [secrets.map](http://secrets.map).json, [secrets.map](http://secrets.map).staging.json
- src/index.ts, tsconfig.json, wrangler.json
- [README.md](http://README.md), docs/[secrets.md](http://secrets.md), .env.example, .gitignore
- [liscense.md](http://liscense.md), [contributing.md](http://contributing.md), [issues.md](http://issues.md), [discussions.md](http://discussions.md), [sponsoring.md](http://sponsoring.md)

Post-merge
- Add repo secrets: OP_SERVICE_ACCOUNT_TOKEN (preferred) or OP_CONNECT_HOST + OP_CONNECT_TOKEN, and CLOUDFLARE_API_TOKEN
- Protect main and restrict workflow_dispatch
- Populate 1Password items for NOTION_TOKEN, NOTION_DATABASE_ID, NOTION_API_BASE, CLOUDFLARE_API_TOKEN
```

### Commit message (initial scaffold)
chore: add full template scaffold with 1Password-based secrets, CI, and docs

- Worker: src/index.ts with retry/backoff, wrangler.json, tsconfig.json
- Secrets: scripts/sync-secrets.sh (DRY_RUN, map by branch, .env mode), secrets.map*.json
- CI: Actions workflow with SA-first, Connect fallback, no --var deploy
- Docs: README with three setup options and hardening; docs/secrets.md; .env.example
- Repo: .gitignore, liscense.md, contributing.md, issues.md, discussions.md, sponsoring.md
=======
# Template requirements:
# - Environment: OP_CONNECT_HOST, OP_CONNECT_TOKEN (for 1Password Connect) OR OP_SERVICE_ACCOUNT_TOKEN
# - Tools: op CLI, jq, Node/npm with wrangler available
# - Files: secrets.map.json in repo root

MAP_FILE="secrets.map.json"

if [[ ! -f "$MAP_FILE" ]]; then
  echo "Missing $MAP_FILE" >&2
  exit 1
fi

# Prefer Service Account if provided; fallback to Connect
if [[ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]]; then
  export OP_SERVICE_ACCOUNT_TOKEN
elif [[ -n "${OP_CONNECT_HOST:-}" && -n "${OP_CONNECT_TOKEN:-}" ]]; then
  export OP_CONNECT_HOST OP_CONNECT_TOKEN
else
  echo "Provide either OP_SERVICE_ACCOUNT_TOKEN or OP_CONNECT_HOST+OP_CONNECT_TOKEN" >&2
  exit 1
fi

# Ensure wrangler is available (install if not present)
if ! command -v wrangler >/dev/null 2>&1; then
  npm i -g wrangler >/dev/null 2>&1 || {
    echo "Failed to install wrangler" >&2; exit 1; }
fi

# Ensure jq is available
if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found; please install jq" >&2
  exit 1
fi

# Iterate secrets
for KEY in $(jq -r 'keys[]' "$MAP_FILE"); do
  OP_PATH=$(jq -r --arg k "$KEY" '.[$k]' "$MAP_FILE")
  if [[ -z "$OP_PATH" || "$OP_PATH" == "null" ]]; then
    echo "Skip $KEY (no op path)" >&2
    continue
  fi
  VALUE=$(op read "$OP_PATH")
  if [[ -z "$VALUE" ]]; then
    echo "Empty value for $KEY ($OP_PATH)" >&2
    exit 1
  fi
  printf "%s" "$VALUE" | wrangler secret put "$KEY" --quiet
  echo "Synced $KEY"
  # Reduce risk of rate limiting
  sleep 0.2
done

echo "All mapped secrets synchronized to Cloudflare Wrangler."
```

---

### `docs/secrets.md` 🆕

> Human-facing documentation for adding/editing secrets.

```md
# Secrets with 1Password (Template)

This repo template uses **1Password** as the source of truth for runtime secrets. CI reads values at deploy time and injects them into **Cloudflare Workers** via `wrangler secret put`.

## How it works
- Secret names (environment vars) are the JSON keys in `secrets.map.json`.
- Each key points to an `op://<vault>/<item>/<field>` path.
- CI uses either **1Password Service Accounts** (preferred) or **1Password Connect**.

## Setup (Service Account)
1. Create a 1Password **Service Account** with read access to the needed vault(s).
2. Store the service account token as a GitHub Actions secret: `OP_SERVICE_ACCOUNT_TOKEN`.
3. Keep `secrets.map.json` paths accurate for your vault/items/fields.

## Setup (Connect)
1. Deploy 1Password **Connect**.
2. Add GitHub Actions secrets:
   - `OP_CONNECT_HOST` (e.g., `https://op-connect.example.com`)
   - `OP_CONNECT_TOKEN` (token with read access)
3. Ensure the op CLI is available in the workflow.

## Local development
- Install the **1Password CLI** (`op`).
- Export either `OP_SERVICE_ACCOUNT_TOKEN` **or** both `OP_CONNECT_HOST` & `OP_CONNECT_TOKEN`.
- Run `./scripts/sync-secrets.sh` to sync secrets into Wrangler locally, or create a local `.env` if your tooling reads from it.

## Add a new secret
1. Create or locate an item in 1Password.
2. Copy its `op://vault/item/field` path.
3. Add to `secrets.map.json` as a new key/value.
4. Commit. The next deploy syncs it.
```

---

## Updated File

### `.github/workflows/deploy.yml` ✏️ (drop-in replacement)

> Includes secret sync step. Keep the rest of your deploy logic as-is.

```yaml
name: Deploy

on:
  push:
    branches: [ main ]
  workflow_dispatch: {}

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install op CLI
        uses: 1password/install-cli-action@v1

      - name: Install dependencies
        run: |
          npm ci --ignore-scripts

      - name: Sync secrets from 1Password
        env:
          # Preferred: Service Account (single token)
          OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
          # Fallback: Connect (host + token)
          OP_CONNECT_HOST: ${{ secrets.OP_CONNECT_HOST }}
          OP_CONNECT_TOKEN: ${{ secrets.OP_CONNECT_TOKEN }}
        run: |
          sudo apt-get update && sudo apt-get install -y jq
          bash scripts/sync-secrets.sh

      - name: Build
        run: |
          npm run build --if-present

      - name: Deploy (Cloudflare Workers)
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: |
          npx wrangler deploy
```

---

## Reminder: Repo Secrets to set in GitHub Actions

- `OP_SERVICE_ACCOUNT_TOKEN` **or** (`OP_CONNECT_HOST`, `OP_CONNECT_TOKEN`)
- `CLOUDFLARE_API_TOKEN`

> You can keep `.env.example` purely as documentation for expected keys; real values never live in Git.

---

### Next

If you want multi-environment support (e.g., `staging` and `prod`), we can add `secrets.map.staging.json` and a tiny flag for the script (`--map secrets.map.staging.json`) plus a matrix build in the workflow.
