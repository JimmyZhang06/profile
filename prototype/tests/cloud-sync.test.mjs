import test from "node:test";
import assert from "node:assert/strict";
import { CloudSync } from "../src/lib/cloudSync.js";
import {
  emptyCloudWorkspace,
  cloudCacheKey,
} from "../src/lib/cloudWorkspace.js";
const memory = () => {
  const values = new Map();
  return {
    values,
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index],
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
function server() {
  let remote = { state: emptyCloudWorkspace(), revision: 0 },
    offline = false;
  return {
    get remote() {
      return structuredClone(remote);
    },
    set remote(value) {
      remote = structuredClone(value);
    },
    set offline(value) {
      offline = value;
    },
    async request(path, { method, body }) {
      if (offline) throw new Error("network offline");
      if (method === "PUT") {
        if (body.revision !== remote.revision)
          throw Object.assign(new Error("conflict"), {
            code: "VERSION_CONFLICT",
            remote: structuredClone(remote),
          });
        remote = {
          state: structuredClone(body.state),
          revision: remote.revision + 1,
        };
        return { revision: remote.revision };
      }
      return structuredClone(remote);
    },
  };
}
function edit(engine, text) {
  engine.setState((state) => ({
    ...state,
    documents: state.documents.map((doc, i) =>
      i ? doc : { ...doc, resume: { ...doc.resume, summary: text } },
    ),
  }));
}
test("offline drafts survive restart and synchronize once the connection returns", async () => {
  const storage = memory(),
    backend = server(),
    engine = new CloudSync({
      ownerId: "alice",
      storage,
      request: backend.request,
      delay: 999999,
    });
  await engine.start();
  backend.offline = true;
  edit(engine, "offline draft");
  await engine.push();
  assert.equal(engine.getSnapshot().saveState, "offline");
  engine.stop();
  backend.offline = false;
  const resumed = new CloudSync({
    ownerId: "alice",
    storage,
    request: backend.request,
    delay: 999999,
  });
  await resumed.start();
  await resumed.push();
  assert.equal(
    backend.remote.state.documents[0].resume.summary,
    "offline draft",
  );
  assert.equal(resumed.getSnapshot().saveState, "synced");
  resumed.stop();
});
test("expired sessions keep the owner draft and never reuse it for another account", async () => {
  const storage = memory(),
    backend = server(),
    engine = new CloudSync({
      ownerId: "alice",
      storage,
      request: backend.request,
      delay: 999999,
    });
  await engine.start();
  edit(engine, "Alice only");
  engine.request = async () => {
    throw Object.assign(new Error("expired"), { status: 401 });
  };
  await engine.push();
  assert.equal(engine.getSnapshot().saveState, "expired");
  engine.stop();
  const bob = new CloudSync({
    ownerId: "bob",
    storage,
    request: backend.request,
  });
  assert.notEqual(
    bob.getSnapshot().state.documents[0].resume.summary,
    "Alice only",
  );
  assert.equal(
    JSON.parse(storage.getItem(cloudCacheKey("alice"))).state.documents[0]
      .resume.summary,
    "Alice only",
  );
});
test("version conflicts retain both versions and create an owner-scoped recovery copy", async () => {
  const storage = memory(),
    backend = server(),
    engine = new CloudSync({
      ownerId: "alice",
      storage,
      request: backend.request,
      delay: 999999,
    });
  await engine.start();
  edit(engine, "local edit");
  const remote = backend.remote;
  remote.state.documents[0].resume.summary = "other device";
  remote.revision++;
  backend.remote = remote;
  await engine.push();
  assert.equal(
    engine.getSnapshot().remoteConflict.state.documents[0].resume.summary,
    "other device",
  );
  assert.equal(
    engine.getSnapshot().state.documents[0].resume.summary,
    "local edit",
  );
  engine.resolve("both");
  await engine.push();
  assert.ok(
    backend.remote.state.documents.some(
      (d) => d.resume.summary === "local edit",
    ),
  );
  assert.ok(
    backend.remote.state.documents.some(
      (d) => d.resume.summary === "other device",
    ),
  );
  assert.ok(
    [...storage.values.keys()].some((key) =>
      key.startsWith(cloudCacheKey("alice") + ":recovery:"),
    ),
  );
  engine.stop();
});
test("a disposed request cannot overwrite the restarted sync engine", async () => {
  const storage = memory(),
    backend = server();
  let complete;
  const engine = new CloudSync({
    ownerId: "alice",
    storage,
    request: () => new Promise((resolve) => (complete = resolve)),
    delay: 999999,
  });
  const old = engine.start();
  engine.stop();
  engine.request = backend.request;
  await engine.start();
  const oldState = emptyCloudWorkspace();
  oldState.documents[0].resume.summary = "stale response";
  complete({ state: oldState, revision: 30 });
  await old;
  assert.notEqual(
    engine.getSnapshot().state.documents[0].resume.summary,
    "stale response",
  );
  assert.equal(engine.getSnapshot().revision, 0);
  engine.stop();
});

test("another offline window cannot silently discard an unsynchronized draft", async () => {
  const storage = memory(),
    backend = server(),
    a = new CloudSync({
      ownerId: "alice",
      storage,
      request: backend.request,
      delay: 999999,
    }),
    b = new CloudSync({
      ownerId: "alice",
      storage,
      request: backend.request,
      delay: 999999,
    });
  await a.start();
  await b.start();
  backend.offline = true;
  edit(a, "window A draft");
  edit(b, "window B draft");
  a.stop();
  b.stop();
  const stored = [...storage.values.values()].map(JSON.parse);
  assert.ok(
    stored.some(
      (value) => value.state.documents[0].resume.summary === "window A draft",
    ),
  );
  assert.ok(
    stored.some(
      (value) => value.state.documents[0].resume.summary === "window B draft",
    ),
  );
});

test("account deletion stops writes before erasing only that account cache", async () => {
  const storage = memory(),
    backend = server(),
    engine = new CloudSync({
      ownerId: "alice",
      storage,
      request: backend.request,
      delay: 999999,
    });
  await engine.start();
  edit(engine, "deleted");
  storage.setItem(cloudCacheKey("bob"), "other account");
  engine.forget();
  engine.stop();
  engine.cache();
  assert.equal(storage.getItem(cloudCacheKey("alice")), null);
  assert.equal(storage.getItem(cloudCacheKey("bob")), "other account");
});

test("a lost save acknowledgement is recovered even when JSON object keys are reordered", async () => {
  const storage = memory(),
    backend = server(),
    engine = new CloudSync({
      ownerId: "alice",
      storage,
      request: backend.request,
      delay: 999999,
    });
  await engine.start();
  edit(engine, "accepted but acknowledgement lost");
  backend.remote = {
    state: Object.fromEntries(
      Object.entries(engine.getSnapshot().state).reverse(),
    ),
    revision: 1,
  };
  await engine.pull();
  assert.equal(engine.getSnapshot().saveState, "synced");
  assert.equal(engine.getSnapshot().remoteConflict, null);
  assert.equal(
    engine.getSnapshot().state.documents[0].resume.summary,
    "accepted but acknowledgement lost",
  );
  engine.stop();
});
