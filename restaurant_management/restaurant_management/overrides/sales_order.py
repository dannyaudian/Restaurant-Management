import frappe
from frappe import _
from erpnext.selling.doctype.sales_order.sales_order import SalesOrder

class RestaurantSalesOrder(SalesOrder):
    def validate(self):
        super(RestaurantSalesOrder, self).validate()
        self.validate_restaurant_fields()
        self.set_branch_from_waiter_order()
    
    def validate_restaurant_fields(self):
        # If this is linked to a restaurant table, ensure waiter order is valid
        if self.restaurant_table and self.restaurant_waiter_order:
            # Check if waiter order matches the table
            waiter_order_table = frappe.db.get_value("Waiter Order", self.restaurant_waiter_order, "table")
            if waiter_order_table != self.restaurant_table:
                frappe.throw(_("The Waiter Order is not associated with the selected Table"))
    
    def set_branch_from_waiter_order(self):
        """Set branch and branch_code from Waiter Order"""
        if self.restaurant_waiter_order and not self.branch:
            waiter_order = frappe.get_doc("Waiter Order", self.restaurant_waiter_order)
            
            # Get branch from waiter order's table
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
                        self.branch = branch[0].name
                        self.branch_code = table.branch_code
                    else:
                        # Set just branch code if branch not found
                        self.branch_code = table.branch_code
    
    def on_update_after_submit(self):
        super(RestaurantSalesOrder, self).on_update_after_submit()
        self.update_restaurant_status()
    
    def update_restaurant_status(self):
        # Update waiter order items based on sales order status
        if self.restaurant_waiter_order and self.docstatus == 1:
            # Sync order item statuses if needed
            self.sync_waiter_order_items()
    
    def sync_waiter_order_items(self):
        # Optionally sync item statuses between Sales Order and Waiter Order
        # This is useful if you want to reflect order fulfillment status in the waiter order
        waiter_order = frappe.get_doc("Waiter Order", self.restaurant_waiter_order)
        
        # Map of Sales Order items to Waiter Order items
        # You could implement custom logic here to keep items in sync
        # For example, if an item is delivered in Sales Order, mark it as Served in Waiter Order
        
        if self.per_delivered == 100 and waiter_order.status != "Paid":
            # If Sales Order is fully delivered, ensure all waiter order items are served
            for item in waiter_order.items:
                if item.status != "Served":
                    item.status = "Served"
                    item.last_update_time = frappe.utils.now()
                    item.last_update_by = frappe.session.user
            
            waiter_order.save()

def validate_branch_permission(self):
    """Validate that user has permission to access this branch"""
    if self.branch_code:
        from restaurant_management.restaurant_management.utils.branch_permissions import user_has_branch_access
        if not user_has_branch_access(self.branch_code):
            frappe.throw(_("You don't have permission to access branch {0}").format(self.branch_code))

class CustomSalesOrder(SalesOrder):
    def autoname(self):
        """Apply branch code to naming series."""
        if self.naming_series and "{branch_code}" in self.naming_series and self.branch_code:
            self.naming_series = self.naming_series.replace("{branch_code}", self.branch_code)
        # Call parent autoname
        super().autoname()

class RestaurantSalesInvoice:
    def validate(self):
        super(RestaurantSalesInvoice, self).validate()
        self.validate_restaurant_fields()
        self.set_branch_from_waiter_order()
        self.validate_branch_permission()

    def validate_branch_permission(self):
        """Validate that user has permission to access this branch"""
        if self.branch_code:
            from restaurant_management.restaurant_management.utils.branch_permissions import user_has_branch_access
            if not user_has_branch_access(self.branch_code):
                frappe.throw(_("You don't have permission to access branch {0}").format(self.branch_code))
