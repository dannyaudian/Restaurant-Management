import frappe
from frappe import _
from frappe.utils import now_datetime, time_diff_in_seconds
from datetime import datetime
import json

def validate_kds_token(token):
    """Validate a KDS access token"""
    # Get the valid token from system settings or a custom DocType
    valid_token = frappe.db.get_single_value("Restaurant Settings", "kds_access_token")
    
    if not valid_token or token != valid_token:
        frappe.throw(_("Invalid access token"))
    
    return True

@frappe.whitelist()
def get_kitchen_item_queue(kitchen_station=None, branch_code=None):
    """
    Get kitchen items queue broken down by quantity
    
    Args:
        kitchen_station (str, optional): Filter by kitchen station
        branch_code (str, optional): Filter by branch code
        
    Returns:
        List of items expanded by quantity
    """
    filters = {
        "status": ["!=", "Ready"]
    }
    
    if kitchen_station:
        filters["kitchen_station"] = kitchen_station
    
    if branch_code:
        filters["parent.branch_code"] = branch_code
    
    # Get items that haven't been marked as Ready
    items = frappe.get_all(
        "Waiter Order Item",
        filters=filters,
        fields=[
            "name as id",
            "item_name",
            "item_code",
            "qty",
            "status",
            "notes",
            "last_update_time",
            "kitchen_station",
            "parent as order_id",
            "creation as order_time"
        ],
        order_by="creation asc"
    )
    
    # Get related information (table number)
    expanded_items = []
    for item in items:
        # Get table number from parent order
        order = frappe.get_cached_value("Waiter Order", item.order_id, ["table"])
        if order:
            table = frappe.get_cached_value("Table", order, ["table_number"])
            item.table_number = table or "Unknown"
        else:
            item.table_number = "Unknown"
        
        # Calculate time in queue
        now = now_datetime()
        order_time = item.order_time
        
        if isinstance(order_time, str):
            order_time = datetime.fromisoformat(order_time.replace('Z', '+00:00'))
            
        item.time_in_queue = int(time_diff_in_seconds(now, order_time))
        
        # Expand by quantity - create separate entries for each quantity unit
        for i in range(int(item.qty)):
            expanded_item = item.copy()
            expanded_items.append(expanded_item)
    
    return expanded_items

@frappe.whitelist(allow_guest=True)
def update_item_status(item_id, new_status, access_token=None):
    """
    Update the status of a kitchen item

    Args:
        item_id (str): ID of the Waiter Order Item
        new_status (str): New status (Waiting, Cooking, Ready)
        access_token (str, optional): Token for authentication when accessed as guest

    Returns:
        dict: Success status and message
    """
    # Validate token for guest access
    if frappe.session.user == "Guest":
        validate_kds_token(access_token)

    if new_status not in ["Waiting", "Cooking", "Ready"]:
        return {"success": False, "error": _("Invalid status")}
    
    try:
        # Get the item
        if not frappe.db.exists("Waiter Order Item", item_id):
            return {"success": False, "error": _("Item not found")}
        
        # Update the status
        frappe.db.set_value("Waiter Order Item", item_id, {
            "status": new_status,
            "last_update_time": now_datetime(),
            "last_update_by": frappe.session.user
        })
        
        frappe.db.commit()
        
        return {"success": True}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error updating item status"))
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def get_kitchen_stations():
    """Get list of kitchen stations the user has access to"""
    from restaurant_management.restaurant_management.utils.branch_permissions import get_allowed_branches_for_user
    
    # Get allowed branches for current user
    allowed_branch_codes = get_allowed_branches_for_user()
    
    if allowed_branch_codes:
        # Filter kitchen stations by allowed branches
        stations = frappe.get_all(
            "Kitchen Station",
            filters={
                "is_active": 1,
                "branch_code": ["in", allowed_branch_codes]
            },
            fields=["name", "station_name"],
            order_by="station_name"
        )
    else:
        # If user doesn't have access to any branches (shouldn't happen, but fallback)
        stations = []
    
    return stations

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
            fields=["branch_code", "name"],
            order_by="name"
        )
    else:
        # If no specific branches allowed (shouldn't happen, but fallback)
        branches = []
    
    return branches

@frappe.whitelist()
def get_kds_config():
    """Get KDS configuration"""
    config_path = frappe.get_app_path("restaurant_management", "config", "kds_display.json")

    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        return config
    except (FileNotFoundError, json.JSONDecodeError):
        # Return default config if file doesn't exist or is invalid
        return {
            "refresh_interval": 10,
            "default_kitchen_station": "",
            "status_color_map": {
                "Waiting": "#e74c3c",
                "Cooking": "#f39c12",
                "Ready": "#2ecc71"
            },
            "enable_sound_on_ready": True
        }
