# Copyright (c) 2025, PT. Inovasi Terbaik Bangsa and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from erpnext.stock.doctype.item.item import Item as ERPNextItem


class RestaurantItem(ERPNextItem):
    def after_insert(self):
        if self.has_variants:
            # Template item; don't create Item Price
            return
            
        # Check if Item Price already exists
        if not self._item_price_exists():
            # Only call super().after_insert() if Item Price doesn't exist
            super().after_insert()
    
    def _item_price_exists(self):
        """Check if Item Price already exists for this item with default price list."""
        # Get default price list from Selling Settings
        default_price_list = frappe.get_cached_value(
            "Selling Settings", 
            None, 
            "selling_price_list"
        ) or "Standard Selling"
        
        # Check if Item Price exists for this item
        return frappe.db.exists(
            "Item Price",
            {
                "item_code": self.item_code,
                "price_list": default_price_list,
                "uom": self.stock_uom
            }
        )