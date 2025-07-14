import frappe
from frappe import _
from frappe.utils import now_datetime, get_url, cint, flt
from typing import Dict, List, Any, Optional, Union
import json

# REST API methods
@frappe.whitelist(methods=["POST"])
def create_order(**kwargs):
    """
    Create a new waiter order or update an existing one
    
    POST parameters:
    - table: Table name/ID (required)
    - waiter: Employee ID of waiter (optional, defaults to current user)
    - items: List of items to add [
        {
          "item_code": "ITEM-001",
          "qty": 2,
          "notes": "Extra spicy"
        }
      ]
    - existing_order: Order ID to update (optional)
    
    Returns:
        Dict with success status and order details
    """
    # Validate permissions
    if not frappe.has_permission("Waiter Order", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
        
    # Check if user has correct role
    if not frappe.utils.has_common(["Waiter", "Restaurant Staff", "System Manager"], 
                                  frappe.get_roles(frappe.session.user)):
        frappe.throw(_("You need to be a Waiter or Restaurant Staff to create orders"))
    
    # Get request data
    data = frappe._dict(kwargs)
    
    # Validate required fields
    if not data.table:
        frappe.throw(_("Table is required"))
    
    if not data.items or not isinstance(data.items, list):
        frappe.throw(_("At least one item is required"))
    
    # Parse items if they're in string format
    if isinstance(data.items, str):
        try:
            data.items = json.loads(data.items)
        except:
            frappe.throw(_("Invalid items format"))
    
    # Check if table exists
    if not frappe.db.exists("Table", data.table):
        frappe.throw(_("Table {0} not found").format(data.table))
    
    # Get table details
    table = frappe.get_doc("Table", data.table)
    
    try:
        # Check if we're updating an existing order
        if data.existing_order:
            if not frappe.db.exists("Waiter Order", data.existing_order):
                frappe.throw(_("Order {0} not found").format(data.existing_order))
            
            # Get existing order
            waiter_order = frappe.get_doc("Waiter Order", data.existing_order)
            
            # Check if table matches
            if waiter_order.table != data.table:
                frappe.throw(_("Order {0} does not belong to table {1}").format(
                    data.existing_order, data.table))
            
            # Add new items to existing order
            add_items_to_order(waiter_order, data.items)
            
            # Save the updated order
            waiter_order.save()
            frappe.db.commit()
            
            return {
                "success": True,
                "message": _("Order updated successfully"),
                "order_id": waiter_order.name,
                "is_new": False
            }
        else:
            # Create new order
            waiter_order = frappe.new_doc("Waiter Order")
            waiter_order.table = table.name
            waiter_order.branch = table.branch
            waiter_order.status = "Draft"
            waiter_order.order_time = now_datetime()
            
            # Set waiter (either from request or current user)
            if data.waiter:
                if not frappe.db.exists("Employee", data.waiter):
                    frappe.throw(_("Waiter {0} not found").format(data.waiter))
                waiter_order.waiter = data.waiter
            
            # Set ordering user
            waiter_order.ordered_by = frappe.session.user
            
            # Add items to the order
            add_items_to_order(waiter_order, data.items)
            
            # Save the new order
            waiter_order.insert()
            
            # Submit the order if auto_submit is requested
            if data.get("auto_submit"):
                waiter_order.status = "Confirmed"
                waiter_order.submit()
            
            frappe.db.commit()
            
            # Update table status
            set_table_status(table.name, waiter_order.name)
            
            return {
                "success": True,
                "message": _("Order created successfully"),
                "order_id": waiter_order.name,
                "is_new": True
            }
    
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), _("Error creating/updating waiter order"))
        return {
            "success": False,
            "message": str(e)
        }


