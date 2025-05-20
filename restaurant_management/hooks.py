I'll rewrite the hooks.py file according to your requirements, ensuring website_route_rules uses hyphens in from_route while keeping the to_route as the template name, and maintaining proper paths for web assets without the "public/" prefix. Here's the rewritten file:

Based on the requirements, here's the rewritten hooks.py file:

```python
app_name = "restaurant_management"
app_title = "Restaurant Management"
app_publisher = "Danny Audian Pratama"
app_description = "Restaurant Management System for ERPNext"
app_icon = "octicon octicon-file-directory"
app_color = "grey"
app_email = "your.email@example.com"
app_license = "MIT"

# Web Assets
web_include_js = [
    "/assets/restaurant_management/js/waiter_order.js",
    "/assets/restaurant_management/js/station_display.js",
    "/assets/restaurant_management/js/table_display.js",
    "/assets/restaurant_management/js/pos_restaurant_custom.js"
]

web_include_css = [
    "/assets/restaurant_management/css/waiter_order.css"
]

# Override Doctype Classes
override_doctype_class = {
    "Sales Invoice": "restaurant_management.restaurant_management.overrides.sales_invoice.RestaurantSalesInvoice",
    "POS Invoice": "restaurant_management.restaurant_management.overrides.pos_invoice.RestaurantPOSInvoice",
    "Sales Order": "restaurant_management.restaurant_management.overrides.sales_order.RestaurantSalesOrder",
    "Payment Entry": "restaurant_management.restaurant_management.overrides.payment_entry.CustomPaymentEntry"
}

# Document Events
doc_events = {
    "Sales Invoice": {
        "validate": "restaurant_management.restaurant_management.overrides.sales_invoice.validate_restaurant_fields",
        "on_submit": "restaurant_management.restaurant_management.overrides.sales_invoice.update_restaurant_status",
        "on_cancel": "restaurant_management.restaurant_management.overrides.sales_invoice.revert_restaurant_status"
    },
    "POS Invoice": {
        "validate": "restaurant_management.restaurant_management.overrides.pos_invoice.validate_restaurant_fields",
        "on_submit": [
            "restaurant_management.restaurant_management.overrides.pos_invoice.update_restaurant_status",
            "restaurant_management.restaurant_management.overrides.pos_invoice.link_to_sales_order"
        ],
        "on_cancel": "restaurant_management.restaurant_management.overrides.pos_invoice.revert_restaurant_status"
    },
    "Sales Order": {
        "validate": "restaurant_management.restaurant_management.overrides.sales_order.validate_restaurant_fields",
        "on_update_after_submit": "restaurant_management.restaurant_management.overrides.sales_order.update_restaurant_status"
    },
    "Payment Entry": {
        "validate": "restaurant_management.restaurant_management.overrides.payment_entry.set_branch_from_reference",
        "on_submit": "restaurant_management.restaurant_management.overrides.payment_entry.update_restaurant_status",
        "on_cancel": "restaurant_management.restaurant_management.overrides.payment_entry.revert_restaurant_status"
    },
    "Waiter Order": {
        "on_update": "restaurant_management.restaurant_management.doctype.waiter_order.waiter_order.update_table_status"
    },
    "Branch": {
        "after_insert": "restaurant_management.restaurant_management.doc_events.branch.after_insert",
        "on_update": "restaurant_management.restaurant_management.doc_events.branch.on_update"
    }
}

# Fixtures
fixtures = [
    {"dt": "Custom Field", "filters": [["module", "=", "Restaurant Management"]]},
    {"dt": "Property Setter", "filters": [["module", "=", "Restaurant Management"]]},
    {"dt": "Client Script", "filters": [["module", "=", "Restaurant Management"]]},
    {"dt": "Server Script", "filters": [["module", "=", "Restaurant Management"]]},
    {"dt": "Workspace", "filters": [["name", "=", "Restaurant Management"]]},
    {"dt": "Dashboard", "filters": [["name", "=", "Restaurant Management"]]},
    {"dt": "Dashboard Chart", "filters": [["module", "=", "Restaurant Management"]]},
    {"dt": "Number Card", "filters": [["module", "=", "Restaurant Management"]]},
    {"dt": "Onboarding", "filters": [["module", "=", "Restaurant Management"]]},
    {"dt": "Onboarding Step", "filters": [["module", "=", "Restaurant Management"]]}
]

# Whitelisted Methods (can be called from frontend)
whitelisted_methods = [
    "restaurant_management.api.kds_display.get_kitchen_item_queue",
    "restaurant_management.api.kds_display.update_item_status",
    "restaurant_management.api.kds_display.get_kitchen_stations",
    "restaurant_management.api.kds_display.get_branches",
    "restaurant_management.api.kds_display.get_kds_config",
    "restaurant_management.api.kitchen_routing.route_order_to_kitchen_stations",
    "restaurant_management.api.pos_restaurant.get_tables",
    "restaurant_management.api.pos_restaurant.get_waiter_order",
    "restaurant_management.api.pos_restaurant.get_item_details",
    "restaurant_management.api.pos_restaurant.get_items",
    "restaurant_management.api.pos_restaurant.update_waiter_order_status",
    "restaurant_management.api.pos_restaurant.create_sales_order_from_waiter_order",
    "restaurant_management.api.pos_restaurant.update_sales_order_from_waiter_order",
    "restaurant_management.api.table_display.get_table_overview",
    "restaurant_management.api.table_display.get_branches",
    "restaurant_management.api.table_display.get_table_display_config",
    "restaurant_management.api.waiter_order.get_available_tables",
    "restaurant_management.api.waiter_order.get_item_templates",
    "restaurant_management.api.waiter_order.get_item_groups",
    "restaurant_management.api.waiter_order.get_item_variant_attributes",
    "restaurant_management.api.waiter_order.resolve_item_variant",
    "restaurant_management.api.waiter_order.send_order_to_kitchen",
    "restaurant_management.api.waiter_order.send_additional_items",
    "restaurant_management.api.waiter_order.mark_items_as_served",
    "restaurant_management.api.waiter_order.get_print_url",
    "restaurant_management.restaurant_management.utils.branch_permissions.assign_all_branches_to_user",
    "restaurant_management.restaurant_management.utils.branch_permissions.get_allowed_branches_query",
    "restaurant_management.api.waiter_order.get_menu_items",
    "restaurant_management.api.waiter_order.get_active_orders"
]

# Guest Methods (can be called without login)
guest_methods = [
    "restaurant_management.api.kds_display.get_kitchen_item_queue",
    "restaurant_management.api.kds_display.update_item_status",
    "restaurant_management.api.kds_display.get_kitchen_stations",
    "restaurant_management.api.kds_display.get_branches",
    "restaurant_management.api.kds_display.get_kds_config",
    "restaurant_management.api.table_display.get_table_overview",
    "restaurant_management.api.table_display.get_branches",
    "restaurant_management.api.table_display.get_table_display_config"
]

# Website routes
website_route_rules = [
    {"from_route": "/waiter-order", "to_route": "waiter_order"},
    {"from_route": "/station-display", "to_route": "station_display"},
    {"from_route": "/table-display", "to_route": "table_display"}
]

# Website pages accessible without login
website_guest_routes = [
    "station_display",
    "table_display"
]
```
