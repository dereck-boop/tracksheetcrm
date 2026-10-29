import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyMessage, withError } from "../lib/actionErrors";
import { isEmail } from "../lib/turnstile";

test("our own messages are shown; technical errors get a general one", () => {
  assert.equal(friendlyMessage(new Error("Add at least one line item")), "Add at least one line item");
  class PrismaClientKnownRequestError extends Error {}
  assert.match(friendlyMessage(new PrismaClientKnownRequestError("Unique constraint failed on the fields: (`email`)")), /Something went wrong/);
  assert.match(friendlyMessage("oops"), /Something went wrong/);
});

test("errors go back to the same page, never to another site", () => {
  assert.equal(withError("https://crm.example.com/invoices/new?x=1", "crm.example.com", "Oops"), "/invoices/new?x=1&error=Oops");
  assert.equal(withError("https://evil.example/phish", "crm.example.com", "Oops"), "/dashboard?error=Oops");
  assert.equal(withError(null, "crm.example.com", "Oops"), "/dashboard?error=Oops");
});

test("email check", () => {
  assert.ok(isEmail("jane@example.com"));
  assert.ok(!isEmail("jane@example"));
  assert.ok(!isEmail("not an email"));
});
