import frappe
from typing import Dict, Any, List
from restaurant_management.restaurant_management.utils.branch_permissions import filter_allowed_branches


def get_context(context: Dict[str, Any]) -> None:
    """
    Prepare context for the waiter order page.
    
    This function fetches branches and default values for the waiter order
    Jinja template. It applies branch permissions filtering to ensure users
    only see branches they have access to.
    
    Args:
        context: The context dictionary that will be passed to the template
    
    Returns:
        None: The function modifies the context dict in-place
    
    Raises:
        frappe.ValidationError: If there's a critical error loading the page data
    """
    try:
        # Set page title
        context.page_title = "Waiter Order"
        
        # Fetch all branches
        all_branches = frappe.get_all(
            'Branch',
            fields=['name', 'branch_code'],
            filters={'is_active': 1}
        )
        
        # Filter branches based on user permissions
        branches = filter_allowed_branches(all_branches)
        
        # Set default branch (first available or None)
        default_branch = branches[0] if branches else None
        
        # Pass data to template context
        context.branches = branches
        context.default_branch = default_branch
        context.user = frappe.session.user
        
        # Additional useful context for the template
        context.has_branches = len(branches) > 0
        
    except Exception as e:
        frappe.log_error(
            message=f"Error loading waiter order page: {str(e)}",
            title="Waiter Order Page Error"
        )
        raise frappe.ValidationError("Unable to load waiter order page. Please check error logs.")
