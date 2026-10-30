import { createHash, randomUUID } from "node:crypto";
import { one, query } from "./database.mjs";
import { HttpError, assert } from "./security.mjs";
import { validWorkspace } from "../../src/lib/workspace.js";
import {
  emptyCloudWorkspace,
  mergeImportedWorkspace,
  canonicalJSON,
} from "../../src/lib/cloudWorkspace.js";

export async function readWorkspace(db, owner) {
  // Each normalized table must come from the same database snapshot.
  if (!db.isTransaction)
    return db
      .transaction()
      .setIsolationLevel("repeatable read")
      .execute((tx) => readWorkspace(tx, owner));
  const row = await one(
    db,
    "SELECT revision,meta,updated_at FROM workspaces WHERE owner_id=$1",
    [owner],
  );
  if (!row) return null;
  const [projects, resumes, versions, messages] = await Promise.all([
    query(db, "SELECT id,data FROM projects WHERE owner_id=$1", [owner]),
    query(db, "SELECT id,data FROM resumes WHERE owner_id=$1", [owner]),
    query(db, "SELECT resume_id,data FROM resume_versions WHERE owner_id=$1", [
      owner,
    ]),
    query(db, "SELECT resume_id,data FROM conversations WHERE owner_id=$1", [
      owner,
    ]),
  ]);
  const { documentOrder, projectOrder, ...meta } = row.meta;
  const documents = documentOrder
    .map((id) => resumes.find((d) => d.id === id)?.data)
    .filter(Boolean)
    .map((d) => ({
      ...d,
      versions: versions
        .filter((v) => v.resume_id === d.id)
        .map((v) => v.data)
        .sort((a, b) => a.time - b.time),
      messages: messages.find((m) => m.resume_id === d.id)?.data || [],
    }));
  return {
    revision: row.revision,
    updatedAt: row.updated_at,
    state: {
      ...meta,
      library: projectOrder
        .map((id) => projects.find((p) => p.id === id)?.data)
        .filter(Boolean),
      documents,
    },
  };
}
async function writeRows(db, owner, state, revision) {
  const { library, documents, ...meta } = state;
  await query(
    db,
    "UPDATE workspaces SET revision=$2,meta=$3::jsonb,updated_at=NOW() WHERE owner_id=$1",
    [
      owner,
      revision,
      JSON.stringify({
        ...meta,
        documentOrder: documents.map((d) => d.id),
        projectOrder: library.map((p) => p.id),
      }),
    ],
  );
  await query(db, "DELETE FROM projects WHERE owner_id=$1", [owner]);
  await query(db, "DELETE FROM resumes WHERE owner_id=$1", [owner]);
  for (const project of library)
    await query(
      db,
      "INSERT INTO projects(owner_id,id,data) VALUES($1,$2,$3::jsonb)",
      [owner, project.id, JSON.stringify(project)],
    );
  for (const { versions, messages, ...doc } of documents) {
    await query(
      db,
      "INSERT INTO resumes(owner_id,id,data) VALUES($1,$2,$3::jsonb)",
      [owner, doc.id, JSON.stringify(doc)],
    );
    for (const version of versions)
      await query(
        db,
        "INSERT INTO resume_versions(owner_id,resume_id,id,data) VALUES($1,$2,$3,$4::jsonb)",
        [owner, doc.id, version.id, JSON.stringify(version)],
      );
    await query(
      db,
      "INSERT INTO conversations(owner_id,resume_id,data) VALUES($1,$2,$3::jsonb)",
      [owner, doc.id, JSON.stringify(messages)],
    );
  }
}
export async function ensureWorkspace(db, owner) {
  await db.transaction().execute(async (tx) => {
    const row = await one(
      tx,
      "INSERT INTO workspaces(owner_id,meta) VALUES($1,$2::jsonb) ON CONFLICT(owner_id) DO NOTHING RETURNING owner_id",
      [owner, "{}"],
    );
    if (row) await writeRows(tx, owner, emptyCloudWorkspace(), 0);
  });
  return readWorkspace(db, owner);
}
function validate(state) {
  assert(validWorkspace(state), 400, "工作区数据格式不正确");
  assert(
    state.documents.length <= 100 &&
      state.library.length <= 500 &&
      JSON.stringify(state).length <= 8_000_000,
    413,
    "工作区超出容量，请先导出并整理旧资料",
  );
  const unique = (values) => new Set(values).size === values.length;
  assert(
    unique(state.documents.map((d) => d.id)) &&
      unique(state.library.map((p) => p.id)) &&
      state.documents.every((d) => unique(d.versions.map((v) => v.id))),
    400,
    "资料包含重复编号",
  );
}
export async function saveWorkspace(db, owner, input) {
  validate(input.state);
  assert(
    Number.isInteger(input.revision) &&
      typeof input.mutationId === "string" &&
      input.mutationId.length <= 100,
    400,
    "缺少同步版本",
  );
  return db.transaction().execute(async (tx) => {
    const row = await one(
      tx,
      "SELECT revision FROM workspaces WHERE owner_id=$1 FOR UPDATE",
      [owner],
    );
    const duplicate = await one(
      tx,
      "SELECT revision FROM workspace_mutations WHERE owner_id=$1 AND mutation_id=$2",
      [owner, input.mutationId],
    );
    if (duplicate) return { revision: duplicate.revision, duplicate: true };
    if (row?.revision !== input.revision)
      throw new HttpError(
        409,
        "另一台设备已修改资料，请选择要保留的版本。",
        "VERSION_CONFLICT",
        { remote: await readWorkspace(tx, owner) },
      );
    if (input.resolve) {
      const old = await readWorkspace(tx, owner);
      await query(
        tx,
        "INSERT INTO sync_backups(id,owner_id,revision,data) VALUES($1,$2,$3,$4::jsonb)",
        [randomUUID(), owner, row.revision, JSON.stringify(old.state)],
      );
    }
    const revision = row.revision + 1;
    await writeRows(tx, owner, input.state, revision);
    await query(
      tx,
      "INSERT INTO workspace_mutations(owner_id,mutation_id,revision) VALUES($1,$2,$3)",
      [owner, input.mutationId, revision],
    );
    return { revision };
  });
}
export async function importWorkspace(db, owner, input) {
  assert(
    input.state &&
      Array.isArray(input.state.documents) &&
      Number.isInteger(input.revision),
    400,
    "导入资料或版本格式不正确",
  );
  const candidate = { ...emptyCloudWorkspace(), ...input.state };
  if (!candidate.documents.length) {
    candidate.documents = emptyCloudWorkspace().documents;
    candidate.activeId = candidate.documents[0].id;
  }
  validate(candidate);
  const fingerprint = createHash("sha256")
    .update(canonicalJSON(input.state))
    .digest("hex");
  const legacyFingerprint = createHash("sha256")
    .update(JSON.stringify(input.state))
    .digest("hex");
  return db.transaction().execute(async (tx) => {
    await one(
      tx,
      "SELECT revision FROM workspaces WHERE owner_id=$1 FOR UPDATE",
      [owner],
    );
    if (
      await one(
        tx,
        "SELECT fingerprint FROM workspace_imports WHERE owner_id=$1 AND fingerprint IN ($2,$3)",
        [owner, fingerprint, legacyFingerprint],
      )
    )
      return { ...(await readWorkspace(tx, owner)), duplicate: true };
    const old = await readWorkspace(tx, owner);
    assert(
      old && old.revision === input.revision,
      409,
      "云端资料已更新，请刷新后重新导入",
      "IMPORT_CONFLICT",
    );
    const merged = mergeImportedWorkspace(
      old.state,
      { ...candidate, documents: input.state.documents },
      randomUUID,
    );
    validate(merged);
    await writeRows(tx, owner, merged, old.revision + 1);
    await query(
      tx,
      "INSERT INTO workspace_imports(owner_id,fingerprint) VALUES($1,$2)",
      [owner, fingerprint],
    );
    return readWorkspace(tx, owner);
  });
}
