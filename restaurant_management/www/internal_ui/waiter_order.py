import frappe
from typing import Dict, Any
from functools import wraps
from frappe import _
from restaurant_management.restaurant_management.utils.branch_permissions import filter_allowed_branches


def validate_roles(allowed_roles):
    """
    Decorator to validate user roles before accessing a page.
    
    Args:
        allowed_roles: List of roles that are allowed to access the page
    
    Returns:
        Decorated function that checks user roles
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not frappe.session.user or frappe.session.user == "Guest":
                raise frappe.PermissionError(_("You need to be logged in to access this page"))
            
            user_roles = frappe.get_roles(frappe.session.user)
            if not any(role in user_roles for role in allowed_roles):
                frappe.throw(
                    _("Access denied: You need to have one of these roles: {0}").format(
                        ", ".join(allowed_roles)
                    ),
                    frappe.PermissionError
                )
            
            return func(*args, **kwargs)
        return wrapper
    return decorator


@validate_roles(["Waiter", "Restaurant Supervisor", "System Manager"])
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
        frappe.PermissionError: If user doesn't have required roles
        frappe.ValidationError: If there's a critical error loading the page data
    """
    try:
        # Hide page from website navigation and search engines
        context.no_cache = 1
        context.no_sitemap = 1
        context.no_breadcrumbs = 1
        context.show_sidebar = 0
        context.hide_in_navbar = 1
        
        # Set page title
        context.page_title = "Waiter Order"
        
        # Fetch all branches
        all_branches = frappe.get_all(
            'Branch',
            fields=['name', 'branch_code']
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
        raise frappe.ValidationError(_("Unable to load waiter order page. Please check error logs."))