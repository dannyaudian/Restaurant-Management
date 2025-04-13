# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

def execute(filters=None):
    if not filters:
        filters = {}

    columns = get_columns(filters)
    data = get_data(filters)
    chart = get_chart_data(data)
    
    return columns, data, None, chart


def get_columns(filters):
    columns = [
        {
            "label": _("Item Code"),
            "fieldname": "item_code",
            "fieldtype": "Link",
            "options": "Item",
            "width": 120
        },
        {
            "label": _("Item Name"),
            "fieldname": "item_name",
            "fieldtype": "Data",
            "width": 200
        },
        {
            "label": _("Item Group"),
            "fieldname": "item_group",
            "fieldtype": "Link",
            "options": "Item Group",
            "width": 120
        }
    ]
    
    if not filters.get("branch_code") or len(filters.get("branch_code")) != 1:
        columns.append({
            "label": _("Branch"),
            "fieldname": "branch_code",
            "fieldtype": "Link",
            "options": "Branch",
            "width": 100
        })
    
    columns.extend([
        {
            "label": _("Quantity"),
            "fieldname": "qty",
            "fieldtype": "Float",
            "width": 100
        },
        {
            "label": _("Amount"),
            "fieldname": "amount",
            "fieldtype": "Currency",
            "width": 120
        },
        {
            "label": _("% of Sales"),
            "fieldname": "sales_percentage",
            "fieldtype": "Percent",
            "width": 100
        }
    ])
    
    return columns


def get_data(filters):
    conditions = get_conditions(filters)
    
    data = frappe.db.sql("""
        SELECT 
            sii.item_code,
            sii.item_name,
            sii.item_group,
            si.branch_code,
            SUM(sii.qty) as qty,
            SUM(sii.amount) as amount,
            SUM(sii.amount) / (
                SELECT SUM(base_grand_total) 
                FROM `tabSales Invoice` 
                WHERE docstatus = 1 
                AND restaurant_table IS NOT NULL
                AND is_return = 0
                {conditions}
            ) * 100 as sales_percentage
        FROM 
            `tabSales Invoice Item` sii
        JOIN 
            `tabSales Invoice` si ON si.name = sii.parent
        WHERE 
            si.docstatus = 1
            AND si.restaurant_table IS NOT NULL
            AND si.is_return = 0
            {conditions}
        GROUP BY 
            sii.item_code, si.branch_code
        ORDER BY 
            amount DESC
    """.format(conditions=conditions), as_dict=1)
    
    return data


def get_conditions(filters):
    conditions = []

    if filters.get("from_date"):
        conditions.append("si.posting_date >= '{}'".format(filters.get("from_date")))
    if filters.get("to_date"):
        conditions.append("si.posting_date <= '{}'".format(filters.get("to_date")))
    if filters.get("company"):
        conditions.append("si.company = '{}'".format(filters.get("company")))
    if filters.get("branch_code"):
        if len(filters.get("branch_code")) == 1:
            conditions.append("si.branch_code = '{}'".format(filters.get("branch_code")[0]))
        else:
            conditions.append("si.branch_code IN ({})".format(", ".join(["'{}'".format(b) for b in filters.get("branch_code")])))
    if filters.get("item_group"):
        conditions.append("sii.item_group = '{}'".format(filters.get("item_group")))

    return " AND " + " AND ".join(conditions) if conditions else ""


def get_chart_data(data):
    if not data:
        return None
    
    labels = []
    values = []
    
    # Get top 10 items by amount
    top_items = sorted(data, key=lambda x: x.get("amount", 0), reverse=True)[:10]
    
    for entry in top_items:
        labels.append(entry.get("item_name"))
        values.append(flt(entry.get("amount")))
    
    chart = {
        "data": {
            "labels": labels,
            "datasets": [
                {
                    "name": "Sales Amount",
                    "values": values
                }
            ]
        },
        "type": "bar",
        "colors": ["#fc4f51"],
        "barOptions": {
            "stacked": 0
        }
    }
    
    return chart
