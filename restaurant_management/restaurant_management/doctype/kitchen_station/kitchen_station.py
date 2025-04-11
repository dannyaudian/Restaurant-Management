# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
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
            last_name = frappe.db.sql("""
                SELECT `name` FROM `tabKitchen Station`
                WHERE `name` LIKE 'KS-{branch_code}-%'
                ORDER BY `name` DESC LIMIT 1
            """.format(branch_code=self.branch_code.upper()))

            # Start counter
            count = 1

            # If there's an existing record, extract the counter
            if last_name:
                # Extract the number from the last name (e.g., KS-JKT-0001 → 1)
                try:
                    count = int(last_name[0][0].split('-')[-1]) + 1
                except (IndexError, ValueError):
                    count = 1

            # Format the new name with 4-digit counter
            self.name = f"KS-{self.branch_code.upper()}-{count:04d}"
        else:
            # Fall back to using station_name if branch_code isn't provided
            self.name = self.station_name
