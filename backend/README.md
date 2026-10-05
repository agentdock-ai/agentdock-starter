# Backend

Express + Agentdock + LangGraph, with PostgreSQL checkpoints, events, and image uploads.
Configuration lives in `.env`; start both apps with `yarn dev` from the starter root.

## HTTP API

| Endpoint                          | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| `GET /health`                     | Check the database connection                      |
| `GET /threads`                    | List the demo user's threads                       |
| `POST /threads`                   | Create a thread                                    |
| `GET /threads/:threadId`          | Read a thread                                      |
| `GET /threads/:threadId/messages` | Restore messages and pending approvals             |
| `POST /agent`                     | Stream a start, approval response, or continuation |
| `POST /agent/cancel`              | Stop an operation and await persistence            |
| `POST /attachments`               | Upload a PNG, JPEG, GIF, or WebP image, up to 5 MB |
| `GET /attachments/:attachmentId`  | Serve an authorized image                          |

Stopped replies remain visible after reload. Display fragments are never inserted
as completed checkpoint answers. Fresh prompts supersede stopped work; genuine
native approvals still require decisions.

The agent's files stay in `.sandbox`. Deletions and running `.mjs` scripts require
approval. Script execution uses Node's permission model, a 10-second timeout,
and a 64 KB output limit. Shutdown aborts active runs before closing storage.

Tests live in `tests/`, using in-memory storage, a native LangGraph checkpointer,
and a deterministic model. No live provider calls are needed.
