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
# web_include_js = [
#    "/assets/restaurant_management/js/waiter_order.js",
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

# override_doctype_class = {
#   "ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
   "Waiter Order": {
      "before_save": "restaurant_management.restaurant_management.doctype.waiter_order.waiter_order.update_table_status",
      "on_trash": "restaurant_management.restaurant_management.doctype.waiter_order.waiter_order.on_trash",
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
#   ]
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

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
#   "*": {
#       "on_update": "method",
#       "on_cancel": "method",
#       "on_trash": "method"
#   }
# }

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
#   ]
#   "monthly": [
#       "restaurant_management.tasks.monthly"
#   ]
# }

# Web Routes
# ----------

 website_route_rules = [
   {"from_route": "/waiter_order", "to_route": "restaurant_management/www/waiter_order"},
# ]

# Fixtures
# --------
fixtures = [
   {"dt": "Custom Field", "filters": [["module", "=", "Restaurant Management"]]},
   {"dt": "Property Setter", "filters": [["module", "=", "Restaurant Management"]]},
   {"dt": "Client Script", "filters": [["module", "=", "Restaurant Management"]]},
   {"dt": "Server Script", "filters": [["module", "=", "Restaurant Management"]]}
]