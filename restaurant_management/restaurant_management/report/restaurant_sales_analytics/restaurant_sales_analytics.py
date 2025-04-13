# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate, flt, add_days, today, add_months, date_diff, formatdate, get_first_day, get_last_day


def execute(filters=None):
    if not filters:
        filters = {}

    if filters.get("from_date") > filters.get("to_date"):
        frappe.throw(_("From Date cannot be greater than To Date"))

    columns = get_columns(filters)
    data = get_data(filters)

    # Add summary metrics
    summary_data = get_summary_data(filters)
    if summary_data:
        chart = get_chart_data(data, filters)
        return columns, data, None, chart, summary_data
    
    chart = get_chart_data(data, filters)
    return columns, data, None, chart


def get_columns(filters):
    columns = [
        {
            "label": _("Date"),
            "fieldname": "posting_date",
            "fieldtype": "Date",
            "width": 90
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
            "label": _("Restaurant Sales"),
            "fieldname": "restaurant_sales",
            "fieldtype": "Currency",
            "width": 120
        },
        {
            "label": _("Orders"),
            "fieldname": "orders",
            "fieldtype": "Int",
            "width": 80
        },
        {
            "label": _("Average Order Value"),
            "fieldname": "average_order",
            "fieldtype": "Currency",
            "width": 120
        },
        {
            "label": _("Items Sold"),
            "fieldname": "items_sold",
            "fieldtype": "Int",
            "width": 90
        }
    ])

    return columns


def get_data(filters):
    conditions = get_conditions(filters)
    
    data = frappe.db.sql("""
        SELECT 
            si.posting_date,
            si.branch_code,
            SUM(si.base_grand_total) as restaurant_sales,
            COUNT(DISTINCT si.name) as orders,
            SUM(si.base_grand_total) / COUNT(DISTINCT si.name) as average_order,
            SUM(sii.qty) as items_sold
        FROM 
            `tabSales Invoice` si
        LEFT JOIN 
            `tabSales Invoice Item` sii ON sii.parent = si.name
        WHERE 
            si.docstatus = 1
            AND si.restaurant_table IS NOT NULL
            AND si.is_return = 0
            {conditions}
        GROUP BY 
            si.posting_date, si.branch_code
        ORDER BY 
            si.posting_date DESC
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

    return " AND " + " AND ".join(conditions) if conditions else ""


def get_summary_data(filters):
    # Get today's date
    today_date = getdate(today())
    
    # Calculate date ranges
    current_month_start = get_first_day(today_date)
    current_month_end = get_last_day(today_date)
    previous_month_start = get_first_day(add_months(today_date, -1))
    previous_month_end = get_last_day(add_months(today_date, -1))
    
    year_start = getdate(f"{today_date.year}-01-01")
    previous_year_start = getdate(f"{today_date.year - 1}-01-01")
    previous_year_end = getdate(f"{today_date.year - 1}-12-31")
    
    # Get daily sales
    daily_sales = get_period_sales(filters, today_date, today_date)
    daily_sales_prev = get_period_sales(filters, add_days(today_date, -1), add_days(today_date, -1))
    
    # Get MTD sales
    mtd_sales = get_period_sales(filters, current_month_start, today_date)
    mtd_sales_prev_year = get_period_sales(filters, previous_month_start, 
                                           add_days(previous_month_end, 
                                                   date_diff(today_date, current_month_start)))
    
    # Get YTD sales
    ytd_sales = get_period_sales(filters, year_start, today_date)
    ytd_sales_prev_year = get_period_sales(filters, previous_year_start, 
                                          add_days(previous_year_start, 
                                                  date_diff(today_date, year_start)))
    
    # Calculate growth percentages
    daily_growth = calculate_growth(daily_sales, daily_sales_prev)
    mtd_growth = calculate_growth(mtd_sales, mtd_sales_prev_year)
    ytd_growth = calculate_growth(ytd_sales, ytd_sales_prev_year)
    
    summary = [
        {
            "value": daily_sales,
            "indicator": "blue" if daily_growth >= 0 else "red",
            "label": "Today's Sales",
            "datatype": "Currency",
            "growth": daily_growth
        },
        {
            "value": mtd_sales,
            "indicator": "blue" if mtd_growth >= 0 else "red",
            "label": "Month to Date",
            "datatype": "Currency",
            "growth": mtd_growth
        },
        {
            "value": ytd_sales,
            "indicator": "blue" if ytd_growth >= 0 else "red",
            "label": "Year to Date",
            "datatype": "Currency",
            "growth": ytd_growth
        }
    ]
    
    return summary


def get_period_sales(filters, start_date, end_date):
    conditions = get_conditions(filters)
    if conditions:
        conditions = conditions + " AND si.posting_date >= '{}' AND si.posting_date <= '{}'".format(start_date, end_date)
    else:
        conditions = " AND si.posting_date >= '{}' AND si.posting_date <= '{}'".format(start_date, end_date)
    
    result = frappe.db.sql("""
        SELECT SUM(base_grand_total) as sales
        FROM `tabSales Invoice` si
        WHERE docstatus = 1
        AND si.restaurant_table IS NOT NULL
        AND is_return = 0
        {}
    """.format(conditions))
    
    return flt(result[0][0]) if result and result[0][0] else 0


def calculate_growth(current, previous):
    if previous and previous > 0:
        return flt((current - previous) / previous * 100, 2)
    else:
        return 100 if current > 0 else 0


def get_chart_data(data, filters):
    if not data:
        return None
    
    labels = []
    restaurant_sales = []
    
    for entry in data:
        labels.append(formatdate(entry.get("posting_date"), "MM-dd"))
        restaurant_sales.append(entry.get("restaurant_sales"))

    chart = {
        "data": {
            "labels": labels[:30],  # Limit to last 30 days for readability
            "datasets": [
                {
                    "name": "Restaurant Sales",
                    "values": restaurant_sales[:30]
                }
            ]
        },
        "type": "bar",
        "colors": ["#4290F5"],
        "axisOptions": {
            "shortenYAxisNumbers": 1
        }
    }
    
    return chart
