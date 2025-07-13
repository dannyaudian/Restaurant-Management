import frappe
from frappe import _
from frappe.utils import cint, nowdate
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
    try:
        from restaurant_management.restaurant_management.utils.branch_permissions import get_allowed_branches_for_user, user_has_branch_access
        
        if not pos_profile:
            frappe.response["message"] = []
            return
        
        # Get branch code from POS profile
        branch_code = frappe.db.get_value("POS Profile", pos_profile, "branch_code")
        
        # Check if user has access to this branch
        if branch_code and not user_has_branch_access(branch_code):
            frappe.throw(_("You don't have permission to access this branch"))
        
        filters = {"is_active": 1}
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
            fields=[
                "name", 
                "table_number", 
                "status", 
                "current_pos_order",
                "branch_code",
                "seating_capacity", 
                "is_available"
            ],
            order_by="table_number"
        )
        
        # Enhance data with additional details
        for table in tables:
            # Ensure consistent status
            if not table.status or table.is_available:
                table.status = "Available"
            elif table.current_pos_order:
                table.status = "Occupied"
            
            # Add waiter info if table has an active order
            if table.current_pos_order:
                waiter_name = frappe.db.get_value(
                    "Waiter Order", 
                    table.current_pos_order, 
                    "waiter_name"
                )
                if waiter_name:
                    table.waiter = waiter_name
        
        frappe.response["message"] = tables
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error fetching tables for POS"))
        frappe.response["message"] = []
        frappe.throw(_("Error fetching tables: {0}").format(str(e)))


@frappe.whitelist()
def get_waiter_order(order_id):
    """
    Get waiter order details for POS
    
    Args:
        order_id (str): Waiter Order ID
        
    Returns:
        Waiter Order with items
    """
    try:
        if not order_id:
            frappe.response["message"] = None
            return
        
        # Check if order exists
        if not frappe.db.exists("Waiter Order", order_id):
            frappe.response["message"] = None
            return
        
        # Check permissions
        if not frappe.has_permission("Waiter Order", "read", order_id):
            frappe.throw(_("You don't have permission to access this order"))
        
        # Get order details
        order = frappe.get_doc("Waiter Order", order_id)
        
        # Format response
        result = {
            "name": order.name,
            "table": order.table,
            "status": order.status,
            "order_time": order.order_time,
            "waiter": order.waiter,
            "waiter_name": order.waiter_name,
            "branch_code": order.branch_code,
            "total_amount": order.total_amount,
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
                "kitchen_station": item.kitchen_station,
                "attributes": item.attributes if hasattr(item, "attributes") else None
            })
        
        frappe.response["message"] = result
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error fetching waiter order"))
        frappe.response["message"] = None
        frappe.throw(_("Error fetching order details: {0}").format(str(e)))


