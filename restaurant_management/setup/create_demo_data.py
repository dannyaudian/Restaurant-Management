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
    
    create_item_attributes()
    create_item_groups()
    create_kitchen_stations()
    create_items()
    
    print("Demo data created successfully!")

def create_item_attributes():
    """Create Item Attributes for variants"""
    print("Creating Item Attributes...")
    
    attributes = [
        {
            "doctype": "Item Attribute",
            "attribute_name": "Size",
            "item_attribute_values": [
                {"attribute_value": "Small", "abbr": "S"},
                {"attribute_value": "Medium", "abbr": "M"},
                {"attribute_value": "Large", "abbr": "L"},
                {"attribute_value": "Single", "abbr": "SGL"},
                {"attribute_value": "Double", "abbr": "DBL"}
            ]
        },
        {
            "doctype": "Item Attribute",
            "attribute_name": "Milk Type",
            "item_attribute_values": [
                {"attribute_value": "Full", "abbr": "FULL"},
                {"attribute_value": "Skimmed", "abbr": "SKIM"},
                {"attribute_value": "Almond", "abbr": "ALMD"},
                {"attribute_value": "Soy", "abbr": "SOY"},
                {"attribute_value": "Oat", "abbr": "OAT"}
            ]
        },
        {
            "doctype": "Item Attribute",
            "attribute_name": "Sugar Level",
            "item_attribute_values": [
                {"attribute_value": "No Sugar", "abbr": "NONE"},
                {"attribute_value": "Low", "abbr": "LOW"},
                {"attribute_value": "Regular", "abbr": "REG"},
                {"attribute_value": "Extra", "abbr": "XTRA"}
            ]
        },
        {
            "doctype": "Item Attribute",
            "attribute_name": "Patty Type",
            "item_attribute_values": [
                {"attribute_value": "Beef", "abbr": "BEEF"},
                {"attribute_value": "Chicken", "abbr": "CHKN"},
                {"attribute_value": "Vegetarian", "abbr": "VEG"}
            ]
        },
        {
            "doctype": "Item Attribute",
            "attribute_name": "Cheese",
            "item_attribute_values": [
                {"attribute_value": "Yes", "abbr": "Y"},
                {"attribute_value": "No", "abbr": "N"},
                {"attribute_value": "Extra", "abbr": "XTRA"}
            ]
        }
    ]
    
    for attr in attributes:
        if not frappe.db.exists("Item Attribute", attr["attribute_name"]):
            doc = frappe.get_doc(attr)
            doc.insert()
            print(f"Created Item Attribute: {attr['attribute_name']}")

def create_item_groups():
    """Create Item Groups for restaurant menu"""
    print("Creating Item Groups...")
    
    groups = [
        {"doctype": "Item Group", "item_group_name": "Beverages", "parent_item_group": "All Item Groups"},
        {"doctype": "Item Group", "item_group_name": "Fast Food", "parent_item_group": "All Item Groups"},
        {"doctype": "Item Group", "item_group_name": "Pizza", "parent_item_group": "All Item Groups"},
        {"doctype": "Item Group", "item_group_name": "Sides", "parent_item_group": "All Item Groups"}
    ]
    
    for group in groups:
        if not frappe.db.exists("Item Group", group["item_group_name"]):
            doc = frappe.get_doc(group)
            doc.insert()
            print(f"Created Item Group: {group['item_group_name']}")

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
            doc.insert()
            print(f"Created Kitchen Station: {station['station_name']}")

