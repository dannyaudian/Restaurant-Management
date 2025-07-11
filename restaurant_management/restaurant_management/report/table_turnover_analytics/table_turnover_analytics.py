# Copyright (c) 2023, PT. Inovasi Terbaik Bangsa and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, time_diff_in_hours

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
            "label": _("Table"),
            "fieldname": "table",
            "fieldtype": "Link",
            "options": "Table",
            "width": 120
        },
        {
            "label": _("Table Number"),
            "fieldname": "table_number",
            "fieldtype": "Data",
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
            "label": _("Orders"),
            "fieldname": "orders",
            "fieldtype": "Int",
            "width": 80
        },
        {
            "label": _("Total Sales"),
            "fieldname": "total_sales",
            "fieldtype": "Currency",
            "width": 120
        },
        {
            "label": _("Avg. Order Value"),
            "fieldname": "average_order",
            "fieldtype": "Currency",
            "width": 120
        },
        {
            "label": _("Avg. Occupancy (hrs)"),
            "fieldname": "average_occupancy",
            "fieldtype": "Float",
            "precision": 2,
            "width": 150
        },
        {
            "label": _("Sales per Hour"),
            "fieldname": "sales_per_hour",
            "fieldtype": "Currency",
            "width": 120
        }
    ])
    
    return columns


def get_data(filters):
    conditions = get_conditions(filters)
    
    # Get sales data by table
    sales_data = frappe.db.sql("""
        SELECT 
            wo.table,
            t.table_number,
            t.branch_code,
            COUNT(DISTINCT wo.name) as orders,
            SUM(si.base_grand_total) as total_sales,
            SUM(si.base_grand_total) / COUNT(DISTINCT wo.name) as average_order
        FROM 
            `tabWaiter Order` wo
        JOIN 
            `tabTable` t ON t.name = wo.table
        LEFT JOIN 
            `tabSales Invoice` si ON si.restaurant_waiter_order = wo.name
        WHERE 
            wo.docstatus < 2
            AND si.docstatus = 1
            {conditions}
        GROUP BY 
            wo.table, t.branch_code
        ORDER BY 
            total_sales DESC
    """.format(conditions=conditions), as_dict=1)
    
    # Get occupancy data by table
    occupancy_data = frappe.db.sql("""
        SELECT 
            wo.table,
            AVG(TIMESTAMPDIFF(MINUTE, wo.order_time, 
                IFNULL(
                    (SELECT MAX(creation) FROM `tabPayment Entry Reference` 
                     WHERE reference_doctype = 'Sales Invoice' AND reference_name = si.name),
                    wo.order_time
                )
            )) / 60 as average_occupancy
        FROM 
            `tabWaiter Order` wo
        JOIN 
            `tabTable` t ON t.name = wo.table
        LEFT JOIN 
            `tabSales Invoice` si ON si.restaurant_waiter_order = wo.name
        WHERE 
            wo.docstatus < 2
            AND si.docstatus = 1
            {conditions}
        GROUP BY 
            wo.table
    """.format(conditions=conditions), as_dict=1)
    
    # Combine both datasets
    occupancy_dict = {d.table: d.average_occupancy for d in occupancy_data}
    
    for row in sales_data:
        row.average_occupancy = flt(occupancy_dict.get(row.table, 0), 2)
        row.sales_per_hour = flt(row.total_sales / row.average_occupancy if row.average_occupancy else 0, 2)
    
    return sales_data


def get_conditions(filters):
    conditions = []

    if filters.get("from_date"):
        conditions.append("wo.order_time >= '{}'".format(filters.get("from_date")))
    if filters.get("to_date"):
        conditions.append("wo.order_time <= '{}'".format(filters.get("to_date")))
    if filters.get("company"):
        conditions.append("si.company = '{}'".format(filters.get("company")))
    if filters.get("branch_code"):
        if len(filters.get("branch_code")) == 1:
            conditions.append("t.branch_code = '{}'".format(filters.get("branch_code")[0]))
        else:
            conditions.append("t.branch_code IN ({})".format(", ".join(["'{}'".format(b) for b in filters.get("branch_code")])))

    return " AND " + " AND ".join(conditions) if conditions else ""


def get_chart_data(data):
    if not data:
        return None
    
    labels = []
    sales = []
    orders = []
    
    # Get top 10 tables by sales
    top_tables = sorted(data, key=lambda x: x.get("total_sales", 0), reverse=True)[:10]
    
    for row in top_tables:
        labels.append(row.get("table_number"))
        sales.append(flt(row.get("total_sales")))
        orders.append(flt(row.get("orders")))
    
    chart = {
        "data": {
            "labels": labels,
            "datasets": [
                {
                    "name": "Sales",
                    "values": sales,
                    "chartType": "bar"
                },
                {
                    "name": "Orders",
                    "values": orders,
                    "chartType": "line"
                }
            ]
        },
        "type": "axis-mixed",
        "colors": ["#5e64ff", "#ff5858"],
        "barOptions": {
            "stacked": 0
        },
        "lineOptions": {
            "regionFill": 0
        },
        "axisOptions": {
            "shortenYAxisNumbers": 1
        },
        "title": "Top Tables by Sales and Order Count"
    }
    
    return chart