@frappe.whitelist()
def get_item_details(item_code):
    """
    Get item details for POS
    
    Args:
        item_code (str): Item code
        
    Returns:
        Item details
    """
    try:
        if not item_code:
            frappe.response["message"] = None
            return
        
        # Check if item exists
        if not frappe.db.exists("Item", item_code):
            frappe.response["message"] = None
            return
        
        # Get item details
        fields = [
            "item_code", "item_name", "stock_uom", "standard_rate",
            "description", "image", "item_group", "has_variants"
        ]
        item = frappe.db.get_value("Item", item_code, fields, as_dict=1)
        
        # Add additional fields as needed
        result = {
            "item_code": item.item_code,
            "item_name": item.item_name,
            "description": item.description,
            "image": item.image,
            "item_group": item.item_group,
            "stock_uom": item.stock_uom,
            "rate": item.standard_rate or 0,
            "has_variants": item.has_variants
        }
        
        frappe.response["message"] = result
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error fetching item details"))
        frappe.response["message"] = None
        frappe.throw(_("Error fetching item details: {0}").format(str(e)))


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
    try:
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
        if item_group and item_group != "All Item Groups":
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
            item_codes = [item.item_code for item in items]
            
            if item_codes:
                item_prices_dict = {}
                
                # Get item prices
                item_prices = frappe.get_all(
                    'Item Price',
                    fields=['item_code', 'price_list_rate'],
                    filters={
                        'price_list': price_list,
                        'item_code': ['in', item_codes]
                    }
                )
                
                # Create dictionary for quick lookup
                for price in item_prices:
                    item_prices_dict[price.item_code] = price.price_list_rate
                
                # Update items with prices
                for item in items:
                    item.standard_rate = item_prices_dict.get(item.item_code, item.standard_rate)
        
        frappe.response["message"] = items
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error fetching items for POS"))
        frappe.response["message"] = []
        frappe.throw(_("Error fetching menu items: {0}").format(str(e)))


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
    try:
        if not waiter_order:
            frappe.response["message"] = {"success": False, "message": _("Waiter Order ID is required")}
            return
        
        # Check if order exists
        if not frappe.db.exists("Waiter Order", waiter_order):
            frappe.response["message"] = {"success": False, "message": _("Waiter Order not found")}
            return
        
        # Check permissions
        if not frappe.has_permission("Waiter Order", "write", waiter_order):
            frappe.throw(_("You don't have permission to update this order"))
        
        # Validate status
        valid_statuses = ["New", "In Progress", "Ready", "Completed", "Paid", "Cancelled"]
        if status not in valid_statuses:
            frappe.response["message"] = {
                "success": False, 
                "message": _("Invalid status. Valid options are: {0}").format(", ".join(valid_statuses))
            }
            return
        
        # Get order
        order = frappe.get_doc("Waiter Order", waiter_order)
        
        # Update status
        order.status = status
        order.db_update()
        
        # If status is Paid or Cancelled, update table status
        if status in ["Paid", "Cancelled"] and order.table:
            table = frappe.get_doc("Table", order.table)
            table.status = "Available"
            table.current_pos_order = None
            table.is_available = 1
            table.db_update()
        
        frappe.db.commit()
        
        frappe.response["message"] = {
            "success": True,
            "message": _("Waiter order status updated to {0}").format(status)
        }
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), _("Error updating waiter order status"))
        frappe.response["message"] = {"success": False, "message": str(e)}