def create_items():
    """Create Items for restaurant menu"""
    print("Creating Items...")
    
    # Regular Items (no variants)
    simple_items = [
        {
            "doctype": "Item",
            "item_code": "RC-001",
            "item_name": "Regular Coffee",
            "item_group": "Beverages",
            "stock_uom": "Nos",
            "description": "A rich and aromatic black coffee",
            "is_stock_item": 1,
            "standard_rate": 15.00,
            "is_sales_item": 1,
            "kitchen_station": "Beverage Station",
            "preparation_time": 5
        },
        {
            "doctype": "Item",
            "item_code": "CB-001",
            "item_name": "Chicken Burger",
            "item_group": "Fast Food",
            "stock_uom": "Nos",
            "description": "Grilled chicken burger with fresh vegetables",
            "is_stock_item": 1,
            "standard_rate": 45.00,
            "is_sales_item": 1,
            "kitchen_station": "Grill Station",
            "preparation_time": 12
        },
        {
            "doctype": "Item",
            "item_code": "VP-001",
            "item_name": "Veggie Pizza",
            "item_group": "Pizza",
            "stock_uom": "Nos",
            "description": "Fresh vegetable pizza with house-made sauce",
            "is_stock_item": 1,
            "standard_rate": 60.00,
            "is_sales_item": 1,
            "kitchen_station": "Pizza Station",
            "preparation_time": 20
        },
        {
            "doctype": "Item",
            "item_code": "FF-001",
            "item_name": "French Fries",
            "item_group": "Sides",
            "stock_uom": "Nos",
            "description": "Crispy fried potatoes with salt",
            "is_stock_item": 1,
            "standard_rate": 20.00,
            "is_sales_item": 1,
            "kitchen_station": "Fries Station",
            "preparation_time": 8
        }
    ]
    
    # Create Item Templates with variants
    templates = [
        {
            "doctype": "Item",
            "item_code": "COFFEE-TMPL",
            "item_name": "Coffee",
            "item_group": "Beverages",
            "stock_uom": "Nos",
            "description": "Coffee with customizable options",
            "is_stock_item": 0,
            "standard_rate": 25.00,
            "is_sales_item": 1,
            "has_variants": 1,
            "variant_based_on": "Item Attribute",
            "attributes": [
                {"attribute": "Size"},
                {"attribute": "Milk Type"},
                {"attribute": "Sugar Level"}
            ],
            "kitchen_station": "Beverage Station",
            "preparation_time": 6
        },
        {
            "doctype": "Item",
            "item_code": "BURGER-TMPL",
            "item_name": "Burger",
            "item_group": "Fast Food",
            "stock_uom": "Nos",
            "description": "Customizable burger with options",
            "is_stock_item": 0,
            "standard_rate": 45.00,
            "is_sales_item": 1,
            "has_variants": 1,
            "variant_based_on": "Item Attribute",
            "attributes": [
                {"attribute": "Patty Type"},
                {"attribute": "Size"},
                {"attribute": "Cheese"}
            ],
            "kitchen_station": "Grill Station",
            "preparation_time": 15
        }
    ]
    
    # Create variants for Coffee template
    coffee_variants = [
        {
            "doctype": "Item",
            "item_code": "COFFEE-LAT-S-REG-FULL",
            "item_name": "Small Latte, Regular, Full Milk",
            "item_group": "Beverages",
            "stock_uom": "Nos",
            "description": "Small latte with regular strength and full milk",
            "is_stock_item": 1,
            "standard_rate": 25.00,
            "is_sales_item": 1,
            "variant_of": "COFFEE-TMPL",
            "attributes": [
                {"attribute": "Size", "attribute_value": "Small"},
                {"attribute": "Milk Type", "attribute_value": "Full"},
                {"attribute": "Sugar Level", "attribute_value": "Regular"}
            ],
            "kitchen_station": "Beverage Station"
        },
        {
            "doctype": "Item",
            "item_code": "COFFEE-LAT-L-LOW-SKIM",
            "item_name": "Large Latte, Low Sugar, Skimmed Milk",
            "item_group": "Beverages",
            "stock_uom": "Nos",
            "description": "Large latte with low sugar and skimmed milk",
            "is_stock_item": 1,
            "standard_rate": 30.00,
            "is_sales_item": 1,
            "variant_of": "COFFEE-TMPL",
            "attributes": [
                {"attribute": "Size", "attribute_value": "Large"},
                {"attribute": "Milk Type", "attribute_value": "Skimmed"},
                {"attribute": "Sugar Level", "attribute_value": "Low"}
            ],
            "kitchen_station": "Beverage Station"
        }
    ]
    
    # Create variants for Burger template
    burger_variants = [
        {
            "doctype": "Item",
            "item_code": "BURGER-DBL-BEEF-CHEESE",
            "item_name": "Double Beef Burger with Cheese",
            "item_group": "Fast Food",
            "stock_uom": "Nos",
            "description": "Double beef patty burger with cheese",
            "is_stock_item": 1,
            "standard_rate": 65.00,
            "is_sales_item": 1,
            "variant_of": "BURGER-TMPL",
            "attributes": [
                {"attribute": "Patty Type", "attribute_value": "Beef"},
                {"attribute": "Size", "attribute_value": "Double"},
                {"attribute": "Cheese", "attribute_value": "Yes"}
            ],
            "kitchen_station": "Grill Station"
        },
        {
            "doctype": "Item",
            "item_code": "BURGER-SGL-CHKN-NOCHEESE",
            "item_name": "Single Chicken Burger No Cheese",
            "item_group": "Fast Food",
            "stock_uom": "Nos",
            "description": "Single chicken patty burger without cheese",
            "is_stock_item": 1,
            "standard_rate": 45.00,
            "is_sales_item": 1,
            "variant_of": "BURGER-TMPL",
            "attributes": [
                {"attribute": "Patty Type", "attribute_value": "Chicken"},
                {"attribute": "Size", "attribute_value": "Single"},
                {"attribute": "Cheese", "attribute_value": "No"}
            ],
            "kitchen_station": "Grill Station"
        }
    ]
    
    # Create Simple Items
    for item in simple_items:
        if not frappe.db.exists("Item", item["item_code"]):
            doc = frappe.get_doc(item)
            doc.insert()
            print(f"Created Item: {item['item_name']}")
    
    # Create Templates
    for template in templates:
        if not frappe.db.exists("Item", template["item_code"]):
            doc = frappe.get_doc(template)
            doc.insert()
            print(f"Created Template Item: {template['item_name']}")
    
    # Create Coffee Variants
    for variant in coffee_variants:
        if not frappe.db.exists("Item", variant["item_code"]):
            # Ensure template exists
            if frappe.db.exists("Item", variant["variant_of"]):
                doc = frappe.get_doc(variant)
                doc.insert()
                print(f"Created Coffee Variant: {variant['item_name']}")
    
    # Create Burger Variants
    for variant in burger_variants:
        if not frappe.db.exists("Item", variant["item_code"]):
            # Ensure template exists
            if frappe.db.exists("Item", variant["variant_of"]):
                doc = frappe.get_doc(variant)
                doc.insert()
                print(f"Created Burger Variant: {variant['item_name']}")


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