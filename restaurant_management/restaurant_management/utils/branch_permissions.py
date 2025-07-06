import frappe
from typing import List, Optional

def get_allowed_branches_for_user(user=None) -> List[str]:
    """
    Get list of branch codes allowed for the user
    
    Args:
        user (str, optional): User to check. If not provided, uses current user
        
    Returns:
        List of branch codes the user has access to
    """
    if not user:
        user = frappe.session.user
    
    # System Manager and Administrator can access all branches
    if "System Manager" in frappe.get_roles(user) or user == "Administrator":
        return get_all_branch_codes()
    
    # Check if user has all branches access
    all_branches_access = frappe.db.get_value("User", user, "all_branches_access")
    if all_branches_access:
        return get_all_branch_codes()
    
    # Get user's assigned branches
    assigned_branches = frappe.get_all(
        "User Branch Assignment",
        filters={"parent": user},
        fields=["branch_code"]
    )
    
    return [b.branch_code for b in assigned_branches if b.branch_code]

def get_all_branch_codes() -> List[str]:
    """Get all active branch codes in the system"""
    branches = frappe.get_all("Branch", fields=["branch_code"])
    return [b.branch_code for b in branches if b.branch_code]

def user_has_branch_access(branch_code: str, user=None) -> bool:
    """
    Check if user has access to a specific branch
    
    Args:
        branch_code (str): Branch code to check
        user (str, optional): User to check. If not provided, uses current user
        
    Returns:
        bool: True if user has access to the branch, False otherwise
    """
    if not user:
        user = frappe.session.user
    
    # System Manager and Administrator can access all branches
    if "System Manager" in frappe.get_roles(user) or user == "Administrator":
        return True
    
    # Check if user has all branches access
    all_branches_access = frappe.db.get_value("User", user, "all_branches_access")
    if all_branches_access:
        return True
    
    # Get user's assigned branches
    assigned_branches = frappe.get_all(
        "User Branch Assignment",
        filters={"parent": user},
        fields=["branch_code"]
    )
    
    allowed_branch_codes = [b.branch_code for b in assigned_branches if b.branch_code]
    
    return branch_code in allowed_branch_codes

def filter_allowed_branches(branch_list, user=None) -> List[dict]:
    """
    Filter a list of branches to only those the user has access to
    
    Args:
        branch_list (list): List of branch dictionaries
        user (str, optional): User to check. If not provided, uses current user
        
    Returns:
        Filtered list of branches
    """
    if not user:
        user = frappe.session.user
    
    # System Manager and Administrator can access all branches
    if "System Manager" in frappe.get_roles(user) or user == "Administrator":
        return branch_list
    
    # Check if user has all branches access
    all_branches_access = frappe.db.get_value("User", user, "all_branches_access")
    if all_branches_access:
        return branch_list
    
    # Get user's assigned branches
    allowed_branch_codes = get_allowed_branches_for_user(user)
    
    # Filter the branch list
    return [branch for branch in branch_list if branch.get("branch_code") in allowed_branch_codes]

@frappe.whitelist()
def assign_all_branches_to_user(user):
    """
    Assign all branches to a user

    Args:
        user (str): User to assign branches to

    Returns:
        Dict with success status
    """
    if not user:
        return {"success": False, "message": "User not specified"}

    try:
        user_doc = frappe.get_doc("User", user)

        # Clear existing assignments
        user_doc.assigned_branches = []

        # Get all branches
        branches = frappe.get_all("Branch", fields=["name"])

        # Add each branch
        for branch in branches:
            user_doc.append("assigned_branches", {
                "branch": branch.name
            })

        user_doc.save()

        return {"success": True, "message": "All branches assigned successfully"}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Error assigning branches to user")
        return {"success": False, "message": str(e)}

@frappe.whitelist()
def get_allowed_branches_query(doctype, txt, searchfield, start, page_len, filters):
    """
    Get query for allowed branches (for use in Link fields)

    Args:
        doctype (str): DocType
        txt (str): Search text
        searchfield (str): Field to search
        start (int): Start index
        page_len (int): Page length
        filters (dict): Filters

    Returns:
        List of branches the user has access to
    """
    allowed_branch_codes = get_allowed_branches_for_user()

    # Build the query
    conditions = []
    if txt:
        conditions.append(f"(`tabBranch`.`name` LIKE '%{txt}%' OR `tabBranch`.`branch_code` LIKE '%{txt}%')")

    if allowed_branch_codes:
        # Convert list to SQL-safe format
        branch_codes_str = ", ".join([f"'{code}'" for code in allowed_branch_codes])
        conditions.append(f"`tabBranch`.`branch_code` IN ({branch_codes_str})")

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    # Execute query
    results = frappe.db.sql(f"""
        SELECT
            `tabBranch`.`name`,
            `tabBranch`.`branch_code`
        FROM `tabBranch`
        WHERE {where_clause}
        LIMIT {start}, {page_len}
    """)

    return results
