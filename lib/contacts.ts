import { db } from "./db";
import { str } from "./form";

const NEW_CLIENT = "__new";

/**
 * Reads a client dropdown from ClientSelect. Returns the chosen contact id, or creates the
 * new client typed inline (reusing an existing contact with the same email).
 */
export async function resolveClient(fd: FormData, studioId: string, name: string): Promise<string | null> {
  const value = str(fd, name);
  if (value !== NEW_CLIENT) return value;
  const firstName = str(fd, `${name}_firstName`);
  if (!firstName) throw new Error("New client needs a first name");
  const email = str(fd, `${name}_email`)?.toLowerCase() ?? null;
  if (email) {
    const existing = await db.contact.findFirst({ where: { studioId, email: { equals: email, mode: "insensitive" } } });
    if (existing) return existing.id;
  }
  const c = await db.contact.create({
    data: { studioId, firstName, lastName: str(fd, `${name}_lastName`), email, phone: str(fd, `${name}_phone`), notes: str(fd, `${name}_notes`) },
  });
  return c.id;
}
