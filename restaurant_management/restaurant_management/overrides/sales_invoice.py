import frappe
from frappe import _
from erpnext.accounts.doctype.sales_invoice.sales_invoice import SalesInvoice

class RestaurantSalesInvoice(SalesInvoice):
    def validate(self):
        super(RestaurantSalesInvoice, self).validate()
        self.validate_restaurant_fields()
        self.set_branch_from_waiter_order()
        self.validate_branch_permission()
        self.validate_already_paid_waiter_order()
    
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
    
    def validate_already_paid_waiter_order(self):
        """Validate that we're not creating an invoice for an already paid waiter order"""
        try:
            if self.docstatus == 0 and self.restaurant_waiter_order:  # Draft invoice being validated
                # Check if waiter order exists
                if not frappe.db.exists("Waiter Order", self.restaurant_waiter_order):
                    return
                
                waiter_order = frappe.get_doc("Waiter Order", self.restaurant_waiter_order)
                
                # If waiter order is already paid, show warning
                if waiter_order.status == "Paid":
                    # Check if there are other submitted invoices for this waiter order
                    existing_invoices = frappe.get_all(
                        "Sales Invoice", 
                        filters={
                            "restaurant_waiter_order": self.restaurant_waiter_order,
                            "docstatus": 1,
                            "name": ["!=", self.name]
                        }
                    )
                    
                    # Also check POS Invoices
                    pos_invoices = frappe.get_all(
                        "POS Invoice", 
                        filters={
                            "restaurant_waiter_order": self.restaurant_waiter_order,
                            "docstatus": 1
                        }
                    )
                    
                    all_invoices = existing_invoices + pos_invoices
                    
                    if all_invoices:
                        invoice_list = ", ".join([inv.name for inv in all_invoices])
                        frappe.msgprint(
                            _("Warning: This Waiter Order is already marked as Paid and has existing invoices: {0}").format(invoice_list),
                            title=_("Duplicate Invoice Warning"),
                            indicator="orange"
                        )
                    else:
                        frappe.msgprint(
                            _("Warning: This Waiter Order is already marked as Paid but no other invoice was found."),
                            title=_("Status Inconsistency"),
                            indicator="orange"
                        )
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error validating already paid waiter order: {str(e)}")
    
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
    
    def on_submit(self):
        """Handle submission of Sales Invoice"""
        try:
            super(RestaurantSalesInvoice, self).on_submit()
            self.update_restaurant_status()
            
            # Optionally create Sales Order from Waiter Order if needed
            if self.restaurant_waiter_order and not self.update_stock:
                # Check if we have a setting to auto-create Sales Order from Sales Invoice
                auto_create = frappe.db.get_single_value("Restaurant Settings", "create_sales_order_from_invoice") or False
                
                if auto_create:
                    frappe.logger().info(f"Auto-creating Sales Order from Waiter Order {self.restaurant_waiter_order} for Sales Invoice {self.name}")
                    try:
                        from restaurant_management.api.pos_restaurant import create_sales_order_from_waiter_order
                        result = create_sales_order_from_waiter_order(self.restaurant_waiter_order, None)
                        
                        if result and result.get("success"):
                            # Link sales order to this invoice
                            frappe.db.set_value("Sales Invoice", self.name, "sales_order", result.get("sales_order"))
                            frappe.logger().info(f"Successfully created and linked Sales Order {result.get('sales_order')} from Waiter Order {self.restaurant_waiter_order}")
                        else:
                            error_msg = result.get("message") if result else "Unknown error"
                            frappe.log_error(
                                f"Failed to create Sales Order from Waiter Order {self.restaurant_waiter_order}: {error_msg}",
                                "Sales Order Creation Failed"
                            )
                    except Exception as e:
                        frappe.log_error(
                            frappe.get_traceback(),
                            f"Error creating Sales Order from Waiter Order {self.restaurant_waiter_order}: {str(e)}"
                        )
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error in on_submit: {str(e)}")
            raise
    
    def update_restaurant_status(self):
        """Update waiter order status when invoice is submitted (if fully paid)"""
        try:
            if self.restaurant_waiter_order and self.docstatus == 1:
                # Check if waiter order exists
                if not frappe.db.exists("Waiter Order", self.restaurant_waiter_order):
                    frappe.log_error(
                        f"Referenced Waiter Order {self.restaurant_waiter_order} not found during status update",
                        "Waiter Order Reference Error"
                    )
                    return
                
                waiter_order = frappe.get_doc("Waiter Order", self.restaurant_waiter_order)
                
                # Only update if the invoice is fully paid or the total invoice is zero
                if (self.status == "Paid" or self.outstanding_amount <= 0 or self.grand_total == 0) and waiter_order.status != "Paid":
                    frappe.logger().info(f"Updating Waiter Order {waiter_order.name} status to Paid via Sales Invoice {self.name}")
                    waiter_order.status = "Paid"
                    
                    # Also mark all items as served
                    for item in waiter_order.items:
                        if item.status != "Served":
                            item.status = "Served"
                    
                    waiter_order.save()
                    
                    # Update table status
                    if waiter_order.table:
                        # Check if table exists
                        if not frappe.db.exists("Table", waiter_order.table):
                            frappe.log_error(
                                f"Referenced Table {waiter_order.table} not found during status update",
                                "Table Reference Error"
                            )
                            return
                        
                        table = frappe.get_doc("Table", waiter_order.table)
                        table.status = "Available"
                        table.current_pos_order = None
                        table.is_available = 1
                        table.save()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error updating restaurant status: {str(e)}")
    
    def on_cancel(self):
        """Handle cancellation of Sales Invoice"""
        try:
            super(RestaurantSalesInvoice, self).on_cancel()
            self.revert_restaurant_status()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error in on_cancel: {str(e)}")
            raise
    
    def revert_restaurant_status(self):
        """If invoice is cancelled, revert waiter order status"""
        try:
            if self.restaurant_waiter_order and self.docstatus == 2:
                # Check if waiter order exists
                if not frappe.db.exists("Waiter Order", self.restaurant_waiter_order):
                    frappe.log_error(
                        f"Referenced Waiter Order {self.restaurant_waiter_order} not found during status reversion",
                        "Waiter Order Reference Error"
                    )
                    return
                
                waiter_order = frappe.get_doc("Waiter Order", self.restaurant_waiter_order)
                
                # Check if there are other submitted invoices for this waiter order before reverting
                other_invoices = frappe.db.exists(
                    "Sales Invoice", 
                    {
                        "restaurant_waiter_order": self.restaurant_waiter_order,
                        "docstatus": 1,
                        "name": ["!=", self.name]
                    }
                )
                
                # Also check POS Invoices
                pos_invoices = frappe.db.exists(
                    "POS Invoice", 
                    {
                        "restaurant_waiter_order": self.restaurant_waiter_order,
                        "docstatus": 1
                    }
                )
                
                if not (other_invoices or pos_invoices) and waiter_order.status == "Paid":
                    frappe.logger().info(f"Reverting Waiter Order {waiter_order.name} status from Paid to In Progress due to Sales Invoice {self.name} cancellation")
                    waiter_order.status = "In Progress"
                    waiter_order.save()
                    
                    # Update table status back to In Progress
                    if waiter_order.table:
                        # Check if table exists
                        if not frappe.db.exists("Table", waiter_order.table):
                            frappe.log_error(
                                f"Referenced Table {waiter_order.table} not found during status reversion",
                                "Table Reference Error"
                            )
                            return
                        
                        table = frappe.get_doc("Table", waiter_order.table)
                        table.status = "In Progress"
                        table.current_pos_order = waiter_order.name
                        table.is_available = 0
                        table.save()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error reverting restaurant status: {str(e)}")

class CustomSalesInvoice(SalesInvoice):
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