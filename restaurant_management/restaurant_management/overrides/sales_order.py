import frappe
from frappe import _
from erpnext.selling.doctype.sales_order.sales_order import SalesOrder
from frappe.utils import now_datetime, nowdate

class RestaurantSalesOrder(SalesOrder):
    def validate(self):
        super(RestaurantSalesOrder, self).validate()
        self.validate_restaurant_fields()
        self.set_branch_from_waiter_order()
        self.validate_branch_permission()
        self.add_waiter_order_note()
    
    def validate_restaurant_fields(self):
        """Validate that restaurant fields are consistent"""
        try:
            # If this is linked to a restaurant table, ensure waiter order is valid
            if self.restaurant_table and self.restaurant_waiter_order:
                # Check if waiter order exists
                if not frappe.db.exists("Waiter Order", self.restaurant_waiter_order):
                    frappe.throw(_("Referenced Waiter Order {0} does not exist").format(self.restaurant_waiter_order))
                
                # Check if table exists
                if not frappe.db.exists("Table", self.restaurant_table):
                    frappe.throw(_("Referenced Table {0} does not exist").format(self.restaurant_table))
                
                # Check if waiter order matches the table
                waiter_order_table = frappe.db.get_value("Waiter Order", self.restaurant_waiter_order, "table")
                if waiter_order_table != self.restaurant_table:
                    frappe.throw(_("The Waiter Order {0} is associated with Table {1}, not with the selected Table {2}").format(
                        self.restaurant_waiter_order, waiter_order_table, self.restaurant_table
                    ))
        except Exception as e:
            if not frappe.flags.in_test:
                frappe.log_error(frappe.get_traceback(), f"Error validating restaurant fields: {str(e)}")
            raise
    
    def add_waiter_order_note(self):
        """Add note about Sales Order being generated from Waiter Order"""
        try:
            if self.restaurant_waiter_order and self.docstatus == 0:  # Draft SO being validated
                # Only add note if it doesn't already exist
                waiter_order_note = f"Generated from Waiter Order: {self.restaurant_waiter_order}"
                
                if not self.notes or waiter_order_note not in self.notes:
                    if not self.notes:
                        self.notes = waiter_order_note
                    else:
                        self.notes += f"\n{waiter_order_note}"
                
                # Set custom field for waiter_order (this will be defined in custom_field.json)
                self.waiter_order = self.restaurant_waiter_order
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error adding waiter order note: {str(e)}")
    
    def set_branch_from_waiter_order(self):
        """Set branch and branch_code from Waiter Order"""
        try:
            if self.restaurant_waiter_order and not self.branch:
                # Check if waiter order exists
                if not frappe.db.exists("Waiter Order", self.restaurant_waiter_order):
                    frappe.log_error(
                        f"Referenced Waiter Order {self.restaurant_waiter_order} not found while setting branch",
                        "Waiter Order Reference Error"
                    )
                    return
                
                waiter_order = frappe.get_doc("Waiter Order", self.restaurant_waiter_order)
                
                # Get branch from waiter order directly if available
                if hasattr(waiter_order, "branch") and waiter_order.branch:
                    self.branch = waiter_order.branch
                    if hasattr(waiter_order, "branch_code") and waiter_order.branch_code:
                        self.branch_code = waiter_order.branch_code
                    return
                
                # Otherwise, get branch from waiter order's table
                if waiter_order.table:
                    # Check if table exists
                    if not frappe.db.exists("Table", waiter_order.table):
                        frappe.log_error(
                            f"Referenced Table {waiter_order.table} not found while setting branch",
                            "Table Reference Error"
                        )
                        return
                    
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
                            self.branch = branch[0].name
                            self.branch_code = table.branch_code
                        else:
                            # Set just branch code if branch not found
                            self.branch_code = table.branch_code
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error setting branch from waiter order: {str(e)}")
    
    def before_submit(self):
        """Additional operations before submitting the Sales Order"""
        super().before_submit()
        try:
            # Update waiter order status when creating a Sales Order
            if self.restaurant_waiter_order:
                # Check if waiter order exists
                if not frappe.db.exists("Waiter Order", self.restaurant_waiter_order):
                    frappe.log_error(
                        f"Referenced Waiter Order {self.restaurant_waiter_order} not found during SO submission",
                        "Waiter Order Reference Error"
                    )
                    return
                
                waiter_order = frappe.get_doc("Waiter Order", self.restaurant_waiter_order)
                
                # Update waiter order status to "SO Created" if it's not already in a final state
                if waiter_order.status not in ["Paid", "Cancelled"]:
                    frappe.logger().info(f"Updating Waiter Order {waiter_order.name} status to 'SO Created' via Sales Order {self.name}")
                    waiter_order.status = "SO Created"
                    waiter_order.sales_order = self.name
                    waiter_order.save()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error in before_submit: {str(e)}")
    
    def on_update_after_submit(self):
        """Handle post-submission updates"""
        super(RestaurantSalesOrder, self).on_update_after_submit()
        try:
            self.update_restaurant_status()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error in on_update_after_submit: {str(e)}")
    
    def update_restaurant_status(self):
        """Update waiter order items based on sales order status"""
        try:
            if self.restaurant_waiter_order and self.docstatus == 1:
                # Check if waiter order exists
                if not frappe.db.exists("Waiter Order", self.restaurant_waiter_order):
                    frappe.log_error(
                        f"Referenced Waiter Order {self.restaurant_waiter_order} not found during status update",
                        "Waiter Order Reference Error"
                    )
                    return
                
                # Sync order item statuses if needed
                self.sync_waiter_order_items()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error updating restaurant status: {str(e)}")
    
    def sync_waiter_order_items(self):
        """Sync item statuses between Sales Order and Waiter Order"""
        try:
            waiter_order = frappe.get_doc("Waiter Order", self.restaurant_waiter_order)
            
            # Create mapping of items by item_code
            so_items = {item.item_code: item for item in self.items}
            waiter_items = {item.item_code: item for item in waiter_order.items}
            
            # Track if any items were updated
            items_updated = False
            
            # Update delivery status in waiter order based on Sales Order
            for so_item in self.items:
                if so_item.item_code in waiter_items:
                    waiter_item = waiter_items[so_item.item_code]
                    
                    # Set waiter_order_item reference in sales order item if not already set
                    if hasattr(so_item, "waiter_order_item") and not so_item.waiter_order_item:
                        so_item.waiter_order_item = waiter_item.name
                        frappe.db.set_value("Sales Order Item", so_item.name, "waiter_order_item", waiter_item.name)
                    
                    # Update status based on delivery
                    if so_item.delivered_qty >= so_item.qty and waiter_item.status != "Served":
                        waiter_item.status = "Served"
                        waiter_item.last_update_time = now_datetime()
                        waiter_item.last_update_by = frappe.session.user
                        items_updated = True
            
            # If Sales Order is fully delivered, ensure all waiter order items are served
            if self.per_delivered == 100 and waiter_order.status != "Paid":
                for item in waiter_order.items:
                    if item.status != "Served":
                        item.status = "Served"
                        item.last_update_time = now_datetime()
                        item.last_update_by = frappe.session.user
                        items_updated = True
                
                # If all items are served, update waiter order status to "Served"
                waiter_order.status = "Served"
                items_updated = True
            
            # Save waiter order if any items were updated
            if items_updated:
                waiter_order.save()
                frappe.logger().info(f"Updated Waiter Order {waiter_order.name} items based on Sales Order {self.name}")
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error syncing waiter order items: {str(e)}")

    def validate_branch_permission(self):
        """Validate that user has permission to access this branch"""
        try:
            if self.branch_code:
                from restaurant_management.restaurant_management.utils.branch_permissions import user_has_branch_access
                if not user_has_branch_access(self.branch_code):
                    frappe.throw(_("You don't have permission to access branch {0}").format(self.branch_code))
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error validating branch permission: {str(e)}")
            frappe.throw(_("Error validating branch permission. Please contact administrator."))
    
    def on_cancel(self):
        """Handle cancellation of Sales Order"""
        super(RestaurantSalesOrder, self).on_cancel()
        try:
            self.revert_waiter_order_status()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error in on_cancel: {str(e)}")
    
    def revert_waiter_order_status(self):
        """Revert waiter order status when Sales Order is cancelled"""
        try:
            if self.restaurant_waiter_order:
                # Check if waiter order exists
                if not frappe.db.exists("Waiter Order", self.restaurant_waiter_order):
                    frappe.log_error(
                        f"Referenced Waiter Order {self.restaurant_waiter_order} not found during SO cancellation",
                        "Waiter Order Reference Error"
                    )
                    return
                
                waiter_order = frappe.get_doc("Waiter Order", self.restaurant_waiter_order)
                
                # Only revert if the status was set by this SO and no other SO exists
                if waiter_order.status == "SO Created" or waiter_order.status == "Served":
                    # Check if there are other active Sales Orders for this waiter order
                    other_sos = frappe.db.exists(
                        "Sales Order", 
                        {
                            "restaurant_waiter_order": self.restaurant_waiter_order,
                            "docstatus": 1,
                            "name": ["!=", self.name]
                        }
                    )
                    
                    if not other_sos:
                        frappe.logger().info(f"Reverting Waiter Order {waiter_order.name} status to 'In Progress' due to Sales Order {self.name} cancellation")
                        waiter_order.status = "In Progress"
                        waiter_order.sales_order = None
                        waiter_order.save()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error reverting waiter order status: {str(e)}")

