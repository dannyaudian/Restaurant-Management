import json


def get_item_variant_attributes(template_item_code=None, item_code=None):
    """Get variant attributes for a template item.

    Args:
        template_item_code: Code of the template item.
        item_code: Alternative item code to use as template.

    Returns:
        List of attribute dictionaries.
    """
    import importlib

    frappe = importlib.import_module("frappe")
    _ = getattr(frappe, "_", lambda m: m)

    template_item_code = template_item_code or item_code

    if not template_item_code or not frappe.db.exists("Item", template_item_code):
        frappe.throw(_("Item template not found"))

    has_variants = frappe.db.get_value("Item", template_item_code, "has_variants")
    if not has_variants:
        return []

    attributes = frappe.get_all(
        "Item Variant Attribute",
        fields=["name", "attribute", "field_name", "options"],
        filters={"parent": template_item_code},
        order_by="idx",
    )
    return attributes


def resolve_item_variant(template_item_code, attributes):
    """Resolve the appropriate variant based on selected attributes."""
    import importlib

    if isinstance(attributes, str):
        attributes = json.loads(attributes)

    frappe = importlib.import_module("frappe")
    _ = getattr(frappe, "_", lambda m: m)

    db_exists = getattr(getattr(frappe, "db", None), "exists", None)
    if callable(db_exists) and not db_exists("Item", template_item_code):
        frappe.throw(_("Item template not found"))

    variants = frappe.get_all(
        "Item",
        filters={"variant_of": template_item_code, "disabled": 0},
        fields=["item_code", "item_name"],
    )

    for variant in variants:
        variant_attributes = frappe.get_all(
            "Item Variant Attribute",
            fields=["attribute", "field_name", "attribute_value"],
            filters={"parent": variant.item_code},
        )

        match = True
        for attr, value in attributes.items():
            found = False
            for va in variant_attributes:
                field_name = getattr(va, "field_name", None)
                if (va.attribute == attr or field_name == attr) and va.attribute_value == value:
                    found = True
                    break
            if not found:
                match = False
                break
        if match:
            return variant

    frappe.throw(_("No matching variant found for selected attributes"))
