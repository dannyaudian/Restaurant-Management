import sys
from types import SimpleNamespace
from unittest.mock import MagicMock
import importlib

import pytest


@pytest.fixture
def stub_frappe(monkeypatch):
    db = SimpleNamespace(
        exists=lambda doctype, name: True,
        commit=MagicMock(),
        rollback=MagicMock(),
    )

    frappe_stub = SimpleNamespace(
        has_permission=lambda doctype, perm: True,
        utils=SimpleNamespace(has_common=lambda roles, user_roles: True),
        get_roles=lambda user: ["Waiter"],
        _dict=lambda d: _make_frappe_dict(d),
        _=lambda msg: msg,
        db=db,
        get_doc=lambda doctype, name: SimpleNamespace(name=name, branch="Main", branch_code="BR"),
        session=SimpleNamespace(user="tester"),
        new_doc=lambda doctype: _make_order_doc(),
        throw=lambda msg, exc=None: (_ for _ in ()).throw(Exception(msg)),
        log_error=lambda *args, **kwargs: None,
        get_traceback=lambda: "tb",
        whitelist=lambda **kwargs: (lambda f: f),
    )

    # expose stub modules
    sys.modules['frappe'] = frappe_stub
    sys.modules['frappe.utils'] = SimpleNamespace(now_datetime=lambda: "now", get_url=lambda x: "url", cint=int, flt=float)

    yield frappe_stub

    del sys.modules['frappe']
    del sys.modules['frappe.utils']


def _make_order_doc():
    doc = SimpleNamespace(items=[], submit=MagicMock())

    def insert():
        doc.name = "WO-001"

    doc.insert = MagicMock(side_effect=insert)
    return doc


def _make_frappe_dict(d):
    class FD:
        def __init__(self, data):
            self.__dict__.update(data)

        def get(self, key, default=None):
            return getattr(self, key, default)

        def __getattr__(self, item):
            return None

    return FD(d)


def test_create_order_rolls_back_on_table_failure(stub_frappe, monkeypatch):
    wo = importlib.import_module('restaurant_management.api.waiter_order')

    monkeypatch.setattr(wo, 'add_items_to_order', lambda order, items: None)

    def fail(*args, **kwargs):
        raise Exception('Table update failed')

    monkeypatch.setattr(wo, 'set_table_status', fail)

    result = wo.create_order(table='T1', items=[{'item_code': 'ITM-1', 'qty': 1}])

    assert result['success'] is False
    assert 'Table update failed' in result['message']
    assert stub_frappe.db.commit.call_count == 0
    assert stub_frappe.db.rollback.call_count >= 1
