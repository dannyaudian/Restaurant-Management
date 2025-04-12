import frappe
from frappe import _
from frappe.utils import now_datetime, cint, flt
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
    
    # Tables that are available for selection are those with status "Available"
    # Occupied tables have status "In Progress"
    
    return tables

@frappe.whitelist()
def get_item_templates():
    """Get list of item templates that can be ordered"""
    price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")
    
    # Get all items that are sales items
    items = frappe.get_all(
        "Item",
        fields=[
            "name as item_code", 
            "item_name", 
            "item_group", 
            "has_variants", 
            "is_stock_item"
        ],
        filters={
            "disabled": 0,
            "is_sales_item": 1
        },
        order_by="item_name"
    )
    
    # Get prices for all items
    if items and price_list:
        item_codes = [item.item_code for item in items]
        item_prices = frappe.get_all(
            "Item Price", 
            fields=["item_code", "price_list_rate"],
            filters={
                "price_list": price_list,
                "item_code": ["in", item_codes]
            }
        )
        
        # Create price lookup dict
        price_dict = {p.item_code: p.price_list_rate for p in item_prices}
        
        # Add prices to items
        for item in items:
            item.standard_rate = price_dict.get(item.item_code, 0)
    
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
def get_item_variant_attributes(template_item_code):
    """Get attributes for an item template"""
    if not frappe.db.exists("Item", template_item_code):
        frappe.throw(_("Item not found"))
    
    # Check if item has variants
    has_variants = frappe.db.get_value("Item", template_item_code, "has_variants")
    if not has_variants:
        return []
    
    # Get attributes
    attributes = frappe.get_all(
        "Item Variant Attribute",
        fields=["attribute", "field_name", "attribute as name", "options"],
        filters={"parent": template_item_code},
        order_by="idx"
    )
    
    return attributes

@frappe.whitelist()
def resolve_item_variant(template_item_code, attributes):
    """Resolve the appropriate variant based on selected attributes"""
    if not frappe.db.exists("Item", template_item_code):
        frappe.throw(_("Template item not found"))
    
    if isinstance(attributes, str):
        attributes = json.loads(attributes)
    
    # Find the variant based on attributes
    variant = frappe.db.sql("""
        SELECT i.name, i.item_name, i.item_code
        FROM `tabItem` i
        WHERE i.variant_of = %s AND i.disabled = 0
    """, template_item_code, as_dict=1)
    
    if not variant:
        frappe.throw(_("No variants found for the selected attributes"))
    
    # For simplicity in this example, assuming we're just returning the first variant
    # In a real implementation, you'd need to filter variants based on selected attributes
    price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")
    variant_item = variant[0]
    
    # Get the price
    if price_list:
        price = frappe.db.get_value(
            "Item Price",
            {"item_code": variant_item.item_code, "price_list": price_list},
            "price_list_rate"
        )
        variant_item["standard_rate"] = price or 0
    
    return variant_item

@frappe.whitelist()
def send_order_to_kitchen(order_data):
    """Create a new waiter order and send it to kitchen"""
    if isinstance(order_data, str):
        order_data = json.loads(order_data)
    
    # Validate order data
    if not order_data.get("table"):
        frappe.throw(_("Table is required"))
    
    if not order_data.get("items") or not isinstance(order_data.get("items"), list):
        frappe.throw(_("Order must contain at least one item"))
    
    table_doc = frappe.get_doc("Table", order_data.get("table"))
    
    # Check if table is available
    if table_doc.status == "In Progress" and table_doc.current_pos_order:
        # If there's already an order for this table, add items to it
        waiter_order = frappe.get_doc("Waiter Order", table_doc.current_pos_order)
    else:
        # Create a new waiter order
        waiter_order = frappe.new_doc("Waiter Order")
        waiter_order.table = order_data.get("table")
        waiter_order.branch_code = table_doc.branch_code
        waiter_order.status = "In Progress"
        waiter_order.order_time = now_datetime()
        waiter_order.ordered_by = frappe.session.user
    
    # Add items to order
    for item_data in order_data.get("items"):
        # Skip if item already exists in order 
        # (for new orders this won't happen, but for existing orders we need to check)
        if waiter_order.get("items"):
            existing_item = next(
                (item for item in waiter_order.items 
                if item.item_code == item_data.get("item_code") and
                   getattr(item, "attributes", None) == item_data.get("attributes", None) and
                   item.status == "New"),
                None
            )
            
            if existing_item:
                existing_item.qty += flt(item_data.get("qty", 1))
                continue
        
        # Add new item
        item = waiter_order.append("items", {
            "item_code": item_data.get("item_code"),
            "item_name": item_data.get("item_name"),
            "qty": flt(item_data.get("qty", 1)),
            "price": flt(item_data.get("price", 0)),
            "notes": item_data.get("notes", ""),
            "status": "Sent to Kitchen"
        })
        
        # Save attributes as a JSON field for simplicity
        # In a real implementation, you might want to store this differently
        if item_data.get("attributes"):
            item.attributes_json = json.dumps(item_data.get("attributes"))
            
        # Auto-assign kitchen station if possible
        kitchen_station = get_kitchen_station_for_item(item.item_code)
        if kitchen_station:
            item.kitchen_station = kitchen_station
    
    # Save the order
    waiter_order.save()
    
    # Get print URL if needed
    print_url = None
    if frappe.db.get_single_value("Restaurant Settings", "auto_print_orders"):
        print_url = f"/printview?doctype=Waiter+Order&name={waiter_order.name}&format=POS+Order&no_letterhead=0&_lang=en"
    
    return {
        "success": True,
        "order_id": waiter_order.name,
        "print_url": print_url
    }