@frappe.whitelist(methods=["GET"])
def get_order(**kwargs):
    """
    Get waiter order details
    
    GET parameters:
    - table: Table name/ID (optional)
    - order_id: Order ID (optional)
    - waiter: Employee ID of waiter (optional)
    
    At least one of table, order_id, or waiter must be provided
    
    Returns:
        Dict with order details
    """
    # Validate permissions
    if not frappe.has_permission("Waiter Order", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
        
    # Check if user has correct role
    if not frappe.utils.has_common(["Waiter", "Restaurant Staff", "System Manager"], 
                                  frappe.get_roles(frappe.session.user)):
        frappe.throw(_("You need to be a Waiter or Restaurant Staff to view orders"))
    
    # Get request data
    data = frappe._dict(kwargs)
    
    # Validate at least one filter is provided
    if not (data.table or data.order_id or data.waiter):
        frappe.throw(_("Please provide at least one of: table, order_id, or waiter"))
    
    try:
        filters = {}
        
        # Build filters based on request parameters
        if data.order_id:
            filters["name"] = data.order_id
        
        if data.table:
            filters["table"] = data.table
        
        if data.waiter:
            filters["waiter"] = data.waiter
        
        # Add status filter if provided
        if data.status:
            filters["status"] = data.status
        
        # Get orders matching the filters
        orders = frappe.get_all(
            "Waiter Order",
            filters=filters,
            fields=[
                "name", "table", "waiter", "order_time", "status", 
                "branch", "branch_code", "ordered_by", "total_qty", "total_amount"
            ],
            order_by="order_time desc"
        )
        
        if not orders:
            return {
                "success": False,
                "message": _("No orders found matching the criteria")
            }
        
        # Get full details for each order
        order_details = []
        for order in orders:
            # Get the complete doc
            waiter_order = frappe.get_doc("Waiter Order", order.name)
            
            # Format the items
            items = []
            for item in waiter_order.items:
                items.append({
                    "item_code": item.item_code,
                    "item_name": item.item_name,
                    "qty": item.qty,
                    "rate": item.rate,
                    "amount": item.amount,
                    "status": item.status,
                    "notes": item.notes,
                    "kitchen_station": item.kitchen_station
                })
            
            # Add table details
            table_info = frappe.db.get_value(
                "Table", 
                waiter_order.table, 
                ["table_number", "seating_capacity"], 
                as_dict=True
            )
            
            # Add waiter details if available
            waiter_info = {}
            if waiter_order.waiter:
                waiter_info = frappe.db.get_value(
                    "Employee",
                    waiter_order.waiter,
                    ["employee_name", "user_id"],
                    as_dict=True
                )
            
            # Compile the complete order details
            order_detail = {
                "order_id": waiter_order.name,
                "table": waiter_order.table,
                "table_number": table_info.table_number if table_info else None,
                "seating_capacity": table_info.seating_capacity if table_info else None,
                "waiter": waiter_order.waiter,
                "waiter_name": waiter_info.employee_name if waiter_info else None,
                "order_time": waiter_order.order_time,
                "status": waiter_order.status,
                "branch": waiter_order.branch,
                "branch_code": waiter_order.branch_code,
                "ordered_by": waiter_order.ordered_by,
                "total_qty": waiter_order.total_qty,
                "total_amount": waiter_order.total_amount,
                "items": items
            }
            
            order_details.append(order_detail)
        
        return {
            "success": True,
            "orders": order_details
        }
    
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error retrieving waiter order"))
        return {
            "success": False,
            "message": str(e)
        }


@frappe.whitelist(methods=["POST"])
def update_order_status(**kwargs):
    """
    Update the status of a waiter order
    
    POST parameters:
    - order_id: Order ID to update (required)
    - status: New status (required) - one of: Draft, Confirmed, Served, Paid, Cancelled
    
    Returns:
        Dict with success status
    """
    # Validate permissions
    if not frappe.has_permission("Waiter Order", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
        
    # Check if user has correct role
    if not frappe.utils.has_common(["Waiter", "Restaurant Staff", "System Manager"], 
                                  frappe.get_roles(frappe.session.user)):
        frappe.throw(_("You need to be a Waiter or Restaurant Staff to update orders"))
    
    # Get request data
    data = frappe._dict(kwargs)
    
    # Validate required fields
    if not data.order_id:
        frappe.throw(_("Order ID is required"))
    
    if not data.status:
        frappe.throw(_("Status is required"))
    
    # Validate status value
    valid_statuses = ["Draft", "Confirmed", "Served", "Paid", "Cancelled"]
    if data.status not in valid_statuses:
        frappe.throw(_("Invalid status. Must be one of: {0}").format(", ".join(valid_statuses)))
    
    try:
        # Get the order
        if not frappe.db.exists("Waiter Order", data.order_id):
            frappe.throw(_("Order {0} not found").format(data.order_id))
        
        waiter_order = frappe.get_doc("Waiter Order", data.order_id)
        
        # Update status
        old_status = waiter_order.status
        waiter_order.status = data.status
        
        # If status is changing to Paid or Cancelled, handle table availability
        if data.status in ["Paid", "Cancelled"] and old_status != data.status:
            table = waiter_order.table
            release_table(table)
        
        # Save the order
        waiter_order.save()
        
        # If cancelling a submitted order, cancel the document
        if data.status == "Cancelled" and waiter_order.docstatus == 1:
            waiter_order.cancel()
        
        frappe.db.commit()
        
        return {
            "success": True,
            "message": _("Order status updated from {0} to {1}").format(old_status, data.status)
        }
    
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), _("Error updating order status"))
        return {
            "success": False,
            "message": str(e)
        }


