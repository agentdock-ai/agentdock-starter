# Frontend

A Vite React app using editable components in `src/components/agentdock-ui`.
The current source comes from the sibling `agentdock-ui` registry via its CLI;
`@agentdock-ai/react` provides the headless runtime.

`src/chat-adapter.ts` owns requests, stream decoding, uploads, and cancellation.
`src/App.tsx` selects threads and restores history before consuming events.
Vite proxies `/agent`, `/threads`, and `/attachments` to the backend on port 3000.

Install and start both apps from the starter root with `yarn install` and `yarn dev`.
Run `yarn ui:add` there to update the copied components while preserving local edits.
