import frappe
from frappe import _
from frappe.utils import now_datetime, time_diff_in_seconds, cint, cstr
from datetime import datetime
from typing import List, Dict, Any, Optional, Union
import json
import os

def validate_kds_token(token: str) -> bool:
    """
    Validate a KDS access token
    
    Args:
        token: The token to validate
        
    Returns:
        True if token is valid
        
    Raises:
        frappe.ValidationError: If token is invalid
    """
    # Get the valid token from system settings or a custom DocType
    valid_token = frappe.db.get_single_value("Restaurant Settings", "kds_access_token")
    
    if not valid_token or token != valid_token:
        frappe.throw(_("Invalid access token"), frappe.AuthenticationError)
    
    return True

@frappe.whitelist()
def get_kitchen_item_queue(kitchen_station: Optional[str] = None, branch_code: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Get kitchen items queue broken down by quantity
    
    Args:
        kitchen_station: Filter by kitchen station
        branch_code: Filter by branch code
        
    Returns:
        List of items expanded by quantity
    """
    # Base filters for Waiter Order Item
    filters = {"status": ["!=", "Ready"]}
    
    if kitchen_station:
        filters["kitchen_station"] = kitchen_station
    
    # Get all matching items first (without branch filter)
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
        order_by="creation asc",
        ignore_permissions=True,
        limit_page_length=0
    )
    
    # Empty result - return early
    if not items:
        return []
    
    # Filter by branch_code if specified
    if branch_code:
        # Get all order IDs
        order_ids = list(set(item["order_id"] for item in items))
        
        # Get orders with matching branch_code
        valid_orders = frappe.get_all(
            "Waiter Order",
            filters={"name": ["in", order_ids], "branch_code": branch_code},
            fields=["name"],
            as_list=True
        )
        
        # Extract just the order names
        valid_order_ids = [order[0] for order in valid_orders]
        
        # Filter items to only those with valid order IDs
        items = [item for item in items if item["order_id"] in valid_order_ids]
    
    # Get related information (table number)
    expanded_items = []
    for item in items:
        try:
            # Get table number from parent order
            table = frappe.db.get_value(
                "Waiter Order", 
                item["order_id"], 
                ["table"], 
                as_dict=True
            )
            
            if table and table.table:
                table_number = frappe.db.get_value(
                    "Table", 
                    table.table, 
                    ["table_number"]
                )
                item["table_number"] = table_number or "Unknown"
            else:
                item["table_number"] = "Unknown"
            
            # Calculate time in queue
            now = now_datetime()
            order_time = item["order_time"]
            
            if isinstance(order_time, str):
                order_time = datetime.fromisoformat(order_time.replace('Z', '+00:00'))
                
            item["time_in_queue"] = int(time_diff_in_seconds(now, order_time))
            
            # Expand by quantity - create separate entries for each quantity unit
            for i in range(cint(item["qty"])):
                expanded_item = item.copy()
                expanded_items.append(expanded_item)
        except Exception as e:
            frappe.log_error(
                f"Error processing kitchen item {item['id']}: {str(e)}", 
                "KDS Display Error"
            )
    
    return expanded_items

@frappe.whitelist(allow_guest=True)
def update_item_status(item_id: str, new_status: str, access_token: Optional[str] = None) -> Dict[str, Any]:
    """
    Update the status of a kitchen item

    Args:
        item_id: ID of the Waiter Order Item
        new_status: New status (Waiting, Cooking, Ready)
        access_token: Token for authentication when accessed as guest

    Returns:
        Dictionary with success status and message
    """
    # Validate token for guest access
    if frappe.session.user == "Guest":
        try:
            validate_kds_token(access_token)
        except Exception as e:
            return {"success": False, "error": str(e)}

    valid_statuses = ["Waiting", "Cooking", "Ready", "Sent to Kitchen"]
    if new_status not in valid_statuses:
        return {"success": False, "error": _(f"Invalid status. Must be one of: {', '.join(valid_statuses)}")}
    
    try:
        # Check if item exists
        if not frappe.db.exists("Waiter Order Item", item_id):
            return {"success": False, "error": _("Item not found")}
        
        # Update the status
        frappe.db.set_value("Waiter Order Item", item_id, {
            "status": new_status,
            "last_update_time": now_datetime(),
            "last_update_by": frappe.session.user
        })
        
        # Check if all items in order are ready or served
        item = frappe.get_doc("Waiter Order Item", item_id)
        order_id = item.parent
        
        # Update parent order status if needed
        if new_status == "Ready":
            update_parent_order_status(order_id)
        
        frappe.db.commit()
        
        return {
            "success": True,
            "message": _("Item status updated to {0}").format(new_status)
        }
    except Exception as e:
        frappe.log_error(
            f"Error updating item status: {frappe.get_traceback()}", 
            "KDS Update Error"
        )
        return {"success": False, "error": str(e)}

def update_parent_order_status(order_id: str) -> None:
    """
    Update parent order status based on items status
    
    Args:
        order_id: ID of the Waiter Order
    """
    if not order_id:
        return
    
    # Get all items in the order
    all_items = frappe.get_all(
        "Waiter Order Item",
        filters={"parent": order_id},
        fields=["status"]
    )
    
    if not all_items:
        return
        
    # Check if all items are ready or served
    all_ready_or_served = all(
        item.status in ["Ready", "Served"] for item in all_items
    )
    
    # Check if at least one item is ready or served
    any_ready_or_served = any(
        item.status in ["Ready", "Served"] for item in all_items
    )
    
    # Check if all items are served
    all_served = all(
        item.status == "Served" for item in all_items
    )
    
    # Update order status
    if all_served:
        frappe.db.set_value("Waiter Order", order_id, "status", "Completed")
    elif all_ready_or_served:
        frappe.db.set_value("Waiter Order", order_id, "status", "Ready")
    elif any_ready_or_served:
        frappe.db.set_value("Waiter Order", order_id, "status", "Partially Served")

@frappe.whitelist()
def get_kitchen_stations() -> List[Dict[str, Any]]:
    """
    Get list of kitchen stations the user has access to
    
    Returns:
        List of kitchen stations
    """
    from restaurant_management.restaurant_management.utils.branch_permissions import get_allowed_branches_for_user
    
    try:
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
                fields=["name", "station_name", "description", "branch_code"],
                order_by="station_name"
            )
        else:
            # If user has system manager role or is admin, show all stations
            if frappe.has_permission("Kitchen Station", "read", user=frappe.session.user):
                stations = frappe.get_all(
                    "Kitchen Station",
                    filters={"is_active": 1},
                    fields=["name", "station_name", "description", "branch_code"],
                    order_by="station_name"
                )
            else:
                stations = []
        
        return stations
    except Exception as e:
        frappe.log_error(
            f"Error getting kitchen stations: {frappe.get_traceback()}", 
            "KDS Error"
        )
        return []

@frappe.whitelist()
def get_branches() -> List[Dict[str, Any]]:
    """
    Get list of branches the user has access to
    
    Returns:
        List of branches
    """
    from restaurant_management.restaurant_management.utils.branch_permissions import get_allowed_branches_for_user
    
    try:
        # Get allowed branches for current user
        allowed_branch_codes = get_allowed_branches_for_user()
        
        if allowed_branch_codes:
            branches = frappe.get_all(
                "Branch",
                filters={"branch_code": ["in", allowed_branch_codes]},
                fields=["branch_code", "name", "address"],
                order_by="name"
            )
        else:
            # If user has system manager role or is admin, show all branches
            if frappe.has_permission("Branch", "read", user=frappe.session.user):
                branches = frappe.get_all(
                    "Branch",
                    fields=["branch_code", "name", "address"],
                    order_by="name"
                )
            else:
                branches = []
        
        return branches
    except Exception as e:
        frappe.log_error(
            f"Error getting branches: {frappe.get_traceback()}", 
            "KDS Error"
        )
        return []

@frappe.whitelist()
def get_kds_config() -> Dict[str, Any]:
    """
    Get KDS configuration
    
    Returns:
        KDS configuration settings
    """
    # Default configuration
    default_config = {
        "refresh_interval": 10,
        "default_kitchen_station": "",
        "status_color_map": {
            "Waiting": "#e74c3c",            # Red
            "Sent to Kitchen": "#e74c3c",    # Red
            "Cooking": "#f39c12",            # Orange
            "Ready": "#2ecc71"               # Green
        },
        "enable_sound_on_ready": True,
        "enable_sound_on_new_item": True,
        "show_item_notes": True,
        "auto_refresh": True
    }
    
    try:
        # Try to get configuration from database first
        if frappe.db.exists("KDS Settings"):
            settings = frappe.get_single("KDS Settings")
            
            # Build config from database settings
            config = {
                "refresh_interval": cint(settings.refresh_interval) or 10,
                "default_kitchen_station": settings.default_kitchen_station or "",
                "status_color_map": {
                    "Waiting": settings.waiting_color or "#e74c3c",
                    "Sent to Kitchen": settings.sent_to_kitchen_color or "#e74c3c",
                    "Cooking": settings.cooking_color or "#f39c12",
                    "Ready": settings.ready_color or "#2ecc71"
                },
                "enable_sound_on_ready": settings.enable_sound_on_ready or True,
                "enable_sound_on_new_item": settings.enable_sound_on_new_item or True,
                "show_item_notes": settings.show_item_notes or True,
                "auto_refresh": settings.auto_refresh or True
            }
            
            return config
        
        # Fallback to file-based config
        config_path = os.path.join(
            frappe.get_app_path("restaurant_management"),
            "config",
            "kds_display.json"
        )
        
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
                
            # Merge with defaults to ensure all fields are present
            for key, value in default_config.items():
                if key not in config:
                    config[key] = value
                elif isinstance(value, dict) and isinstance(config.get(key), dict):
                    # For nested dictionaries like status_color_map
                    for subkey, subvalue in value.items():
                        if subkey not in config[key]:
                            config[key][subkey] = subvalue
                            
            return config
    except Exception as e:
        frappe.log_error(
            f"Error loading KDS configuration: {str(e)}", 
            "KDS Config Error"
        )
    
    # Return default config if all else fails
    return default_config

@frappe.whitelist(allow_guest=True)
def get_token_status(access_token: str) -> Dict[str, Any]:
    """
    Check if a KDS access token is valid
    
    Args:
        access_token: The token to validate
        
    Returns:
        Dictionary with token status
    """
    try:
        is_valid = validate_kds_token(access_token)
        return {
            "success": True,
            "is_valid": is_valid
        }
    except Exception:
        return {
            "success": False,
            "is_valid": False
        }