# Helper functions
def add_items_to_order(order_doc, items_list):
    """
    Add items to a waiter order document
    
    Args:
        order_doc: Waiter Order document
        items_list: List of items to add
    """
    for item_data in items_list:
        # Skip if item_code is missing
        if not item_data.get("item_code"):
            continue
        
        # Check if item exists
        if not frappe.db.exists("Item", item_data.get("item_code")):
            frappe.throw(_("Item {0} not found").format(item_data.get("item_code")))
        
        # Get item details
        item_details = frappe.db.get_value(
            "Item", 
            item_data.get("item_code"), 
            ["item_name", "standard_rate", "item_group"], 
            as_dict=True
        )
        
        # Get rate from price list if not provided
        rate = item_data.get("rate")
        if not rate:
            rate = get_item_rate(item_data.get("item_code"))
        
        # Parse variant attributes if provided
        variant_attrs = item_data.get("variant_attributes") or item_data.get("attributes")
        if isinstance(variant_attrs, str):
            try:
                variant_attrs = json.loads(variant_attrs)
            except Exception:
                variant_attrs = None

        # Add item to order
        item = order_doc.append("items", {
            "item_code": item_data.get("item_code"),
            "item_name": item_details.item_name,
            "qty": flt(item_data.get("qty", 1)),
            "rate": flt(rate),
            "notes": item_data.get("notes", ""),
            "status": "New",
            "ordered_by": frappe.session.user,
            "last_update_by": frappe.session.user,
            "last_update_time": now_datetime(),
            "variant_attributes": variant_attrs or None,
        })
        
        # Set amount based on rate and qty
        item.amount = flt(item.rate) * flt(item.qty)
        
        # Handle kitchen station routing
        kitchen_station = get_kitchen_station_for_item(item_data.get("item_code"))
        if kitchen_station:
            item.kitchen_station = kitchen_station
    
    # Calculate totals
    calculate_order_totals(order_doc)


def calculate_order_totals(order_doc):
    """
    Calculate total quantity and amount for the order
    
    Args:
        order_doc: Waiter Order document
    """
    total_qty = 0
    total_amount = 0
    
    for item in order_doc.items:
        total_qty += flt(item.qty)
        total_amount += flt(item.amount)
    
    order_doc.total_qty = total_qty
    order_doc.total_amount = total_amount


def set_table_status(table_name, order_id):
    """
    Update table status when an order is created or updated
    
    Args:
        table_name: Name of the table
        order_id: ID of the associated order
    """
    from restaurant_management.restaurant_management.doctype.table.table import update_table_status as table_set_status

    # Update table status to In Progress and link to order
    table_set_status(table_name, "In Progress", order_id)


