frappe.provide('erpnext.pos');
frappe.provide('restaurant_management.pos');

// Restaurant Mode customizations for ERPNext POS
restaurant_management.pos = {
    init: function() {
        // Initialize and extend POS with restaurant features
        this.extend_pos_item_selector();
        this.extend_pos_cart();
        this.extend_payment_controller();
        this.extend_pos_page();
    },

    // Check if we should activate restaurant mode
    is_restaurant_mode: function() {
        const pos_profile = cur_pos.pos_profile;
        return pos_profile && pos_profile.restaurant_mode === 1;
    },

    extend_pos_page: function() {
        if (!this.is_restaurant_mode()) return;

        // Save original show method
        const original_show = cur_pos.wrapper.pos_bill.show;

        // Override show method to initialize restaurant features
        cur_pos.wrapper.pos_bill.show = () => {
            original_show.call(cur_pos.wrapper.pos_bill);
            
            // Initialize restaurant UI after POS loads
            this.init_restaurant_ui();
        };
    },

    init_restaurant_ui: function() {
        // Add restaurant UI elements on POS load
        this.create_table_selector();
        this.adjust_pos_UI_for_restaurant();
    },

    create_table_selector: function() {
        // Create table selector panel
        const pos_bill = cur_pos.wrapper.pos_bill;
        const parent = pos_bill.find('.pos-bill-header');

        // Check if table selector already exists
        if (parent.find('.restaurant-table-selector').length) return;

        // Create table selector container
        const table_selector = $(`
            <div class="restaurant-table-selector">
                <div class="table-selector-header">
                    <span class="table-selector-title">Select Table</span>
                    <span class="table-selector-close" title="Hide Table Selector">×</span>
                </div>
                <div class="table-selector-body">
                    <div class="table-selector-search">
                        <input type="text" placeholder="Search tables..." class="table-search-input">
                    </div>
                    <div class="table-grid"></div>
                </div>
            </div>
        `).prependTo(parent);

        // Add styles for table selector
        $(`<style>
            .restaurant-table-selector {
                margin-bottom: 15px;
                background-color: var(--bg-color);
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .table-selector-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 15px;
                background-color: var(--gray-100);
                border-bottom: 1px solid var(--gray-300);
            }
            .table-selector-title {
                font-weight: bold;
                color: var(--text-color);
            }
            .table-selector-close {
                cursor: pointer;
                font-size: 20px;
                color: var(--gray-600);
            }
            .table-selector-close:hover {
                color: var(--gray-900);
            }
            .table-selector-body {
                padding: 15px;
            }
            .table-selector-search {
                margin-bottom: 10px;
            }
            .table-search-input {
                width: 100%;
                padding: 8px;
                border: 1px solid var(--gray-300);
                border-radius: 4px;
            }
            .table-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                gap: 10px;
                max-height: 300px;
                overflow-y: auto;
                padding-right: 5px;
            }
            .table-item {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 10px;
                background-color: var(--blue-100);
                border-radius: 4px;
                cursor: pointer;
                text-align: center;
                font-weight: 500;
                position: relative;
            }
            .table-item:hover {
                background-color: var(--blue-200);
            }
            .table-item.occupied {
                background-color: var(--red-100);
                cursor: pointer;
            }
            .table-item.selected {
                background-color: var(--primary);
                color: white;
            }
            .table-item-status {
                position: absolute;
                top: -5px;
                right: -5px;
                width: 10px;
                height: 10px;
                border-radius: 50%;
            }
            .status-available {
                background-color: var(--green-500);
            }
            .status-in-progress {
                background-color: var(--orange-500);
            }
            .table-indicator {
                display: flex;
                align-items: center;
                background-color: var(--control-bg);
                padding: 5px 10px;
                border-radius: 4px;
                margin-top: 10px;
            }
            .table-indicator-label {
                font-weight: bold;
                margin-right: 10px;
            }
            .table-indicator-value {
                color: var(--primary);
                font-weight: bold;
            }
            .restaurant-header-summary {
                display: flex;
                justify-content: space-between;
                padding: 10px 15px;
                background-color: var(--control-bg);
                border-radius: 4px;
                margin-top: 10px;
            }
            .restaurant-summary-item {
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .summary-value {
                font-weight: bold;
                font-size: 16px;
            }
            .summary-label {
                font-size: 11px;
                color: var(--text-muted);
                margin-top: 2px;
            }
        </style>`).appendTo(document.head);

        // Load tables from server
        this.load_tables();

        // Setup event handlers
        table_selector.find('.table-selector-close').on('click', () => {
            table_selector.slideUp();
        });

        table_selector.find('.table-search-input').on('input', (e) => {
            const search_value = $(e.target).val().toLowerCase();
            this.filter_tables(search_value);
        });

        // Add table indicator
        if (!parent.find('.table-indicator').length) {
            $(`
                <div class="table-indicator" style="display: none;">
                    <div class="table-indicator-label">Table:</div>
                    <div class="table-indicator-value"></div>
                </div>
            `).appendTo(parent);
        }

        // Add order summary
        if (!parent.find('.restaurant-header-summary').length) {
            $(`
                <div class="restaurant-header-summary" style="display: none;">
                    <div class="restaurant-summary-item">
                        <div class="summary-value" data-summary="total_items">0</div>
                        <div class="summary-label">Items</div>
                    </div>
                    <div class="restaurant-summary-item">
                        <div class="summary-value" data-summary="in_kitchen">0</div>
                        <div class="summary-label">In Kitchen</div>
                    </div>
                    <div class="restaurant-summary-item">
                        <div class="summary-value" data-summary="ready">0</div>
                        <div class="summary-label">Ready</div>
                    </div>
                    <div class="restaurant-summary-item">
                        <div class="summary-value" data-summary="served">0</div>
                        <div class="summary-label">Served</div>
                    </div>
                </div>
            `).appendTo(parent);
        }
    },

    load_tables: function() {
        frappe.call({
            method: 'restaurant_management.api.pos_restaurant.get_tables',
            args: {
                pos_profile: cur_pos.pos_profile_data.name
            },
            callback: (r) => {
                if (r.message) {
                    this.render_tables(r.message);
                }
            }
        });
    },

    render_tables: function(tables) {
        const table_grid = $('.table-grid');
        table_grid.empty();

        tables.forEach(table => {
            const table_element = $(`
                <div class="table-item ${table.status !== 'Available' ? 'occupied' : ''}" 
                     data-table="${table.name}" 
                     data-table-number="${table.table_number}"
                     data-status="${table.status}"
                     data-order="${table.current_pos_order || ''}"
                     title="${table.status !== 'Available' ? 'Table occupied' : 'Table available'}">
                    ${table.table_number}
                    <div class="table-item-status status-${table.status.toLowerCase().replace(' ', '-')}"></div>
                </div>
            `).appendTo(table_grid);

            table_element.on('click', () => {
                this.handle_table_selection(table);
            });
        });
    },

    filter_tables: function(search_value) {
        $('.table-item').each(function() {
            const table_number = $(this).data('table-number').toString().toLowerCase();
            if (table_number.includes(search_value)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    },

    handle_table_selection: function(table) {
        // Clear previous selection
        $('.table-item').removeClass('selected');
        $(`.table-item[data-table="${table.name}"]`).addClass('selected');

        // Update table indicator
        $('.table-indicator').show();
        $('.table-indicator-value').text(table.table_number);

        // Load existing order or create new cart
        if (table.status !== 'Available' && table.current_pos_order) {
            this.load_waiter_order(table.current_pos_order, table);
        } else {
            // Clear cart for new order
            cur_pos.cart.empty_cart();
            
            // Set table in cart
            cur_pos.cart.frm.doc.restaurant_table = table.name;
            cur_pos.cart.frm.doc.restaurant_table_number = table.table_number;
            
            // Hide order summary
            $('.restaurant-header-summary').hide();
        }
        
        // Hide table selector after selection
        $('.restaurant-table-selector').slideUp();
    },

    load_waiter_order: function(order_id, table) {
        frappe.call({
            method: 'restaurant_management.api.pos_restaurant.get_waiter_order',
            args: {
                order_id: order_id
            },
            callback: (r) => {
                if (r.message) {
                    const order = r.message;
                    
                    // Clear cart first
                    cur_pos.cart.empty_cart();
                    
                    // Set order reference
                    cur_pos.cart.frm.doc.restaurant_waiter_order = order.name;
                    cur_pos.cart.frm.doc.restaurant_table = table.name;
                    cur_pos.cart.frm.doc.restaurant_table_number = table.table_number;
                    
                    // Add items to cart
                    order.items.forEach(item => {
                        this.add_waiter_order_item_to_cart(item);
                    });
                    
                    // Update order summary
                    this.update_order_summary(order);
                    $('.restaurant-header-summary').show();
                }
            }
        });
    },

    add_waiter_order_item_to_cart: function(item) {
        if (!item.item_code) return;
        
        frappe.call({
            method: 'restaurant_management.api.pos_restaurant.get_item_details',
            args: {
                item_code: item.item_code
            },
            callback: (r) => {
                if (r.message) {
                    const item_details = r.message;
                    
                    // Create cart item
                    const args = {
                        item_code: item.item_code,
                        qty: item.qty,
                        rate: item.price || item_details.rate,
                        uom: item_details.stock_uom
                    };
                    
                    // Add waiter order item reference
                    args.waiter_order_item = item.name;
                    args.kitchen_status = item.status;
                    
                    // Add to cart
                    cur_pos.cart.add_item(args);
                    
                    // Update UI to show kitchen status
                    this.update_cart_item_ui(item);
                }
            }
        });
    },

    update_cart_item_ui: function(item) {
        // Find the cart item row
        setTimeout(() => {
            const cart_item = cur_pos.cart.wrapper.find(`.list-item[data-item-code="${item.item_code}"]`);
            
            if (cart_item.length) {
                // Add kitchen status indicator if not already present
                if (!cart_item.find('.kitchen-status').length) {
                    const status_colors = {
                        'Waiting': 'var(--red-500)',
                        'Cooking': 'var(--orange-500)',
                        'Ready': 'var(--green-500)',
                        'Served': 'var(--gray-500)'
                    };
                    
                    const status_color = status_colors[item.status] || 'var(--gray-500)';
                    
                    $(`
                        <div class="kitchen-status" style="
                            display: inline-block; 
                            margin-left: 8px;
                            padding: 2px 6px;
                            border-radius: 10px;
                            font-size: 10px;
                            color: white;
                            background-color: ${status_color};
                        ">
                            ${item.status}
                        </div>
                    `).appendTo(cart_item.find('.item-name'));
                }
            }
        }, 300); // Small delay to ensure cart is updated
    },

    update_order_summary: function(order) {
        // Calculate summary stats
        const total_items = order.items.reduce((sum, item) => sum + item.qty, 0);
        const in_kitchen = order.items.filter(item => ['Waiting', 'Cooking'].includes(item.status))
            .reduce((sum, item) => sum + item.qty, 0);
        const ready = order.items.filter(item => item.status === 'Ready')
            .reduce((sum, item) => sum + item.qty, 0);
        const served = order.items.filter(item => item.status === 'Served')
            .reduce((sum, item) => sum + item.qty, 0);
        
        // Update summary
        $('[data-summary="total_items"]').text(total_items);
        $('[data-summary="in_kitchen"]').text(in_kitchen);
        $('[data-summary="ready"]').text(ready);
        $('[data-summary="served"]').text(served);
    },

    adjust_pos_UI_for_restaurant: function() {
        if (!this.is_restaurant_mode()) return;
        
        // Hide unnecessary features in restaurant mode
        setTimeout(() => {
            // Hide customer selection if select_table_first is enabled
            if (cur_pos.pos_profile_data.select_table_first) {
                cur_pos.wrapper.find('.customer-section').hide();
            }
            
            // Add button to show table selector
            const action_buttons = cur_pos.wrapper.find('.pos-actions');
            
            if (!action_buttons.find('.select-table-btn').length) {
                $(`
                    <div class="select-table-btn" style="
                        background-color: var(--primary);
                        color: white;
                        padding: 8px 15px;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-left: 10px;
                        display: flex;
                        align-items: center;
                    ">
                        <span class="fa fa-table" style="margin-right: 5px;"></span>
                        <span>Select Table</span>
                    </div>
                `).appendTo(action_buttons).on('click', () => {
                    $('.restaurant-table-selector').slideDown();
                });
            }
        }, 500);
    },

    extend_pos_item_selector: function() {
        const original_get_items = cur_pos.item_selector.get_items;

        // Override get_items to filter by allowed item groups in restaurant mode
        cur_pos.item_selector.get_items = function(start, page_length, item_group = this.parent_item_group) {
            if (restaurant_management.pos.is_restaurant_mode() &&
                cur_pos.pos_profile_data.allowed_item_groups &&
                cur_pos.pos_profile_data.allowed_item_groups.length) {
                
                // Get allowed item groups from POS profile
                const allowed_groups = cur_pos.pos_profile_data.allowed_item_groups.map(
                    g => g.item_group
                );
                
                // Use original function but add filter for allowed groups
                const args = {
                    start: start,
                    page_length: page_length,
                    price_list: cur_pos.price_list,
                    item_group: item_group,
                    pos_profile: cur_pos.pos_profile_data.name,
                    search_value: this.search_field ? this.search_field.get_value() : '',
                    allowed_item_groups: allowed_groups
                };
                
                return new Promise(resolve => {
                    frappe.call({
                        method: 'restaurant_management.api.pos_restaurant.get_items',
                        freeze: false,
                        args: args,
                        callback: (r) => {
                            resolve(r.message);
                        }
                    });
                });
            } else {
                // Fall back to default behavior
                return original_get_items.call(this, start, page_length, item_group);
            }
        };
    },

    extend_pos_cart: function() {
        if (!this.is_restaurant_mode()) return;
        
        // Extend the update_item method to respect kitchen status
        const original_update_item = cur_pos.cart.update_item;
        
        cur_pos.cart.update_item = function(opts) {
            // Check if we're updating an item that's already been sent to kitchen
            const item = this.get_item(opts.item_code);
            
            if (item && item.waiter_order_item && !cur_pos.pos_profile_data.allow_add_item_post_kitchen) {
                // Only allow increasing quantity if explicitly allowed in POS profile
                const original_qty = item.qty;
                original_update_item.call(this, opts);
                
                // If quantity was reduced and this item is in kitchen, revert to original
                if (opts.qty < original_qty && ['Waiting', 'Cooking', 'Ready'].includes(item.kitchen_status)) {
                    frappe.show_alert({
                        message: __('Cannot reduce quantity of items already sent to kitchen'),
                        indicator: 'red'
                    });
                    opts.qty = original_qty;
                    original_update_item.call(this, opts);
                }
            } else {
                original_update_item.call(this, opts);
            }
        };
        
        // Extend the remove_item method to respect kitchen status
        const original_remove_item = cur_pos.cart.remove_item;
        
        cur_pos.cart.remove_item = function(opts) {
            // Check if we're removing an item that's already been sent to kitchen
            const item = this.get_item(opts.item_code);
            
            if (item && item.waiter_order_item && !cur_pos.pos_profile_data.allow_add_item_post_kitchen) {
                if (['Waiting', 'Cooking', 'Ready'].includes(item.kitchen_status)) {
                    frappe.show_alert({
                        message: __('Cannot remove items already sent to kitchen'),
                        indicator: 'red'
                    });
                    return;
                }
            }
            
            original_remove_item.call(this, opts);
        };
        
        // Extend submit_invoice to update waiter order
        const original_submit_invoice = cur_pos.cart.submit_invoice;
        
        cur_pos.cart.submit_invoice = function() {
            // Add restaurant-specific fields
            const doc = this.frm.doc;
            
            if (doc.restaurant_table) {
                // Add custom fields related to restaurant
                this.frm.set_value('restaurant_table', doc.restaurant_table);
                this.frm.set_value('restaurant_table_number', doc.restaurant_table_number);
                
                if (doc.restaurant_waiter_order) {
                    this.frm.set_value('restaurant_waiter_order', doc.restaurant_waiter_order);
                }
            // Automatically create/update Sales Order if setting enabled (for immediate invoicing)
            const pos_profile = cur_pos.pos_profile_data;
            if (pos_profile && pos_profile.auto_create_sales_order && doc.restaurant_waiter_order) {
                // We'll create Sales Order after successful invoice creation
                this.pending_sales_order = true;
            }
        }
        
        // Call original submit method
        return original_submit_invoice.call(this);
    };
    },

    extend_payment_controller: function() {
        if (!this.is_restaurant_mode()) return;

        // Extend the submit_invoice method to update waiter order and table
        const original_submit_action = erpnext.pos.payment.prototype.submit_action;

        erpnext.pos.payment.prototype.submit_action = function(print) {
            const me = this;

            // Call original method and handle result
            return original_submit_action.call(this, print)
                .then(function(result) {
                    // After successful payment, update waiter order and table
                    const doc = me.events.get_frm().doc;

                    if (doc.restaurant_waiter_order) {
                        // Update waiter order status
                        frappe.call({
                            method: 'restaurant_management.api.pos_restaurant.update_waiter_order_status',
                            args: {
                                waiter_order: doc.restaurant_waiter_order,
                                status: 'Paid'
                            },
                            callback: (r) => {
                                if (r.message && r.message.success) {
                                    frappe.show_alert({
                                        message: __('Waiter order updated'),
                                        indicator: 'green'
                                    });
}
                            }
                        });

                        // Automatically create or update Sales Order if needed based on setting
                        const pos_profile = cur_pos.pos_profile_data;
                        if (pos_profile && pos_profile.auto_create_sales_order) {
                            frappe.call({
                                method: 'restaurant_management.api.pos_restaurant.create_sales_order_from_waiter_order',
                                args: {
                                    waiter_order_id: doc.restaurant_waiter_order,
                                    pos_invoice: result.name
                                }
                            });
                        }
                    }

                    return result;
                });
        };
    }
};

// Initialize restaurant customizations when POS is ready
$(document).on('ready', function() {
    // Wait for POS to be fully initialized
    const check_pos_initialized = setInterval(function() {
        if (cur_pos && cur_pos.pos_profile_data) {
            clearInterval(check_pos_initialized);
            restaurant_management.pos.init();
        }
    }, 1000);
});
