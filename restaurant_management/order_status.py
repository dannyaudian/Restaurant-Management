"""Utilities for handling Waiter Order status transitions."""

VALID_STATUS_TRANSITIONS = {
    "Draft": ["Confirmed", "Cancelled"],
    "Confirmed": ["Served", "Cancelled"],
    "Served": ["Paid", "Cancelled"],
    "Paid": [],
    "Cancelled": [],
}


def is_valid_status_transition(current: str, new: str) -> bool:
    """Return True if transition from current to new is allowed."""
    return new in VALID_STATUS_TRANSITIONS.get(current, [])
