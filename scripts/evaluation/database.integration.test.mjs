import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { withEvaluationDatabase, sql } from "./database.mjs";

const enabled = process.env.SCOUT_EVALUATION_INTEGRATION === "1";

test(
  "evaluation schemas are removed after failed work and process interruption",
  { skip: !enabled, timeout: 30000 },
  async () => {
    await withEvaluationDatabase(async (observer) => {
      let failedSchema;
      await assert.rejects(
        withEvaluationDatabase(async (db) => {
          failedSchema = (
            await sql`SELECT current_schema() AS name`.execute(db)
          ).rows[0].name;
          throw new Error("synthetic failure");
        }),
        /synthetic failure/,
      );
      assert.equal(
        (
          await sql`SELECT 1 FROM pg_namespace WHERE nspname=${failedSchema}`.execute(
            observer,
          )
        ).rows.length,
        0,
      );
      const moduleUrl = new URL("./database.mjs", import.meta.url).href;
      const child = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
      import { withEvaluationDatabase, sql } from ${JSON.stringify(moduleUrl)};
      await withEvaluationDatabase(async (db) => {
        const result = await sql\`SELECT current_schema() AS name\`.execute(db);
        console.log(result.rows[0].name);
        await new Promise((resolve) => setTimeout(resolve, 20000));
      });
    `,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const closed = once(child, "close");

      try {
        const [output] = await once(child.stdout, "data");
        const schema = output.toString().trim();
        assert.match(schema, /^evaluation_[a-f0-9]{32}$/);
        assert.equal(
          (
            await sql`SELECT 1 FROM pg_namespace WHERE nspname=${schema}`.execute(
              observer,
            )
          ).rows.length,
          1,
        );
        child.kill("SIGINT");
        assert.equal((await closed)[0], 130);
        assert.equal(
          (
            await sql`SELECT 1 FROM pg_namespace WHERE nspname=${schema}`.execute(
              observer,
            )
          ).rows.length,
          0,
        );
      } finally {
        if (child.exitCode === null) {
          child.kill("SIGTERM");
        }

        await closed;
      }
    });
  },
);
