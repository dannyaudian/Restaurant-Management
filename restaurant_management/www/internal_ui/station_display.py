# Copyright (c) 2025, PT. Inovasi Terbaik Bangsa and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _


@frappe.whitelist(allow_guest=True)
def get_context(context):
    """
    Set up context for the station display page.
    This page is accessible by guests but hidden from navigation elements.
    """
    # Hide this page from search indexing
    context.no_index = 1
    
    # Hide the sidebar
    context.no_sidebar = 1
    
    # Hide from menu
    context.hide_from_menu = 1
    
    # Hide breadcrumbs
    context.no_breadcrumbs = 1
    
    # Set page title
    context.title = _("Kitchen Display")
    
    # Additional context data can be added here
    # For example, fetching active orders for kitchen display
    
    return context