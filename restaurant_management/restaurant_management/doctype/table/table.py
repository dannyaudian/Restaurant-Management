# Copyright (c) 2023, Danny Audian Pratama and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from typing import Optional, List, Dict, Any


class Table(Document):
    """
    Table represents a physical table in the restaurant.
    
    This doctype tracks restaurant tables with their status and current order.
    It automatically manages availability status based on order assignments
    and provides integration with Waiter Order.
    """
    
    def autoname(self):
        """Generate name using format {table_number}-{branch_code}"""
        if self.table_number and self.branch_code:
            self.name = f"{self.table_number}-{self.branch_code}"
        else:
            frappe.throw("Table Number and Branch Code are required")
    
    def validate(self):
        """
        Validate table document before saving:
        - Ensure table number is unique within a branch
        - Clear current_pos_order when status is Available
        - Sync availability status with order assignment
        """
        self.validate_unique_table_number()
        
        # Set branch_code from branch if not already set (for backward compatibility)
        if not self.branch_code and self.branch:
            self.branch_code = frappe.db.get_value("Branch", self.branch, "branch_code")
        
        # Clear current_pos_order when status is Available
        if self.status == "Available":
            self.current_pos_order = None
        
        # Sync availability status with order assignment
        self.is_available = 1 if not self.current_pos_order else 0
    
    def validate_unique_table_number(self):
        """Ensure table number is unique within a branch"""
        if self.table_number and self.branch:
            # Check if there's already a table with the same number in this branch
            duplicate_exists = frappe.db.exists(
                "Table", 
                {
                    "branch": self.branch, 
                    "table_number": self.table_number,
                    "name": ("!=", self.name)
                }
            )
            
            if duplicate_exists:
                frappe.throw("Table Number must be unique per Branch.")
        
        # Keep the existing validation for branch_code as well for backward compatibility
        if self.table_number and self.branch_code:
            existing = frappe.db.get_value(
                "Table", 
                {
                    "table_number": self.table_number, 
                    "branch_code": self.branch_code,
                    "name": ("!=", self.name)
                }, 
                "name"
            )
            if existing:
                frappe.throw(f"Table {self.table_number} already exists in branch {self.branch_code}")


def update_table_status(table_name: str, new_status: str, order_id: Optional[str] = None) -> Optional[Document]:
    """
    Update the table status and optionally link/unlink to a Waiter Order.
    
    Args:
        table_name: Name of the table to update
        new_status: New status to set ("Available", "In Progress", etc.)
        order_id: Optional Waiter Order ID to link with the table
    
    Returns:
        The updated table document or None if an error occurred
    """
    logger = frappe.logger("table")
    
    try:
        # Get the table document
        table = frappe.get_doc("Table", table_name)
        old_status = table.status
        old_order = table.current_pos_order
        
        # Update table status
        table.status = new_status
        
        # Update order reference and availability based on status
        if new_status == "Available":
            table.current_pos_order = None
            table.is_available = 1
        elif order_id:
            table.current_pos_order = order_id
            table.is_available = 0
        
        # Save the changes
        table.save()
        
        # Log the status change
        logger.info(
            f"Table {table_name} status changed from '{old_status}' to '{new_status}'. "
            f"Order changed from '{old_order}' to '{table.current_pos_order}'. "
            f"Availability set to {table.is_available}"
        )
        
        return table
    
    except Exception as e:
        logger.error(f"Failed to update table {table_name}: {str(e)}")
        frappe.throw(f"Failed to update table: {str(e)}")
        return None


def assign_table_to_order(table_name: str, order_id: str) -> Optional[Document]:
    """
    Assign a table to a waiter order and mark it as unavailable.
    
    Args:
        table_name: Name of the table to assign
        order_id: Waiter Order ID to link with the table
    
    Returns:
        The updated table document or None if an error occurred
    """
    return update_table_status(table_name, "In Progress", order_id)


def release_table_from_order(table_name: str) -> Optional[Document]:
    """
    Release a table from a waiter order and mark it as available.
    
    Args:
        table_name: Name of the table to release
    
    Returns:
        The updated table document or None if an error occurred
    """
    return update_table_status(table_name, "Available", None)


def get_tables_by_branch(branch: str, include_inactive: bool = False) -> List[Dict[str, Any]]:
    """
    Get all tables for a specific branch.
    
    Args:
        branch: Branch to filter tables by
        include_inactive: Whether to include inactive tables
    
    Returns:
        List of table documents as dictionaries
    """
    filters = {"branch": branch}
    if not include_inactive:
        filters["is_active"] = 1
    
    tables = frappe.get_all(
        "Table",
        filters=filters,
        fields=[
            "name", "table_number", "branch", "branch_code", 
            "status", "current_pos_order", "is_available", 
            "seating_capacity", "is_active"
        ],
        order_by="table_number"
    )
    
    return tables


def get_available_tables(branch: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Get all available tables, optionally filtered by branch.
    
    Args:
        branch: Optional branch to filter tables by
    
    Returns:
        List of available table documents as dictionaries
    """
    filters = {
        "is_active": 1,
        "is_available": 1
    }
    
    if branch:
        filters["branch"] = branch
    
    tables = frappe.get_all(
        "Table",
        filters=filters,
        fields=[
            "name", "table_number", "branch", "branch_code", 
            "status", "seating_capacity"
        ],
        order_by="table_number"
    )
    
    return tables


def get_active_orders_by_branch(branch: str) -> List[Dict[str, Any]]:
    """
    Get all active orders with tables for a specific branch.
    
    Args:
        branch: Branch to filter tables by
    
    Returns:
        List of tables with active orders as dictionaries
    """
    tables = frappe.get_all(
        "Table",
        filters={
            "branch": branch,
            "is_active": 1,
            "current_pos_order": ["is", "set"]
        },
        fields=[
            "name", "table_number", "status", "current_pos_order",
            "seating_capacity"
        ],
        order_by="table_number"
    )
    
    # Enhance with order details
    for table in tables:
        if table.get("current_pos_order"):
            order = frappe.get_value(
                "Waiter Order",
                table.get("current_pos_order"),
                ["status", "order_time", "ordered_by", "total_amount"],
                as_dict=True
            )
            if order:
                table.update({
                    "order_status": order.status,
                    "order_time": order.order_time,
                    "ordered_by": order.ordered_by,
                    "order_amount": order.total_amount
                })
    
    return tables