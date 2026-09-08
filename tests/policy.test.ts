import test from "node:test";
import assert from "node:assert/strict";
import {
  assertEligible,
  productEligible,
  publicationStatus,
  reviewInput,
} from "../app/services/policy";
import { sameOrigin, boundedForm } from "../app/services/http.server";
const now = new Date("2026-09-08"),
  valid = {
    fulfilledAt: new Date("2026-09-01"),
    dueAt: now,
    expiresAt: new Date("2026-10-01"),
    consumedAt: null,
    revoked: false,
    order: { cancelled: false },
  };
test("eligible only inside invitation window with fulfilled uncancelled unused order", () => {
  assert.doesNotThrow(() => assertEligible(valid, now));
  for (const change of [
    { fulfilledAt: new Date("2027-01-01") },
    { dueAt: new Date("2027-01-01") },
    { expiresAt: now },
    { consumedAt: now },
    { revoked: true },
    { order: { cancelled: true } },
  ])
    assert.throws(() => assertEligible({ ...valid, ...change }, now));
});
test("eligibility supports all products and union of product/collection selections", () => {
  assert.equal(productEligible("", "", "1", []), true);
  assert.equal(productEligible("1,2", "", "1", []), true);
  assert.equal(productEligible("1", "8", "2", ["8"]), true);
  assert.equal(productEligible("1", "8", "2", ["9"]), false);
  assert.equal(productEligible("12", "", "2", []), false);
});
test("required proof fails closed and mock always stays pending", () => {
  assert.throws(() => publicationStatus(true, false, false, true));
  assert.equal(publicationStatus(true, false, true, true), "pending");
  assert.equal(publicationStatus(true, true, false, true), "published");
  assert.equal(publicationStatus(false, false, false, true), "published");
  assert.equal(publicationStatus(true, true, false, false), "pending");
});
test("rating and review text have bounded validation", () => {
  for (const rating of [0, 6, 1.5, "NaN"])
    assert.equal(
      reviewInput.safeParse({
        rating,
        title: "Good",
        body: "A real experience",
      }).success,
      false,
    );
  assert.equal(
    reviewInput.safeParse({
      rating: 1,
      title: " A title ",
      body: " Honest negative experience ",
    }).success,
    true,
  );
  assert.equal(
    reviewInput.safeParse({ rating: 5, title: "ok", body: "short" }).success,
    false,
  );
});
test("public mutations reject absent and foreign origins", () => {
  for (const origin of [null, "https://attacker.example"])
    assert.throws(() =>
      sameOrigin(
        new Request("https://reviews.example.com/api", {
          method: "POST",
          headers: origin ? { origin } : {},
        }),
      ),
    );
  assert.doesNotThrow(() =>
    sameOrigin(
      new Request("https://reviews.example.com/api", {
        method: "POST",
        headers: { origin: "https://reviews.example.com" },
      }),
    ),
  );
});
test("body limit applies even without Content-Length", async () => {
  await assert.rejects(
    boundedForm(
      new Request("https://reviews.example.com/api", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "a=" + "x".repeat(64001),
      }),
    ),
    (e) => e instanceof Response && e.status === 413,
  );
});
