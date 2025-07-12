from erpnext.stock.doctype.item.item import Item as ERPNextItem

class RestaurantItem(ERPNextItem):
    def after_insert(self):
        if self.has_variants:
            # Template item; don’t create Item Price
            return
        super().after_insert()

