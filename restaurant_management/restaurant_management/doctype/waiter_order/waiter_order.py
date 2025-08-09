import frappe
import json
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import now_datetime, flt
from restaurant_management.restaurant_management.doctype.table.table import update_table_status
from restaurant_management.order_status import is_valid_status_transition
from typing import Dict, List

class WaiterOrder(Document):
    """
    Waiter Order represents orders submitted by waiters.
    
    This doctype tracks a single order placed by a waiter, linked to a Table and 
    consisting of items. It handles synchronization with Table status and ensures
    proper order validation.
    """
    
    def autoname(self):
        """
        Generate document name using the configured naming series.
        Replaces {branch_code} with actual branch code in the series.
        """
        if not self.branch_code:
            frappe.throw("Branch Code is required for Waiter Order")
    
        # Get the naming series pattern
        series = self.naming_series or "WO-{branch_code}-.########"

        # Replace branch_code placeholder with actual value
        series = series.replace("{branch_code}", self.branch_code.upper())

        # Generate the name using Frappe's autoname utility
        self.name = make_autoname(series)

    def validate(self):
        """
        Validate waiter order before saving.
        """
        logger = frappe.logger("waiter_order")

        # Set default values if not specified
        if not self.order_time:
            self.order_time = now_datetime()

        if not self.ordered_by:
            self.ordered_by = frappe.session.user

        # Ensure branch code is set
        if not self.branch_code and self.table:
            self.branch_code = frappe.db.get_value("Table", self.table, "branch_code")
            logger.info(f"Setting branch code to {self.branch_code} from table {self.table}")

            # Update naming series with branch code
            if hasattr(self, 'naming_series'):
                self.naming_series = self.naming_series.replace(
                    "{branch_code}",
                    self.branch_code.upper()
                )

        # Ensure at least one item in the order
        if not self.items or len(self.items) == 0:
            frappe.throw("Order must contain at least one item")

        # Validate all order items
        self.validate_order_items()

        # Validate status transition
        if not self.is_new():
            previous_status = frappe.db.get_value(self.doctype, self.name, "status")
            if previous_status and previous_status != self.status:
                if not is_valid_status_transition(previous_status, self.status):
                    frappe.throw(
                        (f"Invalid status transition from {previous_status} to {self.status}")
                    )

        # Update table status when order status changes to Paid
        if self.status == "Paid" and self.table:
            logger.info(f"Order {self.name} marked as Paid, updating table {self.table}")
            update_table_status(self.table, "Available", None)
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

    def validate_quantity(self):
        """
        Validate quantity for all order items:
        - Check quantity is positive
        - Validate against available stock
        - Apply item-specific quantity limits
        
        Raises:
            frappe.ValidationError: If quantity validation fails
        """
        logger = frappe.logger("waiter_order")
        
        for i, item in enumerate(self.items, 1):
            if not item.qty or item.qty <= 0:
                frappe.throw((
                    "Row {0}: Quantity must be greater than 0 for item '{1}'"
                ).format(i, item.item_name or item.item_code))

            # Get item settings
            item_settings = frappe.db.get_value(
                "Item",
                item.item_code,
                ["is_stock_item", "min_order_qty", "max_order_qty", "item_group"],
                as_dict=True
            )

            # Check min/max order quantities if set
            min_qty = flt(item_settings.min_order_qty)
            if min_qty and item.qty < min_qty:
                frappe.throw((
                    "Row {0}: Minimum order quantity is {1} for item '{2}'"
                ).format(i, min_qty, item.item_name or item.item_code))

            max_qty = flt(item_settings.max_order_qty)
            if max_qty and item.qty > max_qty:
                frappe.throw((
                    "Row {0}: Maximum order quantity is {1} for item '{2}'"
                ).format(i, max_qty, item.item_name or item.item_code))

            # Only check stock for stock items
            if item_settings.is_stock_item:
                try:
                    # Get warehouse for the branch
                    warehouse = frappe.db.get_value(
                        "Branch",
                        self.branch,
                        "default_warehouse"
                    )
                    
                    if not warehouse:
                        logger.warning(
                            f"No default warehouse found for branch {self.branch}. "
                            f"Stock validation skipped for item {item.item_code}"
                        )
                        continue

                    # Get current stock quantity
                    current_stock = frappe.db.get_value(
                        "Bin",
                        {
                            "item_code": item.item_code,
                            "warehouse": warehouse
                        },
                        "actual_qty"
                    ) or 0

                    # Check if enough stock is available
                    if item.qty > current_stock:
                        # Get stock settings
                        allow_negative_stock = frappe.db.get_single_value(
                            "Stock Settings",
                            "allow_negative_stock"
                        )

                        if not allow_negative_stock:
                            frappe.throw((
                                "Row {0}: Not enough stock for item '{1}'. "
                                "Available quantity: {2}, Requested: {3}"
                            ).format(
                                i,
                                item.item_name or item.item_code,
                                current_stock,
                                item.qty
                            ))
                        else:
                            # Log warning if allowing negative stock
                            logger.warning(
                                f"Negative stock will occur - Item: {item.item_code}, "
                                f"Available: {current_stock}, Requested: {item.qty}"
                            )
                            
                            # Show warning message to user
                            frappe.msgprint((
                                "Warning: Stock will go negative for item '{0}'. "
                                "Available: {1}, Requested: {2}"
                            ).format(
                                item.item_name or item.item_code,
                                current_stock,
                                item.qty
                            ), indicator='orange', alert=True)

                except Exception as e:
                    # Log error but don't block order
                    logger.error(
                        f"Error checking stock for item {item.item_code}: {str(e)}"
                    )
                    frappe.msgprint((
                        "Warning: Could not verify stock quantity for item '{0}'. "
                        "Please check manually."
                    ).format(item.item_name or item.item_code),
                        indicator='orange',
                        alert=True
                    )

