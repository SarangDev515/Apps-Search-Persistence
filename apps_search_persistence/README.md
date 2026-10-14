# Apps Search Persistence — Odoo 19.0

LGPL-3 extension. Includes a small ir.module.module method extension and frontend search-state handoff. No new models, database fields, controllers, XML, external libraries or paid dependencies.

## Installation

1. Place the `apps_search_persistence` directory in an addons directory. This copy is in `D:\ODOO PROJECTS\ODOO-19\extra_addons`, already included in the inspected odoo.conf.
2. Restart Odoo so it discovers the addon.
3. Enable developer mode; open Apps > Update Apps List. Remove the default Apps filter (this is a technical addon), search Apps Search Persistence and install it.
4. Reload the browser to load the new backend assets. If updating this extension later, upgrade it and reload; use debug=assets to diagnose stale asset bundles.

ZIP installation: extract the ZIP into the addons directory; it contains one top-level apps_search_persistence folder. It is a standard source addon archive, not a promise that Community Odoo supports uploading arbitrary Python addon ZIPs through its UI.

## Usage

Use the existing Apps Upgrade button in List or Kanban. Commit a search term to a search facet before clicking Upgrade. The full search model, active filters, grouping, search-panel state and current view are handed to Odoo's native restoration path. No replacement buttons.

## Verified Odoo 19 source and root cause

Inspected the installed source tree at D:\ODOO PROJECTS\ODOO-19:

- odoo/addons/base/models/ir_module.py: button_immediate_upgrade calls _button_immediate_function. After rebuilding the registry, it calls next(). With no open configuration todo, next() returns an ir.actions.act_url to /odoo (target self), so the client-reload fallback with the first root menu is normally not reached. An actual isolated database upgrade confirmed this URL return.
- odoo/addons/base/views/ir_module_views.xml: base.open_module_tree has path apps, model ir.module.module and kanban,list,form views.
- addons/web/static/src/webclient/actions/client_actions.js: the registered reload function replaces the route with menu_id/action_id when supplied, then calls router.pushState with reload=true.
- addons/web/static/src/webclient/actions/action_service.js: exposes doActionButton/currentController; controller.getGlobalState collects native state; loadState/_getActionParams passes route.globalState to the view.
- addons/web/static/src/search/with_search/with_search.js: serializes SearchModel.exportState into globalState.searchModel and awaits SearchModel.load({state}) before rendering controllers.
- addons/web/static/src/search/search_model.js: load imports config.state, including query/searchItems and serialized search-panel structures.

The normal upgrade redirects to the /odoo home URL, losing the Apps route and in-memory search state during navigation. The reload fallback can also select the first root menu. Both default redirect cases are handled by the small backend extension in version 19.0.1.0.2. Restoring input text alone would not restore the actual domain.

## Implementation

A service depending on action observes the native rpcBus RPC:REQUEST and RPC:RESPONSE events without changing requests, responses or methods. For ir.module.module/button_immediate_upgrade from the actual Apps action in List/Kanban, it snapshots controller.getGlobalState before the request. Only a successful matching response returning the reload client action arms restoration. A small wrapper around the registered reload action handles only that operation and controller. The handoff is keyed by the action service rather than an environment object. It stores a one-shot handoff, keeps the Apps route and view_type, then delegates to the original full reload handler without its root-menu redirect. The RPC, registry rebuild and full web-client reload are unchanged.

On the next startup the service consumes the handoff and injects globalState into the route. Odoo itself loads that state before the view's data query; no DOM manipulation, arbitrary waits or separate controller implementations are used.

Storage is sessionStorage (tab-local), scoped by database/user and exact destination URL, expires after ten minutes and is consumed before restoration. Searches are never saved during ordinary navigation. Failed operations and responses without a reload discard the in-memory token. A different route, malformed data, changed user/database, expired state or an existing globalState prevents restoration. Installation/uninstallation and other reload actions delegate unchanged. If browser storage is unavailable, the standard upgrade continues unchanged, without persistence.

No state is shared through localStorage. A duplicated tab may inherit its initial sessionStorage copy according to browser behavior, but subsequent changes are independent; a handoff lasts only until the immediate next startup.

## Scope and limitations

- Targets the ordinary immediate Apps Upgrade button; it deliberately does not redirect installation/setup wizards or custom upgrade actions that return something other than reload.
- Does not preserve uncommitted text still in the autocomplete input: select/commit the search facet first, as with native Odoo search state.
- Restores the original filters faithfully. If an upgraded app genuinely ceases to match a selected filter, it will not be forced into the result set.
- Third-party replacements of the action service/reload handler may require compatibility testing.
- No existing operational database was changed during validation.

## Automated regression tests

With Node.js available, run:

`node apps_search_persistence/tests/regression.cjs`

