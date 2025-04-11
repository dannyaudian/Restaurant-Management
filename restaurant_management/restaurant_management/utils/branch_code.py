from typing import Optional
import frappe

def get_branch_code_from_pos_profile(pos_profile: Optional[str] = None) -> Optional[str]:
    """Get branch code from POS Profile.
    
    Args:
        pos_profile: POS Profile name, if not provided will use default profile
        
    Returns:
        Branch code string or None if not found
    """
    if not pos_profile:
        # Get default POS Profile for current user
        pos_profile = frappe.db.get_value(
            "POS Profile User",
            {"user": frappe.session.user},
            "parent"
        )
    
    if not pos_profile:
        return None
    
    return frappe.db.get_value("POS Profile", pos_profile, "branch_code")

def set_branch_code_in_document(doc, method=None):
    """Set branch code in document before save.
    
    This is designed to be attached to before_save hook for documents.
    It will fetch the branch code from the POS Profile if available,
    or from the parent document if it's a child document.
    
    Args:
        doc: Document being saved
        method: Method being called (not used, only for hook compatibility)
    """
    if hasattr(doc, "branch_code") and not doc.branch_code:
        # First try to get from POS Profile if this is a POS transaction
        if hasattr(doc, "pos_profile") and doc.pos_profile:
            branch_code = get_branch_code_from_pos_profile(doc.pos_profile)
            if branch_code:
                doc.branch_code = branch_code
        
        # If still not set and it's a child of a document with branch_code, inherit it
        elif getattr(doc, "parent_doc", None) and hasattr(doc.parent_doc, "branch_code"):
            if doc.parent_doc.branch_code:
                doc.branch_code = doc.parent_doc.branch_code

def format_name_with_branch_code(doc, naming_series):
    """Format naming series with branch code.
    
    Args:
        doc: Document being named
        naming_series: Original naming series
        
    Returns:
        Formatted naming series with branch code
    """
    if "{branch_code}" in naming_series and hasattr(doc, "branch_code") and doc.branch_code:
        return naming_series.replace("{branch_code}", doc.branch_code)
    
    return naming_series
