from odoo import models


class IrModuleModule(models.Model):
    _inherit = "ir.module.module"

    def button_immediate_upgrade(self):
        # Keep the normal access checks, RPC, registry rebuild and upgrade.
        # Resolve before super: an upgrade may replace the registry/environment.
        apps_action = self.env.ref("base.open_module_tree")
        apps_action_id = apps_action.id
        apps_menu = self.env.ref("base.menu_module_tree")
        apps_menu_id = apps_menu.id
        params = self.env.context.get("params") or {}
        source_action = params.get("action")
        from_apps = source_action is None or source_action in (
            apps_action_id, str(apps_action_id), "apps", "base.open_module_tree"
        )
        # Native object buttons can omit params.action entirely. Immediate
        # module upgrades without an explicit other action return to Apps;
        # an explicitly different action retains its standard destination.
        result = super().button_immediate_upgrade()
        # Odoo 19 next() normally returns this URL action before the reload
        # fallback is reached. Convert only its default-home redirect.
        if (from_apps and isinstance(result, dict)
                and result.get("type") == "ir.actions.act_url"
                and result.get("target") == "self"
                and result.get("url") == "/odoo"):
            result = {
                "type": "ir.actions.client",
                "tag": "reload",
                "params": {"menu_id": apps_menu_id, "action_id": apps_action_id},
            }
        if (from_apps and isinstance(result, dict)
                and result.get("type") == "ir.actions.client"
                and result.get("tag") == "reload"):
            result = dict(result)
            result["params"] = dict(result.get("params") or {})
            result["params"].update({
                "menu_id": apps_menu_id,
                "action_id": apps_action_id,
            })
        return result
