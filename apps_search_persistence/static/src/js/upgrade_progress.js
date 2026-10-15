/** @odoo-module **/

import { Component, reactive, useState, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { browser } from "@web/core/browser/browser";
import { rpcBus } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";
import { useActiveElement } from "@web/core/ui/ui_service";

// Initial visual estimate only: the upgrade RPC does not expose server timing.
const ESTIMATED_UPGRADE_MS = 90_000;
function formatRemaining(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export class UpgradeProgress extends Component {
    static props = {};
    static template = xml`
        <div t-if="state.visible" class="asp_upgrade_backdrop" role="dialog"
             aria-modal="true" aria-labelledby="asp_upgrade_title" t-ref="root" tabindex="-1">
            <section class="asp_upgrade_card" t-att-aria-busy="state.percent !== 100">
                <h2 id="asp_upgrade_title">Upgrading module</h2>
                <p class="asp_upgrade_module_name"><t t-esc="state.applicationNames || 'Loading module name…'"/></p>
                <p class="asp_upgrade_caption" role="status" aria-live="polite"><t t-esc="state.message"/></p>
                <div class="asp_upgrade_track" role="progressbar" aria-label="Estimated upgrade progress"
                     aria-valuemin="0" aria-valuemax="100" t-att-aria-valuenow="state.percent">
                    <div t-att-style="'width: ' + state.percent + '%;'"/>
                </div>
                <div class="asp_upgrade_details">
                    <strong><t t-esc="state.percent"/>%</strong>
                    <span>Estimated time: <strong><t t-esc="state.remainingTime"/></strong></span>
                </div>
                <p t-if="state.overEstimate" class="asp_upgrade_warning">Taking longer than estimated. Waiting for Odoo to finish.</p>
                <p class="asp_upgrade_note">Progress and time are estimates. Keep this tab open; Odoo will refresh automatically.</p>
            </section>
        </div>
    `;
    setup() {
        this.state = useState(useService("apps_upgrade_progress").state);
        useActiveElement("root");
    }
}

registry.category("main_components").add("AppsUpgradeProgress", { Component: UpgradeProgress });

registry.category("services").add("apps_upgrade_progress", {
    dependencies: ["ui", "orm", "title"],
    start(env, { ui, orm, title }) {
        const state = reactive({ visible: false, percent: 0, message: "Waiting for Odoo…", applicationNames: "", remainingTime: "01:30", overEstimate: false });
        const requests = new Set();
        const nameCache = new Map();
        const selectedIds = new Set();
        let generation = 0;
        function cacheNames(records) {
            for (const record of records || []) {
                if (!record || typeof record !== "object") { continue; }
                const name = record.shortdesc || record.display_name || record.name;
                if (Number.isInteger(record.id) && typeof name === "string" && name) {
                    nameCache.set(record.id, name);
                }
            }
        }
        function updateNames() {
            state.applicationNames = [...selectedIds].map(id => nameCache.get(id) || "Loading application name…").join(", ");
        }
        function loadNames(ids) {
            for (const id of ids) { selectedIds.add(id); }
            updateNames();
            const missing = ids.filter(id => !nameCache.has(id));
            if (!missing.length) { return; }
            const currentGeneration = generation;
            // Normally available from the native List/Kanban read response.
            // Read missing selected records only; never delay or change upgrade.
            orm.read("ir.module.module", missing, ["shortdesc", "name"])
                .then(records => {
                    cacheNames(records);
                    if (state.visible && generation === currentGeneration) { updateNames(); }
                })
                .catch(() => {
                    if (state.visible && generation === currentGeneration) {
                        for (const id of missing) { if (!nameCache.has(id)) { nameCache.set(id, "Selected application"); } }
                        updateNames();
                    }
                });
        }
        const TITLE_KEY = "apps_upgrade_progress";
        let ownsTitle = false;
        let lastTitle = "";
        function updateTabTitle() {
            const text = "| " + state.percent + "% | " + state.remainingTime.replace(":", " : ") +
                " | " + (state.percent === 100 ? "Complete" : "Progress") + " |";
            if (!ownsTitle) {
                // Lead with progress in narrow tabs; preserve Odoo title parts/counters.
                const parts = title.getParts();
                title.setParts(Object.fromEntries(Object.keys(parts).map(key => [key, null])));
                title.setParts({ [TITLE_KEY]: text, ...parts });
                ownsTitle = true;
            } else if (text !== lastTitle) {
                title.setParts({ [TITLE_KEY]: text });
            }
            lastTitle = text;
        }
        function restoreTabTitle() {
            if (ownsTitle) { title.setParts({ [TITLE_KEY]: null }); }
            ownsTitle = false;
            lastTitle = "";
        }
        let timer = null;
        let startedAt = 0;
        let ownsBlock = false;
        function stopTimer() {
            if (timer !== null) { browser.clearInterval(timer); timer = null; }
        }
        function close() {
            stopTimer();
            restoreTabTitle();
            requests.clear();
            selectedIds.clear();
            generation++;
            state.applicationNames = "";
            state.visible = false;
            state.remainingTime = formatRemaining(ESTIMATED_UPGRADE_MS);
            state.overEstimate = false;
            if (ownsBlock) { ownsBlock = false; ui.unblock(); }
        }
        function tick() {
            // Visual estimate only. Never report completion before success.
            const elapsed = Math.max(0, Date.now() - startedAt);
            state.remainingTime = formatRemaining(ESTIMATED_UPGRADE_MS - elapsed);
            state.overEstimate = elapsed >= ESTIMATED_UPGRADE_MS;
            state.percent = Math.min(95, Math.floor(5 + 90 * (1 - Math.exp(-elapsed / 30000))));
            state.message = state.percent >= 90 ? "Still waiting for Odoo to finish…" : "Odoo is processing the upgrade…";
            updateTabTitle();
        }
        rpcBus.addEventListener("RPC:REQUEST", ({ detail }) => {
            const params = detail.data?.params;
            if (params?.model !== "ir.module.module" || params.method !== "button_immediate_upgrade") { return; }
            requests.add(detail.data.id);
            if (!state.visible) {
                state.percent = 5;
                state.remainingTime = formatRemaining(ESTIMATED_UPGRADE_MS);
                state.overEstimate = false;
                state.message = "Odoo is processing the upgrade…";
                state.visible = true;
                startedAt = Date.now();
                ownsBlock = true;
                ui.block({ delay: 0 });
                updateTabTitle();
                timer = browser.setInterval(tick, 250);
            }
            const recordIds = params.args?.[0];
            const ids = (Array.isArray(recordIds) ? recordIds : [recordIds]).filter(Number.isInteger);
            loadNames(ids);
        });
        rpcBus.addEventListener("RPC:RESPONSE", ({ detail }) => {
            // Capture names already loaded by Odoo; no DOM text scraping.
            if (detail.data?.params?.model === "ir.module.module" && !detail.error) {
                const records = Array.isArray(detail.result) ? detail.result : detail.result?.records;
                if (Array.isArray(records)) {
                    cacheNames(records);
                    if (state.visible && selectedIds.size) { updateNames(); }
                }
            }
            if (!requests.delete(detail.data?.id)) { return; }
            if (detail.error) { close(); return; }
            if (requests.size) { return; }
            stopTimer();
            const result = detail.result;
            const willReload = (result?.type === "ir.actions.client" && result.tag === "reload") ||
                (result?.type === "ir.actions.act_url" && result.target === "self");
            if (willReload) {
                state.percent = 100;
                state.remainingTime = "00:00";
                state.overEstimate = false;
                state.message = "Upgrade completed. Refreshing Odoo…";
                updateTabTitle();
            } else {
                // Release the screen for configuration wizards and other actions.
                close();
            }
        });
        env.bus.addEventListener("ACTION_MANAGER:UI-UPDATED", () => {
            if (!requests.size) { close(); }
        });
        return { state };
    },
});
