import frappe
from frappe import _
from erpnext.accounts.doctype.payment_entry.payment_entry import PaymentEntry

def update_restaurant_status(doc, method=None):
    """Update waiter order status when a payment is submitted"""
    try:
        # Set branch from reference document if not set
        set_branch_from_reference(doc)
        
        # Check if payment is against a Sales Invoice or POS Invoice
        if doc.docstatus == 1 and doc.references:
            for ref in doc.references:
                if ref.reference_doctype in ["Sales Invoice", "POS Invoice"]:
                    invoice = frappe.get_doc(ref.reference_doctype, ref.reference_name)
                    
                    # Check if this invoice has a restaurant waiter order
                    if hasattr(invoice, "restaurant_waiter_order") and invoice.restaurant_waiter_order:
                        # Check if payment completes the invoice
                        outstanding_amount = frappe.db.get_value(ref.reference_doctype, ref.reference_name, "outstanding_amount")
                        if outstanding_amount <= 0:
                            # Check if waiter order exists
                            if not frappe.db.exists("Waiter Order", invoice.restaurant_waiter_order):
                                frappe.log_error(
                                    f"Referenced Waiter Order {invoice.restaurant_waiter_order} not found for {ref.reference_doctype} {ref.reference_name}",
                                    "Waiter Order Reference Error"
                                )
                                continue
                                
                            # Update waiter order status to Paid if not already paid
                            waiter_order = frappe.get_doc("Waiter Order", invoice.restaurant_waiter_order)
                            if waiter_order.status != "Paid":
                                frappe.logger().info(f"Updating Waiter Order {waiter_order.name} status to Paid via Payment Entry {doc.name}")
                                waiter_order.status = "Paid"
                                waiter_order.save()
                                
                                # Update table status
                                if waiter_order.table:
                                    if frappe.db.exists("Table", waiter_order.table):
                                        table = frappe.get_doc("Table", waiter_order.table)
                                        table.status = "Available"
                                        table.current_pos_order = None
                                        table.is_available = 1
                                        table.save()
                                    else:
                                        frappe.log_error(
                                            f"Referenced Table {waiter_order.table} not found for Waiter Order {waiter_order.name}",
                                            "Table Reference Error"
                                        )
                            else:
                                frappe.logger().info(f"Waiter Order {waiter_order.name} already has Paid status, no update needed")
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error in update_restaurant_status: {str(e)}")

def revert_restaurant_status(doc, method=None):
    """Revert waiter order status when a payment is cancelled"""
    try:
        # Check if cancelled payment was against a Sales Invoice or POS Invoice
        if doc.docstatus == 2 and doc.references:
            for ref in doc.references:
                if ref.reference_doctype in ["Sales Invoice", "POS Invoice"]:
                    # Validate if reference document exists
                    if not frappe.db.exists(ref.reference_doctype, ref.reference_name):
                        frappe.log_error(
                            f"Referenced {ref.reference_doctype} {ref.reference_name} not found during payment cancellation",
                            "Reference Error in Payment Cancellation"
                        )
                        continue
                        
                    invoice = frappe.get_doc(ref.reference_doctype, ref.reference_name)
                    
                    # Check if this invoice has a restaurant waiter order
                    if hasattr(invoice, "restaurant_waiter_order") and invoice.restaurant_waiter_order:
                        # Check if waiter order exists
                        if not frappe.db.exists("Waiter Order", invoice.restaurant_waiter_order):
                            frappe.log_error(
                                f"Referenced Waiter Order {invoice.restaurant_waiter_order} not found during payment cancellation",
                                "Waiter Order Reference Error"
                            )
                            continue
                            
                        # Check if invoice is now unpaid again
                        outstanding_amount = frappe.db.get_value(ref.reference_doctype, ref.reference_name, "outstanding_amount")
                        if outstanding_amount > 0:
                            # Revert waiter order status to In Progress
                            waiter_order = frappe.get_doc("Waiter Order", invoice.restaurant_waiter_order)
                            if waiter_order.status == "Paid":
                                frappe.logger().info(f"Reverting Waiter Order {waiter_order.name} status from Paid to In Progress due to payment cancellation")
                                waiter_order.status = "In Progress"
                                waiter_order.save()
                                
                                # Update table status back to In Progress
                                if waiter_order.table:
                                    if frappe.db.exists("Table", waiter_order.table):
                                        table = frappe.get_doc("Table", waiter_order.table)
                                        table.status = "In Progress"
                                        table.current_pos_order = waiter_order.name
                                        table.is_available = 0
                                        table.save()
                                    else:
                                        frappe.log_error(
                                            f"Referenced Table {waiter_order.table} not found during payment cancellation",
                                            "Table Reference Error"
                                        )
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error in revert_restaurant_status: {str(e)}")

