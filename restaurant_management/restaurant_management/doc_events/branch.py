import frappe
from frappe import _

def after_insert(doc, method=None):
    """After a new branch is inserted, update associated data"""
    # Create default POS profile for the branch if it's a restaurant
    if doc.is_restaurant and not doc.default_pos_profile:
        create_default_pos_profile(doc)

def on_update(doc, method=None):
    """When branch is updated, sync related records"""
    # Update branch code in Tables linked to this branch
    update_linked_tables(doc)
    
    # Update POS profiles
    update_pos_profiles(doc)

def create_default_pos_profile(branch_doc):
    """Create a default POS profile for this branch"""
    try:
        # Check if a POS profile with this branch code already exists
        existing = frappe.get_all(
            "POS Profile", 
            filters={"branch_code": branch_doc.branch_code},
            fields=["name"]
        )
        
        if existing:
            # Link the existing profile to the branch
            branch_doc.db_set("default_pos_profile", existing[0].name)
            return
        
        # Create new profile with default settings
        pos_profile = frappe.new_doc("POS Profile")
        pos_profile.name = f"{branch_doc.branch_code} Restaurant POS"
        pos_profile.branch = branch_doc.name
        pos_profile.branch_code = branch_doc.branch_code
        pos_profile.restaurant_mode = 1
        
        # Get company - use the first available company if not specified
        company = frappe.defaults.get_global_default("company")
        pos_profile.company = company
        
        # Set basic defaults
        pos_profile.hide_images = 0
        pos_profile.use_customer_credit = 1
        pos_profile.auto_create_sales_order = 1
        pos_profile.allow_add_item_post_kitchen = 0
        
        # Set naming series with branch code
        pos_profile.naming_series = "POS-{branch_code}-.######"
        
        pos_profile.save(ignore_permissions=True)
        
        # Link this profile to the branch
        branch_doc.db_set("default_pos_profile", pos_profile.name)
        
        frappe.msgprint(_("Default POS Profile created for this branch"))
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error creating default POS Profile for branch"))
        frappe.msgprint(_("Failed to create default POS Profile: {0}").format(str(e)))

def update_linked_tables(branch_doc):
    """Update all tables linked to this branch"""
    if not branch_doc.branch_code:
        return
    
    try:
        # Get all tables for this branch
        tables = frappe.get_all(
            "Table",
            filters={"branch": branch_doc.name},
            fields=["name"]
        )
        
        for table in tables:
            frappe.db.set_value("Table", table.name, "branch_code", branch_doc.branch_code)
        
        if tables:
            frappe.db.commit()
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error updating tables for branch"))

def update_pos_profiles(branch_doc):
    """Update POS profiles linked to this branch"""
    if not branch_doc.branch_code:
        return
    
    try:
        # Get all POS profiles for this branch
        profiles = frappe.get_all(
            "POS Profile",
            filters={"branch": branch_doc.name},
            fields=["name"]
        )
        
        for profile in profiles:
            frappe.db.set_value("POS Profile", profile.name, "branch_code", branch_doc.branch_code)
        
        if profiles:
            frappe.db.commit()
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Error updating POS profiles for branch"))
