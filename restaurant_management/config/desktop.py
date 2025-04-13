from frappe import _

def get_data():
    return [
        {
            "module_name": "Restaurant Management",
            "type": "module",
            "label": _("Restaurant Management"),
            "color": "orange",
            "icon": "octicon octicon-utensils",  # pakai icon apapun yang kamu mau
            "is_standard": 1,
        }
    ]