def set_branch_from_reference(doc):
    """Set branch and branch_code from reference document"""
    try:
        if not doc.branch and doc.references:
            for ref in doc.references:
                if ref.reference_doctype in ["Sales Invoice", "POS Invoice", "Sales Order"]:
                    # Validate if reference document exists
                    if not frappe.db.exists(ref.reference_doctype, ref.reference_name):
                        continue
                        
                    ref_doc = frappe.get_doc(ref.reference_doctype, ref.reference_name)
                    
                    # If reference document has branch, use it
                    if hasattr(ref_doc, "branch") and ref_doc.branch:
                        doc.branch = ref_doc.branch
                        
                        # Set branch_code if not automatically fetched
                        if not doc.branch_code and hasattr(ref_doc, "branch_code") and ref_doc.branch_code:
                            doc.branch_code = ref_doc.branch_code
                        
                        break
                    
                    # If reference document has restaurant_waiter_order, get branch from there
                    elif hasattr(ref_doc, "restaurant_waiter_order") and ref_doc.restaurant_waiter_order:
                        # Check if waiter order exists
                        if not frappe.db.exists("Waiter Order", ref_doc.restaurant_waiter_order):
                            continue
                            
                        waiter_order = frappe.get_doc("Waiter Order", ref_doc.restaurant_waiter_order)
                        
                        if waiter_order.table:
                            # Check if table exists
                            if not frappe.db.exists("Table", waiter_order.table):
                                continue
                                
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
                                    doc.branch = branch[0].name
                                    doc.branch_code = table.branch_code
                                else:
                                    # Set just branch code if branch not found
                                    doc.branch_code = table.branch_code
                                
                                break
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f"Error in set_branch_from_reference: {str(e)}")

class CustomPaymentEntry(PaymentEntry):
    def validate(self):
        super(CustomPaymentEntry, self).validate()
        # Ensure branch is set from references
        set_branch_from_reference(self)
        
        # Validate branch permission
        self.validate_branch_permission()
        
        # Validate payment against already paid waiter orders
        self.validate_waiter_order_payment()
    
    def validate_branch_permission(self):
        """Validate that user has permission to access this branch"""
        try:
            if self.branch_code:
                from restaurant_management.restaurant_management.utils.branch_permissions import user_has_branch_access
                if not user_has_branch_access(self.branch_code):
                    frappe.throw(_("You don't have permission to access branch {0}").format(self.branch_code))
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error in validate_branch_permission: {str(e)}")
            frappe.throw(_("Error validating branch permission. Please contact administrator."))
    
    def validate_waiter_order_payment(self):
        """Prevent payment against already paid waiter orders"""
        try:
            if self.docstatus == 0 and self.references:  # Draft payment being validated
                for ref in self.references:
                    if ref.reference_doctype in ["Sales Invoice", "POS Invoice"]:
                        # Check if reference exists
                        if not frappe.db.exists(ref.reference_doctype, ref.reference_name):
                            continue
                            
                        invoice = frappe.get_doc(ref.reference_doctype, ref.reference_name)
                        
                        # Check if this invoice has a restaurant waiter order
                        if hasattr(invoice, "restaurant_waiter_order") and invoice.restaurant_waiter_order:
                            # Check if waiter order exists
                            if not frappe.db.exists("Waiter Order", invoice.restaurant_waiter_order):
                                continue
                                
                            waiter_order = frappe.get_doc("Waiter Order", invoice.restaurant_waiter_order)
                            
                            # If waiter order is already paid, show warning
                            if waiter_order.status == "Paid":
                                frappe.msgprint(
                                    _("Warning: Waiter Order {0} is already marked as Paid.").format(waiter_order.name),
                                    title=_("Duplicate Payment Warning"),
                                    indicator="orange"
                                )
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error in validate_waiter_order_payment: {str(e)}")
    
    def autoname(self):
        """Apply branch code to naming series."""
        try:
            if hasattr(self, 'naming_series') and self.naming_series and hasattr(self, 'branch_code') and self.branch_code and "{branch_code}" in self.naming_series:
                self.naming_series = self.naming_series.replace("{branch_code}", self.branch_code)
            # Call parent autoname
            super().autoname()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Error in autoname: {str(e)}")
            super().autoname()  # Try parent method as fallback
