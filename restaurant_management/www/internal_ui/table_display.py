# Copyright (c) 2025, PT. Inovasi Terbaik Bangsa and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _


@frappe.whitelist(allow_guest=True)
def get_context(context):
    """
    Set up context for the restaurant table display page.
    This page is accessible by guests without login but hidden from navigation elements.
    Designed to show real-time table status without appearing in ERPNext navigation.
    """
    # Hide this page from navigation elements and search indexing
    context.no_index = 1
    context.no_sidebar = 1
    context.hide_from_menu = 1
    context.no_breadcrumbs = 1
    
    # Set page title
    context.title = _("Table Overview")
    
    # Make CSRF token available to JavaScript
    context.csrf_token = frappe.session.csrf_token
    
    return context