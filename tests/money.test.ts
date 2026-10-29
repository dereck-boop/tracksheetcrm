import { test } from "node:test";
import assert from "node:assert/strict";
import { totals } from "../lib/money";
import { balance, defaultDepositPercent, depositAmount, dueNow } from "../lib/invoices";

test("totals add lines, take off the discount and tax only taxable lines", () => {
  const t = totals(
    [
      { description: "Mixing", quantity: 2, unitPrice: 15000, taxable: true },
      { description: "Deposit paid (INV-1)", quantity: 1, unitPrice: -5000, taxable: false },
    ],
    10,
    1000,
  );
  assert.equal(t.subtotal, 25000);
  assert.equal(t.total, t.subtotal - 1000 + t.tax);
  assert.ok(t.tax > 0);
});

test("balance never goes below zero", () => {
  assert.equal(balance({ total: 10000, amountPaid: 12000 }), 0);
  assert.equal(balance({ total: 10000, amountPaid: 2500 }), 7500);
});

test("the pay link asks for the deposit first, then the rest", () => {
  const inv = { total: 200000, amountPaid: 0, depositPercent: 50 };
  assert.equal(depositAmount(inv), 100000);
  assert.deepEqual(dueNow(inv), { amount: 100000, deposit: true });
  assert.deepEqual(dueNow({ ...inv, amountPaid: 100000 }), { amount: 100000, deposit: false });
  assert.deepEqual(dueNow({ ...inv, depositPercent: null }), { amount: 200000, deposit: false });
});

test("no deposit under the minimum", () => {
  const studio = { depositPercent: 50, depositMinimum: 100000 };
  assert.equal(defaultDepositPercent(studio, 99999, ["Mixing"]), null);
  assert.equal(defaultDepositPercent(studio, 150000, ["Tracking day"]), 50);
  assert.equal(defaultDepositPercent({ depositPercent: 0, depositMinimum: 0 }, 150000, ["Mastering"]), null);
});
