# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class KitchenStation(Document):
    """Kitchen Station for restaurant order routing.
    
    This DocType is used to map item groups to specific kitchen stations
    for routing in POS Orders.
    """
    pass
