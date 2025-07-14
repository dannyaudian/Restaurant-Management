# Copyright (c) 2025, PT. Inovasi Terbaik Bangsa and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _


def get_context(context=None):
    """
    Set up context for the restaurant table display page.
    This page is accessible by guests without login but hidden from navigation elements.
    Designed to show real-time table status without appearing in ERPNext navigation.
    """
    context = context or {}
    
    try:
        # Hide this page from navigation elements and search indexing
        context.no_cache = 1
        context.no_index = 1
        context.no_sidebar = 1
        context.hide_from_menu = 1
        context.no_breadcrumbs = 1
        context.no_sitemap = 1
        
        # Set page title
        context.title = _("Table Overview")
        context.error_message = ""
        
        # Make CSRF token available to JavaScript
        context.csrf_token = getattr(frappe.session, 'csrf_token', '')
        
        # Fetch meta for optional fields
        branch_meta = frappe.get_meta("Branch")
        branch_fields = ["name"]
        if branch_meta.has_field("branch_code"):
            branch_fields.append("branch_code")
        else:
            frappe.log_error(
                message="'branch_code' field missing in Branch DocType",
                title="Missing Field",
            )

        # Get all branches
        branches = frappe.get_all(
            "Branch",
            fields=branch_fields,
        ) or []
        for b in branches:
            b.setdefault("branch_code", "")
        
        # Set default branch (first available or None)
        default_branch = branches[0] if branches else None
        
        # Determine available fields for the Table DocType
        meta = frappe.get_meta("Table")

        table_fields = ["name"]
        optional_fields = [
            "table_number",
            "seating_capacity",
            "status",
            "branch",
            "current_pos_order",
        ]

        for field in optional_fields:
            if meta.has_field(field):
                if field == "current_pos_order":
                    table_fields.append(f"{field} as current_order")
                else:
                    table_fields.append(field)
            else:
                frappe.log_error(
                    message=f"'{field}' field missing in Table DocType",
                    title="Missing Field",
                )

        # Get all tables with relevant fields
        tables = frappe.get_all(
            "Table",
            fields=table_fields
        ) or []

        # Provide fallback values for tables
        for table in tables:
            table.setdefault("table_number", "")
            table.setdefault("seating_capacity", 0)
            table.setdefault("status", "")
            table.setdefault("branch", None)
            table.setdefault("current_order", "")
        
        # Add data to context
        context.branches = branches
        context.default_branch = default_branch
        context.tables = tables
        context.has_branches = bool(branches)
        
    except Exception as e:
        frappe.log_error(
            message=f"Error loading table display page: {str(e)}",
            title="Table Display Page Error"
        )
        # Provide minimal context in case of error to prevent page crash
        context.branches = []
        context.tables = []
        context.has_branches = False
        context.default_branch = None
        context.error_message = _("Unable to load table data. Please check error logs.")
    
    context.no_wrapper = 1
    return context
