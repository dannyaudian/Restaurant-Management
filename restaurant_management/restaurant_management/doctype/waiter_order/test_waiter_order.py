import importlib
import sys
import types

import pytest
from restaurant_management.order_status import is_valid_status_transition


def test_valid_status_transitions():
    assert is_valid_status_transition("Draft", "Confirmed")
    assert is_valid_status_transition("Confirmed", "Served")
    assert is_valid_status_transition("Served", "Paid")


def test_invalid_status_transitions():
    assert not is_valid_status_transition("Draft", "Paid")
    assert not is_valid_status_transition("Paid", "Confirmed")
    assert not is_valid_status_transition("Cancelled", "Draft")


def test_resolve_item_variant(monkeypatch):
    """Ensure resolve_item_variant returns matching variant"""
    fake_frappe = types.ModuleType("frappe")

    def fake_whitelist(*args, **kwargs):
        def decorator(fn):
            return fn

        return decorator

    fake_frappe.whitelist = fake_whitelist

    variants = [
        types.SimpleNamespace(item_code="ITEM-RED-LARGE", item_name="Red Large"),
        types.SimpleNamespace(item_code="ITEM-BLUE-SMALL", item_name="Blue Small"),
    ]
    variant_attrs = {
        "ITEM-RED-LARGE": [
            types.SimpleNamespace(attribute="Color", attribute_value="Red"),
            types.SimpleNamespace(attribute="Size", attribute_value="Large"),
        ],
        "ITEM-BLUE-SMALL": [
            types.SimpleNamespace(attribute="Color", attribute_value="Blue"),
            types.SimpleNamespace(attribute="Size", attribute_value="Small"),
        ],
    }

    def fake_get_all(doctype, filters=None, fields=None):
        if doctype == "Item":
            return variants
        if doctype == "Item Variant Attribute":
            return variant_attrs[filters["parent"]]
        return []

    fake_frappe.get_all = fake_get_all
    fake_frappe.db = types.SimpleNamespace()
    fake_frappe.get_doc = lambda *a, **k: None
    fake_frappe.logger = lambda *a, **k: types.SimpleNamespace(
        info=lambda *a, **k: None,
        warning=lambda *a, **k: None,
        error=lambda *a, **k: None,
    )

    monkeypatch.setitem(sys.modules, "frappe", fake_frappe)
    monkeypatch.setitem(sys.modules, "frappe.model", types.ModuleType("frappe.model"))
    monkeypatch.setitem(
        sys.modules, "frappe.model.document", types.SimpleNamespace(Document=object)
    )
    monkeypatch.setitem(
        sys.modules,
        "frappe.model.naming",
        types.SimpleNamespace(make_autoname=lambda series: series),
    )
    monkeypatch.setitem(
        sys.modules,
        "frappe.utils",
        types.SimpleNamespace(now_datetime=lambda: None, flt=float),
    )

    module = importlib.import_module(
        "restaurant_management.restaurant_management.doctype.waiter_order.waiter_order"
    )

    result = module.resolve_item_variant(
        "TEMPLATE", {"Color": "Red", "Size": "Large"}
    )

    assert result.item_code == "ITEM-RED-LARGE"
    assert result.item_name == "Red Large"
