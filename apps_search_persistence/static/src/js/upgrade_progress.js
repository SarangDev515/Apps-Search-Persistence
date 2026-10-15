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
                <header class="asp_upgrade_header">
                    <div class="asp_upgrade_icon" aria-hidden="true"><i class="fa fa-cubes"/></div>
                    <div>
                        <div class="asp_upgrade_eyebrow">SYSTEM UPDATE</div>
                        <h2 id="asp_upgrade_title">Module upgrade</h2>
                    </div>
                    <span class="asp_upgrade_badge"><t t-esc="state.percent === 100 ? 'Completed' : 'In progress'"/></span>
                </header>
                <div class="asp_upgrade_application">
                    <span>Selected applications</span>
                    <strong><t t-esc="state.applicationNames || 'Loading application names…'"/></strong>
                </div>
                <div class="asp_upgrade_metrics">
                    <div class="asp_upgrade_ring" t-att-style="'--asp-progress: ' + state.percent + '%;'"
                         role="progressbar" aria-label="Estimated upgrade progress"
                         aria-valuemin="0" aria-valuemax="100" t-att-aria-valuenow="state.percent"
                         t-att-aria-valuetext="state.percent + '% — ' + state.message">
                        <div class="asp_upgrade_ring_inner"><strong><t t-esc="state.percent"/><span>%</span></strong><small>Estimated</small></div>
                    </div>
                    <div class="asp_upgrade_countdown" role="timer" aria-label="Estimated time remaining">
                        <span>Estimated time remaining</span>
                        <strong><t t-esc="state.remainingTime"/></strong>
                        <small t-if="state.overEstimate" class="asp_upgrade_warning">Taking longer than estimated</small>
                        <small t-else="">Duration may vary by module</small>
                    </div>
                </div>
                <p class="asp_upgrade_caption" role="status" aria-live="polite"><span class="asp_upgrade_status_dot" aria-hidden="true"/><t t-esc="state.message"/></p>
                <div class="asp_upgrade_track" aria-hidden="true"><div t-att-style="'width: ' + state.percent + '%;'"/></div>
                <p class="asp_upgrade_estimate">Progress and time are estimates, not live server measurements.</p>
                <footer class="asp_upgrade_note"><i class="fa fa-info-circle" aria-hidden="true"/><span>Keep this tab open. Odoo will refresh automatically when the upgrade is complete.</span></footer>
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
    dependencies: ["ui", "orm"],
    start(env, { ui, orm }) {
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
        let timer = null;
        let startedAt = 0;
        let ownsBlock = false;
        function stopTimer() {
            if (timer !== null) { browser.clearInterval(timer); timer = null; }
        }
        function close() {
            stopTimer();
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
