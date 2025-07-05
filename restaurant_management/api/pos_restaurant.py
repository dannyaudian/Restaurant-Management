import frappe
from frappe import _
import json


@frappe.whitelist()
def get_tables(pos_profile=None):
    """
    Get tables for POS interface
    
    Args:
        pos_profile (str): POS Profile name to filter tables by branch
        
    Returns:
        List of tables with status
    """
    from restaurant_management.restaurant_management.utils.branch_permissions import get_allowed_branches_for_user, user_has_branch_access
    
    if not pos_profile:
        return []
    
    # Get branch code from POS profile
    branch_code = frappe.db.get_value("POS Profile", pos_profile, "branch_code")
    
    # Check if user has access to this branch
    if branch_code and not user_has_branch_access(branch_code):
        frappe.throw(_("You don't have permission to access this branch"))
    
    filters = {}
    if branch_code:
        filters["branch_code"] = branch_code
    else:
        # If no specific branch in POS profile, filter by all allowed branches
        allowed_branches = get_allowed_branches_for_user()
        if allowed_branches:
            filters["branch_code"] = ["in", allowed_branches]
    
    # Get tables
    tables = frappe.get_all(
        "Table",
        filters=filters,
        fields=["name", "table_number", "status", "current_pos_order", "branch_code"],
        order_by="table_number"
    )
    
    return tables

@frappe.whitelist()
def get_waiter_order(order_id):
    """
    Get waiter order details for POS
    
    Args:
        order_id (str): Waiter Order ID
        
    Returns:
        Waiter Order with items
    """
    if not order_id or not frappe.db.exists("Waiter Order", order_id):
        return None
    
    # Get order details
    order = frappe.get_doc("Waiter Order", order_id)
    
    # Format response
    result = {
        "name": order.name,
        "table": order.table,
        "status": order.status,
        "items": []
    }
    
    # Add items
    for item in order.items:
        result["items"].append({
            "name": item.name,
            "item_code": item.item_code,
            "item_name": item.item_name,
            "qty": item.qty,
            "price": item.price,
            "status": item.status,
            "notes": item.notes,
            "kitchen_station": item.kitchen_station
        })
    
    return result

@frappe.whitelist()
def get_item_details(item_code):
    """
    Get item details for POS
    
    Args:
        item_code (str): Item code
        
    Returns:
        Item details
    """
    if not item_code:
        return None
    
    item = frappe.get_doc("Item", item_code)
    
    result = {
        "item_code": item.item_code,
        "item_name": item.item_name,
        "stock_uom": item.stock_uom,
        "rate": item.standard_rate or 0
    }
    
    return result

@frappe.whitelist()
def get_items(start, page_length, price_list, item_group, pos_profile, search_value="", allowed_item_groups=None):
    """
    Custom method to get items for POS with restaurant filtering
    
    Args:
        start (int): Start index
        page_length (int): Number of items to fetch
        price_list (str): Price list
        item_group (str): Item group to filter by
        pos_profile (str): POS Profile
        search_value (str): Search query
        allowed_item_groups (list): List of allowed item groups
        
    Returns:
        Items for POS
    """
    # Convert to proper types
    start = cint(start)
    page_length = cint(page_length)
    
    # Parse allowed item groups if it's a string
    if allowed_item_groups and isinstance(allowed_item_groups, str):
        allowed_item_groups = json.loads(allowed_item_groups)
    
    # Prepare filters
    filters = {
        'disabled': 0,
        'is_sales_item': 1
    }
    
    # Add item group filter
    if item_group != "All Item Groups":
        filters['item_group'] = item_group
    elif allowed_item_groups:
        # If we're showing all groups but have a restricted list
        filters['item_group'] = ['in', allowed_item_groups]
    
    # Add search filter
    if search_value:
        filters['item_name'] = ['like', f'%{search_value}%']
    
    # Get items
    items = frappe.get_all(
        'Item',
        fields=[
            'name as item_code',
            'item_name',
            'description',
            'item_group',
            'image as item_image',
            'is_stock_item',
            'has_variants',
            'stock_uom',
            'standard_rate',
            'idx as idx',
        ],
        filters=filters,
        start=start,
        page_length=page_length,
        order_by='idx'
    )
    
    # Get prices from Price List if specified
    if price_list:
        item_prices_dict = {}
        
        # Get item prices
        item_prices = frappe.get_all(
            'Item Price',
            fields=['item_code', 'price_list_rate'],
            filters={
                'price_list': price_list,
                'item_code': ['in', [item.item_code for item in items]]
            }
        )
        
        # Create dictionary for quick lookup
        for price in item_prices:
            item_prices_dict[price.item_code] = price.price_list_rate
        
        # Update items with prices
        for item in items:
            item.standard_rate = item_prices_dict.get(item.item_code, item.standard_rate)
    
    return items

