# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class KitchenStation(Document):
    """Kitchen Station for restaurant order routing.
    
    This DocType is used to map item groups to specific kitchen stations
    for routing in POS Orders.
    """

    def autoname(self):
        """Generate name using format KS-{branch_code}-{####}"""
        if self.branch_code:
            # Get the next number for this branch code
            last_name = frappe.db.sql(
                """
                SELECT `name` FROM `tabKitchen Station`
                WHERE `name` LIKE 'KS-{branch_code}-%'
                ORDER BY `name` DESC LIMIT 1
            """.format(
                    branch_code=self.branch_code.upper()
                )
            )

            # Start counter
            count = 1

            # If there's an existing record, extract the counter
            if last_name:
                # Extract the number from the last name (e.g., KS-JKT-0001 → 1)
                try:
                    count = int(last_name[0][0].split("-")[-1]) + 1
                except (IndexError, ValueError):
                    count = 1

            # Format the new name with 4-digit counter
            self.name = f"KS-{self.branch_code.upper()}-{count:04d}"
        else:
            # Fall back to using station_name if branch_code isn't provided
            self.name = self.station_name

    def validate(self):
        """Validate kitchen station configuration before saving."""
        self.validate_mandatory_fields()
        self.validate_unique_printer()

    def validate_mandatory_fields(self):
        """Ensure all mandatory fields are properly filled."""
        if not self.station_name:
            frappe.throw(_("Station Name is mandatory for Kitchen Station"))
        
        if not self.branch_code:
            frappe.throw(_("Branch Code is mandatory for Kitchen Station"))

    def validate_unique_printer(self):
        """Ensure printer name is unique per branch if applicable."""
        if not self.printer_name:
            return
            
        existing = frappe.db.sql(
            """
            SELECT name FROM `tabKitchen Station`
            WHERE branch_code = %s AND printer_name = %s AND name != %s
            """,
            (self.branch_code, self.printer_name, self.name or "New Kitchen Station"),
        )
        
        if existing:
            frappe.throw(
                _("Printer '{0}' is already assigned to another kitchen station in branch '{1}'").format(
                    self.printer_name, self.branch_code
                )
            )

    def on_update(self):
        """Hook for actions to perform when kitchen station is updated."""
        self.update_print_service()

    def update_print_service(self):
        """Update routing to print service if applicable."""
        # This method can be implemented to handle print service integration
        # Current implementation is a placeholder for future functionality
        frappe.logger().debug(f"Kitchen Station {self.name} updated. Print service routing may need refresh.")