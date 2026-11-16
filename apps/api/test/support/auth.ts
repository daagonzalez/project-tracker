import type { Db } from "../../src/db/client.js";
import { createSession } from "../../src/modules/auth/service.js";

/** Creates a session directly (no HTTP login, so it never touches the login rate limiter). */
export async function loginAs(
  t: { db: Db },
  user: { id: string },
): Promise<{ cookie: string; csrf: string; headers: Record<string, string> }> {
  const { token, csrfToken } = await createSession(t.db, user.id);
  return {
    cookie: `sid=${token}`,
    csrf: csrfToken,
    headers: { cookie: `sid=${token}`, "x-csrf-token": csrfToken },
  };
}
