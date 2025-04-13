app_name = "restaurant_management"
app_title = "Restaurant Management"
app_publisher = "Danny Audian Pratama"
app_description = "Restaurant Management System for ERPNext"
app_icon = "octicon octicon-file-directory"
app_color = "grey"
app_email = "your.email@example.com"
app_license = "MIT"

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/restaurant_management/css/restaurant_management.css"
# app_include_js = "/assets/restaurant_management/js/restaurant_management.js"

# include js, css files in header of web template
# web_include_css = "/assets/restaurant_management/css/dummy.css"
 web_include_js = [
    "/assets/restaurant_management/js/waiter_order.js",
    "/assets/restaurant_management/js/station_display.js",
    "/assets/restaurant_management/js/table_display.js"
     "/assets/restaurant_management/js/pos_restaurant_customjs"
]

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "restaurant_management/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
#   "Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Installation
# ------------

# before_install = "restaurant_management.install.before_install"
# after_install = "restaurant_management.install.after_install"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "restaurant_management.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
#   "Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
#   "Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

override_doctype_class = {
    "Sales Invoice": "restaurant_management.restaurant_management.overrides.sales_invoice.RestaurantSalesInvoice",
    "POS Invoice": "restaurant_management.restaurant_management.overrides.pos_invoice.RestaurantPOSInvoice",
    "Sales Order": "restaurant_management.restaurant_management.overrides.sales_order.RestaurantSalesOrder",
    "Payment Entry": "restaurant_management.restaurant_management.overrides.payment_entry.CustomPaymentEntry"
}
# Document Events
# ---------------
# Hook on document methods and events

oc_events = {
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
    }
}
# Scheduled Tasks
# ---------------

# scheduler_events = {
#   "all": [
#       "restaurant_management.tasks.all"
#   ],
#   "daily": [
#       "restaurant_management.tasks.daily"
#   ],
#   "hourly": [
#       "restaurant_management.tasks.hourly"
#   ],
#   "weekly": [
#       "restaurant_management.tasks.weekly"
#   ],
#   "monthly": [
#       "restaurant_management.tasks.monthly"
#   ]
# }

# Testing
# -------

# before_tests = "restaurant_management.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
#   "frappe.desk.doctype.event.event.get_events": "restaurant_management.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
#   "Task": "restaurant_management.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Fixtures
# --------
fixtures = [
    {"dt": "Custom Field", "filters": [["module", "=", "Restaurant Management"]]},
    {"dt": "Property Setter", "filters": [["module", "=", "Restaurant Management"]]},
    {"dt": "Print Format", "filters": [["module", "=", "Restaurant Management"]]},
    {"dt": "Role", "filters": [["name", "like", "Restaurant%"]]},
    {"dt": "Client Script", "filters": [["module", "=", "Restaurant Management"]]},
    {"dt": "Server Script", "filters": [["module", "=", "Restaurant Management"]]}
]

# Whitelisted Methods
# ------------------
# These methods can be called from the frontend without login
whitelisted_methods = [
    # KDS Display APIs
    "restaurant_management.api.kds_display.get_kitchen_item_queue",
    "restaurant_management.api.kds_display.update_item_status",
    "restaurant_management.api.kds_display.get_kitchen_stations",
    "restaurant_management.api.kds_display.get_branches",
    "restaurant_management.api.kds_display.get_kds_config",
    
    # Kitchen Routing APIs
    "restaurant_management.api.kitchen_routing.route_order_to_kitchen_stations",
    
    # POS Restaurant APIs
    "restaurant_management.api.pos_restaurant.get_tables",
    "restaurant_management.api.pos_restaurant.get_waiter_order",
    "restaurant_management.api.pos_restaurant.get_item_details",
    "restaurant_management.api.pos_restaurant.get_items",
    "restaurant_management.api.pos_restaurant.update_waiter_order_status",
    "restaurant_management.api.pos_restaurant.create_sales_order_from_waiter_order",
    "restaurant_management.api.pos_restaurant.update_sales_order_from_waiter_order",
    
    # Table Display APIs
    "restaurant_management.api.table_display.get_table_overview",
    "restaurant_management.api.table_display.get_branches",
    "restaurant_management.api.table_display.get_table_display_config",
    
    # Waiter Order APIs
    "restaurant_management.api.waiter_order.get_available_tables",
    "restaurant_management.api.waiter_order.get_item_templates",
    "restaurant_management.api.waiter_order.get_item_groups",
    "restaurant_management.api.waiter_order.get_item_variant_attributes",
    "restaurant_management.api.waiter_order.resolve_item_variant",
    "restaurant_management.api.waiter_order.send_order_to_kitchen",
    "restaurant_management.api.waiter_order.send_additional_items",
    "restaurant_management.api.waiter_order.mark_items_as_served",
    "restaurant_management.api.waiter_order.get_print_url",
    
    # Branch Permissions Utils
    "restaurant_management.restaurant_management.utils.branch_permissions.assign_all_branches_to_user",
    "restaurant_management.restaurant_management.utils.branch_permissions.get_allowed_branches_query"
]

# Add to Frappe's whitelisted methods
whitelisted_methods = whitelist_methods

# Guest Methods (allowed without login)
# These methods can be called without any login
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

# Add to Frappe's allowed guest methods
allow_guest_methods = guest_methods

# Website Rules
# ------------------
website_route_rules = [
    {"from_route": "/waiter_order", "to_route": "www/waiter_order"},
    {"from_route": "/station_display", "to_route": "www/station_display", "no_cache": 1},
    {"from_route": "/table_display", "to_route": "www/table_display", "no_cache": 1}
]

# Pages that can be accessed without login
website_guest_routes = [
    "station_display",
    "table_display"
]