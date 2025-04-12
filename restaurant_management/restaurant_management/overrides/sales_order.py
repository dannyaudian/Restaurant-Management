import frappe
from erpnext.selling.doctype.sales_order.sales_order import SalesOrder

class CustomSalesOrder(SalesOrder):
    def autoname(self):
        """Apply branch code to naming series."""
        if self.naming_series and "{branch_code}" in self.naming_series and self.branch_code:
            self.naming_series = self.naming_series.replace("{branch_code}", self.branch_code)
        # Call parent autoname
        super().autoname()
