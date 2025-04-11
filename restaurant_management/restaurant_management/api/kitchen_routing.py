from typing import Optional, List, Dict, Any
import frappe

def get_kitchen_station_for_item(item_group: str) -> Optional[str]:
    """Get the appropriate kitchen station for an item based on its item group.
    
    Args:
        item_group: The item group name to route
        
    Returns:
        The kitchen station name if found, None otherwise
    """
    # Check cache first for performance
    cache_key = f"kitchen_station_mapping:{item_group}"
    cached_station = frappe.cache().get_value(cache_key)
    if cached_station:
        return cached_station
    
    # Find all active kitchen stations that handle this item group
    stations = frappe.get_all(
        "Kitchen Station",
        filters={"is_active": 1},
        fields=["name", "station_name"]
    )
    
    for station in stations:
        # Check if this station handles the item group
        item_groups = frappe.get_all(
            "Kitchen Station Item Group",
            filters={"parent": station.name, "item_group": item_group},
            fields=["item_group"]
        )
        
        if item_groups:
            # Cache the result for faster future lookups (cache for 30 minutes)
            frappe.cache().set_value(cache_key, station.station_name, expires_in_sec=1800)
            return station.station_name
    
    return None

def get_kitchen_stations_for_items(items: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Group items by their assigned kitchen stations.
    
    Args:
        items: List of items with at least 'item_code' and 'item_group' properties
        
    Returns:
        Dictionary mapping kitchen station names to lists of items
    """
    result: Dict[str, List[Dict[str, Any]]] = {}
    unassigned_items: List[Dict[str, Any]] = []
    
    for item in items:
        item_group = item.get("item_group")
        if not item_group:
            # Try to get item group if not provided
            item_doc = frappe.get_doc("Item", item.get("item_code"))
            item_group = item_doc.item_group if item_doc else None
        
        if not item_group:
            unassigned_items.append(item)
            continue
        
        station = get_kitchen_station_for_item(item_group)
        if station:
            if station not in result:
                result[station] = []
            result[station].append(item)
        else:
            unassigned_items.append(item)
    
    # Add unassigned items under "Unassigned" key if any exist
    if unassigned_items:
        result["Unassigned"] = unassigned_items
    
    return result

@frappe.whitelist()
def route_order_to_kitchen_stations(order_items):
    """Route order items to appropriate kitchen stations.
    
    Args:
        order_items: JSON string of order items or list of item dictionaries
        
    Returns:
        Dictionary mapping kitchen stations to their items
    """
    if isinstance(order_items, str):
        import json
        order_items = json.loads(order_items)
    
    return get_kitchen_stations_for_items(order_items)