@frappe.whitelist()
def get_menu_items(branch=None, show_variants=False):
    """
    Get menu items for the waiter order screen.
    
    Args:
        branch: Branch code to filter items
        show_variants: Whether to include variant items
        
    Returns:
        List of menu items
    """
    filters = {"disabled": 0}
    
    # If branch is specified, filter items by branch
    if branch:
        # Add branch-specific filter logic here if needed
        pass
    
    # If not showing variants, exclude items that are variants of other items
    if not frappe.utils.cint(show_variants):
        filters["variant_of"] = ["is", "not set"]
    
    items = frappe.get_all(
        "Item",
        filters=filters,
        fields=["item_code", "item_name", "has_variants", "kitchen_station", 
                "standard_rate", "item_group"]
    )
    
    return items

@frappe.whitelist()
def get_item_variant_attributes(template_item_code):
    """
    Get variant attributes for a template item.
    
    Args:
        template_item_code: Item code of the template
        
    Returns:
        List of attribute details
    """
    if not template_item_code:
        return []
        
    # Get item variant attributes
    attributes = []
    item_attributes = frappe.get_all(
        "Item Variant Attribute",
        filters={"parent": template_item_code},
        fields=["attribute", "attribute_value"]
    )
    
    # Get full attribute details
    for attr in item_attributes:
        attribute_doc = frappe.get_doc("Item Attribute", attr.attribute)
        attributes.append({
            "name": attribute_doc.name,
            "field_name": attribute_doc.name,
            "attribute": attribute_doc.name,
            "options": "\n".join([value.attribute_value for value in attribute_doc.item_attribute_values])
        })
    
    return attributes

@frappe.whitelist()
def resolve_item_variant(template_item_code, attributes):
    """
    Resolve a variant item based on template and attributes.
    
    Args:
        template_item_code: Item code of the template
        attributes: Dict of attribute name to value
        
    Returns:
        Variant item details
    """
    if not template_item_code or not attributes:
    return None

    # Convert string attributes to dict if needed
    if isinstance(attributes, str):
        attributes = json.loads(attributes)
    
    # Find matching variant
    variants = frappe.get_all(
        "Item",
        filters={"variant_of": template_item_code, "disabled": 0},
        fields=["item_code", "item_name"]
    )
    
    for variant in variants:
        # Get variant attributes
        variant_attrs = frappe.get_all(
            "Item Variant Attribute",
            filters={"parent": variant.item_code},
            fields=["attribute", "attribute_value"]
        )
        
        # Check if all specified attributes match
        matches = True
        for attr_name, attr_value in attributes.items():
            match_found = False
            for v_attr in variant_attrs:
                if v_attr.attribute == attr_name and v_attr.attribute_value == attr_value:
                    match_found = True
                    break
            
            if not match_found:
                matches = False
                break
        
        if matches:
            return variant
    
    return None
