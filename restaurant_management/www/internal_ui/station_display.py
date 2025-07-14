# Copyright (c) 2025, PT. Inovasi Terbaik Bangsa and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _


def get_context(context):
    """
    Set up context for the kitchen station display page.
    This page is accessible by guests but hidden from navigation elements.
    """
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
        
        # Make CSRF token available to JavaScript
        context.csrf_token = frappe.session.csrf_token
        
        # Get all branches
        branches = frappe.get_all(
            'Branch',
            fields=['name', 'branch_code']
        )
        
        # Set default branch (first available or None)
        default_branch = branches[0] if branches else None
        
        # Get all kitchen stations
        kitchen_stations = frappe.get_all(
            'Kitchen Station',
            fields=['name', 'station_name', 'branch']
        )
        
        # Add data to context
        context.branches = branches
        context.default_branch = default_branch
        context.kitchen_stations = kitchen_stations
        context.has_branches = len(branches) > 0
        context.has_stations = len(kitchen_stations) > 0
        
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
        context.error_message = _("Unable to load kitchen station data. Please check error logs.")
    
    return context