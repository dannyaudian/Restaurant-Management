# Copyright (c) 2025, PT. Inovasi Terbaik Bangsa and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _
from restaurant_management.restaurant_management.utils.branch_permissions import filter_allowed_branches

def get_context(context=None):
    """
    Prepare context for the waiter order page.
    
    Args:
        context: The context dictionary that will be passed to the template
    
    Returns:
        The context dictionary with added values
    """
    context = context or {}
    try:
        # --- Cek user login ---
        if frappe.session.user == "Guest":
            frappe.throw(_("You need to be logged in to access this page"), frappe.PermissionError)
        
        # --- Cek role ---
        user_roles = frappe.get_roles(frappe.session.user)
        allowed_roles = ["Waiter", "Restaurant Supervisor", "System Manager", "Restaurant Manager"]
        
        if not any(role in user_roles for role in allowed_roles):
            frappe.throw(
                _("Access denied: You need to have one of these roles: {0}").format(
                    ", ".join(allowed_roles)
                ),
                frappe.PermissionError
            )
        
        # --- Hide dari search/navigation ---
        context.no_cache = 1
        context.no_sitemap = 1
        context.no_breadcrumbs = 1
        context.no_sidebar = 1
        context.hide_from_menu = 1
        context.no_index = 1
        
        # Set page title
        context.title = _("Waiter Order")
        
        # Make CSRF token available to JavaScript
        context.csrf_token = frappe.session.csrf_token
        
        # --- Fetch data utama ---
        branch_meta = frappe.get_meta("Branch")
        branch_fields = ["name"]
        if branch_meta.has_field("branch_code"):
            branch_fields.append("branch_code")
        else:
            frappe.log_error(
                message="'branch_code' field missing in Branch DocType",
                title="Missing Field",
            )

        all_branches = frappe.get_all("Branch", fields=branch_fields) or []
        for b in all_branches:
            b.setdefault("branch_code", "")

        branches = filter_allowed_branches(all_branches) or []
        default_branch = branches[0] if branches else None

        table_meta = frappe.get_meta("Table")
        table_fields = ["name"]
        table_optional = [
            "table_number",
            "seating_capacity",
            "status",
            "branch",
            "current_pos_order",
        ]

        for field in table_optional:
            if table_meta.has_field(field):
                if field == "current_pos_order":
                    table_fields.append(f"{field} as current_order")
                else:
                    table_fields.append(field)
            else:
                frappe.log_error(
                    message=f"'{field}' field missing in Table DocType",
                    title="Missing Field",
                )

        tables = frappe.get_all("Table", fields=table_fields) or []
        for table in tables:
            table.setdefault("table_number", "")
            table.setdefault("seating_capacity", 0)
            table.setdefault("status", "")
            table.setdefault("branch", None)
            table.setdefault("current_order", "")

        item_meta = frappe.get_meta("Item Group")
        ig_fields = ["name"]
        if item_meta.has_field("item_group_name"):
            ig_fields.append("item_group_name")
        else:
            frappe.log_error(
                message="'item_group_name' field missing in Item Group DocType",
                title="Missing Field",
            )

        item_groups = frappe.get_all(
            "Item Group",
            filters={"show_in_website": 1},
            fields=ig_fields,
        ) or []
        for ig in item_groups:
            ig.setdefault("item_group_name", "")
        
        # --- Assign ke context, selalu ada ---
        context.branches = branches
        context.default_branch = default_branch
        context.tables = tables
        context.item_groups = item_groups
        context.user = frappe.session.user
        context.has_branches = bool(branches)
        context.has_tables = bool(tables)
        context.error_message = ""
        
    except Exception as e:
        frappe.log_error(
            message=f"Error loading waiter order page: {str(e)}",
            title="Waiter Order Page Error"
        )
        # Context minimal jika error
        context.branches = []
        context.tables = []
        context.item_groups = []
        context.has_branches = False
        context.has_tables = False
        context.default_branch = None
        context.error_message = _("Unable to load waiter order page. Please check error logs.")
    
    return context