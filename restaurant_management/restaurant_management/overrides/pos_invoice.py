import frappe
from erpnext.accounts.doctype.pos_invoice.pos_invoice import POSInvoice

class CustomPOSInvoice(POSInvoice):
    def autoname(self):
        """Apply branch code to naming series."""
        if self.naming_series and "{branch_code}" in self.naming_series and self.branch_code:
            self.naming_series = self.naming_series.replace("{branch_code}", self.branch_code)
        # Call parent autoname
        super().autoname()
