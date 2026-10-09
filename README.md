# Agentdock starter

A small TypeScript backend and React frontend for a persistent Agentdock chat. The starter configures the compiled graph, native Postgres checkpointer, PostgresStore, trusted demo identity, and cancellable application tools. `@agentdock-ai/conversations` owns conversation routes, Store records, ordered transcript persistence, native-control projection, operation scoping, request settlement, and a reusable PostgreSQL attachment-byte adapter. The shared React client and hook own thread/history synchronization while the existing `ChatAdapter` remains the UI boundary.

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

## Conversation storage

The native graph checkpointer stores workflow state. The PostgresStore stores Agentdock thread metadata, ordered display messages, operation receipts, and attachment references. Image bytes use `createPostgresConversationFileStorage` from `@agentdock-ai/conversations`, which creates the `agentdock_conversation_files` table by default. Startup sets up the native checkpointer, LangGraph Store schema, ordered catalog index, and file-byte table.

The starter uses the shared conversation client and `/conversations` API. Its PostgreSQL file storage can be replaced by an adapter implementing `put`, `get`, and idempotent `delete`.

## Commands

- `yarn ci` checks formatting, TypeScript, deterministic backend tests, and the frontend build.
- `yarn test` runs deterministic backend tests without provider requests.
- `AGENTDOCK_TEST_DATABASE_URL=postgresql://.../agentdock_test yarn test:db` runs the compiled-graph, PostgresStore/checkpointer, attachment persistence, and separate-process approval-recovery suites. The URL must point to a disposable database whose name contains `test`.
- `AGENTDOCK_TEST_DATABASE_URL=postgresql://.../agentdock_test yarn test:load` reports bounded catalog paging, transcript-write latency, and RSS for a synthetic PostgresStore workload. This is a local baseline, not a production capacity claim.
- `yarn build` checks backend TypeScript and builds the frontend.
- `yarn ui:add` installs current registry components from the local Agentdock UI CLI.

The backend runs TypeScript directly using Node's built-in support. This demo uses a fixed trusted server-side user ID and a loopback-only server; replace that identity resolution with application authentication before exposing it to users.