@frappe.whitelist()
def update_waiter_order_status(waiter_order, status):
    """
    Update waiter order status
    
    Args:
        waiter_order (str): Waiter Order ID
        status (str): New status
        
    Returns:
        Success status
    """
    if not waiter_order or not frappe.db.exists("Waiter Order", waiter_order):
        return {"success": False, "message": _("Waiter Order not found")}
    
    try:
        # Get order
        order = frappe.get_doc("Waiter Order", waiter_order)
        
        # Update status
        order.status = status
        order.save()
        
        # If status is Paid, update table status
        if status == "Paid" and order.table:
            table = frappe.get_doc("Table", order.table)
            table.status = "Available"
            table.current_pos_order = None
            table.save()
        
        frappe.db.commit()
        
        return {"success": True}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error updating waiter order status"))
        return {"success": False, "message": str(e)}

def cint(value):
    """Convert value to integer"""
    try:
        return int(value)
    except (ValueError, TypeError):
        return 0
@frappe.whitelist()
def update_sales_order_from_waiter_order(sales_order_id, waiter_order_id):
    """
    Update an existing Sales Order from a Waiter Order
    
    Args:
        sales_order_id (str): Sales Order ID
        waiter_order_id (str): Waiter Order ID
        
    Returns:
        Dict with success status
    """
    if (not sales_order_id or not frappe.db.exists("Sales Order", sales_order_id) or
        not waiter_order_id or not frappe.db.exists("Waiter Order", waiter_order_id)):
        return {"success": False, "message": _("Sales Order or Waiter Order not found")}
    
    try:
        # Get documents
        so = frappe.get_doc("Sales Order", sales_order_id)
        waiter_order = frappe.get_doc("Waiter Order", waiter_order_id)
        
        # Cannot update submitted Sales Order
        if so.docstatus != 0:
            return {"success": False, "message": _("Cannot update a submitted Sales Order")}
        
        # Update restaurant fields
        so.restaurant_waiter_order = waiter_order.name
        so.restaurant_table = waiter_order.table
        
        # Map of existing items by item code
        existing_items = {item.item_code: item for item in so.items}
        
        # Add or update items
        for item in waiter_order.items:
            if item.item_code in existing_items:
                # Update existing item
                existing_items[item.item_code].qty = item.qty
                existing_items[item.item_code].rate = item.price
            else:
                # Add new item
                so.append("items", {
                    "item_code": item.item_code,
                    "item_name": item.item_name,
                    "qty": item.qty,
                    "rate": item.price,
                    "delivery_date": frappe.utils.nowdate()
                })
        
        # Remove items that are no longer in the waiter order
        waiter_order_item_codes = [item.item_code for item in waiter_order.items]
        items_to_remove = [item for item in so.items if item.item_code not in waiter_order_item_codes]
        
        for item in items_to_remove:
            so.remove(item)
        
        so.save()
        
        return {
            "success": True,
            "sales_order": so.name,
            "message": _("Sales Order updated successfully")
        }
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error updating Sales Order from Waiter Order"))
        return {"success": False, "message": str(e)}

@frappe.whitelist()
# Add this to your create_sales_order_from_waiter_order function

