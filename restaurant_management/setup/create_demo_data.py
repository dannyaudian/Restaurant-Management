import frappe
import json
import os
from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

def create_demo_data():
    """Create demo data for Restaurant Management App"""
    print("Creating demo data for Restaurant Management...")
    
    # Make sure we're in developer mode
    if not frappe.conf.get('developer_mode'):
        print("Please enable developer mode to create demo data")
        return
    
    # Import data from fixtures
    import_fixture_data()
    # Create item prices
    create_item_prices()
    # Create kitchen stations
    create_kitchen_stations()
    
    print("Demo data created successfully!")

def import_fixture_data():
    """Import data from fixture files"""
    print("Importing fixture data...")

    # Define fixture files to import
    fixture_files = [
        "item_attribute_fixtures.json",
        "item_group_fixtures.json",
        "item_fixtures.json"
    ]

    app_path = frappe.get_app_path("restaurant_management")
    fixtures_path = os.path.join(app_path, "fixtures")

    for fixture_file in fixture_files:
        file_path = os.path.join(fixtures_path, fixture_file)

        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                data = json.load(f)

            print(f"Importing {len(data)} records from {fixture_file}")

            for doc_data in data:
                doctype = doc_data.get("doctype")
                name = doc_data.get("name")

                if doctype and name:
                    # Skip template items first to prevent errors
                    if doctype == "Item" and doc_data.get("has_variants") == 1:
                        continue

                    # Skip variant items first
                    if doctype == "Item" and doc_data.get("variant_of"):
                        continue

                    # For all other records, create or update
                    try:
                        if not frappe.db.exists(doctype, name):
                            doc = frappe.get_doc(doc_data)
                            doc.insert(ignore_permissions=True)
                            print(f"Created {doctype}: {name}")
                        else:
                            # Update existing record
                            existing_doc = frappe.get_doc(doctype, name)
                            existing_doc.update(doc_data)
                            existing_doc.save(ignore_permissions=True)
                            print(f"Updated {doctype}: {name}")
    except Exception as e:
                        print(f"Error creating {doctype} {name}: {str(e)}")

            # Now import template items
            if fixture_file == "item_fixtures.json":
                for doc_data in data:
                    if doc_data.get("doctype") == "Item" and doc_data.get("has_variants") == 1:
                        name = doc_data.get("name")
                        try:
                            # Remove standard_rate to prevent issues
                            if "standard_rate" in doc_data:
                                del doc_data["standard_rate"]

                            if not frappe.db.exists("Item", name):
                                doc = frappe.get_doc(doc_data)
                                doc.insert(ignore_permissions=True)
                                print(f"Created template Item: {name}")
                            else:
                                # Update existing record
                                existing_doc = frappe.get_doc("Item", name)
                                existing_doc.update(doc_data)
                                existing_doc.save(ignore_permissions=True)
                                print(f"Updated template Item: {name}")
                        except Exception as e:
                            print(f"Error creating template Item {name}: {str(e)}")

                # Finally import variant items
                for doc_data in data:
                    if doc_data.get("doctype") == "Item" and doc_data.get("variant_of"):
                        name = doc_data.get("name")
                        try:
                            # Store standard rate for later use
                            standard_rate = doc_data.get("standard_rate")

                            # Remove standard_rate to prevent issues
                            if "standard_rate" in doc_data:
                                del doc_data["standard_rate"]

                            if not frappe.db.exists("Item", name):
                                doc = frappe.get_doc(doc_data)
                                doc.insert(ignore_permissions=True)
                                print(f"Created variant Item: {name}")
                            else:
                                # Update existing record
                                existing_doc = frappe.get_doc("Item", name)
                                existing_doc.update(doc_data)
                                existing_doc.save(ignore_permissions=True)
                                print(f"Updated variant Item: {name}")
                        except Exception as e:
                            print(f"Error creating variant Item {name}: {str(e)}")

