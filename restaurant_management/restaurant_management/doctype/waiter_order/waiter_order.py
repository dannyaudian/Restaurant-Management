# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

class WaiterOrder(Document):
    """Waiter Order represents orders submitted by waiters."""
    
    def autoname(self):
        """Generate name using format WO-{branch_code}-{########}"""
        if self.branch_code:
            # Get the next number for this branch code
            last_name = frappe.db.sql("""
                SELECT `name` FROM `tabWaiter Order`
                WHERE `name` LIKE 'WO-{branch_code}-%'
                ORDER BY `name` DESC LIMIT 1
            """.format(branch_code=self.branch_code.upper()))
            
            # Start counter
            count = 1
            
            # If there's an existing record, extract the counter
            if last_name:
                # Extract the number from the last name (e.g., WO-JKT-00000001 → 1)
                try:
                    count = int(last_name[0][0].split('-')[-1]) + 1
                except (IndexError, ValueError):
                    count = 1
            
            # Format the new name with 8-digit counter
            self.name = f"WO-{self.branch_code.upper()}-{count:08d}"
        else:
            frappe.throw("Branch Code is required for Waiter Order")
    
    def validate(self):
        # Set default values if not specified
        if not self.order_time:
            self.order_time = now_datetime()
        
        if not self.ordered_by:
            self.ordered_by = frappe.session.user
        
        # Fetch branch code from table if not specified
        if not self.branch_code and self.table:
            self.branch_code = frappe.db.get_value("Table", self.table, "branch_code")
            
        # Update table status when order status changes
        self.update_table_status()
    
    def update_table_status(self):
        """Update linked table status based on order status"""
        if not self.table:
            return
            
        table_doc = frappe.get_doc("Table", self.table)
        
        if self.status == "Draft" or self.status == "In Progress":
            table_doc.status = "In Progress"
            table_doc.current_pos_order = self.name
        elif self.status == "Paid":
            table_doc.status = "Available"
            table_doc.current_pos_order = None
        
        table_doc.save(ignore_permissions=True)
    
    def on_trash(self):
        """When order is deleted, update table status"""
        if self.table:
            table_doc = frappe.get_doc("Table", self.table)
            if table_doc.current_pos_order == self.name:
                table_doc.status = "Available"
                table_doc.current_pos_order = None
                table_doc.save(ignore_permissions=True)
