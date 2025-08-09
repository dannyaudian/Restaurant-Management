# Waiter Order Documentation

## Overview
The Waiter Order module provides both a web interface and DocType UI for managing restaurant orders, ensuring system reliability through dual interfaces. It handles restaurant order management, allowing waiters to take orders, send them to the kitchen, and track their status.
## Components

### DocType: Waiter Order
Main document type that stores order information including:
- Table assignment
- Order items
- Status tracking
- Totals calculation
- Branch information

#### Key Fields
- `table`: Link to Table DocType
- `waiter`: Link to Employee DocType
- `status`: Order status (Draft/Confirmed/Served/Paid/Cancelled)
- `items`: Child table of Waiter Order Items
- `total_qty`: Total quantity of items
- `total_amount`: Total order amount

#### Methods
- `validate()`: Validates order data before saving
- `validate_order_items()`: Ensures items meet requirements
- `on_submit()`: Updates table status when submitted
- `on_cancel()`: Reverts table status when cancelled

### DocType: Waiter Order Item
Child table that stores individual order items including:
- Item details
- Quantity and pricing
- Kitchen status tracking
- Variant handling

#### Key Fields
- `item_code`: Link to Item DocType
- `qty`: Ordered quantity  
- `rate`: Item rate
- `amount`: Total amount
- `status`: Kitchen status
- `kitchen_station`: Linked kitchen station

#### Methods
- `validate()`: Validates item data
- `calculate_amount()`: Calculates item total
- `validate_quantity()`: Checks quantity limits
- `fetch_item_details()`: Gets item information

### Web Interface
The waiter order interface provides:
- Table selection
- Menu browsing
- Order creation
- Kitchen status monitoring
- Print functionality

#### Key Features
- Real-time table status updates
- Item variant selection
- Order modification
- Kitchen routing
- Branch-based filtering

## API Endpoints

### Orders
- `create_order`: Create new waiter order
- `get_order`: Get order details
- `update_order_status`: Update order status
- `send_order_to_kitchen`: Send order to kitchen display
- `send_additional_items`: Add items to existing order

### Items
- `get_menu_items`: Get available menu items
- `get_item_variant_attributes`: Get item variants
- `resolve_item_variant`: Resolve selected variant
- `get_item_rate`: Get current item pricing

### Tables
- `get_available_tables`: Get available tables
- `update_table_status`: Update table status
- `assign_table_to_order`: Assign table to order
- `release_table`: Release table after order

## Configuration
The module requires:
- Branch setup
- Table configuration  
- Kitchen station mapping
- Item variant setup
- Price list configuration

## Permissions
Access controlled by:
- Restaurant Manager role
- Restaurant User role
- System Manager role

## Integration Points
Integrates with:
- POS system
- Kitchen Display System
- Table management
- Branch management

## Access Methods

### 1. Web Interface Route
```python
# Access via URL with required login
/waiter-order

# Route configuration in hooks.py
website_route_rules = [
    {
        "from_route": "/waiter-order",
        "to_route": "internal_ui/waiter_order",
        "hidden": True
    }
]
```

### 2. DocType Interface
```python
# Access via ERPNext Desk
Desk > Restaurant Management > Waiter Order
```

## Authentication & Security

### Web Interface
- Requires valid user login
- Role-based access control:
  ```python
  allowed_roles = [
      "Waiter",
      "Restaurant Supervisor",
      "Restaurant Manager",
      "System Manager"
  ]
  ```
- Session validation:
  ```python
  if frappe.session.user == "Guest":
      frappe.throw(_("Login required to access Waiter Order"))
  ```

### DocType Interface
- Standard ERPNext permission system
- Role-based permissions:
  ```json
  "permissions": [
    {
      "role": "Restaurant Manager",
      "read": 1,
      "write": 1,
      "create": 1,
      "delete": 1,
      "submit": 1,
      "cancel": 1
    },
    {
      "role": "Restaurant User",
      "read": 1,
      "write": 1,
      "create": 1,
      "submit": 1
    }
  ]
```