@frappe.whitelist()
def create_sales_order_from_waiter_order(waiter_order_id, pos_invoice=None):
    """
    Create a Sales Order from a Waiter Order
    
    Args:
        waiter_order_id (str): Waiter Order ID
        pos_invoice (str, optional): POS Invoice linked to this order
        
    Returns:
        Dict with success status and sales order name
    """
    try:
        if not waiter_order_id:
            frappe.response["message"] = {"success": False, "message": _("Waiter Order ID is required")}
            return
        
        # Check if order exists
        if not frappe.db.exists("Waiter Order", waiter_order_id):
            frappe.response["message"] = {"success": False, "message": _("Waiter Order not found")}
            return
        
        # Check permissions
        if not frappe.has_permission("Waiter Order", "read", waiter_order_id) or not frappe.has_permission("Sales Order", "create"):
            frappe.throw(_("You don't have permission to create Sales Order from this Waiter Order"))
        
        # Get waiter order
        waiter_order = frappe.get_doc("Waiter Order", waiter_order_id)
        
        # Check if sales order already exists for this waiter order
        existing_so = frappe.db.get_value(
            "Sales Order", 
            {"restaurant_waiter_order": waiter_order.name, "docstatus": ["<", 2]}, 
            "name"
        )
        
        if existing_so:
            # Update existing Sales Order
            result = update_sales_order_from_waiter_order(existing_so, waiter_order.name)
            
            # Additionally link POS Invoice if provided
            if pos_invoice and result["success"]:
                link_pos_invoice_to_sales_order(pos_invoice, result["sales_order"])
                
            frappe.response["message"] = result
            return
        
        # Get customer 
        customer = None
        
        # If POS Invoice is provided, get customer from there
        if pos_invoice and frappe.db.exists("POS Invoice", pos_invoice):
            customer = frappe.db.get_value("POS Invoice", pos_invoice, "customer")
        
        # Otherwise get from POS Profile
        if not customer:
            pos_profile = frappe.db.get_value(
                "POS Profile", 
                {"restaurant_mode": 1, "branch_code": waiter_order.branch_code},
                "customer"
            )
            customer = pos_profile
        
        # Fallback to default customer
        if not customer:
            customer = frappe.db.get_single_value("Selling Settings", "customer")
        
        if not customer:
            frappe.response["message"] = {"success": False, "message": _("Default customer not found")}
            return
        
        # Create new Sales Order
        so = frappe.new_doc("Sales Order")
        so.customer = customer
        so.restaurant_waiter_order = waiter_order.name
        so.restaurant_table = waiter_order.table
        so.delivery_date = nowdate()
        
        # Set branch fields from table
        if waiter_order.table:
            table_doc = frappe.db.get_value(
                "Table", 
                waiter_order.table, 
                ["branch_code", "branch"],
                as_dict=1
            )
            
            if table_doc:
                if table_doc.branch:
                    so.branch = table_doc.branch
                
                if table_doc.branch_code:
                    so.branch_code = table_doc.branch_code
        
        # Add items
        if not waiter_order.items:
            frappe.response["message"] = {"success": False, "message": _("Waiter Order has no items")}
            return
            
        for item in waiter_order.items:
            so.append("items", {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "qty": item.qty,
                "rate": item.price,
                "delivery_date": nowdate()
            })
        
        so.insert()
        
        # Link to POS Invoice if provided
        if pos_invoice:
            link_pos_invoice_to_sales_order(pos_invoice, so.name)
        
        frappe.response["message"] = {
            "success": True,
            "sales_order": so.name,
            "message": _("Sales Order {0} created successfully").format(so.name)
        }
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), _("Error creating Sales Order from Waiter Order"))
        frappe.response["message"] = {"success": False, "message": str(e)}


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
    try:
        # Validate inputs
        if not sales_order_id or not waiter_order_id:
            frappe.response["message"] = {"success": False, "message": _("Sales Order ID and Waiter Order ID are required")}
            return
        
        # Check if documents exist
        if not frappe.db.exists("Sales Order", sales_order_id):
            frappe.response["message"] = {"success": False, "message": _("Sales Order not found")}
            return
            
        if not frappe.db.exists("Waiter Order", waiter_order_id):
            frappe.response["message"] = {"success": False, "message": _("Waiter Order not found")}
            return
        
        # Check permissions
        if not frappe.has_permission("Sales Order", "write", sales_order_id) or not frappe.has_permission("Waiter Order", "read", waiter_order_id):
            frappe.throw(_("You don't have permission to update this Sales Order"))
        
        # Get documents
        so = frappe.get_doc("Sales Order", sales_order_id)
        waiter_order = frappe.get_doc("Waiter Order", waiter_order_id)
        
        # Cannot update submitted Sales Order
        if so.docstatus != 0:
            frappe.response["message"] = {"success": False, "message": _("Cannot update a submitted Sales Order")}
            return
        
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
                    "delivery_date": nowdate()
                })
        
        # Remove items that are no longer in the waiter order
        waiter_order_item_codes = [item.item_code for item in waiter_order.items]
        items_to_remove = [item for item in so.items if item.item_code not in waiter_order_item_codes]
        
        for item in items_to_remove:
            so.remove(item)
        
        so.save()
        
        frappe.response["message"] = {
            "success": True,
            "sales_order": so.name,
            "message": _("Sales Order {0} updated successfully").format(so.name)
        }
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), _("Error updating Sales Order from Waiter Order"))
        frappe.response["message"] = {"success": False, "message": str(e)}


def link_pos_invoice_to_sales_order(pos_invoice, sales_order):
    """
    Link a POS Invoice to a Sales Order
    
    Args:
        pos_invoice (str): POS Invoice name
        sales_order (str): Sales Order name
        
    Returns:
        Dict with success status
    """
    try:
        if not pos_invoice or not sales_order:
            return {"success": False, "message": _("POS Invoice or Sales Order not specified")}
        
        # Check if documents exist
        if not frappe.db.exists("POS Invoice", pos_invoice):
            return {"success": False, "message": _("POS Invoice not found")}
            
        if not frappe.db.exists("Sales Order", sales_order):
            return {"success": False, "message": _("Sales Order not found")}

        # Get POS Invoice
        pos_doc = frappe.get_doc("POS Invoice", pos_invoice)

        # Check if it already has a Sales Order reference
        if hasattr(pos_doc, "sales_order") and not pos_doc.sales_order:
            pos_doc.sales_order = sales_order
            pos_doc.db_update()
            frappe.db.commit()

        return {"success": True, "message": _("POS Invoice linked to Sales Order")}
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), _("Error linking POS Invoice to Sales Order"))
        return {"success": False, "message": str(e)}
