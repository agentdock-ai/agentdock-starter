<div align="center">
  <p><img src="./logo.png" alt="Agentdock" width="320" /></p>
  <p>
    <a href="https://github.com/agentdock-ai/agentdock-starter"><img alt="GitHub repository" src="https://img.shields.io/badge/GitHub-agentdock--starter-181717?logo=github" /></a>
    <img alt="Node.js 22.18+" src="https://img.shields.io/badge/Node.js-22.18%2B-339933?logo=node.js&logoColor=white" />
    <img alt="Express 5" src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
    <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-powered-4169E1?logo=postgresql&logoColor=white" />
  </p>
  <p><strong>A simple, persistent chatbot built with Agentdock, LangGraph, Express, and React.</strong></p>
</div>

Agentdock Starter is a small full-stack Node.js application that shows how to
build a streaming chat assistant with durable conversations. The Express backend
runs a compiled LangGraph agent through Agentdock. A React frontend provides the
chat experience, and PostgreSQL stores graph checkpoints and conversation data.

## What’s included

- Streaming assistant replies with tool activity and approval prompts.
- Persistent threads and message history backed by PostgreSQL.
- A sandbox workspace with tools for listing, reading, and editing files.
- Human approval before file deletion or running a `.mjs` script.
- A React chat UI with thread selection, image attachments, and history reload.

## Stack

| Area        | Technology                            |
| ----------- | ------------------------------------- |
| Backend     | Node.js 22.18+, TypeScript, Express 5 |
| Agent       | Agentdock, LangGraph, LangChain       |
| Model       | OpenRouter                            |
| Persistence | PostgreSQL checkpointer and Store     |
| Frontend    | React, Vite, Agentdock React client   |

## Run locally

This development checkout uses the sibling `agentdock` and `agentdock-ui`
repositories through local workspace links. Build their packages and UI registry
first:

```sh
yarn --cwd ../agentdock build
yarn --cwd ../agentdock-ui build:packages
yarn --cwd ../agentdock-ui registry:build
yarn --cwd ../agentdock-ui cli:build
```

Then install and start the starter:

```sh
yarn install
cp backend/.env.example backend/.env
```

Set `DATABASE_URL`, `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL` in
`backend/.env`. Start PostgreSQL and both apps:

```sh
docker compose up -d
yarn dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The Express backend listens
on [http://127.0.0.1:3000](http://127.0.0.1:3000). `yarn dev` watches both apps;
`yarn start` starts them without watching backend files. Stopping the root
command stops both processes.

The conversations handler publishes its OpenAPI document at
[`http://127.0.0.1:3000/openapi.json`](http://127.0.0.1:3000/openapi.json) and
interactive Swagger UI at [http://127.0.0.1:3000/docs](http://127.0.0.1:3000/docs).
The docs page loads Swagger UI assets from jsDelivr, so a browser needs internet
access to render the interface.

## Project layout

```text
backend/   Express server, system prompt, LangGraph runtime, sandbox tools, and PostgreSQL setup
frontend/  React chat application and editable UI components
```

The starter delegates conversation routes, thread records, transcript
persistence, and event synchronization to `@agentdock-ai/conversations` and the
shared Agentdock React client. LangGraph owns graph execution and checkpoint
state; PostgreSQL Store records hold the conversation catalog and display
history. The trusted assistant instructions live in
[`backend/prompts/assistant.md`](./backend/prompts/assistant.md) and are loaded
once during server startup; workspace files cannot replace them.

## Commands

| Command          | Purpose                                                        |
| ---------------- | -------------------------------------------------------------- |
| `yarn dev`       | Run the backend and frontend in development mode               |
| `yarn start`     | Run both apps without backend file watching                    |
| `yarn build`     | Typecheck the backend and build the frontend                   |
| `yarn typecheck` | Typecheck both apps                                            |
| `yarn test`      | Run deterministic backend tests                                |
| `yarn ci`        | Run formatting checks, tests, and the build                    |
| `yarn ui:add`    | Refresh the starter chat components from the local UI registry |

Database-backed verification uses a disposable PostgreSQL database:

```sh
AGENTDOCK_TEST_DATABASE_URL=postgresql://.../agentdock_test yarn test:db
AGENTDOCK_TEST_DATABASE_URL=postgresql://.../agentdock_test yarn test:load
```

The test database name must contain `test`. The load command reports a local
synthetic baseline, not a production capacity claim.

## Deployment note

The supported deployment runs one execution-owning backend process. The Store
does not coordinate graph execution across multiple workers. This demo also uses
a fixed server-side user ID and binds to loopback; add application
authentication and trusted user identity before exposing it to users.