def release_table(table_name):
    """
    Release table when an order is paid or cancelled
    
    Args:
        table_name: Name of the table
    """
    from restaurant_management.restaurant_management.doctype.table.table import update_table_status as table_set_status

    # Update table status to Available and remove order link
    table_set_status(table_name, "Available", None)


@frappe.whitelist()
def get_item_rate(item_code):
    """
    Get the current rate for an item
    
    Args:
        item_code: Item code to get rate for
        
    Returns:
        Float rate value
    """
    # Check if POS price list is configured
    pos_price_list = frappe.db.get_single_value("POS Settings", "selling_price_list")
    if pos_price_list:
        price = frappe.db.get_value(
            "Item Price",
            {"item_code": item_code, "price_list": pos_price_list, "selling": 1},
            "price_list_rate"
        )
        if price:
            return flt(price)
    
    # Fallback to default selling price list
    default_price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")
    if default_price_list:
        price = frappe.db.get_value(
            "Item Price",
            {"item_code": item_code, "price_list": default_price_list, "selling": 1},
            "price_list_rate"
        )
        if price:
            return flt(price)
    
    # Last resort: get standard rate from item
    standard_rate = frappe.db.get_value("Item", item_code, "standard_rate")
    return flt(standard_rate) or 0


# Existing functions (keeping for compatibility)
@frappe.whitelist()
def get_available_tables(branch=None, available_only=False):
    """
    Get list of tables, optionally filtered by branch and availability
    
    Args:
        branch: Branch to filter tables by
        available_only: If True, only show available tables
    """
    filters = {"is_active": 1}
    
    if branch:
        filters["branch"] = branch
    
    if cint(available_only):
        filters["status"] = "Available"
    
    tables = frappe.get_all(
        "Table",
        fields=[
            "name", "table_number", "status", "current_pos_order", 
            "branch", "branch_code", "seating_capacity", 
            "IF(status = 'Available', 1, 0) as is_available"
        ],
        filters=filters,
        order_by="table_number"
    )
    
    # Convert is_available to boolean
    for table in tables:
        table.is_available = bool(table.is_available)
    
    return tables


@frappe.whitelist()
def get_menu_items():
    """Get list of menu items for waiter order screen."""
    try:
        # Get all sellable items
        items = frappe.get_all(
            "Item",
            filters={
                "disabled": 0,
                "is_sales_item": 1
            },
            fields=[
                "name as item_code", 
                "item_name", 
                "item_group", 
                "has_variants", 
                "standard_rate",
                "description",
                "image"
            ],
            order_by="item_name"
        )
        
        # Get price list rates
        price_list_name = frappe.db.get_single_value("Selling Settings", "selling_price_list")
        
        if price_list_name:
            for item in items:
                price = frappe.db.get_value(
                    "Item Price",
                    {
                        "price_list": price_list_name,
                        "item_code": item.item_code,
                        "selling": 1
                    },
                    "price_list_rate"
                )
        
                if price:
                    item.standard_rate = price

                # Get kitchen station
                kitchen_station_result = frappe.db.sql("""
                    SELECT ks.name
                    FROM `tabKitchen Station` ks
                    INNER JOIN `tabKitchen Station Item Group` ksig ON ksig.parent = ks.name
                    WHERE ksig.item_group = %s AND ks.is_active = 1
                    LIMIT 1
                """, item.item_group)

                item.kitchen_station = kitchen_station_result[0][0] if kitchen_station_result else None
        
        return items
    
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error in get_menu_items: {str(e)}")
        return []


@frappe.whitelist()
def get_item_groups():
    """Get list of item groups for filtering"""
    item_groups = frappe.get_all(
        "Item Group",
        fields=["name", "item_group_name"],
        filters={"is_group": 0},
        order_by="item_group_name"
    )
    
    return item_groups


