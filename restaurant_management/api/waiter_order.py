import frappe
from frappe import _
from frappe.utils import now_datetime, get_url
from typing import Dict, List, Any, Optional, Union
import json

@frappe.whitelist()
def get_available_tables():
    """Get list of available tables (not occupied with active orders)"""
    tables = frappe.get_all(
        "Table",
        fields=["name", "table_number", "status", "current_pos_order", "branch_code"],
        filters={"is_active": 1},
        order_by="table_number"
    )
    
    return tables

@frappe.whitelist()
def get_item_templates():
    """Get list of item templates that can be ordered"""
    items = frappe.get_all(
        "Item",
        fields=[
            "name as item_code", 
            "item_name", 
            "item_group", 
            "has_variants",
            "standard_rate"
        ],
        filters={
            "disabled": 0,
            "is_sales_item": 1
        },
        order_by="item_name"
    )
    
    # Get prices from Item Price
    price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")
    if price_list:
        for item in items:
            price = frappe.db.get_value(
                "Item Price",
                {"item_code": item.item_code, "price_list": price_list},
                "price_list_rate"
            )
            if price:
                item.standard_rate = price
    
    return items

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
def get_item_variant_attributes(template_item_code: Optional[str] = None, item_code: Optional[str] = None):
    """Get attributes for an item template.

    Accepts either ``template_item_code`` or ``item_code`` as the template's
    identifier. This now supports additional variant attributes such as
    "Sauce" and "Side Dish" which may have been added through custom fields.
    """
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
                "standard_rate": item.standard_rate
            }
    
    frappe.throw(_("No matching variant found for selected attributes"))

@frappe.whitelist()
def send_order_to_kitchen(order_data):
    """Create a new order or send additional items to kitchen"""
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
        waiter_order.branch_code = table.branch_code
        waiter_order.status = "In Progress"
        waiter_order.ordered_by = frappe.session.user
        waiter_order.order_time = now_datetime()
        
        # Add items
        for item_data in order_data.get("items"):
            item = waiter_order.append("items", {
                "item_code": item_data.get("item_code"),
                "item_name": item_data.get("item_name"),
                "qty": item_data.get("qty", 1),
                "price": item_data.get("price", 0),
                "status": "Sent to Kitchen",
                "notes": item_data.get("notes", ""),
                "ordered_by": frappe.session.user,
                "last_update_by": frappe.session.user,
                "last_update_time": now_datetime()
            })
            
            # Handle kitchen station routing
            station = get_kitchen_station_for_item(item_data.get("item_code"))
            if station:
                item.kitchen_station = station
        
        waiter_order.save()
        frappe.db.commit()
        
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
    if not order_data.get("order_id"):
        return {"success": False, "error": _("Order ID is required")}
    
    if not order_data.get("items") or not isinstance(order_data.get("items"), list):
        return {"success": False, "error": _("At least one item is required")}
    
    try:
        # Get existing order
        waiter_order = frappe.get_doc("Waiter Order", order_data.get("order_id"))
        
        # Add new items
        for item_data in order_data.get("items"):
            item = waiter_order.append("items", {
                "item_code": item_data.get("item_code"),
                "item_name": item_data.get("item_name"),
                "qty": item_data.get("qty", 1),
                "price": item_data.get("price", 0),
                "status": "Sent to Kitchen",
                "notes": item_data.get("notes", ""),
                "ordered_by": frappe.session.user,
                "last_update_by": frappe.session.user,
                "last_update_time": now_datetime()
            })
            
            # Handle kitchen station routing
            station = get_kitchen_station_for_item(item_data.get("item_code"))
            if station:
                item.kitchen_station = station
        
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
                item.status = "Served"
                item.last_update_by = frappe.session.user
                item.last_update_time = now_datetime()
                updated = True
            # Otherwise only mark specific items
            elif item.name in item_ids and item.status == "Ready":
                item.status = "Served"
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
    kitchen_stations = frappe.get_all(
        "Kitchen Station",
        filters={"is_active": 1}
    )
    
    for station_name in kitchen_stations:
        station = frappe.get_doc("Kitchen Station", station_name.name)
        
        # Check if this station handles the item group
        for station_item_group in station.item_groups:
            if station_item_group.item_group == item_group:
                return station.name
    
    return None
