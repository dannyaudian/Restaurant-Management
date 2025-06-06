import frappe
from frappe import _
from erpnext.accounts.doctype.pos_invoice.pos_invoice import POSInvoice

class RestaurantPOSInvoice(POSInvoice):
    def validate(self):
        super(RestaurantPOSInvoice, self).validate()
        self.validate_restaurant_fields()
        self.set_branch_from_waiter_order()
        self.validate_branch_permission()
    
    def validate_restaurant_fields(self):
        # If this is linked to a restaurant table, ensure waiter order is valid
        if self.restaurant_table and self.restaurant_waiter_order:
            # Check if waiter order matches the table
            waiter_order_table = frappe.db.get_value("Waiter Order", self.restaurant_waiter_order, "table")
            if waiter_order_table != self.restaurant_table:
                frappe.throw(_("The Waiter Order is not associated with the selected Table"))
    
    def validate_branch_permission(self):
        """Validate that user has permission to access this branch"""
        if self.branch_code:
            from restaurant_management.restaurant_management.utils.branch_permissions import user_has_branch_access
            if not user_has_branch_access(self.branch_code):
                frappe.throw(_("You don't have permission to access branch {0}").format(self.branch_code))
    
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
    
    def on_submit(self):
        super(RestaurantPOSInvoice, self).on_submit()
        self.update_restaurant_status()
        
        # Check if we need to automatically create Sales Order
        if self.restaurant_waiter_order:
            auto_create = frappe.db.get_value("POS Profile", self.pos_profile, "auto_create_sales_order")
            
            if auto_create:
                from restaurant_management.api.pos_restaurant import create_sales_order_from_waiter_order
                create_sales_order_from_waiter_order(self.restaurant_waiter_order, self.name)

    def update_restaurant_status(self):
        # Update waiter order status when POS invoice is submitted
        if self.restaurant_waiter_order and self.docstatus == 1:
            waiter_order = frappe.get_doc("Waiter Order", self.restaurant_waiter_order)

            # Only update if the POS invoice is fully paid
            if self.status == "Paid" and waiter_order.status != "Paid":
                waiter_order.status = "Paid"
                waiter_order.save()

                # Update table status
                if waiter_order.table:
                    table = frappe.get_doc("Table", waiter_order.table)
                    table.status = "Available"
                    table.current_pos_order = None
                    table.save()

    def on_cancel(self):
        super(RestaurantPOSInvoice, self).on_cancel()
        self.revert_restaurant_status()

    def revert_restaurant_status(self):
        # If POS invoice is cancelled, revert waiter order status
        if self.restaurant_waiter_order and self.docstatus == 2:
            waiter_order = frappe.get_doc("Waiter Order", self.restaurant_waiter_order)

            if waiter_order.status == "Paid":
                waiter_order.status = "In Progress"
                waiter_order.save()

                # Update table status back to In Progress
                if waiter_order.table:
                    table = frappe.get_doc("Table", waiter_order.table)
                    table.status = "In Progress"
                    table.current_pos_order = waiter_order.name
                    table.save()

class CustomPOSInvoice(POSInvoice):
    def autoname(self):
        """Apply branch code to naming series."""
        if self.naming_series and "{branch_code}" in self.naming_series and self.branch_code:
            self.naming_series = self.naming_series.replace("{branch_code}", self.branch_code)
        # Call parent autoname
        super().autoname()