@frappe.whitelist()
def get_item_variant_attributes(template_item_code=None, item_code=None):
    """Get attributes for an item template."""
    template_item_code = template_item_code or item_code

    if not template_item_code or not frappe.db.exists("Item", template_item_code):
        frappe.throw(_("Item template not found"))
    
    # Check if item has variants
    has_variants = frappe.db.get_value("Item", template_item_code, "has_variants")
    if not has_variants:
        return []
    
    # Get attributes
    attributes = frappe.get_all(
        "Item Variant Attribute",
        fields=["name", "attribute", "field_name", "options"],
        filters={"parent": template_item_code},
        order_by="idx"
    )
    
    return attributes


@frappe.whitelist()
def resolve_item_variant(template_item_code, attributes):
    """Resolve the appropriate variant based on selected attributes"""
    if isinstance(attributes, str):
        attributes = json.loads(attributes)
    
    if not frappe.db.exists("Item", template_item_code):
        frappe.throw(_("Item template not found"))
    
    # Get all variants of this template
    variants = frappe.get_all(
        "Item",
        filters={"variant_of": template_item_code, "disabled": 0}
    )
    
    for variant in variants:
        variant_attributes = frappe.get_all(
            "Item Variant Attribute",
            fields=["attribute", "field_name", "attribute_value"],
            filters={"parent": variant.name}
        )
        
        # Check if all selected attributes match this variant
        match = True
        for attr, value in attributes.items():
            found = False
            for va in variant_attributes:
                if (
                    (va.attribute == attr or va.field_name == attr)
                    and va.attribute_value == value
                ):
                    found = True
                    break
            
            if not found:
                match = False
                break
        
        if match:
            # Return the matched variant
            item = frappe.get_doc("Item", variant.name)
            return {
                "item_code": item.name,
                "item_name": item.item_name,
                "standard_rate": get_item_rate(item.name)
            }
    
    frappe.throw(_("No matching variant found for selected attributes"))


