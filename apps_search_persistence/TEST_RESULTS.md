# Validation results — 2026-10-14

## Actual completed checks

- Exact local Odoo 19 source inspection: completed; files and APIs documented in README.
- Installation on a new database apps_search_persistence_test_20261014: PASS. Odoo initialized base, web and apps_search_persistence successfully and loaded the registry. No existing database changed.
- Extension model/schema changes: none.
- Mocked JavaScript regression scenarios: 12 PASS, using the actual extension file.
  - List full search-state handoff and one-shot consumption.
  - Kanban full search-state handoff and one-shot consumption.
  - Installation passthrough.
  - Uninstallation passthrough.
  - Non-Apps action excluded.
  - Form view excluded.
  - Different destination rejects and consumes stale state.
  - Changed user rejects state.
  - Existing/new action state is not overwritten.
  - Sequential upgrade handoffs.
  - Malformed saved JSON ignored.
  - Expired state ignored.

These are service-level simulations, not live List/Kanban result verification. The native Odoo SearchModel implementation was inspected, not simulated as proof of live UI success.

## Live browser status

The isolated server was launched on localhost:8097 and its sign-in page opened. Private sign-in handoff failed because it requires HTTPS. The subsequent question requesting authorization to use the clean database's default administrator was skipped. Therefore no authenticated browser upgrade was attempted.

- Test A List live upgrade: NOT RUN.
- Test B Kanban live upgrade: NOT RUN.
- Tests C/D/E partial, multiple results, filters: NOT RUN live.
- Test F navigation: mocked guard coverage only; NOT RUN live.
- Test G repeated upgrades: mocked handoff coverage only; NOT RUN live.
- Test H install/uninstall operations through UI and console errors: NOT RUN live. Initial CLI installation passed; pass-through behavior covered by mocks.

The deliverable is implemented and clean-install validated, but the user's full acceptance criteria remain unverified until authenticated live tests are completed.

## Revision 19.0.1.0.1

User observed a live failure in the initial version: upgrading from the Apps Kanban card menu still opened Discuss. User confirmed installation and requested file-only remediation without browser verification.

Revision: use read-only native RPC event observation; match exact upgrade request and successful reload response; key state by the action service rather than the environment object. Added coverage for failed upgrade, non-reload response, intentional navigation during upgrade and reload handler invoked with another environment sharing the same action service.

Initial clean installation evidence above applies to 19.0.1.0.0. The revised version requires deployment and live verification in the intended database. No existing database was upgraded by this file-only change.

Revised JavaScript syntax check: PASS. Revised event-based regression suite: 16 mocked scenarios PASS. Live List/Kanban upgrade result remains unverified.

## Revision 19.0.1.0.2: actual native return diagnosed

An initial real backend upgrade test returned {'type': 'ir.actions.act_url', 'target': 'self', 'url': '/odoo'}, proving that the earlier frontend-only implementations did not cover the normal upgrade return. Odoo ir.module.module.next() returns this home URL when no configuration todo is open.

The new method extension calls the original immediate upgrade, converts only this default home URL into a full-reload client action targeting Apps, and corrects the destination of existing reload actions. Configuration/wizard actions, other URL destinations, installation/uninstallation and explicitly different source actions remain untouched.

Deployment requires a server restart to import the new models files, a module upgrade in the intended database and a hard browser refresh. The working database was not changed.

After correction, REAL Odoo immediate upgrade in isolated database: PASS. Returned ir.actions.client/reload with Apps menu_id=49 and action_id=39. Frontend mocked regression suite: 16 PASS. Python syntax validation: PASS. Live browser search/results and view restoration remain unverified.

## Version 19.0.1.0.3 progress overlay
JavaScript syntax: PASS. SCSS compilation using installed Odoo libsass: PASS after correcting mixed-unit min() compatibility. Progress lifecycle simulation: PASS (ignored installation, request start, capped estimate, response matching, confirmed completion, cleanup, failure, wizard and URL reload). Existing 16 search-persistence regression checks: PASS. Browser visual/focus behavior NOT VERIFIED; this remains file-only work.

## Version 19.0.1.0.4 application names
JS syntax and SCSS compilation: PASS. Single application name, multiple comma-separated names, deduplicated selected IDs, asynchronous missing-name lookup and cleanup: PASS in mocked service tests. Previous progress lifecycle checks and 16 search-state regression scenarios: PASS. Live browser rendering remains unverified.
