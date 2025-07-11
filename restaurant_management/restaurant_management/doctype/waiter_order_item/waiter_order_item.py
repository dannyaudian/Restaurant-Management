# Copyright (c) 2023, PT. Inovasi Terbaik Bangsa and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, flt
from typing import Optional, Dict, Any


class WaiterOrderItem(Document):
    """
    Waiter Order Item represents individual items in a waiter order.
    
    This child table tracks individual items per waiter order, including kitchen status
    and user audit trail. It handles item name fetching, amount calculation,
    and maintains a complete audit trail of changes.
    """
    
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
        """
        Validate waiter order item before saving:
        - Set item_name from item_code if missing
        - Ensure rate is set from price list if missing
        - Calculate amount as rate × qty
        - Validate quantity is within allowed limits for item type
        - Set ordered_by if not already set
        - Always update last_update_by and last_update_time
        - Validate status transitions
        """
        logger = frappe.logger("waiter_order_item")
        
        # Validate essential fields
        if not self.item_code:
            frappe.throw("Item Code is required")
        
        # Fetch item details if missing
        self.fetch_item_details()
        
        # Validate quantity
        self.validate_quantity()
        
        # Calculate amount
        self.calculate_amount()
        
        # Set audit fields
        self.set_audit_fields()
        
        # Validate status transitions
        self.validate_status_transition()
        
        # Update parent waiter order ID
        if hasattr(self, 'parent') and self.parent:
            self.waiter_order_id = self.parent
    
    def fetch_item_details(self):
        """Fetch item name, rate and other details if not set"""
        if not self.item_code:
            return
            
        item_data = self.get_item_details()
        
        # Set item name if not specified
        if not self.item_name and item_data.get('item_name'):
            self.item_name = item_data.get('item_name')
        
        # Set rate if not specified
        if not self.rate:
            self.rate = self.get_item_rate()
            
        # Set kitchen station if not specified
        if not self.kitchen_station and item_data.get('kitchen_station'):
            self.kitchen_station = item_data.get('kitchen_station')
            
        # Set has_variants flag
        self.has_variants = item_data.get('has_variants', 0)
    
    def get_item_details(self) -> Dict[str, Any]:
        """Get item details from the Item doctype"""
        if not self.item_code:
            return {}
            
        fields = [
            "item_name", "kitchen_station", "has_variants", 
            "min_order_qty", "max_order_qty", "item_group"
        ]
        
        item_data = frappe.db.get_value("Item", self.item_code, fields, as_dict=True) or {}
        return item_data
    
    def get_item_rate(self) -> float:
        """
        Get the current rate of the item from the selling price list.
        
        If a variant is selected, get the rate for the variant.
        Otherwise, get the rate for the template item.
        
        Returns:
            float: The item rate, or 0 if not found
        """
        # Use the variant if specified, otherwise use the template
        item_code_to_use = self.item_variant if self.has_variants and self.item_variant else self.item_code
        
        if not item_code_to_use:
            return 0
            
        # First try to get rate from POS Price List
        pos_price_list = frappe.db.get_single_value("POS Settings", "selling_price_list")
        if pos_price_list:
            item_price = frappe.db.get_value(
                "Item Price",
                {"item_code": item_code_to_use, "price_list": pos_price_list},
                "price_list_rate"
            )
            if item_price:
                return flt(item_price)
        
        # Fallback to default selling price list
        default_price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")
        if default_price_list:
            item_price = frappe.db.get_value(
                "Item Price",
                {"item_code": item_code_to_use, "price_list": default_price_list},
                "price_list_rate"
            )
            if item_price:
                return flt(item_price)
        
        # Last resort: get standard rate from Item
        standard_rate = frappe.db.get_value("Item", item_code_to_use, "standard_rate")
        if standard_rate:
            return flt(standard_rate)
            
        return 0
    
    def validate_quantity(self):
        """
        Validate quantity based on item type and min/max order quantity:
        - Ensure qty > 0
        - Check min/max order quantity based on item settings
        - Apply special rules for certain item groups (e.g., beverages)
        """
        if not self.qty or self.qty <= 0:
            frappe.throw(f"Quantity must be greater than 0 for item '{self.item_name or self.item_code}'")
        
        item_data = self.get_item_details()
        
        # Check min order quantity
        min_qty = item_data.get('min_order_qty')
        if min_qty and self.qty < min_qty:
            frappe.throw(f"Minimum order quantity for '{self.item_name or self.item_code}' is {min_qty}")
        
        # Check max order quantity
        max_qty = item_data.get('max_order_qty')
        if max_qty and self.qty > max_qty:
            frappe.throw(f"Maximum order quantity for '{self.item_name or self.item_code}' is {max_qty}")
        
        # Special rules based on item group
        item_group = item_data.get('item_group', '').lower()
        
        # Beverages typically have higher quantity limits
        if 'beverage' in item_group or 'drink' in item_group:
            if self.qty > 10:  # Example threshold, adjust as needed
                frappe.msgprint(
                    f"Warning: High quantity ({self.qty}) ordered for beverage item '{self.item_name or self.item_code}'",
                    indicator='orange'
                )
    
    def calculate_amount(self):
        """Calculate amount as rate × qty"""
        if self.qty is not None and self.rate is not None:
            self.amount = flt(self.rate) * flt(self.qty)
        else:
            self.amount = 0
    
    def set_audit_fields(self):
        """Set audit fields for tracking changes"""
        # Set ordered_by if not specified
        if not self.ordered_by:
            self.ordered_by = frappe.session.user
        
        # Always update last_update_by and last_update_time
        self.last_update_by = frappe.session.user
        self.last_update_time = now_datetime()
    
    def validate_status_transition(self):
        """
        Validate that status transitions follow the correct workflow:
        New → Cooking → Ready → Delivered
        
        Can't skip steps in the process.
        """
        if not hasattr(self, 'status') or not self.status:
            return
            
        if not hasattr(self, '_doc_before_save') or not self._doc_before_save:
            return
            
        old_status = self._doc_before_save.status
        new_status = self.status
        
        # Define valid status transitions
        valid_transitions = {
            "New": ["Cooking", "Cancelled"],
            "Cooking": ["Ready", "Cancelled"],
            "Ready": ["Delivered", "Cancelled"],
            "Delivered": ["Cancelled"],  # Can only cancel after delivery
            "Cancelled": []  # Can't change status after cancellation
        }
        
        # Check if the transition is valid
        if old_status in valid_transitions and new_status not in valid_transitions[old_status]:
            valid_next_steps = ", ".join(valid_transitions[old_status])
            frappe.throw(
                f"Invalid status transition from '{old_status}' to '{new_status}'. "
                f"Valid next steps are: {valid_next_steps or 'None'}"
            )


def update_parent_totals(doc, method=None):
    """
    Update the parent Waiter Order's total quantity and amount
    after a child item is saved, deleted, or modified.
    
    This function should be linked in hooks.py to run on appropriate triggers.
    """
    if not doc.parent:
        return
        
    # Get all items from the parent
    items = frappe.get_all(
        "Waiter Order Item",
        filters={"parent": doc.parent},
        fields=["qty", "amount"]
    )
    
    # Calculate totals
    total_qty = sum(flt(item.qty) for item in items)
    total_amount = sum(flt(item.amount) for item in items)
    
    # Update the parent
    frappe.db.set_value("Waiter Order", doc.parent, {
        "total_qty": total_qty,
        "total_amount": total_amount
    })