# Add this function to your existing waiter_order.py file

@frappe.whitelist()
def get_active_orders(table_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Get active orders for a specific table or all active orders if table_id is not provided

    Args:
        table_id: Optional ID of the table to get orders for

    Returns:
        List of active orders with their items and status
    """
    try:
        filters = {"status": ["in", ["In Progress", "Partially Served"]]}

        if table_id:
            filters["table"] = table_id

        orders = frappe.get_all(
            "Waiter Order",
            filters=filters,
            fields=[
                "name",
                "table",
                "order_time",
                "status",
                "ordered_by",
                "branch_code"
            ],
            order_by="order_time desc"
        )

        # Fetch items for each order
        for order in orders:
            order_items = frappe.get_all(
                "Waiter Order Item",
                filters={"parent": order.name},
                fields=[
                    "name",
                    "item_code",
                    "item_name",
                    "qty",
                    "price",
                    "status",
                    "notes",
                    "kitchen_station",
                    "ordered_by",
                    "last_update_by",
                    "last_update_time"
                ]
            )

            # Calculate some helper values
            order_total = sum(item.qty * item.price for item in order_items)
            items_ready = sum(1 for item in order_items if item.status == "Ready")
            items_served = sum(1 for item in order_items if item.status == "Served")
            items_total = len(order_items)

            # Add items and calculated fields to order
            order.items = order_items
            order.order_total = order_total
            order.items_ready = items_ready
            order.items_served = items_served
            order.items_total = items_total

            # Get table information
            table_info = frappe.db.get_value(
                "Table",
                order.table,
                ["table_number", "description"],
                as_dict=True
            )
            if table_info:
                order.table_number = table_info.table_number
                order.table_description = table_info.description

        return orders

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error in get_active_orders: {str(e)}")
        return []
@frappe.whitelist()
def get_menu_items() -> List[Dict[str, Any]]:
    """
    Get list of menu items for waiter order screen.

    Only item templates (``has_variants = 1``) are returned so that the client
    can prompt for variant options such as Sauce or Side Dish.
    """
    try:
        # Get all sellable item templates
        items = frappe.get_all(
            "Item",
            filters={
                "disabled": 0,
                "is_sales_item": 1,
                "has_variants": 1
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
        
        # Get price list rates if applicable
        price_list_name = frappe.db.get_single_value("Selling Settings", "selling_price_list")
        
        if price_list_name:
            for item in items:
                # Get price from Item Price
                price = frappe.db.get_value(
                    "Item Price",
                    {
                        "price_list": price_list_name,
                        "item_code": item.item_code,
                        "selling": 1
                    },
                    "price_list_rate"
                )
        
                # Update standard_rate if price exists
                if price:
                    item.standard_rate = price

                # Get kitchen station for the item's item group
                kitchen_station_result = frappe.db.sql("""
                    SELECT ks.name
                    FROM `tabKitchen Station` ks
                    INNER JOIN `tabKitchen Station Item Group` ksig ON ksig.parent = ks.name
                    WHERE ksig.item_group = %s AND ks.is_active = 1
                    LIMIT 1
                """, item.item_group)

                item.kitchen_station = kitchen_station_result[0][0] if kitchen_station_result else None

        # Get available stock from configured warehouse (if applicable)
        pos_profile = frappe.db.get_value(
            "POS Profile User",
            {"user": frappe.session.user},
            "parent"
        )

        if pos_profile:
            warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
            if warehouse:
                for item in items:
                    # Skip templates as they don't have stock
                    if not item.has_variants:
                        actual_qty = frappe.db.get_value(
                            "Bin",
                            {"item_code": item.item_code, "warehouse": warehouse},
                            "actual_qty"
                        ) or 0
                        item.actual_qty = actual_qty
        
        return items
    
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error in get_menu_items: {str(e)}")
        return []