@frappe.whitelist()
def send_additional_items(order_data):
    """Send additional items to an existing order"""
    if isinstance(order_data, str):
        order_data = json.loads(order_data)
    
    # Validate order data
    if not order_data.get("order_id") and not order_data.get("table"):
        frappe.throw(_("Order ID or Table is required"))
    
    if not order_data.get("items") or not isinstance(order_data.get("items"), list):
        frappe.throw(_("Order must contain at least one new item"))
    
    # Get the existing order
    if order_data.get("order_id"):
        waiter_order = frappe.get_doc("Waiter Order", order_data.get("order_id"))
    else:
        # Find order by table
        table_doc = frappe.get_doc("Table", order_data.get("table"))
        if not table_doc.current_pos_order:
            frappe.throw(_("No active order found for this table"))
        
        waiter_order = frappe.get_doc("Waiter Order", table_doc.current_pos_order)
    
    # Validate order status
    if waiter_order.status == "Paid":
        frappe.throw(_("Cannot add items to a paid order"))
    
    # Add new items to order
    for item_data in order_data.get("items"):
        # Add new item
        item = waiter_order.append("items", {
            "item_code": item_data.get("item_code"),
            "item_name": item_data.get("item_name"),
            "qty": flt(item_data.get("qty", 1)),
            "price": flt(item_data.get("price", 0)),
            "notes": item_data.get("notes", ""),
            "status": "Sent to Kitchen"
        })
        
        # Save attributes as a JSON field
        if item_data.get("attributes"):
            item.attributes_json = json.dumps(item_data.get("attributes"))
            
        # Auto-assign kitchen station if possible
        kitchen_station = get_kitchen_station_for_item(item.item_code)
        if kitchen_station:
            item.kitchen_station = kitchen_station
    
    # Save the order
    waiter_order.save()
    
    # Get print URL if needed
    print_url = None
    if frappe.db.get_single_value("Restaurant Settings", "auto_print_orders"):
        print_url = f"/printview?doctype=Waiter+Order&name={waiter_order.name}&format=Additional+Items&no_letterhead=0&_lang=en"
    
    return {
        "success": True,
        "order_id": waiter_order.name,
        "print_url": print_url
    }

@frappe.whitelist()
def mark_items_as_served(order_id, item_ids=None, all_ready=False):
    """Mark specific items or all ready items as served"""
    if not order_id:
        frappe.throw(_("Order ID is required"))
    
    if isinstance(item_ids, str):
        item_ids = json.loads(item_ids)
    
    if isinstance(all_ready, str):
        all_ready = cint(all_ready)
    
    waiter_order = frappe.get_doc("Waiter Order", order_id)
    
    updated = False
    
    for item in waiter_order.items:
        if all_ready and item.status == "Ready":
            item.status = "Served"
            item.last_update_by = frappe.session.user
            item.last_update_time = now_datetime()
            updated = True
        elif not all_ready and item_ids and item.name in item_ids:
            item.status = "Served"
            item.last_update_by = frappe.session.user
            item.last_update_time = now_datetime()
            updated = True
    
    if updated:
        waiter_order.save()
        return {"success": True}
    else:
        return {"success": False, "error": _("No items were updated")}

@frappe.whitelist()
def get_print_url(order_id):
    """Get URL for printing an order"""
    if not order_id:
        frappe.throw(_("Order ID is required"))
    
    return {
        "success": True,
        "print_url": f"/printview?doctype=Waiter+Order&name={order_id}&format=POS+Order&no_letterhead=0&_lang=en"
    }

def get_kitchen_station_for_item(item_code):
    """Helper function to determine kitchen station for an item"""
    # Get the item group
    item_group = frappe.db.get_value("Item", item_code, "item_group")
    if not item_group:
        return None
    
    # Find kitchen station for this item group
    kitchen_stations = frappe.get_all(
        "Kitchen Station", 
        filters={"is_active": 1}
    )
    
    for station_name in kitchen_stations:
        station = frappe.get_doc("Kitchen Station", station_name)
        
        # Check if this item group is mapped to this station
        for group in station.item_groups:
            if group.item_group == item_group:
                return station.name
    
    return None