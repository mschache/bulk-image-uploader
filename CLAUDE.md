# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shopify embedded app built with Remix that enables bulk image uploading to products by matching filenames to SKUs. Uses the filename pattern `SKU-SortNumber.extension` (e.g., `ABC123-01.jpg`).

## Development Commands

```bash
npm run dev         # Start Shopify dev server with tunnel
npm run build       # Compile with Vite → build/
npm run lint        # ESLint with caching
npm run typecheck   # TypeScript validation
npm run prisma db push  # Apply schema changes to SQLite
```

## Architecture

### Tech Stack
- **Framework:** Remix v2 with Vite
- **UI:** Shopify Polaris components
- **Database:** SQLite via Prisma (session storage)
- **Deployment:** Fly.io with Docker

### Route Structure (Remix file-based routing)
- `app/routes/app._index.tsx` - Main upload interface (action handles uploads, loader checks auth)
- `app/routes/app.tsx` - Authenticated layout wrapper
- `app/routes/auth.$.tsx` - Shopify OAuth flow
- `app/routes/webhooks.tsx` - Shopify webhook handler

### Key Utilities
- `app/utils/shopifyMedia.server.ts` - Shopify GraphQL mutations (staged uploads, media creation)
- `app/utils/imageQueue.server.ts` - Upload queue with p-limit concurrency (5 concurrent)
- `app/utils/fileParser.ts` - Filename parsing to extract SKU and sort order
- `app/utils/patternAnalyzer.ts` - Validates filename patterns before upload

### Server-Only Pattern
Files ending in `.server.ts` contain server-side code (Prisma, Shopify API). Remix automatically excludes these from client bundles.

### Path Alias
TypeScript uses `~/` as alias for `./app/*` (configured in tsconfig.json).

## Upload Flow

1. User drops files/ZIP → `UploadDropZone` extracts and validates
2. Files parsed: last hyphen separates SKU from sort number
3. Action queries Shopify for matching products (GraphQL)
4. Files uploaded via Shopify staged upload URLs
5. Media attached to products with selected strategy (append/prepend/replace)

## Configuration

- `shopify.app.toml` - App manifest, OAuth scopes, webhooks
- `.env` - API_KEY, API_SECRET, SCOPES, APP_URL, DATABASE_URL
- `fly.toml` - Deployment config with SQLite volume at /data/

## Required OAuth Scopes
`write_products` - Required for uploading images and modifying product media