def create_sales_order_from_waiter_order(waiter_order_id, pos_invoice=None):
    """
    Create a Sales Order from a Waiter Order
    
    Args:
        waiter_order_id (str): Waiter Order ID
        pos_invoice (str, optional): POS Invoice linked to this order
        
    Returns:
        Dict with success status and sales order name
    """
    if not waiter_order_id or not frappe.db.exists("Waiter Order", waiter_order_id):
        return {"success": False, "message": _("Waiter Order not found")}
    
    try:
        # Get waiter order
        waiter_order = frappe.get_doc("Waiter Order", waiter_order_id)
        
        # Check if sales order already exists for this waiter order
        existing_so = frappe.db.get_value("Sales Order", 
            {"restaurant_waiter_order": waiter_order.name, "docstatus": ["<", 2]}, "name")
        
        if existing_so:
            # Update existing Sales Order
            result = update_sales_order_from_waiter_order(existing_so, waiter_order.name)
            
            # Additionally link POS Invoice if provided
            if pos_invoice and result["success"]:
                link_pos_invoice_to_sales_order(pos_invoice, result["sales_order"])
                
            return result
        
        # Get customer 
        customer = None
        
        # If POS Invoice is provided, get customer from there
        if pos_invoice and frappe.db.exists("POS Invoice", pos_invoice):
            customer = frappe.db.get_value("POS Invoice", pos_invoice, "customer")
        
        # Otherwise get from POS Profile
        if not customer:
            pos_profile = frappe.db.get_value("POS Profile", 
                {"restaurant_mode": 1, "branch_code": waiter_order.branch_code},
                "customer")
            customer = pos_profile
        
        # Fallback to default customer
        if not customer:
            customer = frappe.db.get_single_value("Selling Settings", "customer")
        
        if not customer:
            return {"success": False, "message": _("Default customer not found")}
        
        # Create new Sales Order
        so = frappe.new_doc("Sales Order")
        so.customer = customer
        so.restaurant_waiter_order = waiter_order.name
        so.restaurant_table = waiter_order.table
        so.delivery_date = frappe.utils.nowdate()
        
        # Set branch fields from table
        if waiter_order.table:
            table = frappe.get_doc("Table", waiter_order.table)
            if table.branch_code:
                # Find branch based on branch code
                branch = frappe.get_all(
                    "Branch",
                    filters={"branch_code": table.branch_code},
                    fields=["name"],
                    limit=1
                )
                
                if branch:
                    so.branch = branch[0].name
                    so.branch_code = table.branch_code
                else:
                    # Set just branch code if branch not found
                    so.branch_code = table.branch_code
        
        # Add items
        for item in waiter_order.items:
            so.append("items", {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "qty": item.qty,
                "rate": item.price,
                "delivery_date": frappe.utils.nowdate()
            })
        
        so.save()
        
        # Link to POS Invoice if provided
        if pos_invoice:
            link_pos_invoice_to_sales_order(pos_invoice, so.name)
        
        return {
            "success": True,
            "sales_order": so.name,
            "message": _("Sales Order created successfully")
        }
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error creating Sales Order from Waiter Order"))
        return {"success": False, "message": str(e)}
    
def link_pos_invoice_to_sales_order(pos_invoice, sales_order):
    """
    Link a POS Invoice to a Sales Order
    
    Args:
        pos_invoice (str): POS Invoice name
        sales_order (str): Sales Order name
    """
    if not pos_invoice or not sales_order:
        return {"success": False, "message": _("POS Invoice or Sales Order not specified")}

    try:
        # Get POS Invoice
        pos_doc = frappe.get_doc("POS Invoice", pos_invoice)

        # Check if it already has a Sales Order reference
        if hasattr(pos_doc, "sales_order") and not pos_doc.sales_order:
            pos_doc.sales_order = sales_order
            pos_doc.save()
            frappe.db.commit()

        return {"success": True}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error linking POS Invoice to Sales Order"))
        return {"success": False, "message": str(e)}
