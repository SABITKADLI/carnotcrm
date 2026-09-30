import assert from "node:assert/strict";
import test from "node:test";
import {
  LOGIN_ROLES,
  PARTNER_VIEW_ACCESS,
  VISIBLE_APP_VIEWS,
  homeForRole,
  viewsForRole,
} from "../src/lib/access";
import {
  SYSTEM_GUIDE_SCREENS,
  SYSTEM_ROLE_GUIDES,
} from "../src/components/system-help";

test("the Settings guide covers every visible page and login role", () => {
  const documentedViews = SYSTEM_GUIDE_SCREENS.map((item) => item.view);
  assert.deepEqual(
    [...new Set(documentedViews)].sort(),
    [...VISIBLE_APP_VIEWS].sort(),
  );

  const documentedRoles = SYSTEM_ROLE_GUIDES.map((item) => item.role);
  assert.deepEqual(
    [...new Set(documentedRoles)].sort(),
    [...LOGIN_ROLES].sort(),
  );

  for (const views of Object.values(PARTNER_VIEW_ACCESS)) {
    for (const view of views) assert.ok(VISIBLE_APP_VIEWS.includes(view));
  }
  for (const role of LOGIN_ROLES) {
    assert.ok(viewsForRole(role).includes(homeForRole(role)));
  }
});

test("the guide labels the known connection gaps honestly", () => {
  const status = Object.fromEntries(
    SYSTEM_GUIDE_SCREENS.map((item) => [item.view, item.status]),
  );
  assert.equal(status.customers, "separate");
  assert.equal(status.cutting, "separate");
  assert.equal(status.reports, "partial");
  assert.equal(status.production, "connected");
  assert.equal(status.invoices, "connected");
});
