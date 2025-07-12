import frappe

def after_install():
    """Run after app installation"""
    frappe.db.commit()
    frappe.clear_cache()
    
    print("Restaurant Management app installed successfully!")
    print("To create demo data, run: bench --site [sitename] execute restaurant_management.setup.create_demo_data.create_demo_data")