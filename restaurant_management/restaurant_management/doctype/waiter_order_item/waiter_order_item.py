# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

class WaiterOrderItem(Document):
    """Waiter Order Item represents individual items in a waiter order."""
    
    def autoname(self):
        """Generate name using format WOI-{branch_code}-{########}"""
        if hasattr(self, 'parent') and self.parent:
            # For child items, the branch code comes from the parent
            branch_code = frappe.db.get_value("Waiter Order", self.parent, "branch_code")
            
            if branch_code:
                # Get the next number for this branch code
                last_name = frappe.db.sql("""
                    SELECT `name` FROM `tabWaiter Order Item`
                    WHERE `name` LIKE 'WOI-{branch_code}-%'
                    ORDER BY `name` DESC LIMIT 1
                """.format(branch_code=branch_code.upper()))
                
                # Start counter
                count = 1
                
                # If there's an existing record, extract the counter
                if last_name:
                    # Extract the number from the last name (e.g., WOI-JKT-00000001 → 1)
                    try:
                        count = int(last_name[0][0].split('-')[-1]) + 1
                    except (IndexError, ValueError):
                        count = 1
                
                # Format the new name with 8-digit counter
                self.name = f"WOI-{branch_code.upper()}-{count:08d}"
            else:
                frappe.throw("Branch Code is required for Waiter Order Item")
    
    def validate(self):
        # Set default values if not specified
        if not self.ordered_by:
            self.ordered_by = frappe.session.user
        
        if not self.last_update_by:
            self.last_update_by = frappe.session.user
        
        if not self.last_update_time:
            self.last_update_time = now_datetime()
            
        # Fetch item price if not specified
        if not self.price and self.item_code:
            self.price = self.get_item_price()
            
        # Update parent waiter order ID
        if hasattr(self, 'parent') and self.parent:
            self.waiter_order_id = self.parent
    
    def get_item_price(self):
        """Get the current price of the item"""
        # This is a simplified example - you might need a more complex
        # pricing logic based on your specific requirements
        price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")
        if not price_list:
            return 0
            
        item_price = frappe.db.get_value(
            "Item Price",
            {"item_code": self.item_code, "price_list": price_list},
            "price_list_rate"
        )
        
        return item_price or 0
