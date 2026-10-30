import { readFile } from "node:fs/promises";
import { Kysely, PostgresDialect, CompiledQuery } from "kysely";
import pg from "pg";

export async function createDatabase(config) {
  let dialect;
  if (config.databaseUrl)
    dialect = new PostgresDialect({
      pool: new pg.Pool({ connectionString: config.databaseUrl, max: 10 }),
    });
  else {
    const { KyselyPGlite } = await import("kysely-pglite");
    ({ dialect } = await KyselyPGlite.create(
      config.memory ? undefined : config.dataDir + "/postgres",
    ));
  }
  const db = new Kysely({ dialect });
  return {
    db,
    dialect,
    async migrate() {
      const source = await readFile(
        new URL("./schema.sql", import.meta.url),
        "utf8",
      );
      for (const statement of source
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await query(db, statement);
    },
    close: () => db.destroy(),
  };
}
export async function query(db, text, values = []) {
  return (await db.executeQuery(CompiledQuery.raw(text, values))).rows;
}
export async function one(db, text, values = []) {
  return (await query(db, text, values))[0] || null;
}
