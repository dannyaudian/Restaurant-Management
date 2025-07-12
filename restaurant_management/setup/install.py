import frappe


def after_install():
    """Run after app installation"""
    frappe.db.commit()
    frappe.clear_cache()

    logger = frappe.logger()
    try:
        logger.info("Restaurant Management app installed successfully!")
        logger.info(
            "To create demo data, run: bench --site [sitename] execute restaurant_management.setup.create_demo_data.create_demo_data"
        )
    except Exception:
        frappe.log_error(frappe.get_traceback(), "restaurant_management.after_install")