def create_item_prices():
    """Create item prices for all items"""
    print("Creating item prices...")

    # Get default price list
    default_price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list")
    if not default_price_list:
        default_price_list = "Standard Selling"

    app_path = frappe.get_app_path("restaurant_management")
    fixture_path = os.path.join(app_path, "fixtures", "item_fixtures.json")

    if os.path.exists(fixture_path):
        with open(fixture_path, 'r') as f:
            data = json.load(f)

        for item_data in data:
            if item_data.get("doctype") == "Item" and not item_data.get("has_variants") and "standard_rate" in item_data:
                item_code = item_data.get("item_code")
                standard_rate = item_data.get("standard_rate")

                if item_code and standard_rate:
                    create_item_price(item_code, standard_rate, default_price_list)

def create_item_price(item_code, price, price_list):
    """Create Item Price for an item"""
    # Check if an item price already exists
    if not frappe.db.exists("Item Price",
                          {"item_code": item_code, "price_list": price_list}):
        try:
            # Create item price
            item_price = frappe.get_doc({
                "doctype": "Item Price",
                "item_code": item_code,
                "price_list": price_list,
                "price_list_rate": price,
                "currency": frappe.db.get_default("currency")
            })
            item_price.insert(ignore_permissions=True)
            print(f"Created Item Price for {item_code}: {price}")
        except Exception as e:
            print(f"Error creating price for {item_code}: {str(e)}")

def create_kitchen_stations():
    """Create Kitchen Stations for restaurant"""
    print("Creating Kitchen Stations...")
    
    # Get the default branch
    default_branch = frappe.db.get_value("Branch", {"is_group": 0}, "name")
    if not default_branch:
        # Create a branch if none exists
        branch = frappe.get_doc({
            "doctype": "Branch",
            "branch": "Main Branch",
            "branch_code": "HO",
            "is_restaurant": 1
        })
        branch.insert()
        default_branch = branch.name
        print(f"Created Branch: {default_branch}")
    
    # Get branch code
    branch_code = frappe.db.get_value("Branch", default_branch, "branch_code") or "HO"
    
    stations = [
        {
            "doctype": "Kitchen Station",
            "station_name": "Beverage Station",
            "station_code": "BEVERAGE-STATION",
            "branch": default_branch,
            "branch_code": branch_code,
            "is_active": 1,
            "printer_name": "Beverage Printer",
            "item_groups": [
                {"item_group": "Beverages"}
            ]
        },
        {
            "doctype": "Kitchen Station",
            "station_name": "Grill Station",
            "station_code": "GRILL-STATION",
            "branch": default_branch,
            "branch_code": branch_code,
            "is_active": 1,
            "printer_name": "Grill Printer",
            "item_groups": [
                {"item_group": "Fast Food"}
            ]
        },
        {
            "doctype": "Kitchen Station",
            "station_name": "Pizza Station",
            "station_code": "PIZZA-STATION",
            "branch": default_branch,
            "branch_code": branch_code,
            "is_active": 1,
            "printer_name": "Pizza Printer",
            "item_groups": [
                {"item_group": "Pizza"}
            ]
        },
        {
            "doctype": "Kitchen Station",
            "station_name": "Fries Station",
            "station_code": "FRIES-STATION",
            "branch": default_branch,
            "branch_code": branch_code,
            "is_active": 1,
            "printer_name": "Fries Printer",
            "item_groups": [
                {"item_group": "Sides"}
            ]
        }
    ]
    
    for station in stations:
        existing = frappe.db.exists("Kitchen Station", {"station_name": station["station_name"]})
        if not existing:
            doc = frappe.get_doc(station)
            doc.insert(ignore_permissions=True)
            print(f"Created Kitchen Station: {station['station_name']}")
def execute():
    """Execute the demo data creation"""
    try:
        frappe.init(site=frappe.local.site)
        frappe.connect()
        create_demo_data()
    except Exception as e:
        print(f"Error creating demo data: {str(e)}")
    finally:
        frappe.destroy()


if __name__ == "__main__":
    execute()
