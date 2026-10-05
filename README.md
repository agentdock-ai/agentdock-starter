# Agentdock starter

A small TypeScript backend and React frontend for a persistent Agentdock chat.

- `backend/src/controllers/` handles HTTP requests.
- `backend/src/repository.ts` owns application SQL.
- `backend/src/services/` handles event streaming, history, and run input.
- `backend/src/agent/` defines the agent, tools, and restricted workspace.
- `frontend/src/` connects the editable Agentdock UI to the backend.

## Run locally

Requires Node.js 22.18+ and Yarn Classic. This checkout uses the sibling
`agentdock` and `agentdock-ui` repositories. Build their packages first:

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
# Set OPENROUTER_API_KEY in backend/.env.
docker compose up -d
yarn dev
```

Open http://127.0.0.1:5173. The backend listens on http://127.0.0.1:3000.
`yarn dev` watches both apps; `yarn start` starts both without watching backend files.
Stopping the root command stops both processes.

## Commands

- `yarn ci` checks formatting, TypeScript, backend tests, and the frontend build.
- `yarn test` runs deterministic backend tests without provider requests.
- `yarn build` checks backend TypeScript and builds the frontend.
- `yarn ui:add` installs current components from the local Agentdock UI CLI,
  preserving consumer edits. The runtime packages and CLI are linked to their sibling checkouts.

The backend runs TypeScript directly using Node's built-in support.
This is a local demo with a fixed user ID and loopback-only server.
