# WinKVM Manager

## Overview

WinKVM Manager is a web-based virtual machine management dashboard for Windows KVM (Kernel-based Virtual Machine) instances. It allows users to create, configure, start, stop, restart, and delete Windows VMs through a modern dark-themed UI. The application also displays real-time host system statistics (CPU, memory, disk, uptime).

The app follows a full-stack TypeScript monorepo pattern with a React frontend and Express backend. VM data is currently stored in a local JSON file (`vms.json`), though the schema is defined using Drizzle ORM with PostgreSQL table definitions for future migration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (client/)
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side router)
- **State/Data Fetching**: TanStack React Query with polling (5s for lists, 2s for detail views)
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (dark tech theme with electric blue/cyan primary)
- **Charts**: Recharts for host statistics visualization (mini pie charts)
- **Animations**: Framer Motion for layout transitions
- **Forms**: React Hook Form with Zod validation via @hookform/resolvers
- **Build Tool**: Vite with path aliases (`@/` → `client/src/`, `@shared/` → `shared/`)

### Key Frontend Pages
- `/` — Dashboard showing host stats cards and VM grid with action buttons
- `/vms/:id` — VM detail view with tabs for console (iframe), settings, and actions

### Backend (server/)
- **Framework**: Express 5 on Node.js with TypeScript (run via tsx)
- **API Pattern**: RESTful JSON API under `/api/` prefix
- **Host Stats**: Uses `systeminformation` package to gather CPU, memory, disk, and uptime data
- **VM Management**: CRUD operations plus action endpoints (start/stop/restart) that execute shell commands via `child_process.exec`
- **Build**: esbuild for server bundling, Vite for client bundling (see `script/build.ts`)

### Shared Code (shared/)
- **Schema** (`shared/schema.ts`): Drizzle ORM table definitions using `pgTable` for the `vms` table. Exports Zod schemas via `drizzle-zod` for validation.
- **Routes** (`shared/routes.ts`): Typed API contract definitions with Zod response schemas. Both client and server import from here to stay in sync.

### Data Storage
- **Current**: JSON file storage (`vms.json`) managed by `JsonStorage` class in `server/storage.ts`. Data is loaded on startup and auto-saved every 15 seconds.
- **Schema Ready for PostgreSQL**: Drizzle ORM schema and config (`drizzle.config.ts`) are set up for PostgreSQL. The `server/db.ts` file creates a pg Pool connection. The `DATABASE_URL` environment variable is required for Drizzle operations but the app currently uses JSON storage for VM data.
- **Database Push**: Run `npm run db:push` to sync schema to PostgreSQL via drizzle-kit.

### API Structure
All routes defined in `shared/routes.ts` with Zod schemas:
- `GET /api/stats/host` — Host system statistics (CPU, memory, disk, uptime)
- `GET /api/vms` — List all VMs
- `GET /api/vms/:id` — Get single VM
- `POST /api/vms` — Create VM
- `PATCH /api/vms/:id` — Update VM settings
- `DELETE /api/vms/:id` — Delete VM
- `POST /api/vms/:id/start` — Start VM
- `POST /api/vms/:id/stop` — Stop VM
- `POST /api/vms/:id/restart` — Restart VM

### Dev vs Production
- **Development**: `npm run dev` runs tsx with Vite dev server middleware (HMR via `/vite-hmr`)
- **Production**: `npm run build` builds client with Vite and server with esbuild into `dist/`, then `npm start` serves the static files

### VM Schema Fields
- `id`, `name`, `version` (Windows version), `ramSize`, `cpuCores`, `diskSize`, `storagePath`, `customCommand`, `status` (running/stopped/installing/error), `webPort`, `rdpPort`, `createdAt`

## External Dependencies

### Database
- **PostgreSQL** — Required for Drizzle ORM operations. Connection via `DATABASE_URL` environment variable. Uses `pg` (node-postgres) driver with `drizzle-orm/node-postgres`.
- **Drizzle ORM** — Schema definition and query builder
- **drizzle-kit** — Database migration and push tool

### System Information
- **systeminformation** — Node.js library for gathering host CPU, memory, disk, and OS information

### Key NPM Packages
- **express** v5 — HTTP server
- **@tanstack/react-query** — Client-side data fetching and caching
- **wouter** — Client-side routing
- **recharts** — Data visualization charts
- **framer-motion** — Animation library
- **react-hook-form** + **zod** — Form handling and validation
- **shadcn/ui** components (Radix UI based)
- **connect-pg-simple** — PostgreSQL session store (available but session auth not currently implemented)

### Replit-Specific
- `@replit/vite-plugin-runtime-error-modal` — Error overlay in development
- `@replit/vite-plugin-cartographer` — Dev tooling (conditional, dev only)
- `@replit/vite-plugin-dev-banner` — Dev environment banner (conditional, dev only)