# Copyright (c) 2025, PT. Inovasi Terbaik Bangsa and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _


def get_context(context=None):
    """
    Set up context for the kitchen station display page.
    This page is accessible by guests but hidden from navigation elements.
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
        context.title = _("Kitchen Display")
        
        # Make CSRF token available to JavaScript - safely handle guest users
        context.csrf_token = getattr(frappe.session, "csrf_token", "") or ""
        
        # Get all branches - safely handle errors for guest users
        try:
            branches = frappe.get_all(
                'Branch',
                fields=['name', 'branch_code']
            ) or []
        except frappe.PermissionError:
            branches = []
            context.permission_error = True
        
        # Set default branch (first available or None)
        default_branch = branches[0] if branches else None
        
        # Get all kitchen stations - safely handle errors for guest users
        try:
            kitchen_stations = frappe.get_all(
                'Kitchen Station',
                fields=['name', 'station_name', 'branch']
            ) or []
        except frappe.PermissionError:
            kitchen_stations = []
            context.permission_error = True
        
        # Add data to context
        context.branches = branches
        context.default_branch = default_branch
        context.kitchen_stations = kitchen_stations
        context.has_branches = bool(branches)
        context.has_stations = bool(kitchen_stations)
        context.error_message = ""
        
        # Add guest flag to help JavaScript handle permission-based logic
        context.is_guest = frappe.session.user == "Guest"
        
        # Handle the case where data is empty
        if not branches and not kitchen_stations:
            if context.permission_error:
                context.error_message = _("Permission error: You don't have access to view this data. Please contact your administrator or log in with appropriate permissions.")
            else:
                context.error_message = _("No branches or kitchen stations found. Please set up your restaurant configuration first.")
        
    except Exception as e:
        frappe.log_error(
            message=f"Error loading kitchen station display page: {str(e)}",
            title="Kitchen Display Page Error"
        )
        # Provide minimal context in case of error to prevent page crash
        context.branches = []
        context.kitchen_stations = []
        context.has_branches = False
        context.has_stations = False
        context.default_branch = None
        context.is_guest = frappe.session.user == "Guest"
        context.error_message = _("Unable to load kitchen station data. Please check error logs.")
    
    return context