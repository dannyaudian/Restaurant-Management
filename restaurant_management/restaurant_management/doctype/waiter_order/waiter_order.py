# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime
from restaurant_management.restaurant_management.doctype.table.table import update_table_status


class WaiterOrder(Document):
    """
    Waiter Order represents orders submitted by waiters.
    
    This doctype tracks a single order placed by a waiter, linked to a Table and 
    consisting of items. It handles synchronization with Table status and ensures
    proper order validation.
    """
    
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
        """
        Validate waiter order before saving:
        - Set default values if not specified
        - Fetch branch code from table if not specified
        - Ensure at least one item is in the order
        - Validate all items have qty >= 1 and item_code
        - Validate items with variants have item_variant specified
        - Update table status when order status changes to Paid
        """
        logger = frappe.logger("waiter_order")
        
        # Set default values if not specified
        if not self.order_time:
            self.order_time = now_datetime()
        
        if not self.ordered_by:
            self.ordered_by = frappe.session.user
        
        # Fetch branch code from table if not specified
        if not self.branch_code and self.table:
            self.branch_code = frappe.db.get_value("Table", self.table, "branch_code")
            logger.info(f"Setting branch code to {self.branch_code} from table {self.table}")
            
        # Ensure at least one item in the order
        if not self.items or len(self.items) == 0:
            frappe.throw("Order must contain at least one item")
        
        # Validate all order items
        self.validate_order_items()
            
        # Update table status when order status changes to Paid
        if self.status == "Paid" and self.table:
            logger.info(f"Order {self.name} marked as Paid, updating table {self.table}")
            update_table_status(self.table, "Available", None)
    
    def validate_order_items(self):
        """
        Validate all items in the order:
        - All items must have qty >= 1
        - All items must have item_code
        - If item has variants, item_variant must be specified
        """
        for i, item in enumerate(self.items, 1):
            # Validate item_code is specified
            if not item.item_code:
                frappe.throw(f"Item code is required for item at row {i}")
            
            # Validate qty is at least 1
            if not item.qty or item.qty < 1:
                frappe.throw(f"Quantity must be at least 1 for item '{item.item_code}' at row {i}")
            
            # Check if item has variants
            has_variants = frappe.db.get_value("Item", item.item_code, "has_variants")
            
            # If item has variants, validate item_variant is specified
            if has_variants and not item.item_variant:
                item_name = item.item_name or frappe.db.get_value("Item", item.item_code, "item_name")
                frappe.throw(f"Variant selection is required for item '{item_name}' at row {i}")
    
    def on_submit(self):
        """
        When order is submitted, update the linked table status to In Progress.
        """
        logger = frappe.logger("waiter_order")
        if self.table:
            logger.info(f"Order {self.name} submitted, updating table {self.table} to In Progress")
            update_table_status(self.table, "In Progress", self.name)
    
    def on_cancel(self):
        """
        When order is cancelled, update the linked table status to Available.
        """
        logger = frappe.logger("waiter_order")
        if self.table:
            logger.info(f"Order {self.name} cancelled, updating table {self.table} to Available")
            update_table_status(self.table, "Available", None)
    
    def on_trash(self):
        """
        When order is deleted, update the linked table status to Available.
        """
        logger = frappe.logger("waiter_order")
        if self.table:
            table_doc = frappe.get_doc("Table", self.table)
            if table_doc.current_pos_order == self.name:
                logger.info(f"Order {self.name} deleted, updating table {self.table} to Available")
                update_table_status(self.table, "Available", None)