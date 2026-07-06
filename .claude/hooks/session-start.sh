#!/bin/bash
# SessionStart hook for CampaignOS AI — prepares the workspace so Claude Code on
# the web can immediately typecheck, test and build.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}"

# Ensure a .env exists so Prisma / the API can load config.
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
fi

# Install workspace dependencies (install, not ci, to benefit from container caching).
corepack enable >/dev/null 2>&1 || true
pnpm install --prefer-offline

# Generate the Prisma client (required for apps/api to typecheck).
pnpm --filter @campaignos/db generate

echo "CampaignOS AI workspace ready."
