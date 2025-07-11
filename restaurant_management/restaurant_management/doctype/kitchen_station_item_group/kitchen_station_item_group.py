# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class KitchenStationItemGroup(Document):
    """Child table for Kitchen Station to link Item Groups.
    
    This DocType links Item Groups to Kitchen Stations for order routing.
    Parent: Kitchen Station
    Parentfield: item_groups
    """

    def validate(self):
        """Validate the item group assignment."""
        self.validate_parentfield()
        self.validate_item_group()

    def validate_parentfield(self):
        """Ensure this document is attached to the correct parentfield."""
        if self.parentfield != "item_groups":
            frappe.throw(
                _("Kitchen Station Item Group must be added to the 'item_groups' table"),
                title=_("Invalid Configuration")
            )

    def validate_item_group(self):
        """Validate that the linked item group exists."""
        if self.item_group:
            # Use exists to avoid fetching the entire document - better performance
            item_group_exists = frappe.db.exists("Item Group", self.item_group)
            
            if not item_group_exists:
                frappe.throw(
                    _("Item Group '{0}' does not exist").format(self.item_group),
                    title=_("Invalid Item Group")
                )
        else:
            frappe.throw(
                _("Item Group is required"),
                title=_("Missing Field")
            )

    def on_update(self):
        """Log when an item group assignment is updated."""
        frappe.logger().debug(
            f"Item Group '{self.item_group}' updated for Kitchen Station '{self.parent}'"
        )

    def after_insert(self):
        """Log when a new item group is assigned to a kitchen station."""
        frappe.logger().debug(
            f"Item Group '{self.item_group}' assigned to Kitchen Station '{self.parent}'"
        )