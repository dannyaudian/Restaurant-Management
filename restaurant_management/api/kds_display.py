"""
Kitchen Display System API for handling queue items, stations, and branches.
"""
from typing import Dict, List, Optional, Any, Union
from datetime import datetime
import json

import frappe
from frappe import _
from frappe.utils import now_datetime, time_diff_in_seconds

__all__ = ['get_kds_items']


def validate_kds_token(token: str) -> bool:
    """Validate a KDS access token.

    Args:
        token: The access token to validate

    Returns:
        bool: True if token is valid

    Raises:
        frappe.ValidationError: If token is invalid
    """
    # Get the valid token from system settings or a custom DocType
    valid_token = frappe.db.get_single_value("Restaurant Settings", "kds_access_token")
    
    if not valid_token or token != valid_token:
        frappe.throw(_("Invalid access token"))
    
    return True


def get_kds_items(branch_code: str, kitchen_station: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get kitchen items queue for a specific branch with optional kitchen station filter.
    
    Uses an explicit SQL JOIN to connect Waiter Order Item with its parent Waiter Order.
    
    Args:
        branch_code: Branch code to filter items by
        kitchen_station: Optional kitchen station filter
        
    Returns:
        List of expanded queue items (one entry per quantity unit)
        
    Raises:
        frappe.ValidationError: If there's an error retrieving the items
    """
    try:
        # Build SQL query with explicit JOIN
        sql_query = """
            SELECT 
                woi.name as id,
                woi.item_name,
                woi.item_code,
                woi.qty,
                woi.status,
                woi.notes,
                woi.last_update_time,
                woi.kitchen_station,
                woi.parent as order_id,
                woi.creation as order_time
            FROM `tabWaiter Order Item` woi
            JOIN `tabWaiter Order` wo ON wo.name = woi.parent
            WHERE wo.branch_code = %(branch_code)s
            AND woi.status != 'Ready'
        """
        
        # Add kitchen station filter if provided
        params = {"branch_code": branch_code}
        if kitchen_station:
            sql_query += " AND woi.kitchen_station = %(kitchen_station)s"
            params["kitchen_station"] = kitchen_station
            
        # Add ordering
        sql_query += " ORDER BY woi.creation ASC"
        
        # Execute the query
        items = frappe.db.sql(sql_query, params, as_dict=True)
        
        # Get related information (table number) and expand by quantity
        expanded_items = []
        for item in items:
            # Get table number from parent order
            order = frappe.get_cached_value("Waiter Order", item.order_id, ["table"])
            if order:
                table = frappe.get_cached_value("Table", order, ["table_number"])
                item["table_number"] = table or "Unknown"
            else:
                item["table_number"] = "Unknown"
            
            # Calculate time in queue
            now = now_datetime()
            order_time = item["order_time"]
            
            if isinstance(order_time, str):
                order_time = datetime.fromisoformat(order_time.replace('Z', '+00:00'))
                
            item["time_in_queue"] = int(time_diff_in_seconds(now, order_time))
            
            # Expand by quantity - create separate entries for each quantity unit
            for i in range(int(item["qty"])):
                expanded_item = item.copy()
                expanded_items.append(expanded_item)
        
        return expanded_items
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error retrieving kitchen items queue"))
        raise frappe.ValidationError(f"Error retrieving kitchen items: {str(e)}")


@frappe.whitelist(allow_guest=False)
def kds_items(branch_code: str, kitchen_station: Optional[str] = None) -> List[Dict[str, Any]]:
    """API endpoint to get kitchen display items.
    
    Args:
        branch_code: Branch code to filter items by
        kitchen_station: Optional kitchen station filter
        
    Returns:
        List of expanded queue items
    """
    return get_kds_items(branch_code, kitchen_station)


@frappe.whitelist()
def get_kitchen_item_queue(kitchen_station: Optional[str] = None, branch_code: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Legacy function for backward compatibility - get kitchen items queue broken down by quantity.
    
    Args:
        kitchen_station: Filter by kitchen station
        branch_code: Filter by branch code
        
    Returns:
        List of items expanded by quantity
    """
    if not branch_code:
        # Return empty list if no branch code provided to prevent error
        return []
    
    return get_kds_items(branch_code, kitchen_station)


@frappe.whitelist(allow_guest=True)
def update_item_status(item_id: str, new_status: str, access_token: Optional[str] = None) -> Dict[str, Union[bool, str]]:
    """
    Update the status of a kitchen item.

    Args:
        item_id: ID of the Waiter Order Item
        new_status: New status (Waiting, Cooking, Ready)
        access_token: Token for authentication when accessed as guest

    Returns:
        Dictionary with success status and message
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
def get_kitchen_stations() -> List[Dict[str, str]]:
    """Get list of kitchen stations the user has access to.
    
    Returns:
        List of kitchen stations with name and station_name fields
    """
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
def get_branches() -> List[Dict[str, str]]:
    """Get list of branches the user has access to.
    
    Returns:
        List of branches with branch_code and name fields
    """
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
def get_kds_config() -> Dict[str, Any]:
    """Get KDS configuration.
    
    Returns:
        Dictionary with KDS configuration values
    """
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
