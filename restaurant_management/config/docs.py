"""
Configuration for docs
"""

def get_context(context=None):
    context = context or {}
    context["brand_html"] = "Restaurant Management"
    return context
