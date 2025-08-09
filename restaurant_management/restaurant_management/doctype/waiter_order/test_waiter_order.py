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
