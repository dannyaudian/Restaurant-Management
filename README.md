# Restaurant Management

Restaurant Management System for ERPNext

## Features

- POS Profile enhancements for restaurant management
- Table management
- Kitchen order management
- Restaurant-specific workflows

## Installation

### Prerequisites

- [Frappe](https://frappeframework.com/) and [ERPNext](https://erpnext.com) 15+
- Bench CLI installed

### Local Development

1. Clone the repository
   ```bash
   git clone https://github.com/<your-org>/Restaurant-Management.git
   cd Restaurant-Management
   ```
2. Create a Frappe bench (if you don't already have one) and install ERPNext.
   ```bash
   bench init frappe-bench --frappe-branch version-15
   cd frappe-bench
   bench get-app erpnext --branch version-15
   bench new-site site1.local
   bench --site site1.local install-app erpnext
   ```
3. Get the restaurant app and install it on your site.
   ```bash
   bench get-app ../Restaurant-Management
   bench --site site1.local install-app restaurant_management
   ```
4. Start the development server.
   ```bash
   bench start
   ```

5. Import fixtures
   ```bash
   bench --site <your-site> migrate
   ```
   This step loads fixtures like the workspace and dashboard. Fixtures are
   processed in alphabetical order, so `00_custom_field.json` ensures that
   all custom fields exist before later fixtures are applied.

## Opening the Workspace

Once your site is running, open ERPNext and select **Restaurant Management** from the modules list or navigate to `/app/restaurant-management`. The workspace provides quick links to common restaurant operations such as placing orders, viewing stations, and managing tables.

## Configuration

1. Log in and set up restaurant masters:
   - **Branches** – define each restaurant location.
   - **Tables** – create table records for each branch.
   - **Kitchen Stations** – configure stations and assign item groups.
2. Assign branch permissions to users if you operate multiple branches.
3. Link POS Profiles to branches and enable restaurant features.

## Typical Workflow

1. Waiters place orders from the **Waiter Order** page selecting the table and menu items.
2. Items appear on the appropriate **Station Display** for kitchen staff who update their status (Waiting → In Progress → Ready).
3. When items are served, the waiter marks them as served from the order page.
4. Finalize and pay the order through the POS once everything is completed.
5. Use the **Table Display** page to monitor active orders and table status across the restaurant.

## Troubleshooting

Running `bench migrate` may fail if fixture values conflict with existing data.

- **CannotChangeConstantError for "Is Fixed Asset"**: This occurs when a fixture
  tries to modify a constant field such as `is_fixed_asset` on **Item**. Delete
  the conflicting `Custom Field` or `Property Setter` and rerun `bench migrate`.

If you encounter other migration errors, ensure that the values in your fixture
JSON files match the records already present in the database, or remove the
offending records before migrating again.
