#!/usr/bin/env bash
#
# Deploy the site: build the static export, sync it to S3, and invalidate
# the CloudFront cache.
#
#   ./deploy.sh             build + sync + invalidate
#   ./deploy.sh --no-build  sync + invalidate only (deploy an existing out/)
#
# BUCKET, DIST_ID, and the optional FATHOM_SITE_ID come from the environment;
# anything unset falls back to a deploy.env file next to this script (the
# environment wins). Copy deploy.env.example to deploy.env and fill it in.
#
# Requires: npm, awscli v2 with credentials authorized for the bucket and
# the CloudFront distribution (s3:PutObject/s3:ListBucket/s3:DeleteObject on
# the bucket, cloudfront:CreateInvalidation on the distribution).

set -euo pipefail

cd "$(dirname "$0")"

# Remember what the environment already set, load deploy.env, then restore the
# environment values so they win over the file.
_env_bucket="${BUCKET:-}"
_env_dist="${DIST_ID:-}"
_env_fathom="${FATHOM_SITE_ID:-}"
if [ -f deploy.env ]; then
  # shellcheck disable=SC1091
  . ./deploy.env
fi
if [ -n "$_env_bucket" ]; then BUCKET="$_env_bucket"; fi
if [ -n "$_env_dist" ]; then DIST_ID="$_env_dist"; fi
if [ -n "$_env_fathom" ]; then FATHOM_SITE_ID="$_env_fathom"; fi

BUCKET="${BUCKET:-}"
DIST_ID="${DIST_ID:-}"
FATHOM_SITE_ID="${FATHOM_SITE_ID:-}"

if [ -z "$BUCKET" ] || [ -z "$DIST_ID" ]; then
  echo "error: BUCKET and DIST_ID must be set in the environment or in deploy.env" >&2
  echo "       copy deploy.env.example to deploy.env and fill in the values" >&2
  exit 1
fi

if [ -n "$FATHOM_SITE_ID" ]; then
  export NEXT_PUBLIC_FATHOM_SITE_ID="$FATHOM_SITE_ID"
else
  echo "==> No FATHOM_SITE_ID set; building without analytics"
fi

BUILD=1
if [ "${1:-}" = "--no-build" ]; then
  BUILD=0
fi

if [ "$BUILD" -eq 1 ]; then
  echo "==> Building static export (npm run build)..."
  npm run build
else
  echo "==> Skipping build (--no-build); using existing out/"
  [ -d out ] || { echo "error: out/ does not exist; run ./deploy.sh without --no-build first" >&2; exit 1; }
fi

echo "==> Syncing out/ to s3://${BUCKET} (deleting removed objects)..."
aws s3 sync out/ "s3://${BUCKET}" --delete

echo "==> Invalidating CloudFront cache (/*) on distribution ${DIST_ID}..."
INV_ID=$(aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text)
echo "    Invalidation ${INV_ID} submitted; waiting for completion..."

while true; do
  STATUS=$(aws cloudfront get-invalidation --distribution-id "$DIST_ID" --id "$INV_ID" \
    --query 'Invalidation.Status' --output text)
  case "$STATUS" in
    Completed)
      echo "    Invalidation complete."
      break
      ;;
    InProgress)
      sleep 10
      ;;
    *)
      echo "error: unexpected invalidation status '${STATUS}'" >&2
      exit 1
      ;;
  esac
done

echo "==> Deployed to s3://${BUCKET}"
