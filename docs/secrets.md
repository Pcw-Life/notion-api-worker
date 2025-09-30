# Secure Secrets Management with 1Password

This project uses 1Password for secure secrets management with production-level security. All secrets are handled via 1Password's official `load-secrets-action` to ensure zero secret exposure in logs or environment variables.

## Deployment Environments

The project uses separate workflows for staging and production with enhanced security:

- **Production Deploy** (`main` branch) → `api-documentation-workflow-prod`
- **Staging Deploy** (`staging` branch) → `api-documentation-workflow-staging`

## 1Password Service Account (Recommended) — Production-Level Security

### Security Features
- **Zero Secret Exposure**: Uses `1password/load-secrets-action@v1` for secure secret loading
- **No Log Exposure**: Secrets are never written to logs, files, or environment variables
- **Vault-Based Access Control**: Fine-grained permissions through 1Password vaults
- **Production-Level Security**: Meets enterprise security requirements

### Production Environment
1. Create a 1Password Service Account with read access to the `pcw-3p-integrations` vault.
2. Add GitHub repository secret:
   - [Add OP_SERVICE_ACCOUNT_TOKEN_PRODUCTION](../../settings/secrets/actions/new)
3. Push to `main` branch for automatic secure deployment.

**Security:** All secrets (including Cloudflare API token) are securely loaded directly from 1Password without exposure.

### Staging Environment
1. Create a 1Password Service Account with read access to your staging vault.
2. Add GitHub repository secret:
   - [Add OP_SERVICE_ACCOUNT_TOKEN](../../settings/secrets/actions/new)
3. Push to `staging` branch for automatic secure deployment.

**Security:** All secrets (including Cloudflare API token) are securely loaded directly from 1Password without exposure.

## Legacy Options (Not Recommended for Production)

### Option 1: 1Password Connect (GitHub Actions)
⚠️ **Security Warning**: This method may expose secrets in environment variables.
1. Add repo secrets for Connect:
   - [Add OP_CONNECT_HOST](../../settings/secrets/actions/new)
   - [Add OP_CONNECT_TOKEN](../../settings/secrets/actions/new)
2. Ensure your 1Password vault has items/fields for NOTION_TOKEN, NOTION_DATABASE_ID, NOTION_API_BASE, CLOUDFLARE_API_TOKEN.
3. Update secrets maps to point to op://<vault>/<item>/<field> for each key.
4. Push to main (production) or staging branch. CI will sync secrets and deploy.

### Option 2: .env (local/dev only)
⚠️ **Security Warning**: Only for local development. Never use in production.
1. Create a .env file with:
   ```
   NOTION_TOKEN=...
   NOTION_DATABASE_ID=...
   NOTION_API_BASE=https://api.notion.com/v1
   CLOUDFLARE_API_TOKEN=...
   ```
2. Run: `./scripts/sync-secrets.sh --from-env`
3. Run: `wrangler dev` or `wrangler deploy` locally.

## Secrets Maps

### Production (secrets.map.production.json)
Used automatically when deploying from `main` branch:
```json
{
  "NOTION_TOKEN": "op://pcw-3p-integrations/NOTION_TOKEN/credential",
  "NOTION_DATABASE_ID": "op://pcw-3p-integrations/NOTION_TOKEN/NOTION_DB_ID",
  "NOTION_API_BASE": "op://pcw-3p-integrations/NOTION_TOKEN/NOTION_API_BASE_URL",
  "CLOUDFLARE_API_TOKEN": "op://pcw-3p-integrations/CF_WORKER_API_TOKEN_NOTION/credential"
}
```

### Staging (secrets.map.staging.json)
Used automatically when deploying from `staging` branch:
```json
{
  "NOTION_TOKEN": "op://<vault>/<staging-item>/notion_token",
  "NOTION_DATABASE_ID": "op://<vault>/<staging-item>/database_id",
  "NOTION_API_BASE": "op://<vault>/<staging-item>/api_base",
  "CLOUDFLARE_API_TOKEN": "op://<vault>/<staging-item>/cf_api_token"
}
```

## Security hardening
- Use separate Cloudflare API tokens for production and staging, scoped only to Workers Deploy.
- Create separate Notion integrations for production and staging environments.
- Use GitHub environment protection for production deployments.
- Rotate secrets periodically and after contributor changes.
- Avoid logging secret-derived values.
- Protect main and staging branches. Restrict workflow_dispatch.
- Pin Action versions or SHAs.
- Use dedicated 1Password Service Accounts for production vs staging.
