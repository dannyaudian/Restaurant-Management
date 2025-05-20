

Based on the requirements, I'll rewrite the entire waiter_order.js file with improved DOM handling, proper loading sequence, and other requested enhancements. Here's the complete code:

```javascript
/**
 * Waiter Order Interface
 * Handles restaurant table selection, item ordering, and kitchen communication.
 */
(function() {
  'use strict';
  
  /**
   * @typedef {Object} TableData
   * @property {string} name - Table identifier
   * @property {string} table_number - Display number for the table
   * @property {Object} current_pos_order - Current active order if any
   */
  
  /**
   * @typedef {Object} OrderItem
   * @property {string} item_code - Item identifier
   * @property {string} item_name - Display name for the item
   * @property {number} qty - Quantity ordered
   * @property {Object} [attributes] - Optional variant attributes
   */

  // Application state
  const state = {
    tables: [],
    items: [],
    itemGroups: [],
    selectedTable: null,
    currentOrder: {
      items: [],
      sentItems: [] // keeps track of items already sent to kitchen
    },
    selectedItemTemplate: null,
    loading: false,
    orderSound: null
  };

  // DOM Elements map using kebab-case keys
  const elements = {
    'tables-container': null,
    'items-container': null,
    'item-search': null,
    'nav-tabs': null,
    'order-items-container': null,
    'selected-table-display': null,
    'send-to-kitchen-btn': null,
    'send-additional-btn': null,
    'variant-modal': null,
    'modal-overlay': null,
    'variant-item-name': null,
    'variant-attributes-container': null,
    'cancel-variant-btn': null,
    'add-variant-btn': null,
    'loading-overlay': null,
    'new-order-btn': null,
    'new-order-table-number': null
  };

  /**
   * Checks if all required DOM elements exist, creates minimal fallbacks if missing
   */
  function checkElements() {
    // Populate elements from DOM
    Object.keys(elements).forEach(id => {
      elements[id] = document.getElementById(id);
    });

    // Ensure loading overlay exists
    if (!elements['loading-overlay']) {
      const loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'loading-overlay';
      loadingOverlay.className = 'loading-overlay';
      loadingOverlay.innerHTML = '<div class="spinner"></div><div>Loading...</div>';
      document.body.appendChild(loadingOverlay);
      elements['loading-overlay'] = loadingOverlay;
      console.debug('Created missing loading-overlay element');
    }

    // Initialize sound if supported
    try {
      state.orderSound = new Audio('/assets/restaurant_management/sounds/ready_alert.mp3');
      state.orderSound.addEventListener('error', (e) => {
        console.error('Error loading order sound:', e.error);
      });
    } catch (err) {
      console.error('Audio not supported in this browser:', err.message);
    }
  }

  /**
   * Initialize the application
   */
  async function init() {
    try {
      checkElements();
      showLoading();
      
      await Promise.all([
        loadTables(),
        loadItems(),
        loadItemGroups()
      ]);
      
      renderItemGroupTabs();
      setupEventListeners();
      hideLoading();
    } catch (error) {
      console.error('Initialization error:', error);
      frappe?.throw?.(__(error.message || 'Failed to initialize waiter order page'));
      hideLoading();
    }
  }

  // Wait for DOM to be fully loaded before initialization
  document.addEventListener('DOMContentLoaded', init);

  /**
   * Data loading functions
   */
  async function loadTables() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_available_tables',
        freeze: false
      });
      
      state.tables = result.message || [];
      renderTables();
    } catch (error) {
      console.error('Error loading tables:', error);
      throw new Error('Failed to load tables');
    }
  }

  async function loadItems() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_menu_items',
        freeze: false
      });
      
      state.items = result.message || [];
      renderItems();
    } catch (error) {
      console.error('Error loading items:', error);
      throw new Error('Failed to load menu items');
    }
  }

  async function loadItemGroups() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_item_groups',
        freeze: false
      });
      
      state.itemGroups = result.message || [];
    } catch (error) {
      console.error('Error loading item groups:', error);
      throw new Error('Failed to load item groups');
    }
  }

  /**
   * Rendering functions
   */
  function renderTables() {
    const tablesContainer = elements['tables-container'];
    if (!tablesContainer) {
      console.error('Tables container element not found');
      return;
    }
    
    // Display only tables with active orders
    const activeTables = state.tables.filter(table => table.current_pos_order);
    
    if (!activeTables.length) {
      tablesContainer.innerHTML = '<div class="empty-message">No active orders</div>';
      return;
    }

    tablesContainer.innerHTML = activeTables.map(table => {
      const isSelected = state.selectedTable && state.selectedTable.name === table.name;
      return `
        <div class="table-button ${isSelected ? 'selected' : ''}" 
             data-table-id="${table.name}">
          ${table.table_number || table.name}
        </div>
      `;
    }).join('');
  }

  function renderItems(filterGroup = 'all', searchQuery = '') {
    const itemsContainer = elements['items-container'];
    if (!itemsContainer) {
      console.error('Items container element not found');
      return;
    }
    
    let filteredItems = state.items;
    
    // Filter by item group
    if (filterGroup !== 'all') {
      filteredItems = filteredItems.filter(item => item.item_group === filterGroup);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredItems = filteredItems.filter(item => 
        item.item_name.toLowerCase().includes(query) || 
        item.item_code.toLowerCase().includes(query)
      );
    }

    if (!filteredItems.length) {
      itemsContainer.innerHTML = '<div class="empty-message">No items found</div>';
      return;
    }

    itemsContainer.innerHTML = filteredItems.map(item => {
      return `
        <div class="item-button" data-item-code="${item.item_code}">
          <div>${item.item_name}</div>
          <small>${item.has_variants ? '(Has variants)' : ''}</small>
        </div>
      `;
    }).join('');
  }

  function renderItemGroupTabs() {
    const navTabs = elements['nav-tabs'];
    if (!navTabs) {
      console.error('Navigation tabs element not found');
      return;
    }
    
    // Add item category tabs
    const tabsHtml = state.itemGroups.map(group => 
      `<div class="nav-tab" data-group="${group.name}">${group.item_group_name}</div>`
    ).join('');
    
    navTabs.innerHTML = '<div class="nav-tab active" data-group="all">All</div>' + tabsHtml;
  
    // Event listener for tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        const itemSearch = elements['item-search'];
        const searchValue = itemSearch?.value || '';
        renderItems(this.getAttribute('data-group'), searchValue);
      });
    });
  }

  function renderOrderItems() {
    const orderItemsContainer = elements['order-items-container'];
    if (!orderItemsContainer) {
      console.error('Order items container element not found');
      return;
    }
    
    if (!state.currentOrder.items.length) {
      orderItemsContainer.innerHTML = '<div class="empty-order-message">No items added to order</div>';
      updateActionButtons();
      return;
    }

    orderItemsContainer.innerHTML = state.currentOrder.items.map((orderItem, index) => {
      const isSent = state.currentOrder.sentItems.some(
        sent => sent.item_code === orderItem.item_code && 
                JSON.stringify(sent.attributes || {}) === JSON.stringify(orderItem.attributes || {})
      );
      
      return `
        <div class="order-item ${isSent ? 'sent-item' : ''}" data-index="${index}">
          <div class="order-item-name">
            ${orderItem.item_name}
            ${orderItem.attributes ? 
              '<small>(' + Object.entries(orderItem.attributes).map(([k, v]) => `${k}: ${v}`).join(', ') + ')</small>' : 
              ''}
          </div>
          <div class="order-item-qty">
            <div class="qty-btn minus">-</div>
            <span style="margin: 0 5px;">${orderItem.qty}</span>
            <div class="qty-btn plus">+</div>
          </div>
          <div class="order-item-remove">✕</div>
        </div>
      `;
    }).join('');

    updateActionButtons();
  }

  function updateActionButtons() {
    const sendToKitchenBtn = elements['send-to-kitchen-btn'];
    const sendAdditionalBtn = elements['send-additional-btn'];
    
    // Update "Send to Kitchen" button state
    if (sendToKitchenBtn) {
      if (state.selectedTable && state.currentOrder.items.length > 0) {
        sendToKitchenBtn.classList.remove('disabled-btn');
      } else {
        sendToKitchenBtn.classList.add('disabled-btn');
      }
    }

    // Update "Send Additional Items" button state
    if (sendAdditionalBtn) {
      const hasNewItems = state.currentOrder.items.some(item => 
        !state.currentOrder.sentItems.some(
          sent => sent.item_code === item.item_code && 
                  JSON.stringify(sent.attributes || {}) === JSON.stringify(item.attributes || {})
        )
      );

      if (state.selectedTable && hasNewItems && state.currentOrder.sentItems.length > 0) {
        sendAdditionalBtn.classList.remove('disabled-btn');
      } else {
        sendAdditionalBtn.classList.add('disabled-btn');
      }
    }
  }

  function updateSelectedTableDisplay() {
    const selectedTableDisplay = elements['selected-table-display'];
    if (!selectedTableDisplay) return;
    
    if (state.selectedTable) {
      selectedTableDisplay.textContent = `Selected Table: ${state.selectedTable.table_number || state.selectedTable.name}`;
    } else {
      selectedTableDisplay.textContent = 'No table selected';
    }
  }

  /**
   * Event handlers
   */
  function setupEventListeners() {
    // Make sure elements exist before attaching listeners
    checkElements();
    
    // Event for active table selection (edit order)
    const tablesContainer = elements['tables-container'];
    if (tablesContainer) {
      tablesContainer.addEventListener('click', handleTableSelection);
    }
    
    // Event for "New Order" button
    const newOrderBtn = elements['new-order-btn'];
    if (newOrderBtn) {
      newOrderBtn.addEventListener('click', handleNewOrder);
    }

    // Event for item selection
    const itemsContainer = elements['items-container'];
    if (itemsContainer) {
      itemsContainer.addEventListener('click', handleItemSelection);
    }
    
    // Event for item search
    const itemSearch = elements['item-search'];
    if (itemSearch) {
      itemSearch.addEventListener('input', handleItemSearch);
    }
    
    // Event for order item operations
    const orderItemsContainer = elements['order-items-container'];
    if (orderItemsContainer) {
      orderItemsContainer.addEventListener('click', handleOrderItemActions);
    }
    
    // Events for kitchen send buttons
    const sendToKitchenBtn = elements['send-to-kitchen-btn'];
    if (sendToKitchenBtn) {
      sendToKitchenBtn.addEventListener('click', handleSendToKitchen);
    }
    
    const sendAdditionalBtn = elements['send-additional-btn'];
    if (sendAdditionalBtn) {
      sendAdditionalBtn.addEventListener('click', handleSendAdditionalItems);
    }
    
    // Events for variant modal
    const cancelVariantBtn = elements['cancel-variant-btn'];
    if (cancelVariantBtn) {
      cancelVariantBtn.addEventListener('click', closeVariantModal);
    }
    
    const addVariantBtn = elements['add-variant-btn'];
    if (addVariantBtn) {
      addVariantBtn.addEventListener('click', handleAddVariant);
    }
    
    const modalOverlay = elements['modal-overlay'];
    if (modalOverlay) {
      modalOverlay.addEventListener('click', closeVariantModal);
    }
  }

  /**
   * Handle active table selection (from grid)
   * @param {Event} event - Click event
   */
  function handleTableSelection(event) {
    const tableButton = event.target.closest('.table-button');
    if (!tableButton) return;
    
    const tableId = tableButton.getAttribute('data-table-id');
    const table = state.tables.find(t => t.name === tableId);
    
    // Select or cancel selection
    if (state.selectedTable && state.selectedTable.name === tableId) {
      state.selectedTable = null;
    } else {
      state.selectedTable = table;
    }
    
    renderTables();
    updateSelectedTableDisplay();
    updateActionButtons();
  }

  /**
   * Handle new order creation
   */
  function handleNewOrder() {
    const newOrderTableNumber = elements['new-order-table-number'];
    if (!newOrderTableNumber) return;
    
    const tableNo = newOrderTableNumber.value.trim();
    if (!tableNo) {
      frappe?.msgprint?.(__(Error('Please enter a table number')));
      return;
    }
    
    // Find table by table_number or name
    const table = state.tables.find(t => (t.table_number || t.name) == tableNo);
    if (!table) {
      frappe?.msgprint?.(__(Error('No table found with that number')));
      return;
    }
    
    // Check if table is already in use
    if (table.current_pos_order) {
      frappe?.msgprint?.(__(Error('Table is not available. It already has an active order.')));
      return;
    }
    
    // Mark as new order (simulation; in real implementation, call API to create order)
    table.current_pos_order = {};
    state.selectedTable = table;
    updateSelectedTableDisplay();
    renderTables();
    
    frappe?.msgprint?.(__(Error('New order created at Table ')) + tableNo);
  }

  /**
   * Handle menu item selection
   * @param {Event} event - Click event
   */
  function handleItemSelection(event) {
    const itemButton = event.target.closest('.item-button');
    if (!itemButton) return;
    
    const itemCode = itemButton.getAttribute('data-item-code');
    const item = state.items.find(i => i.item_code === itemCode);
    
    if (!item) return;
    
    if (item.has_variants) {
      // Show variant selection modal
      state.selectedItemTemplate = item;
      showVariantModal(item);
    } else {
      // Add item directly to order
      addItemToOrder(item);
    }
  }

  /**
   * Handle item search input
   * @param {Event} event - Input event
   */
  function handleItemSearch(event) {
    const searchQuery = event.target.value;
    const activeGroupElem = document.querySelector('.nav-tab.active');
    const activeGroup = activeGroupElem ? activeGroupElem.getAttribute('data-group') : 'all';
    renderItems(activeGroup, searchQuery);
  }

  /**
   * Handle actions on order items (increase/decrease qty, remove)
   * @param {Event} event - Click event
   */
  function handleOrderItemActions(event) {
    const orderItemElem = event.target.closest('.order-item');
    if (!orderItemElem) return;
    
    const index = parseInt(orderItemElem.getAttribute('data-index'));
    
    if (event.target.classList.contains('plus')) {
      state.currentOrder.items[index].qty += 1;
      renderOrderItems();
    } else if (event.target.classList.contains('minus')) {
      if (state.currentOrder.items[index].qty > 1) {
        state.currentOrder.items[index].qty -= 1;
        renderOrderItems();
      }
    } else if (event.target.classList.contains('order-item-remove')) {
      state.currentOrder.items.splice(index, 1);
      renderOrderItems();
    }
  }

  /**
   * Send complete order to kitchen
   */
  async function handleSendToKitchen() {
    const sendToKitchenBtn = elements['send-to-kitchen-btn'];
    
    if (!state.selectedTable || 
        !state.currentOrder.items.length || 
        (sendToKitchenBtn && sendToKitchenBtn.classList.contains('disabled-btn'))) {
      return;
    }
    
    try {
      showLoading();
      
      const orderData = {
        table: state.selectedTable.name,
        items: state.currentOrder.items
      };
      
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.send_order_to_kitchen',
        args: { order_data: orderData },
        freeze: true,
        freeze_message: __('Sending order to kitchen...')
      });
      
      if (result.message?.success) {
        // Mark items as sent
        state.currentOrder.sentItems = [...state.currentOrder.items];
        
        // Play notification sound if available
        if (state.orderSound) {
          try {
            await state.orderSound.play();
          } catch (err) {
            console.debug('Could not play order sound:', err.message);
          }
        }
        
        frappe?.show_alert?.({
          message: __('Order sent to kitchen successfully'),
          indicator: 'green'
        }, 5);
        
        // Refresh table list to update occupancy
        await loadTables();
        updateActionButtons();
      } else {
        frappe?.throw?.(__(Error('Failed to send order to kitchen')));
      }
      
      hideLoading();
    } catch (error) {
      console.error('Error sending order to kitchen:', error);
      frappe?.throw?.(__(Error('Failed to send order to kitchen')));
      hideLoading();
    }
  }

  /**
   * Send only new items to kitchen
   */
  async function handleSendAdditionalItems() {
    const sendAdditionalBtn = elements['send-additional-btn'];
    
    if (!state.selectedTable || 
        (sendAdditionalBtn && sendAdditionalBtn.classList.contains('disabled-btn'))) {
      return;
    }
    
    const newItems = state.currentOrder.items.filter(item => 
      !state.currentOrder.sentItems.some(
        sent => sent.item_code === item.item_code && 
                JSON.stringify(sent.attributes || {}) === JSON.stringify(item.attributes || {})
      )
    );
    
    if (!newItems.length) return;
    
    try {
      showLoading();
      
      const orderData = {
        table: state.selectedTable.name,
        items: newItems,
        is_additional: true
      };
      
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.send_additional_items',
        args: { order_data: orderData },
        freeze: true,
        freeze_message: __('Sending additional items to kitchen...')
      });
      
      if (result.message?.success) {
        state.currentOrder.sentItems = [...state.currentOrder.items];
        
        // Play notification sound if available
        if (state.orderSound) {
          try {
            await state.orderSound.play();
          } catch (err) {
            console.debug('Could not play order sound:', err.message);
          }
        }
        
        frappe?.show_alert?.({
          message: __('Additional items sent to kitchen successfully'),
          indicator: 'green'
        }, 5);
        
        updateActionButtons();
      } else {
        frappe?.throw?.(__(Error('Failed to send additional items to kitchen')));
      }
      
      hideLoading();
    } catch (error) {
      console.error('Error sending additional items:', error);
      frappe?.throw?.(__(Error('Failed to send additional items to kitchen')));
      hideLoading();
    }
  }

  /**
   * Variant handling
   */
  function showVariantModal(item) {
    const variantItemName = elements['variant-item-name'];
    const modalOverlay = elements['modal-overlay'];
    const variantModal = elements['variant-modal'];
    
    if (!variantItemName || !modalOverlay || !variantModal) {
      console.error('Variant modal elements not found');
      return;
    }
    
    variantItemName.textContent = item.item_name;
    
    // Get variant attributes
    frappe.call({
      method: 'restaurant_management.api.waiter_order.get_item_variant_attributes',
      args: { item_code: item.item_code },
      callback: function(response) {
        if (response.message) {
          renderVariantAttributes(response.message);
          modalOverlay.style.display = 'block';
          variantModal.style.display = 'block';
        } else {
          frappe?.throw?.(__(Error('Failed to get variant attributes')));
        }
      }
    });
  }

  /**
   * Render variant attribute options in modal
   * @param {Array} attributes - List of item attributes
   */
  function renderVariantAttributes(attributes) {
    const variantAttributesContainer = elements['variant-attributes-container'];
    
    if (!variantAttributesContainer) {
      console.error('Variant attributes container not found');
      return;
    }
    
    variantAttributesContainer.innerHTML = attributes.map(attr => {
      const options = attr.options.split('\n').map(option => 
        `<option value="${option.trim()}">${option.trim()}</option>`
      ).join('');
      
      return `
        <div class="form-group">
          <label for="attr-${attr.name}">${attr.field_name}</label>
          <select class="form-control variant-attribute" id="attr-${attr.name}" data-attribute="${attr.field_name}">
            <option value="">Select ${attr.field_name}</option>
            ${options}
          </select>
        </div>
      `;
    }).join('');
  }

  /**
   * Close variant selection modal
   */
  function closeVariantModal() {
    const modalOverlay = elements['modal-overlay'];
    const variantModal = elements['variant-modal'];
    
    if (modalOverlay) {
      modalOverlay.style.display = 'none';
    }
    
    if (variantModal) {
      variantModal.style.display = 'none';
    }
    
    state.selectedItemTemplate = null;
  }

  /**
   * Process variant selection and add to order
   */
  async function handleAddVariant() {
    if (!state.selectedItemTemplate) return;
    
    const attributes = {};
    const attributeSelects = document.querySelectorAll('.variant-attribute');
    
    let allSelected = true;
    attributeSelects.forEach(select => {
      if (!select.value) {
        allSelected = false;
        select.classList.add('error');
      } else {
        select.classList.remove('error');
        attributes[select.getAttribute('data-attribute')] = select.value;
      }
    });
    
    if (!allSelected) {
      frappe?.throw?.(__(Error('Please select all variant attributes')));
      return;
    }
    
    try {
      showLoading();
      
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.resolve_item_variant',
        args: {
          template_item_code: state.selectedItemTemplate.item_code,
          attributes: attributes
        },
        freeze: false
      });
      
      if (result.message) {
        const variant = result.message;
        addItemToOrder({
          item_code: variant.item_code,
          item_name: variant.item_name,
          attributes: attributes
        });
        closeVariantModal();
      } else {
        frappe?.throw?.(__(Error('Failed to resolve variant')));
      }
      
      hideLoading();
    } catch (error) {
      console.error('Error resolving variant:', error);
      frappe?.throw?.(__(Error('Failed to resolve variant')));
      hideLoading();
    }
  }

  /**
   * Add item to current order
   * @param {Object} item - Item to add
   */
  function addItemToOrder(item) {
    const existingItemIndex = state.currentOrder.items.findIndex(orderItem => 
      orderItem.item_code === item.item_code && 
      JSON.stringify(orderItem.attributes || {}) === JSON.stringify(item.attributes || {})
    );
    
    if (existingItemIndex !== -1) {
      state.currentOrder.items[existingItemIndex].qty += 1;
    } else {
      state.currentOrder.items.push({
        item_code: item.item_code,
        item_name: item.item_name,
        qty: 1,
        attributes: item.attributes
      });
    }
    
    renderOrderItems();
  }

  /**
   * Show loading overlay
   */
  function showLoading() {
    state.loading = true;
    const loadingOverlay = elements['loading-overlay'];
    
    if (loadingOverlay) {
      loadingOverlay.style.display = 'flex';
    }
  }

  /**
   * Hide loading overlay
   */
  function hideLoading() {
    state.loading = false;
    const loadingOverlay = elements['loading-overlay'];
    
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
  }
})();
```
