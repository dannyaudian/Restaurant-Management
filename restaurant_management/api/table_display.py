import frappe
from frappe import _
import json


@frappe.whitelist()
def get_table_overview(branch_code=None):
    """
    Get overview of tables with active orders
    
    Args:
        branch_code (str, optional): Filter by branch code
        
    Returns:
        List of tables with order summary and items
    """
    from restaurant_management.restaurant_management.utils.branch_permissions import get_allowed_branches_for_user
    
    filters = {}
    
    # Get allowed branches for current user
    allowed_branches = get_allowed_branches_for_user()
    
    if branch_code:
        # If specific branch requested, check if user has access
        if branch_code in allowed_branches:
            filters["branch_code"] = branch_code
        else:
            frappe.throw(_("You don't have permission to access this branch"))
    else:
        # Otherwise filter by all allowed branches
        if allowed_branches:
            filters["branch_code"] = ["in", allowed_branches]
    
    if branch_code:
        filters["branch_code"] = branch_code
    
    # Get all tables from the branch
    tables = frappe.get_all(
        "Table",
        filters=filters,
        fields=["name", "table_number", "status", "current_pos_order", "branch_code"],
        order_by="table_number"
    )
    
    result = []
    
    for table in tables:
        # Skip tables with no current order
        if not table.current_pos_order:
            # Only include available tables if they don't have an order
            if table.status == "Available":
                result.append({
                    "name": table.name,
                    "table_number": table.table_number,
                    "status": "Available",
                    "order_id": None,
                    "items": [],
                    "summary": {
                        "total_items": 0,
                        "items_in_progress": 0,
                        "items_ready": 0,
                        "items_served": 0,
                        "total_amount": 0
                    }
                })
            continue
        
        # Check if order is paid - skip if it is
        order_status = frappe.db.get_value("Waiter Order", table.current_pos_order, "status")
        if order_status == "Paid":
            continue
        
        # Get order items
        items = frappe.get_all(
            "Waiter Order Item",
            filters={"parent": table.current_pos_order},
            fields=["item_code", "item_name", "qty", "status", "price"]
        )
        
        # Calculate summary statistics
        total_items = sum(item.qty for item in items)
        items_in_progress = sum(item.qty for item in items if item.status in ["Waiting", "Cooking"])
        items_ready = sum(item.qty for item in items if item.status == "Ready")
        items_served = sum(item.qty for item in items if item.status == "Served")
        total_amount = sum(item.qty * item.price for item in items)
        
        result.append({
            "name": table.name,
            "table_number": table.table_number,
            "status": "In Progress",
            "order_id": table.current_pos_order,
            "items": items,
            "summary": {
                "total_items": total_items,
                "items_in_progress": items_in_progress,
                "items_ready": items_ready,
                "items_served": items_served,
                "total_amount": total_amount
            }
        })
    
    return result


@frappe.whitelist()
def get_branches():
    """Get list of branches the user has access to"""
    from restaurant_management.restaurant_management.utils.branch_permissions import get_allowed_branches_for_user
    
    # Get allowed branches for current user
    allowed_branch_codes = get_allowed_branches_for_user()
    
    if allowed_branch_codes:
        branches = frappe.get_all(
            "Branch",
            filters={"branch_code": ["in", allowed_branch_codes]},
            fields=["branch_code", "branch_name"],
            order_by="branch_name"
        )
    else:
        # If no specific branches allowed (shouldn't happen, but fallback)
        branches = []
    
    return branches
    """Get list of branches"""
    branches = frappe.get_all(
        "Branch",
        fields=["branch_code", "branch_name"],
        order_by="branch_name"
    )
    
    return branches

@frappe.whitelist()
def get_table_display_config():
    """Get table display configuration"""
    config_path = frappe.get_app_path("restaurant_management", "config", "table_display.json")
    
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        return config
    except (FileNotFoundError, json.JSONDecodeError):
        # Return default config if file doesn't exist or is invalid
        return {
            "refresh_interval": 30,
            "default_branch_code": "",
            "status_color_map": {
                "Waiting": "#e74c3c",
                "Cooking": "#f39c12",
                "Ready": "#2ecc71",
                "Served": "#95a5a6"
            }
        }
