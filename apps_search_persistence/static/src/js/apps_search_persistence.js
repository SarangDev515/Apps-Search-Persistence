/** @odoo-module **/

import "@web/webclient/actions/client_actions";
import { browser } from "@web/core/browser/browser";
import { router } from "@web/core/browser/router";
import { registry } from "@web/core/registry";
import { rpcBus } from "@web/core/network/rpc";
import { user } from "@web/core/user";
import { session } from "@web/session";

// One short-lived, tab-local handoff. Never persist ordinary Apps searches.
const KEY = "apps_search_persistence.v2";
const MAX_AGE = 10 * 60 * 1000;
const upgrades = new WeakMap();
const actions = registry.category("actions");
const standardReload = actions.get("reload");

function removeSaved() {
    try {
        browser.sessionStorage.removeItem(KEY);
    } catch {
        // Storage restrictions must not break a module operation.
    }
}

function isApps(controller) {
    const action = controller?.action;
    return action?.type === "ir.actions.act_window" &&
        action.res_model === "ir.module.module" &&
        (action.path === "apps" || action.xml_id === "base.open_module_tree") &&
        ["list", "kanban"].includes(controller.props?.type);
}

function identity() {
    return { db: session.db, uid: user.userId };
}

function restoreOnce() {
    let raw;
    try {
        raw = browser.sessionStorage.getItem(KEY);
    } catch {
        return;
    }
    // Consume before doing anything else: no stale restore or reload loop.
    removeSaved();
    if (!raw) {
        return;
    }
    try {
        const saved = JSON.parse(raw);
        const who = identity();
        const age = Date.now() - saved.timestamp;
        if (saved.db !== who.db || saved.uid !== who.uid ||
            age < 0 || age > MAX_AGE ||
            !["list", "kanban"].includes(saved.route?.view_type) ||
            router.stateToUrl(router.current) !== saved.url ||
            router.current.globalState || !saved.globalState?.searchModel) {
            return;
        }
        // Odoo's action service passes globalState to WithSearch, which loads
        // SearchModel with config.state before the controller queries records.
        router.replaceState({ globalState: saved.globalState }, { sync: true });
    } catch {
        // Malformed or obsolete data is ignored, not applied to a new search.
    }
}

// Delegate ALL reloads except the reload returned by an Apps Upgrade operation.
function reloadWithAppsState(env, action) {
    const service = env.services.action;
    const pending = upgrades.get(service);
    if (!pending || !pending.ready || service.currentController !== pending.controller) {
        return standardReload(env, action);
    }
    // Consume the in-memory token before requesting the standard full reload.
    upgrades.delete(service);
    const route = { ...pending.route };
    delete route.globalState;
    delete route.resId;
    delete route.active_id;
    delete route.active_ids;
    route.action = pending.controller.action.path || pending.controller.action.id;
    route.view_type = pending.controller.props.type;
    route.actionStack = [{ action: route.action, view_type: route.view_type }];
    try {
        browser.sessionStorage.setItem(KEY, JSON.stringify({
            ...identity(), timestamp: Date.now(), route,
            url: router.stateToUrl(route), globalState: pending.globalState,
        }));
    } catch {
        // Preserve the normal backend-selected destination if storage fails.
        removeSaved();
        return standardReload(env, action);
    }
    router.replaceState(route, { replace: true, sync: true });
    // The backend's menu_id is the first root menu, NOT necessarily Apps.
    // Omitting only that redirect preserves Apps while retaining full reload.
    return standardReload(env, { ...action, params: {} });
}

actions.add("reload", reloadWithAppsState, { force: true });

registry.category("services").add("apps_search_persistence", {
    dependencies: ["action"],
    start(env, { action }) {
        // Invalidate any handoff from the previous implementation.
        try { browser.sessionStorage.removeItem("apps_search_persistence.v1"); } catch {}
        restoreOnce();
        rpcBus.addEventListener("RPC:REQUEST", ({ detail }) => {
            const params = detail.data?.params;
            const controller = action.currentController;
            if (params?.model !== "ir.module.module" ||
                params.method !== "button_immediate_upgrade" || !isApps(controller)) {
                return;
            }
            removeSaved();
            upgrades.delete(action);
            try {
                const globalState = JSON.parse(JSON.stringify(controller.getGlobalState?.()));
                if (globalState?.searchModel) {
                    upgrades.set(action, {
                        requestId: detail.data.id, controller, globalState,
                        route: { ...router.current }, ready: false,
                    });
                }
            } catch {
                // Export failure must not affect the standard operation.
            }
        });
        rpcBus.addEventListener("RPC:RESPONSE", ({ detail }) => {
            const pending = upgrades.get(action);
            if (!pending || pending.requestId !== detail.data?.id) {
                return;
            }
            if (detail.error || detail.result?.type !== "ir.actions.client" ||
                detail.result.tag !== "reload" || action.currentController !== pending.controller) {
                upgrades.delete(action);
                return;
            }
            pending.ready = true;
        });
        env.bus.addEventListener("ACTION_MANAGER:UI-UPDATED", () => {
            const pending = upgrades.get(action);
            if (pending && action.currentController !== pending.controller) {
                upgrades.delete(action);
                removeSaved();
            }
        });
        return {};
    },
});