class CustomSalesOrder(SalesOrder):
    def autoname(self):
        """Apply branch code to naming series."""
        try:
            if self.naming_series and "{branch_code}" in self.naming_series and self.branch_code:
                self.naming_series = self.naming_series.replace("{branch_code}", self.branch_code)
            # Call parent autoname
            super().autoname()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error in autoname: {str(e)}")
            super().autoname()  # Try parent method as fallback

# Define custom field for sales_order.json (will be created via fixtures or custom_field.json)
def get_custom_fields():
    """Return the custom fields configuration for Sales Order"""
    return [
        {
            "fieldname": "waiter_order",
            "label": "Waiter Order",
            "fieldtype": "Link",
            "options": "Waiter Order",
            "insert_after": "order_type",
            "read_only": 1,
            "allow_on_submit": 0,
            "in_list_view": 0,
            "in_standard_filter": 1,
            "in_global_search": 1,
            "in_preview": 0,
            "in_filter": 1,
            "remember_last_selected_value": 0,
            "ignore_user_permissions": 0,
            "no_copy": 1,
            "print_hide": 0,
            "report_hide": 0,
            "reqd": 0,
            "search_index": 0,
            "translatable": 0,
            "unique": 0,
            "hide_border": 0,
            "bold": 0,
            "collapsible": 0,
            "collapsible_depends_on": None,
            "depends_on": None,
        }
    ]