Node is required only to run this developer test file, not to install or operate the addon. Tests evaluate the actual extension JavaScript against mocked Odoo services, registry and browser storage. They do not replace live UI tests.

## Live acceptance checklist

On a clean Odoo 19 database with this addon installed:

A. List: remove Apps filter if needed, search an installed test module, select List, upgrade. Confirm facets, List mode and results after full reload.
B. Kanban: repeat A in Kanban.
C. Partial: search a partial name, upgrade a matching installed module; compare facets and results.
D. Multiple results: choose a term matching several installed modules, upgrade one, compare the filtered set after reload.
E. Filters: combine Apps/Installed or applicable category filters and a term, upgrade, compare filters and resulting domain.
F. Navigation: search, leave for Settings without upgrading, return; verify no extension handoff was restored. Native Odoo navigation behavior is not overridden.
G. Repeated: upgrade two matching modules sequentially, verifying search after each reload.
H. Normal operations: install a disposable test addon, upgrade it, uninstall it; confirm normal wizard flow and no frontend errors.

Also test empty searches, zero-result searches (safe navigation), failed upgrades, two independent tabs and blocked sessionStorage. Inspect the browser console for errors.

See TEST_RESULTS.md for the actual validation status. Do not treat this checklist as evidence that all tests have passed.

## Version 19.0.1.0.1 update

The user reported that upgrading from a Kanban card menu still redirected to Discuss. This revision replaces the button-service wrapper with native request/response event observation and keys the handoff by action service identity. This covers native Upgrade requests without depending on a particular button callback or environment object identity. The exact live failure cause was not confirmed because browser verification was declined.

After replacing files, upgrade Apps Search Persistence itself in the intended database. Its first upgrade may still redirect because the old assets are executing. After that completes, hard-refresh the browser (Ctrl+Shift+R), return to Apps, apply the search and retry the Kanban card Upgrade. A server restart alone does not regenerate the installed module asset bundle. If necessary, use debug=assets and verify the registered apps_search_persistence service and JS file. No database upgrade or server restart was performed in the user database for this revision.

## Version 19.0.1.0.2: backend redirect correction

The user reported that both earlier frontend-only revisions still redirected to Discuss. This version also extends ir.module.module.button_immediate_upgrade. It calls super() unchanged, then converts only the default ir.actions.act_url /odoo target-self result to an ir.actions.client reload. For that result or an existing reload from Apps (or an immediate upgrade with no explicit source action), it sets menu_id to base.menu_module_tree and action_id to base.open_module_tree. An explicitly different source action keeps its original destination. Installation/uninstallation methods and configuration/wizard results are not changed. The full browser reload remains.

This makes the Apps destination explicit on the backend, independent of the frontend reload wrapper. Frontend assets still must be loaded to restore search/filter state. It does not prove search restoration in a real browser.

DEPLOYMENT REQUIRED: restart the running Odoo server to import the new Python files, upgrade Apps Search Persistence in the intended database, then Ctrl+Shift+R. The on-disk code alone does not update a running server. Neither the working server nor its database was changed automatically.

## Version 19.0.1.0.3: centered upgrade progress

The extension now shows a centered modal progress card with a full-screen blurred/dimmed backdrop during ir.module.module.button_immediate_upgrade. The card includes a circular percentage indicator, progress bar and server-waiting message. It uses Owl, the supported main_components registry, native RPC events and a balanced ui.block/ui.unblock pair. Focus is held by Odoo's useActiveElement hook. Install/uninstall requests do not trigger it.

IMPORTANT: the percentage is an estimate, not database/module-loading telemetry. It starts at 5%, asymptotically advances and remains below 100% while awaiting Odoo. Only a successful server response requiring a refresh displays 100%. Errors release the overlay immediately so Odoo can show its error; configuration wizards release it as well. A pending operation has no cancel control and the overlay does not cancel or change the upgrade RPC. The animation timer does not control upgrade timing.

No cross-reload progress is persisted. The page reload naturally removes the overlay. Upgrade this extension and hard refresh the browser to load the new JS/SCSS. The current tab can display the overlay only after the assets containing it have loaded; the first upgrade using older assets will not show it.

Run additional tests with: node apps_search_persistence/tests/progress.cjs. Rendering, centering, blur and focus behavior still require real browser verification.

## Version 19.0.1.0.4: application names

The overlay heading displays Upgrading: followed by the selected application display names (shortdesc). Multiple selected application names are separated by commas in selection order, with duplicate IDs removed. Names are cached from native Odoo module read responses; if missing, only selected records are read asynchronously without delaying the upgrade. No DOM scraping. A missing-name lookup cannot update an overlay from a later operation. If names cannot be read, the heading falls back to Selected application rather than inventing a name.

Upgrade this extension and hard-refresh to load the new JavaScript.
