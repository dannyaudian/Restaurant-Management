import frappe
from frappe import _
from erpnext.accounts.doctype.payment_entry.payment_entry import PaymentEntry

def update_restaurant_status(doc, method=None):
    """Update waiter order status when a payment is submitted"""
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
                        # Update waiter order status to Paid
                        waiter_order = frappe.get_doc("Waiter Order", invoice.restaurant_waiter_order)
                        if waiter_order.status != "Paid":
                            waiter_order.status = "Paid"
                            waiter_order.save()
                            
                            # Update table status
                            if waiter_order.table:
                                table = frappe.get_doc("Table", waiter_order.table)
                                table.status = "Available"
                                table.current_pos_order = None
                                table.save()

def revert_restaurant_status(doc, method=None):
    """Revert waiter order status when a payment is cancelled"""
    # Check if cancelled payment was against a Sales Invoice or POS Invoice
    if doc.docstatus == 2 and doc.references:
        for ref in doc.references:
            if ref.reference_doctype in ["Sales Invoice", "POS Invoice"]:
                invoice = frappe.get_doc(ref.reference_doctype, ref.reference_name)
                
                # Check if this invoice has a restaurant waiter order
                if hasattr(invoice, "restaurant_waiter_order") and invoice.restaurant_waiter_order:
                    # Check if invoice is now unpaid again
                    outstanding_amount = frappe.db.get_value(ref.reference_doctype, ref.reference_name, "outstanding_amount")
                    if outstanding_amount > 0:
                        # Revert waiter order status to In Progress
                        waiter_order = frappe.get_doc("Waiter Order", invoice.restaurant_waiter_order)
                        if waiter_order.status == "Paid":
                            waiter_order.status = "In Progress"
                            waiter_order.save()
                            
                            # Update table status back to In Progress
                            if waiter_order.table:
                                table = frappe.get_doc("Table", waiter_order.table)
                                table.status = "In Progress"
                                table.current_pos_order = waiter_order.name
                                table.save()

def set_branch_from_reference(doc):
    """Set branch and branch_code from reference document"""
    if not doc.branch and doc.references:
        for ref in doc.references:
            if ref.reference_doctype in ["Sales Invoice", "POS Invoice", "Sales Order"]:
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
                    waiter_order = frappe.get_doc("Waiter Order", ref_doc.restaurant_waiter_order)
                    
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
                                doc.branch = branch[0].name
                                doc.branch_code = table.branch_code
                            else:
                                # Set just branch code if branch not found
                                doc.branch_code = table.branch_code
                            
                            break

class CustomPaymentEntry(PaymentEntry):
    def validate(self):
        super(CustomPaymentEntry, self).validate()
        # Ensure branch is set from references
        set_branch_from_reference(self)
    
    def autoname(self):
        """Apply branch code to naming series."""
        if hasattr(self, 'naming_series') and self.naming_series and hasattr(self, 'branch_code') and self.branch_code and "{branch_code}" in self.naming_series:
            self.naming_series = self.naming_series.replace("{branch_code}", self.branch_code)
        # Call parent autoname
        super().autoname()