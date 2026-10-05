import assert from "node:assert/strict";
import test from "node:test";
import { createRepository } from "../src/repository.ts";
import { sequence } from "./event-fixtures.js";

test("repository scopes resource access to the owner and preserves attachment order", async () => {
  const queries = [];
  const files = [{ id: "second" }, { id: "first" }];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: sql.includes("ANY") ? files : [] };
    },
  };
  const repository = createRepository(pool, "owner");
  await assert.rejects(repository.requireThread("thread"), { status: 404 });
  assert.deepEqual(queries.at(-1).values, ["thread", "owner"]);
  await assert.rejects(repository.requireAttachment("attachment"), {
    status: 404,
  });
  assert.deepEqual(queries.at(-1).values, ["attachment", "owner"]);
  const loaded = await repository.loadAttachments("thread", [
    "first",
    "second",
    "first",
  ]);
  assert.deepEqual(
    loaded.map((file) => file.id),
    ["first", "second"],
  );
  assert.deepEqual(queries.at(-1).values, [
    "thread",
    "owner",
    ["first", "second"],
  ]);
  await assert.rejects(repository.loadAttachments("thread", ["missing"]), {
    status: 400,
  });
});

test("repository stores canonical events without updating the thread for every delta", async () => {
  const queries = [];
  const event = sequence([{ type: "run.started" }])[0];
  const repository = createRepository(
    {
      async query(sql, values) {
        queries.push({ sql, values });
        return { rows: [{ event }] };
      },
    },
    "owner",
  );
  await repository.saveEvent("thread", event);
  assert.equal(queries.length, 1);
  assert.deepEqual(JSON.parse(queries[0].values[2]), event);
  assert.match(queries[0].sql, /ON CONFLICT/);
  assert.deepEqual(await repository.loadEvents("thread"), [event]);
  await repository.touchThread("thread");
  assert.deepEqual(queries.at(-1).values, ["thread", "owner"]);
});