@frappe.whitelist()
def send_order_to_kitchen(order_data):
    """Create a new order"""
    if isinstance(order_data, str):
        order_data = json.loads(order_data)
    
    # Validate input
    if not order_data.get("table"):
        return {"success": False, "error": _("Table is required")}
    
    if not order_data.get("items") or not isinstance(order_data.get("items"), list):
        return {"success": False, "error": _("At least one item is required")}
    
    # Get table details
    table = frappe.get_doc("Table", order_data.get("table"))
    
    try:
        # Create new order
        waiter_order = frappe.new_doc("Waiter Order")
        waiter_order.table = table.name
        waiter_order.branch = table.branch
        waiter_order.branch_code = table.branch_code
        waiter_order.status = "Confirmed"  # Start with Confirmed status
        waiter_order.ordered_by = frappe.session.user
        waiter_order.order_time = now_datetime()
        
        # Add items
        add_items_to_order(waiter_order, order_data.get("items"))
        
        # Set totals if provided
        if order_data.get("total_qty"):
            waiter_order.total_qty = flt(order_data.get("total_qty"))
        
        if order_data.get("total_amount"):
            waiter_order.total_amount = flt(order_data.get("total_amount"))
        
        waiter_order.insert()
        waiter_order.submit()
        frappe.db.commit()
        
        # Update table status
        set_table_status(table.name, waiter_order.name)
        
        # Generate print format URL
        print_url = get_print_url(waiter_order.name)
        
        return {
            "success": True, 
            "order_id": waiter_order.name,
            "print_url": print_url
        }
    
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error creating waiter order"))
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def send_additional_items(order_data):
    """Send additional items to an existing order"""
    if isinstance(order_data, str):
        order_data = json.loads(order_data)
    
    # Validate input
    if not order_data.get("table"):
        return {"success": False, "error": _("Table is required")}
    
    if not order_data.get("items") or not isinstance(order_data.get("items"), list):
        return {"success": False, "error": _("At least one item is required")}
    
    try:
        # Get table to find the current order
        table = frappe.get_doc("Table", order_data.get("table"))
        
        if not table.current_pos_order:
            return {"success": False, "error": _("No active order found for this table")}
        
        # Get existing order
        waiter_order = frappe.get_doc("Waiter Order", table.current_pos_order)
        
        # Add new items
        add_items_to_order(waiter_order, order_data.get("items"))
        
        # Set totals if provided
        if order_data.get("total_qty"):
            waiter_order.total_qty = flt(order_data.get("total_qty"))
        
        if order_data.get("total_amount"):
            waiter_order.total_amount = flt(order_data.get("total_amount"))
        
        waiter_order.save()
        frappe.db.commit()
        
        # Generate print format URL for additional items only
        print_url = get_print_url(waiter_order.name, additional=True)
        
        return {
            "success": True,
            "print_url": print_url
        }
    
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error adding items to waiter order"))
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def cancel_order(table):
    """Cancel an active order for a table"""
    if not table:
        return {"success": False, "error": _("Table is required")}
    
    try:
        # Get table details
        table_doc = frappe.get_doc("Table", table)
        
        if not table_doc.current_pos_order:
            return {"success": False, "error": _("No active order found for this table")}
        
        # Get the order
        order = frappe.get_doc("Waiter Order", table_doc.current_pos_order)
        
        # Update order status
        order.status = "Cancelled"
        order.save()
        
        # If order is submitted, cancel it
        if order.docstatus == 1:
            order.cancel()
        
        # Release the table
        release_table(table)
        
        frappe.db.commit()
        
        return {
            "success": True,
            "message": _("Order cancelled successfully")
        }
    
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error cancelling order"))
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def mark_items_as_served(order_id, item_ids, all_ready=False):
    """Mark items as served"""
    if isinstance(item_ids, str):
        item_ids = json.loads(item_ids)
    
    if not order_id:
        return {"success": False, "error": _("Order ID is required")}
    
    try:
        waiter_order = frappe.get_doc("Waiter Order", order_id)
        
        # Track if any items were updated
        updated = False
        
        for item in waiter_order.items:
            # If all_ready is true, mark all ready items as served
            if all_ready and item.status == "Ready":
                item.status = "Delivered"
                item.last_update_by = frappe.session.user
                item.last_update_time = now_datetime()
                updated = True
            # Otherwise only mark specific items
            elif item.name in item_ids and item.status == "Ready":
                item.status = "Delivered"
                item.last_update_by = frappe.session.user
                item.last_update_time = now_datetime()
                updated = True
        
        if updated:
            waiter_order.save()
            frappe.db.commit()
            return {"success": True}
        else:
            return {"success": False, "error": _("No items were updated")}
    
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error marking items as served"))
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_print_url(order_id, additional=False):
    """Get URL for printing order"""
    if not frappe.db.exists("Waiter Order", order_id):
        return {"print_url": None}
    
    # Generate print format URL
    params = {
        "doctype": "Waiter Order",
        "name": order_id,
        "print_format": "Waiter Order" if not additional else "Additional Order",
        "no_letterhead": 1
    }
    
    print_url = get_url("/api/method/frappe.utils.print_format.download_pdf?") + \
        "&".join([f"{key}={params[key]}" for key in params])
    
    return {"print_url": print_url}


def get_kitchen_station_for_item(item_code):
    """Get the appropriate kitchen station for an item"""
    if not item_code:
        return None
    
    # Get item group
    item_group = frappe.db.get_value("Item", item_code, "item_group")
    if not item_group:
        return None
    
    # Find kitchen station for this item group
    kitchen_station = frappe.db.sql("""
        SELECT ks.name
        FROM `tabKitchen Station` ks
        INNER JOIN `tabKitchen Station Item Group` ksig ON ksig.parent = ks.name
        WHERE ksig.item_group = %s AND ks.is_active = 1
        LIMIT 1
    """, item_group)
    
    return kitchen_station[0][0] if kitchen_station else None
