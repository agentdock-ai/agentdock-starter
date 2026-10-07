# Agentdock starter

A small TypeScript backend and React frontend for a persistent Agentdock chat. The starter configures the compiled graph, native Postgres checkpointer, PostgresStore, trusted demo identity, attachment byte storage, and cancellable application tools. `@agentdock-ai/conversations` owns conversation routes, Store records, ordered transcript persistence, native-control projection, operation scoping, and request settlement. The shared React client and hook own thread/history synchronization while the existing `ChatAdapter` remains the UI boundary.

The supported deployment profile is one execution-owning backend process. Multiple backend workers are unsupported: the Store is not an execution lock and does not fence stale native checkpoint writers.

## Run locally

Requires Node.js 22.18+ and Yarn Classic. This checkout uses sibling `agentdock` and `agentdock-ui` repositories. Build their packages and registry first:

```sh
yarn --cwd ../agentdock build
yarn --cwd ../agentdock-ui build:packages
yarn --cwd ../agentdock-ui registry:build
yarn --cwd ../agentdock-ui cli:build
```

From this starter's root:

```sh
yarn install
cp backend/.env.example backend/.env
# Set DATABASE_URL, OPENROUTER_API_KEY and OPENROUTER_MODEL in backend/.env.
docker compose up -d
yarn dev
```

Open http://127.0.0.1:5173. The backend listens on http://127.0.0.1:3000. `yarn dev` watches both apps; `yarn start` starts both without watching backend files. Stopping the root command stops both processes.

## Conversation storage and migration

The native graph checkpointer stores workflow state. The PostgresStore stores Agentdock thread metadata, ordered display messages, operation receipts, and attachment references. Image bytes are stored in the new `agentdock_conversation_files` table. Startup creates that table and the LangGraph Store schema; it does not create, update, or drop the legacy demo tables.

The offline importer reads `agentdock_demo_threads`, `agentdock_demo_events`, and `agentdock_demo_attachments` without changing them. It preserves thread IDs, owners, titles, timestamps, native message IDs, partial text, order, and attachment bytes. Do not run it against production until an application-approved backup and maintenance boundary are in place. The existing tables remain the rollback/export source; retirement requires a separate explicit destructive migration.

Rehearse only against a disposable database whose name includes `test`:

```sh
DATABASE_URL=postgresql://.../agentdock_test yarn workspace agentdock-starter-backend migrate:demo
DATABASE_URL=postgresql://.../agentdock_test yarn workspace agentdock-starter-backend migrate:demo --apply
```

The first command is read-only with respect to the target database. The `--apply` command creates the Store schema and new attachment table and imports records idempotently. It never alters legacy rows or native checkpoints. Existing installations should take and verify an application-approved backup before the final cutover.

## Commands

- `yarn ci` checks formatting, TypeScript, deterministic backend tests, and the frontend build.
- `yarn test` runs deterministic backend tests without provider requests.
- `AGENTDOCK_TEST_DATABASE_URL=postgresql://.../agentdock_test yarn test:db` runs the compiled-graph, PostgresStore/checkpointer, migration, and separate-process approval-recovery suites. The URL must point to a disposable database whose name contains `test`.
- `AGENTDOCK_TEST_DATABASE_URL=postgresql://.../agentdock_test yarn test:load` reports bounded catalog paging, transcript-write latency, and RSS for a synthetic PostgresStore workload. This is a local baseline, not a production capacity claim.
- `yarn build` checks backend TypeScript and builds the frontend.
- `yarn ui:add` installs current registry components from the local Agentdock UI CLI.

The backend runs TypeScript directly using Node's built-in support. This demo uses a fixed trusted server-side user ID and a loopback-only server; replace that identity resolution with application authentication before exposing it to users.
