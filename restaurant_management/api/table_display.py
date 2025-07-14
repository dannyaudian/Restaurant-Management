import frappe
from frappe import _
import json
from frappe.utils.caching import redis_cache


@frappe.whitelist()
def get_table_status(branch=None):
    """
    Get status of all tables, optionally filtered by branch
    
    Args:
        branch (str, optional): Branch docname to filter tables by
        
    Returns:
        List of tables with their status information
    """
    # Use caching for frequent reloads
    cache_key = f"table_status:{branch or 'all'}"
    cached_data = frappe.cache().get_value(cache_key)
    
    if cached_data:
        return cached_data
    
    # Build filters
    filters = {"is_active": 1}
    if branch:
        filters["branch"] = branch
    
    # Get branch code for cache key
    branch_code = None
    if branch:
        branch_code = frappe.db.get_value("Branch", branch, "branch_code")
    
    # Efficient query with join to get waiter information
    branch_filter = ""
    values = []
    if branch:
        branch_filter = "AND t.branch = %s"
        values.append(branch)

    tables = frappe.db.sql(
        """
        SELECT
            t.name,
            t.table_number,
            t.branch,
            b.branch_code,
            t.status,
            t.current_pos_order,
            t.is_active,
            t.seating_capacity,
            CASE WHEN t.current_pos_order IS NULL THEN 1 ELSE 0 END as is_available,
            wo.status as order_status,
            wo.order_time,
            wo.waiter,
            e.employee_name as waiter_name
        FROM
            `tabTable` t
        LEFT JOIN
            `tabBranch` b ON t.branch = b.name
        LEFT JOIN
            `tabWaiter Order` wo ON t.current_pos_order = wo.name
        LEFT JOIN
            `tabEmployee` e ON wo.waiter = e.name
        WHERE
            t.is_active = 1
            {branch_filter}
        ORDER BY
            t.table_number
        """.format(branch_filter=branch_filter),
        values,
        as_dict=1,
    )
    
    # Process results
    result = []
    for table in tables:
        table_data = {
            "name": table.name,
            "table_number": table.table_number,
            "branch": table.branch,
            "branch_code": table.branch_code,
            "status": table.status,
            "is_available": bool(table.is_available),
            "seating_capacity": table.seating_capacity,
            "current_pos_order": table.current_pos_order
        }
        
        # Add order details if available
        if table.current_pos_order:
            table_data.update({
                "order_status": table.order_status,
                "order_time": table.order_time,
                "waiter": table.waiter,
                "waiter_name": table.waiter_name
            })
        
        result.append(table_data)
    
    # Cache the result for 10 seconds (short-lived to maintain freshness)
    frappe.cache().set_value(cache_key, result, expires_in_sec=10)
    
    return result


@frappe.whitelist()
@redis_cache(ttl=60)
def get_branches():
    """
    Get list of branches the user has access to
    
    Returns:
        List of branches with name and branch_code
    """
    # Check if user has specific branch permissions
    if frappe.has_permission("Branch", "read"):
        # Get branches based on user permissions
        branches = frappe.get_list(
            "Branch",
            fields=["name", "branch_name", "branch_code"],
            order_by="branch_name",
            as_list=0
        )
    else:
        # Default to all branches if no specific permissions
        branches = frappe.get_all(
            "Branch",
            fields=["name", "branch_name", "branch_code"],
            order_by="branch_name"
        )
    
    return branches


@frappe.whitelist()
@redis_cache(ttl=300)  # Cache for 5 minutes
def get_table_display_config():
    """
    Get table display configuration
    
    Returns:
        Dictionary with display configuration
    """
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
            "status_colors": {
                "Available": "#2ecc71",  # green
                "In Progress": "#e74c3c", # red
                "Paid": "#3498db"        # blue
            }
        }


@frappe.whitelist()
def refresh_table_status(table_name=None):
    """
    Force refresh the table status cache
    
    Args:
        table_name (str, optional): Specific table to refresh
    
    Returns:
        Boolean indicating success
    """
    # Clear all table status caches
    cache_keys = frappe.cache().get_keys("table_status:*")
    for key in cache_keys:
        frappe.cache().delete_key(key)
    
    # If a specific table was updated, get its branch and clear that branch's cache
    if table_name:
        branch = frappe.db.get_value("Table", table_name, "branch")
        if branch:
            frappe.cache().delete_key(f"table_status:{branch}")
    
    return {"success": True}


@frappe.whitelist()
def get_table_overview(branch=None):
    """
    Get a list of active tables with basic information, optionally filtered by branch.
    
    This function is designed to be called by table_display.js to get an overview
    of all tables for display purposes.
    
    Args:
        branch (str, optional): Branch name to filter tables by
        
    Returns:
        Dict containing a list of tables with their basic information
    """
    # Build filters
    filters = {"is_active": 1}
    if branch:
        filters["branch"] = branch
    
    # Get all active tables with the requested fields
    tables = frappe.get_all(
        "Table",
        filters=filters,
        fields=[
            "name", 
            "table_number", 
            "status", 
            "current_pos_order as current_order", 
            "is_active as active", 
            "modified"
        ],
        order_by="table_number"
    )
    
    # Return the result in the requested format
    return {"tables": tables}
