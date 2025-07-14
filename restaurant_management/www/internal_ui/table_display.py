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
        
        # Get all branches
        branches = frappe.get_all(
            'Branch',
            fields=['name', 'branch_code']
        ) or []
        
        # Set default branch (first available or None)
        default_branch = branches[0] if branches else None
        
        # Determine available fields for the Table DocType
        meta = frappe.get_meta("Table")

        table_fields = [
            "name",
            "table_number",
            "seating_capacity",
            "status",
            "branch",
            "current_pos_order as current_order",
        ]

        if meta.has_field("occupied_seats"):
            table_fields.append("occupied_seats")

        # Get all tables with relevant fields
        tables = frappe.get_all(
            "Table",
            fields=table_fields
        ) or []

        # Ensure occupied_seats exists in every table dict
        for table in tables:
            table["occupied_seats"] = table.get("occupied_seats", 0)
        
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
    
    return context