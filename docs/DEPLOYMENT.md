# Deployment Guide

This document explains the deployment setup for the Notion API Documentation Hub using Cloudflare Workers and 1Password for secrets management.

## Overview

The project uses separate deployment workflows for staging and production environments:

- **Staging Deploy** (`.github/workflows/deploy.yml`) - Deploys to staging environment
- **Production Deploy** (`.github/workflows/production.deploy.yml`) - Deploys to production environment

## Environment Configuration

### Production Environment

**Triggers:**
- Push to `main` branch
- Manual workflow dispatch

**Required GitHub Secrets:**
- `OP_SERVICE_ACCOUNT_TOKEN_PRODUCTION` - 1Password Service Account token for production

**Security Features:**
- Uses 1Password `load-secrets-action` for secure secret loading without exposure in logs
- No secrets are written to environment files or GitHub environment variables
- All secrets are passed via secure 1Password references
- Production-level security with zero secret exposure

**Secrets Mapping:**
Production uses `secrets.map.production.json` which references:
```json
{
  "NOTION_TOKEN": "op://pcw-3p-integrations/NOTION_TOKEN/credential",
  "NOTION_DATABASE_ID": "op://pcw-3p-integrations/NOTION_TOKEN/NOTION_DB_ID",
  "NOTION_API_BASE": "op://pcw-3p-integrations/NOTION_TOKEN/NOTION_API_BASE_URL",
  "CLOUDFLARE_API_TOKEN": "op://pcw-3p-integrations/CF_WORKER_API_TOKEN_NOTION/credential"
}
```

**Cloudflare Worker Name:** `api-documentation-workflow-prod`

### Staging Environment

**Triggers:**
- Push to `staging` branch
- Manual workflow dispatch

**Required GitHub Secrets:**
- `OP_SERVICE_ACCOUNT_TOKEN` - 1Password Service Account token

**Security Features:**
- Uses 1Password `load-secrets-action` for secure secret loading without exposure in logs
- No secrets are written to environment files or GitHub environment variables
- All secrets are passed via secure 1Password references
- Production-level security with zero secret exposure

**Note:** The Cloudflare API token is now managed through 1Password and automatically retrieved from the vault during deployment.

**Secrets Mapping:**
Staging uses `secrets.map.staging.json` which references:
```json
{
  "NOTION_TOKEN": "op://<vault>/<staging-item>/notion_token",
  "NOTION_DATABASE_ID": "op://<vault>/<staging-item>/database_id",
  "NOTION_API_BASE": "op://<vault>/<staging-item>/api_base",
  "CLOUDFLARE_API_TOKEN": "op://<vault>/<staging-item>/cf_api_token"
}
```

**Cloudflare Worker Name:** `api-documentation-workflow-staging`

## Setup Instructions

### 1. Configure GitHub Environments

1. Go to your repository Settings → Environments
2. Create `production` environment with protection rules
3. Create `staging` environment 
4. Add the required secrets to each environment

### 2. Configure 1Password

Ensure the following items exist in your 1Password vaults:

**Production (pcw-3p-integrations vault):**
- `NOTION_TOKEN` item with credential and custom fields
- `CF_WORKER_API_TOKEN_NOTION` item with credential

**Staging:**
- Configure the vault and items referenced in `secrets.map.staging.json`

### 3. Set Up Service Account Tokens

1. Create a 1Password Service Account for production
2. Grant access to the `pcw-3p-integrations` vault
3. Add the service account token as `OP_SERVICE_ACCOUNT_TOKEN_PRODUCTION` in GitHub secrets

## Deployment Process

### Production Deployment
1. Push changes to `main` branch
2. GitHub Actions will automatically:
   - Install dependencies
   - Securely load secrets from 1Password using `load-secrets-action`
   - Deploy to Cloudflare Workers with production configuration

### Staging Deployment
1. Push changes to `staging` branch
2. GitHub Actions will automatically:
   - Install dependencies
   - Securely load secrets from 1Password using `load-secrets-action`
   - Deploy to Cloudflare Workers with staging configuration

### Manual Deployment
Both workflows support manual triggers with an optional `dry_run` parameter to test secret synchronization without deploying.

## Security Features

- **Zero Secret Exposure**: Uses 1Password `load-secrets-action` to securely load secrets without exposing them in logs or environment variables
- **Production-Level Security**: No secrets are written to files, logs, or GitHub environment variables
- **1Password Secret References**: All secrets are passed via secure 1Password vault references
- **Environment Protection**: Production deploys use GitHub environment protection
- **Service Account Authentication**: 1Password Service Account tokens for secure secret access
- **Separate Configurations**: Isolated staging and production environments

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Verify 1Password service account tokens are correct
2. **Missing Secrets**: Check that all required secrets exist in 1Password vaults
3. **Deployment Failures**: Verify Cloudflare API tokens have sufficient permissions
4. **Worker Name Conflicts**: Ensure staging and production workers have different names

### Dry Run Mode

Use the `dry_run` parameter when manually triggering workflows to test secret synchronization without deploying:

```bash
# Manually trigger with dry run
gh workflow run production.deploy.yml -f dry_run=true
```

This will sync and display secrets without writing them to Cloudflare Workers.