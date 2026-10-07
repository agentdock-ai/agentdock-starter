# Backend

The Express host configures a compiled LangGraph, Postgres checkpointer,
PostgresStore, trusted actor identity, attachment byte storage, and cancellable
application tools. `@agentdock-ai/conversations` provides the thread, history,
attachment, execution, continuation, stop, and approval routes. The frontend
uses the shared conversation client and mounts these routes through Vite's
`/conversations` proxy.

The server binds to loopback on port 3000. It uses one execution-owning process;
multiple workers are unsupported until a shared coordinator provides ownership,
cancellation routing, and stale-writer exclusion.

## Verification

- `yarn ci` runs formatting, deterministic backend tests, TypeScript checks, and
  the frontend production build.
- `yarn test:db` requires `AGENTDOCK_TEST_DATABASE_URL` pointing to a disposable
  PostgreSQL database whose name contains `test`. It checks a compiled graph,
  Store/checkpointer persistence, idempotent demo migration, and approval
  recovery across separate Node processes.
- `yarn test:load` uses the same disposable database and reports catalog page
  latency, transcript write latency, bounded history size, and process RSS for a
  synthetic workload. It is a local baseline, not a production capacity claim.

No live model provider calls are needed by these suites.

## Browser end-to-end fixture

Use a disposable test database; this serves the actual handler with a deterministic
compiled graph, native approvals and persistent Store, without provider requests:

```sh
AGENTDOCK_TEST_DATABASE_URL=postgresql://.../agentdock_test yarn test:e2e:serve
AGENTDOCK_BACKEND_URL=http://127.0.0.1:3016 yarn workspace agentdock-starter-frontend dev --host 127.0.0.1 --port 5176
```

Open http://127.0.0.1:5176. Verify Stop/reload/fresh prompt, Continue, native
approval/reload, new/select/rename thread and image upload/reload/preview. The
fixture is test-only, binds loopback and rejects non-test database names.

The one-way legacy importer lives in `scripts/migration/demo-conversations.ts`,
invoked by `scripts/migrate-demo.ts`. Runtime source does not query or create
the three demo tables. Migration combines old output events with checkpoint
messages so prompts omitted from the old event log survive the cutover.
