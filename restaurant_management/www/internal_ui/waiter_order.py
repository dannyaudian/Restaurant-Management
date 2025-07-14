# Copyright (c) 2025, PT. Inovasi Terbaik Bangsa and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _
from restaurant_management.restaurant_management.utils.branch_permissions import filter_allowed_branches


def get_context(context):
    """
    Prepare context for the waiter order page.
    
    This function fetches branches and default values for the waiter order
    Jinja template. It applies branch permissions filtering to ensure users
    only see branches they have access to.
    
    Args:
        context: The context dictionary that will be passed to the template
    
    Returns:
        The context dictionary with added values
    """
    try:
        # Validate user roles
        if frappe.session.user == "Guest":
            frappe.throw(_("You need to be logged in to access this page"), frappe.PermissionError)
        
        user_roles = frappe.get_roles(frappe.session.user)
        allowed_roles = ["Waiter", "Restaurant Supervisor", "System Manager", "Restaurant Manager"]
        
        if not any(role in user_roles for role in allowed_roles):
            frappe.throw(
                _("Access denied: You need to have one of these roles: {0}").format(
                    ", ".join(allowed_roles)
                ),
                frappe.PermissionError
            )
        
        # Hide page from website navigation and search engines
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
        
        # Fetch all branches
        all_branches = frappe.get_all(
            'Branch',
            fields=['name', 'branch_code']
        )
        
        # Filter branches based on user permissions
        branches = filter_allowed_branches(all_branches)
        
        # Set default branch (first available or None)
        default_branch = branches[0] if branches else None
        
        # Get all tables for initial state
        tables = frappe.get_all(
            'Table',
            fields=[
                'name', 'table_number', 'capacity', 'status',
                'branch', 'current_order'
            ]
        )
        
        # Get item groups for menu categorization
        item_groups = frappe.get_all(
            'Item Group',
            filters={'show_in_website': 1},
            fields=['name', 'item_group_name']
        )
        
        # Pass data to template context
        context.branches = branches
        context.default_branch = default_branch
        context.tables = tables
        context.item_groups = item_groups
        context.user = frappe.session.user
        
        # Additional useful context for the template
        context.has_branches = len(branches) > 0
        context.has_tables = len(tables) > 0
        
    except Exception as e:
        frappe.log_error(
            message=f"Error loading waiter order page: {str(e)}",
            title="Waiter Order Page Error"
        )
        # Provide minimal context in case of error to prevent page crash
        context.branches = []
        context.tables = []
        context.item_groups = []
        context.has_branches = False
        context.has_tables = False
        context.default_branch = None
        context.error_message = _("Unable to load waiter order page. Please check error logs.")
    
    return context