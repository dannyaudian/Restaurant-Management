# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class UserBranchAssignment(Document):
    """Child table for assigning branches to users.
    
    This DocType is used to link users to specific branches for access control
    and reporting purposes. It is a child table typically used in User or
    Role Profile doctypes.
    """

    def validate(self):
        """Validate branch assignment and update fetched fields."""
        self.validate_branch()
        self.update_branch_details()

    def validate_branch(self):
        """Ensure the assigned branch exists in the system."""
        if not self.branch:
            frappe.throw(_("Branch is required"), title=_("Missing Field"))
            
        branch_exists = frappe.db.exists("Branch", self.branch)
        if not branch_exists:
            frappe.throw(
                _("Branch '{0}' does not exist").format(self.branch),
                title=_("Invalid Branch")
            )

    def update_branch_details(self):
        """Update branch_code and branch_name from the linked branch."""
        if self.branch:
            # Use get_value to fetch both fields in a single DB query for better performance
            branch_code, branch_name = frappe.db.get_value(
                "Branch", self.branch, ["branch_code", "branch_name"]
            ) or (None, None)
            
            # Update the fields only if values are available
            if branch_code:
                self.branch_code = branch_code
            
            if branch_name:
                self.branch_name = branch_name
                
            # Log if we couldn't retrieve the expected values
            if not branch_code or not branch_name:
                frappe.logger().warning(
                    f"Could not fetch complete details for Branch '{self.branch}'"
                )