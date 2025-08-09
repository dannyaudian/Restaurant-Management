frappe.ui.form.on('POS Invoice', {
    refresh: function(frm) {
        frm.set_query('branch', function() {
            return {
                query: 'restaurant_management.restaurant_management.utils.branch_permissions.get_allowed_branches_query'
            };
        });
    }
});

frappe.provide('erpnext.pos');
frappe.provide('restaurant_management.pos');

// Restaurant Mode customizations for ERPNext POS
restaurant_management.pos = {
    // Track initialization state
    initialized: false,
    initAttempts: 0,
    maxInitAttempts: 5,
    
    init: function() {
        // Initialize and extend POS with restaurant features
        try {
            // Validate POS Profile existence
            if (!cur_pos || !cur_pos.pos_profile_data) {
                if (this.initAttempts < this.maxInitAttempts) {
                    this.initAttempts++;
                    setTimeout(() => this.init(), 1000);
                    return;
                } else {
                    console.warn("Restaurant POS mode could not initialize - POS Profile not available");
                    return;
                }
            }
            
            this.extend_pos_item_selector();
            this.extend_pos_cart();
            this.extend_payment_controller();
            this.extend_pos_page();
            
            this.initialized = true;
            console.log("Restaurant POS extensions initialized successfully");
        } catch (error) {
            console.error("Error initializing restaurant POS extensions:", error);
            frappe.msgprint({
                title: __("Error"),
                indicator: "red",
                message: __("Could not initialize restaurant features. Please refresh the page and try again.")
            });
        }
    },

    // Check if we should activate restaurant mode
    is_restaurant_mode: function() {
        try {
            const pos_profile = cur_pos && cur_pos.pos_profile;
            return pos_profile && pos_profile.restaurant_mode === 1;
        } catch (error) {
            console.error("Error checking restaurant mode:", error);
            return false;
        }
    },

    extend_pos_page: function() {
        if (!this.is_restaurant_mode()) return;

        try {
            // Validate required objects
            if (!cur_pos.wrapper || !cur_pos.wrapper.pos_bill) {
                console.warn("POS bill wrapper not available, cannot extend POS page");
                return;
            }
            
            // Save original show method
            const original_show = cur_pos.wrapper.pos_bill.show;

            // Override show method to initialize restaurant features
            cur_pos.wrapper.pos_bill.show = () => {
                original_show.call(cur_pos.wrapper.pos_bill);
                
                // Initialize restaurant UI after POS loads
                this.init_restaurant_ui();
            };
        } catch (error) {
            console.error("Error extending POS page:", error);
        }
    },

    init_restaurant_ui: function() {
        try {
            // Add restaurant UI elements on POS load
            this.create_table_selector();
            this.adjust_pos_UI_for_restaurant();
        } catch (error) {
            console.error("Error initializing restaurant UI:", error);
            frappe.msgprint({
                title: __("UI Error"),
                indicator: "orange",
                message: __("Could not initialize restaurant UI components.")
            });
        }
    },

    create_table_selector: function() {
        try {
            // Create table selector panel
            const pos_bill = cur_pos.wrapper.pos_bill;
            if (!pos_bill) {
                console.warn("POS bill element not found, cannot create table selector");
                return;
            }
            
            const parent = pos_bill.find('.pos-bill-header');
            if (!parent.length) {
                console.warn("POS bill header not found, will retry table selector creation");
                setTimeout(() => this.create_table_selector(), 1000);
                return;
            }

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
            // Load tables from server
            this.load_tables();

            // Setup event handlers
            if (table_selector.find('.table-selector-close').length) {
                table_selector.find('.table-selector-close').on('click', () => {
                    table_selector.slideUp();
                });
            }

            if (table_selector.find('.table-search-input').length) {
                table_selector.find('.table-search-input').on('input', (e) => {
                    const search_value = $(e.target).val().toLowerCase();
                    this.filter_tables(search_value);
                });
            }

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
        } catch (error) {
            console.error("Error creating table selector:", error);
        }
    },

    load_tables: function() {
        try {
            // Validate POS profile
            if (!cur_pos || !cur_pos.pos_profile_data || !cur_pos.pos_profile_data.name) {
                console.warn("POS profile data not available, cannot load tables");
                return;
            }
            
            frappe.call({
                method: 'restaurant_management.api.pos_restaurant.get_tables',
                args: {
                    pos_profile: cur_pos.pos_profile_data.name
                },
                callback: (r) => {
                    if (r.message) {
                        this.render_tables(r.message);
                    } else {
                        // Handle empty response
                        const table_grid = $('.table-grid');
                        if (table_grid.length) {
                            table_grid.html('<div class="text-muted text-center p-4">No tables available</div>');
                        }
                    }
                },
                error: (err) => {
                    console.error("Error loading tables:", err);
                    frappe.msgprint({
                        title: __("Table Loading Failed"),
                        indicator: "red",
                        message: __("Could not load restaurant tables. Please check your internet connection.")
                    });
                    
                    // Display fallback message in grid
                    const table_grid = $('.table-grid');
                    if (table_grid.length) {
                        table_grid.html('<div class="text-muted text-center p-4">Failed to load tables</div>');
                    }
                }
            });
        } catch (error) {
            console.error("Error in load_tables:", error);
        }
    },

    render_tables: function(tables) {
        try {
            const table_grid = $('.table-grid');
            if (!table_grid.length) {
                console.warn("Table grid element not found, cannot render tables");
                return;
            }
            
            table_grid.empty();
            
            // Check if tables array exists and has items
            if (!Array.isArray(tables) || !tables.length) {
                table_grid.html('<div class="text-muted text-center p-4">No tables available</div>');
                return;
            }

            tables.forEach(table => {
                if (!table || !table.name) return; // Skip invalid tables
                
                const tableStatus = table.status || 'Unknown';
                const tableNumber = table.table_number || table.name;
                
                const table_element = $(`
                    <div class="table-item ${tableStatus !== 'Available' ? 'occupied' : ''}" 
                         data-table="${table.name}" 
                         data-table-number="${tableNumber}"
                         data-status="${tableStatus}"
                         data-order="${table.current_pos_order || ''}"
                         title="${tableStatus !== 'Available' ? 'Table occupied' : 'Table available'}">
                        ${tableNumber}
                        <div class="table-item-status status-${tableStatus.toLowerCase().replace(' ', '-')}"></div>
                    </div>
                `).appendTo(table_grid);

                table_element.on('click', () => {
                    this.handle_table_selection(table);
                });
            });
        } catch (error) {
            console.error("Error rendering tables:", error);
        }
    },

    filter_tables: function(search_value) {
        try {
            if (!search_value) {
                // If search is empty, show all tables
                $('.table-item').show();
                return;
            }
            
            $('.table-item').each(function() {
                const table_number = $(this).data('table-number');
                // Handle case where table number might be undefined
                if (table_number) {
                    const searchable = table_number.toString().toLowerCase();
                    if (searchable.includes(search_value)) {
                        $(this).show();
                    } else {
                        $(this).hide();
                    }
                } else {
                    // If no table number, just hide it
                    $(this).hide();
                }
            });
        } catch (error) {
            console.error("Error filtering tables:", error);
        }
    },

    handle_table_selection: function(table) {
        try {
            // Validate table object
            if (!table || !table.name) {
                frappe.msgprint({
                    title: __("Error"),
                    indicator: "red",
                    message: __("Invalid table selection")
                });
                return;
            }
            
            // Clear previous selection
            $('.table-item').removeClass('selected');
            $(`.table-item[data-table="${table.name}"]`).addClass('selected');

            // Update table indicator
            const tableIndicator = $('.table-indicator');
            if (tableIndicator.length) {
                tableIndicator.show();
                tableIndicator.find('.table-indicator-value').text(table.table_number || table.name);
            }

            // Validate POS cart
            if (!cur_pos || !cur_pos.cart) {
                console.error("POS cart not available");
                frappe.msgprint({
                    title: __("Error"),
                    indicator: "red",
                    message: __("POS system is not fully initialized. Please refresh the page.")
                });
                return;
            }

            // Load existing order or create new cart
            if (table.status !== 'Available' && table.current_pos_order) {
                this.load_waiter_order(table.current_pos_order, table);
            } else {
                // Clear cart for new order
                cur_pos.cart.empty_cart();
                
                // Set table in cart
                if (cur_pos.cart.frm && cur_pos.cart.frm.doc) {
                    cur_pos.cart.frm.doc.restaurant_table = table.name;
                    cur_pos.cart.frm.doc.restaurant_table_number = table.table_number || table.name;
                }
                
                // Hide order summary
                $('.restaurant-header-summary').hide();
            }
            
            // Hide table selector after selection
            $('.restaurant-table-selector').slideUp();
        } catch (error) {
            console.error("Error handling table selection:", error);
            frappe.msgprint({
                title: __("Error"),
                indicator: "red",
                message: __("Could not process table selection. Please try again.")
            });
        }
    },

    load_waiter_order: function(order_id, table) {
        try {
            // Validate parameters
            if (!order_id) {
                console.warn("No order ID provided, cannot load waiter order");
                return;
            }
            
            // Validate table object
            if (!table || !table.name) {
                console.warn("Invalid table object, cannot load waiter order");
                return;
            }
            
            frappe.call({
                method: 'restaurant_management.api.pos_restaurant.get_waiter_order',
                args: {
                    order_id: order_id
                },
                callback: (r) => {
                    if (r.message) {
                        const order = r.message;
                        
                        // Validate order and cart
                        if (!order || !order.name || !cur_pos.cart || !cur_pos.cart.frm) {
                            console.warn("Invalid order data or POS cart not available");
                            return;
                        }
                        
                        // Clear cart first
                        cur_pos.cart.empty_cart();
                        
                        // Set order reference
                        cur_pos.cart.frm.doc.restaurant_waiter_order = order.name;
                        cur_pos.cart.frm.doc.restaurant_table = table.name;
                        cur_pos.cart.frm.doc.restaurant_table_number = table.table_number || table.name;
                        
                        // Add items to cart if they exist
                        if (Array.isArray(order.items) && order.items.length > 0) {
                            order.items.forEach(item => {
                                this.add_waiter_order_item_to_cart(item);
                            });
                            
                            // Update order summary
                            this.update_order_summary(order);
                            $('.restaurant-header-summary').show();
                        } else {
                            frappe.msgprint({
                                title: __("Empty Order"),
                                indicator: "orange",
                                message: __("This order contains no items.")
                            });
                            $('.restaurant-header-summary').hide();
                        }
                    } else {
                        frappe.msgprint({
                            title: __("Order Not Found"),
                            indicator: "red",
                            message: __("Could not load the order details.")
                        });
                    }
                },
                error: (err) => {
                    console.error("Error loading waiter order:", err);
                    frappe.msgprint({
                        title: __("Loading Failed"),
                        indicator: "red",
                        message: __("Failed to load order details. Please try again.")
                    });
                }
            });
        } catch (error) {
            console.error("Error in load_waiter_order:", error);
        }
    },

    add_waiter_order_item_to_cart: function(item) {
        try {
            // Validate item
            if (!item || !item.item_code) {
                console.warn("Invalid item, cannot add to cart");
                return;
            }
            
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
                            qty: item.qty || 1,
                            rate: item.price || (item_details && item_details.rate) || 0,
                            uom: (item_details && item_details.stock_uom) || 'Nos'
                        };
                        
                        // Add waiter order item reference
                        if (item.name) {
                            args.waiter_order_item = item.name;
                        }
                        
                        if (item.status) {
                            args.kitchen_status = item.status;
                        }
                        
                        // Validate cart before adding
                        if (!cur_pos.cart || typeof cur_pos.cart.add_item !== 'function') {
                            console.error("POS cart not available or add_item method missing");
                            return;
                        }
                        
                        // Add to cart
                        cur_pos.cart.add_item(args);
                        
                        // Update UI to show kitchen status
                        this.update_cart_item_ui(item);
                    } else {
                        console.warn(`Could not get details for item ${item.item_code}`);
                    }
                },
                error: (err) => {
                    console.error("Error getting item details:", err);
                    frappe.msgprint({
                        title: __("Item Loading Failed"),
                        indicator: "red",
                        message: __("Could not load details for item: ") + (item.item_name || item.item_code)
                    });
                }
            });
        } catch (error) {
            console.error("Error adding waiter order item to cart:", error);
        }
    },

    update_cart_item_ui: function(item) {
        try {
            // Validate item
            if (!item || !item.item_code) return;
            
            // Find the cart item row with retry mechanism
            let attempts = 0;
            const maxAttempts = 5;
            
            const updateUI = () => {
                if (attempts >= maxAttempts) return;
                attempts++;
                
                const cart_item = cur_pos.cart.wrapper.find(`.list-item[data-item-code="${item.item_code}"]`);
                
                if (cart_item.length) {
                    // Add kitchen status indicator if not already present
                    if (!cart_item.find('.kitchen-status').length && item.status) {
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
                } else {
                    // Retry after a delay if cart item not found
                    setTimeout(updateUI, 100 * attempts);
                }
            };
            
            // Start the update process with initial delay
            setTimeout(updateUI, 300);
        } catch (error) {
            console.error("Error updating cart item UI:", error);
        }
    },

    update_order_summary: function(order) {
        try {
            // Validate order object
            if (!order || !Array.isArray(order.items)) {
                console.warn("Invalid order for summary update");
                return;
            }
            
            // Calculate summary stats
            let total_items = 0;
            let in_kitchen = 0;
            let ready = 0;
            let served = 0;
            
            // Safely calculate values
            order.items.forEach(item => {
                if (!item) return;
                
                const qty = item.qty || 0;
                total_items += qty;
                
                if (item.status) {
                    if (['Waiting', 'Cooking'].includes(item.status)) {
                        in_kitchen += qty;
                    } else if (item.status === 'Ready') {
                        ready += qty;
                    } else if (item.status === 'Served') {
                        served += qty;
                    }
                }
            });
            
            // Update summary
            $('[data-summary="total_items"]').text(total_items);
            $('[data-summary="in_kitchen"]').text(in_kitchen);
            $('[data-summary="ready"]').text(ready);
            $('[data-summary="served"]').text(served);
        } catch (error) {
            console.error("Error updating order summary:", error);
        }
    },

    adjust_pos_UI_for_restaurant: function() {
        if (!this.is_restaurant_mode()) return;
        
        try {
            // Hide unnecessary features in restaurant mode
            setTimeout(() => {
                // Check if POS profile and wrapper exist
                if (!cur_pos || !cur_pos.pos_profile_data || !cur_pos.wrapper) {
                    console.warn("POS profile data or wrapper not available, cannot adjust UI");
                    return;
                }
                
                // Hide customer selection if select_table_first is enabled
                if (cur_pos.pos_profile_data.select_table_first) {
                    const customerSection = cur_pos.wrapper.find('.customer-section');
                    if (customerSection.length) {
                        customerSection.hide();
                    }
                }
                
                // Add button to show table selector
                const action_buttons = cur_pos.wrapper.find('.pos-actions');
                
                if (action_buttons.length && !action_buttons.find('.select-table-btn').length) {
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
        } catch (error) {
            console.error("Error adjusting POS UI for restaurant:", error);
        }
    },

    extend_pos_item_selector: function() {
        try {
            // Validate POS and item selector existence
            if (!cur_pos || !cur_pos.item_selector || typeof cur_pos.item_selector.get_items !== 'function') {
                console.warn("POS item selector not available, cannot extend");
                return;
            }
            
            const original_get_items = cur_pos.item_selector.get_items;

            // Override get_items to filter by allowed item groups in restaurant mode
            cur_pos.item_selector.get_items = function(start, page_length, item_group = this.parent_item_group) {
                if (restaurant_management.pos.is_restaurant_mode() &&
                    cur_pos.pos_profile_data &&
                    cur_pos.pos_profile_data.allowed_item_groups &&
                    Array.isArray(cur_pos.pos_profile_data.allowed_item_groups) &&
                    cur_pos.pos_profile_data.allowed_item_groups.length) {
                    
                    // Get allowed item groups from POS profile
                    const allowed_groups = cur_pos.pos_profile_data.allowed_item_groups.map(
                        g => g && g.item_group
                    ).filter(Boolean); // Filter out any undefined or null values
                    
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
                                resolve(r.message || []);
                            },
                            error: (err) => {
                                console.error("Error getting filtered items:", err);
                                frappe.msgprint({
                                    title: __("Loading Error"),
                                    indicator: "red",
                                    message: __("Could not load menu items. Please try again.")
                                });
                                resolve([]);
                            }
                        });
                    });
                } else {
                    // Fall back to default behavior
                    return original_get_items.call(this, start, page_length, item_group);
                }
            };
        } catch (error) {
            console.error("Error extending POS item selector:", error);
        }
    },

    extend_pos_cart: function() {
        if (!this.is_restaurant_mode()) return;
        
        try {
            // Validate cart existence
            if (!cur_pos || !cur_pos.cart) {
                console.warn("POS cart not available, cannot extend");
                return;
            }
            
            // Extend the update_item method to respect kitchen status
            if (typeof cur_pos.cart.update_item === 'function') {
                const original_update_item = cur_pos.cart.update_item;
                
                cur_pos.cart.update_item = function(opts) {
                    try {
                        // Check if we're updating an item that's already been sent to kitchen
                        const item = this.get_item(opts.item_code);
                        
                        // Validate POS profile data
                        const allow_edit = cur_pos.pos_profile_data && 
                                        cur_pos.pos_profile_data.allow_add_item_post_kitchen;
                        
                        if (item && item.waiter_order_item && !allow_edit) {
                            // Only allow increasing quantity if explicitly allowed in POS profile
                            const original_qty = item.qty;
                            original_update_item.call(this, opts);
                            
                            // If quantity was reduced and this item is in kitchen, revert to original
                            if (opts.qty < original_qty && ['Waiting', 'Cooking', 'Ready'].includes(item.kitchen_status)) {
                                frappe.msgprint({
                                    title: __('Cannot Modify Order'),
                                    indicator: 'red',
                                    message: __('Cannot reduce quantity of items already sent to kitchen')
                                });
                                opts.qty = original_qty;
                                original_update_item.call(this, opts);
                            }
                        } else {
                            original_update_item.call(this, opts);
                        }
                    } catch (error) {
                        console.error("Error in cart update_item override:", error);
                        original_update_item.call(this, opts);
                    }
                };
            }
            
            // Extend the remove_item method to respect kitchen status
            if (typeof cur_pos.cart.remove_item === 'function') {
                const original_remove_item = cur_pos.cart.remove_item;
                
                cur_pos.cart.remove_item = function(opts) {
                    try {
                        // Check if we're removing an item that's already been sent to kitchen
                        const item = this.get_item(opts.item_code);
                        
                        // Validate POS profile data
                        const allow_edit = cur_pos.pos_profile_data && 
                                        cur_pos.pos_profile_data.allow_add_item_post_kitchen;
                        
                        if (item && item.waiter_order_item && !allow_edit) {
                            if (['Waiting', 'Cooking', 'Ready'].includes(item.kitchen_status)) {
                                frappe.msgprint({
                                    title: __('Cannot Modify Order'),
                                    indicator: 'red',
                                    message: __('Cannot remove items already sent to kitchen')
                                });
                                return;
                            }
                        }
                        
                        original_remove_item.call(this, opts);
                    } catch (error) {
                        console.error("Error in cart remove_item override:", error);
                        // In case of error, fall back to original method
                        original_remove_item.call(this, opts);
                    }
                };
            }
            
            // Extend submit_invoice to update waiter order
            if (typeof cur_pos.cart.submit_invoice === 'function') {
                const original_submit_invoice = cur_pos.cart.submit_invoice;
                
                cur_pos.cart.submit_invoice = function() {
                    try {
                        // Add restaurant-specific fields
                        if (this.frm && this.frm.doc) {
                            const doc = this.frm.doc;
                            
                            if (doc.restaurant_table) {
                                // Add custom fields related to restaurant
                                this.frm.set_value('restaurant_table', doc.restaurant_table);
                                this.frm.set_value('restaurant_table_number', doc.restaurant_table_number);
                                
                                if (doc.restaurant_waiter_order) {
                                    this.frm.set_value('restaurant_waiter_order', doc.restaurant_waiter_order);
                                }
                            }
                            
                            // Automatically create/update Sales Order if setting enabled (for immediate invoicing)
                            if (cur_pos.pos_profile_data && 
                                cur_pos.pos_profile_data.auto_create_sales_order && 
                                doc.restaurant_waiter_order) {
                                // We'll create Sales Order after successful invoice creation
                                this.pending_sales_order = true;
                            }
                        }
                        
                        // Call original submit method
                        return original_submit_invoice.call(this);
                    } catch (error) {
                        console.error("Error in submit_invoice override:", error);
                        // In case of error, fall back to original method
                        return original_submit_invoice.call(this);
                    }
                };
            }
        } catch (error) {
            console.error("Error extending POS cart:", error);
        }
    },

    extend_payment_controller: function() {
        if (!this.is_restaurant_mode()) return;

        try {
            // Check if payment prototype exists
            if (!erpnext.pos.payment || !erpnext.pos.payment.prototype || 
                typeof erpnext.pos.payment.prototype.submit_action !== 'function') {
                console.warn("POS payment controller not available, cannot extend");
                return;
            }

            // Extend the submit_invoice method to update waiter order and table
            const original_submit_action = erpnext.pos.payment.prototype.submit_action;

            erpnext.pos.payment.prototype.submit_action = function(print) {
                const me = this;
                
                // Validate events and get_frm method
                if (!me.events || typeof me.events.get_frm !== 'function') {
                    console.warn("Payment controller events not available");
                    return original_submit_action.call(this, print);
                }

                // Call original method and handle result
                return original_submit_action.call(this, print)
                    .then(function(result) {
                        try {
                            // After successful payment, update waiter order and table
                            const frm = me.events.get_frm();
                            if (!frm || !frm.doc) {
                                console.warn("Invalid form in payment controller");
                                return result;
                            }
                            
                            const doc = frm.doc;

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
                                        } else {
                                            console.warn("Failed to update waiter order status");
                                        }
                                    },
                                    error: (err) => {
                                        console.error("Error updating waiter order status:", err);
                                        frappe.msgprint({
                                            title: __("Update Failed"),
                                            indicator: "orange",
                                            message: __("Order was paid but status update failed. This will be resolved automatically.")
                                        });
                                    }
                                });

                                // Automatically create or update Sales Order if needed based on setting
                                if (cur_pos.pos_profile_data && cur_pos.pos_profile_data.auto_create_sales_order) {
                                    frappe.call({
                                        method: 'restaurant_management.api.pos_restaurant.create_sales_order_from_waiter_order',
                                        args: {
                                            waiter_order_id: doc.restaurant_waiter_order,
                                            pos_invoice: result.name
                                        },
                                        error: (err) => {
                                            console.error("Error creating sales order:", err);
                                            frappe.msgprint({
                                                title: __("Sales Order Creation Failed"),
                                                indicator: "orange",
                                                message: __("Invoice was created but sales order creation failed. This can be handled manually.")
                                            });
                                        }
                                    });
                                }
                            }
                        } catch (error) {
                            console.error("Error in payment submit_action override:", error);
                        }

                        return result;
                    })
                    .catch(function(err) {
                        console.error("Error in original submit_action:", err);
                        frappe.msgprint({
                            title: __("Payment Processing Error"),
                            indicator: "red",
                            message: __("There was an error processing the payment. Please try again.")
                        });
                        throw err;
                    });
            };
        } catch (error) {
            console.error("Error extending payment controller:", error);
        }
    }
};

// Initialize restaurant customizations when POS is ready
$(document).on('ready', function() {
    try {
        // Wait for POS to be fully initialized with retry logic
        let initAttempts = 0;
        const maxInitAttempts = 10;
        
        const check_pos_initialized = setInterval(function() {
            initAttempts++;
            
            if (cur_pos && cur_pos.pos_profile_data) {
                clearInterval(check_pos_initialized);
                restaurant_management.pos.init();
            } else if (initAttempts >= maxInitAttempts) {
                // Give up after max attempts
                clearInterval(check_pos_initialized);
                console.warn("Restaurant POS extensions could not initialize - POS not ready after multiple attempts");
            }
        }, 1000);
    } catch (error) {
        console.error("Error in document ready handler:", error);
    }
});