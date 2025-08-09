frappe.ui.form.on('POS Profile', {
    refresh: function(frm) {
        frm.set_query('branch', function() {
            return {
                query: 'restaurant_management.restaurant_management.utils.branch_permissions.get_allowed_branches_query'
            };
        });
    }
});
