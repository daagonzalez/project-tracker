import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { loadConfig } from "../config.js";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { createUser } from "../modules/auth/service.js";

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  process.stdout.write(question);
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  muted = true;
  return new Promise((resolve) =>
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    }),
  );
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: create-user <email>   (password from TRACKER_NEW_USER_PASSWORD or prompt)");
  process.exit(1);
}

const config = loadConfig();
const password = process.env.TRACKER_NEW_USER_PASSWORD ?? (await promptHidden("Password (min 12 chars): "));
const { db, close } = createDb(config.databaseUrl);
try {
  await runMigrations(db);
  const user = await createUser(db, email, password);
  console.log(`Created user ${user.email} (${user.id})`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await close();
}
