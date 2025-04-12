# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class Table(Document):
    """Table represents a physical table in the restaurant."""
    
    def autoname(self):
        """Generate name using format {table_number}-{branch_code}"""
        if self.table_number and self.branch_code:
            self.name = f"{self.table_number}-{self.branch_code}"
        else:
            frappe.throw("Table Number and Branch Code are required")
    
    def validate(self):
        self.validate_unique_table_number()
    
    def validate_unique_table_number(self):
        """Ensure table number is unique within a branch"""
        if self.table_number and self.branch_code:
            existing = frappe.db.get_value(
                "Table", 
                {
                    "table_number": self.table_number, 
                    "branch_code": self.branch_code,
                    "name": ("!=", self.name)
                }, 
                "name"
            )
            if existing:
                frappe.throw(f"Table {self.table_number} already exists in branch {self.branch_code}")
