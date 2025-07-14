'use strict';

frappe.ready(() => {
  // State management
  const state = {
    tables: [],
    items: [],
    itemGroups: [],
    selectedBranch: null,
    selectedTable: null,
    currentOrder: {
      items: [],
      sentItems: [], // keeps track of items already sent to kitchen
      total_qty: 0,
      total_amount: 0
    },
    selectedItemTemplate: null,
    variantAttributes: [], // Stores current variant attributes for selection
    loading: false,
    itemRates: {} // Cache for item rates
  };

  // DOM Elements
  const elements = {
    tablesContainer: document.getElementById('tables-container'),
    itemsContainer: document.getElementById('item-list'),
    itemSearch: document.getElementById('item-search'),
    navTabs: document.querySelector('.nav-tabs'),
    orderItemsContainer: document.getElementById('order-items'),
    selectedTableDisplay: document.getElementById('selected-table-display'),
    branchSelector: document.getElementById('branch-selector'),
    sendToKitchenBtn: document.getElementById('send-to-kitchen-btn'),
    sendAdditionalBtn: document.getElementById('send-additional-btn'),
    cancelOrderBtn: document.getElementById('cancel-order-btn'),
    variantModal: document.getElementById('variant-modal'),
    modalOverlay: document.getElementById('modal-overlay'),
    variantItemName: document.getElementById('variant-item-name'),
    variantAttributes: document.getElementById('variant-attributes'),
    cancelVariantBtn: document.getElementById('cancel-variant-btn'),
    addVariantBtn: document.getElementById('add-variant-btn'),
    loadingOverlay: document.getElementById('loading-overlay'),
    // New Order Elements
    newOrderBtn: document.getElementById('new-order-btn'),
    newOrderTableNumber: document.getElementById('new-order-table-number'),
    // Order Total Elements
    orderTotalQty: document.getElementById('order-total-qty'),
    orderTotalAmount: document.getElementById('order-total-amount')
  };

  // Ensure all elements exist before using them
  const ensureElements = () => {
    if (!elements.loadingOverlay) {
      const loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'loading-overlay';
      loadingOverlay.className = 'loading-overlay';
      loadingOverlay.innerHTML = '<div class="spinner"></div><div>Loading...</div>';
      document.body.appendChild(loadingOverlay);
      elements.loadingOverlay = loadingOverlay;
    }

    if (!elements.itemsContainer) {
      const itemsContainer = document.createElement('div');
      itemsContainer.id = 'item-list';
      document.querySelector('#items-section')?.appendChild(itemsContainer);
      elements.itemsContainer = itemsContainer;
    }

    if (!elements.orderItemsContainer) {
      const orderItemsContainer = document.createElement('div');
      orderItemsContainer.id = 'order-items';
      document.querySelector('#order-section')?.appendChild(orderItemsContainer);
      elements.orderItemsContainer = orderItemsContainer;
    }

    if (!elements.branchSelector) {
      elements.branchSelector = document.getElementById('branch-selector');
    }

    if (!elements.variantAttributes) {
      const variantAttributes = document.createElement('div');
      variantAttributes.id = 'variant-attributes';
      elements.variantModal?.appendChild(variantAttributes);
      elements.variantAttributes = variantAttributes;
    }

    // Create total elements if they don't exist
    if (!elements.orderTotalQty) {
      const totalSection = document.createElement('div');
      totalSection.className = 'order-totals';
      totalSection.innerHTML = `
        <div class="total-row">
          <div>Total Quantity:</div>
          <div id="order-total-qty">0</div>
        </div>
        <div class="total-row">
          <div>Total Amount:</div>
          <div id="order-total-amount">₹0.00</div>
        </div>
      `;
      elements.orderItemsContainer?.parentNode?.appendChild(totalSection);
      elements.orderTotalQty = document.getElementById('order-total-qty');
      elements.orderTotalAmount = document.getElementById('order-total-amount');
    }

    // Create cancel order button if it doesn't exist
    if (!elements.cancelOrderBtn && elements.sendToKitchenBtn) {
      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'cancel-order-btn';
      cancelBtn.className = 'btn btn-danger disabled-btn';
      cancelBtn.innerHTML = 'Cancel Order';
      cancelBtn.setAttribute('aria-label', 'Cancel current order');
      elements.sendToKitchenBtn.parentNode.appendChild(cancelBtn);
      elements.cancelOrderBtn = cancelBtn;
    }
  };

  // Minimal logging helper
  const log = (level, msg, data) => {
    const levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    const currentLevel = levels.info; // Change to set minimum log level
    
    if (levels[level] >= currentLevel) {
      if (data) {
        console[level](msg, data);
      } else {
        console[level](msg);
      }
    }
  };

  // Initialize the page
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    ensureElements();
    state.selectedBranch = elements.branchSelector ? elements.branchSelector.value : null;
    try {
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
      log('error', 'Initialization error:', error);
      frappe.msgprint(__('Failed to initialize waiter order page'));
      hideLoading();
    }
  }

  // Data loading functions
  const loadTables = async () => {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_available_tables',
        args: {
          branch: state.selectedBranch,
          available_only: true // Only get available tables
        },
        freeze: false
      });

      state.tables = result.message || [];
      renderTables();
    } catch (error) {
      log('error', 'Error loading tables:', error);
      frappe.msgprint(__('Failed to fetch waiter order data.'));
    }
  };

  const loadItems = async () => {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_menu_items',
        args: {
          show_variants: false, // Only show template items and standalone items
          branch: state.selectedBranch
        },
        freeze: false
      });
      
      state.items = result.message || [];
      renderItems();
    } catch (error) {
      log('error', 'Error loading items:', error);
      frappe.msgprint(__('Failed to fetch waiter order data.'));
    }
  };

  const loadItemGroups = async () => {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_item_groups',
        freeze: false
      });
      
      state.itemGroups = result.message || [];
    } catch (error) {
      log('error', 'Error loading item groups:', error);
      frappe.msgprint(__('Failed to fetch waiter order data.'));
    }
  };

  // Fetch item rate from server
  const fetchItemRate = async (itemCode) => {
    // Return from cache if available
    if (state.itemRates[itemCode] !== undefined) {
      return state.itemRates[itemCode];
    }
    
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_item_rate',
        args: { item_code: itemCode },
        freeze: false
      });
      
      const rate = result.message || 0;
      // Cache the rate for future use
      state.itemRates[itemCode] = rate;
      return rate;
    } catch (error) {
      log('error', 'Error fetching item rate:', error);
      return 0;
    }
  };

  // Rendering functions
  const renderTables = () => {
    if (!elements.tablesContainer) return;

    if (!state.tables.length) {
      elements.tablesContainer.innerHTML = '<div class="empty-message">No available tables found</div>';
      return;
    }

    elements.tablesContainer.innerHTML = state.tables.map(table => {
      const isSelected = state.selectedTable && state.selectedTable.name === table.name;
      const status = table.is_available ? 'Available' : 'Occupied';
      const statusClass = table.is_available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
      const capacityDisplay = table.seating_capacity ? ` (${table.seating_capacity})` : '';
      
      return `
        <div class="table-button ${isSelected ? 'selected' : ''}" data-table-id="${table.name}" aria-label="Table ${table.table_number || table.name}, Status: ${status}${capacityDisplay}">
          <div>${table.table_number || table.name}${capacityDisplay}</div>
          <span class="badge ${statusClass} inline-block px-2 py-0.5 rounded text-xs ml-2">${status}</span>
        </div>
      `;
    }).join('');
  };

  const renderItems = (filterGroup = 'all', searchQuery = '') => {
    if (!elements.itemsContainer) return;
    
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
      elements.itemsContainer.innerHTML = '<div class="empty-message">No items found</div>';
      return;
    }

    elements.itemsContainer.innerHTML = filteredItems.map(item => {
      // Show price if available in cache
      const priceDisplay = state.itemRates[item.item_code] ? 
        `<div class="item-price">₹${formatCurrency(state.itemRates[item.item_code])}</div>` : '';
      
      // Add variant indicator
      const variantIndicator = item.has_variants ? 
        '<div class="variant-indicator"><i class="fa fa-list"></i> Has variants</div>' : '';
      
      return `
        <div class="item-button" data-item-code="${item.item_code}" aria-label="Item: ${item.item_name}${item.has_variants ? ', Has variants' : ''}">
          <div class="item-info">
            <div class="item-name">${item.item_name}</div>
            ${variantIndicator}
          </div>
          ${priceDisplay}
        </div>
      `;
    }).join('');
  };

  const renderItemGroupTabs = () => {
    if (!elements.navTabs) return;
    
    const tabsHtml = state.itemGroups.map(group => 
      `<div class="nav-tab" data-group="${group.name}" aria-label="Filter by ${group.item_group_name}">${group.item_group_name}</div>`
    ).join('');
    
    elements.navTabs.innerHTML = '<div class="nav-tab active" data-group="all" aria-label="Show all items">All</div>' + tabsHtml;
  
    // Event listener for tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        renderItems(this.getAttribute('data-group'), elements.itemSearch?.value);
      });
    });
  };

  const renderOrderItems = () => {
    if (!elements.orderItemsContainer) return;
    
    if (!state.currentOrder.items.length) {
      elements.orderItemsContainer.innerHTML = '<div class="empty-order-message">No items added to order</div>';
      updateOrderTotals();
      updateActionButtons();
      return;
    }

    elements.orderItemsContainer.innerHTML = state.currentOrder.items.map((orderItem, index) => {
      const isSent = state.currentOrder.sentItems.some(
        sent => sent.item_code === orderItem.item_code && 
                JSON.stringify(sent.attributes || {}) === JSON.stringify(item.attributes || {})
      );
      
      // Calculate and display amount
      const amount = (orderItem.rate || 0) * (orderItem.qty || 0);
      
      // Format attributes for display
      const attributesDisplay = orderItem.attributes ? 
        '<div class="item-attributes">' + 
        Object.entries(orderItem.attributes)
          .map(([k, v]) => `<span class="attribute-badge">${k}: ${v}</span>`)
          .join(' ') + 
        '</div>' : '';
      
      return `
        <div class="order-item ${isSent ? 'sent-item' : ''}" data-index="${index}">
          <div class="order-item-details">
            <div class="order-item-name">${orderItem.item_name}</div>
            ${attributesDisplay}
            <div class="order-item-rate">₹${formatCurrency(orderItem.rate || 0)}</div>
          </div>
          <div class="order-item-actions">
            <div class="order-item-qty">
              <button class="qty-btn minus" aria-label="Decrease quantity">-</button>
              <span class="qty-value">${orderItem.qty}</span>
              <button class="qty-btn plus" aria-label="Increase quantity">+</button>
            </div>
            <div class="order-item-amount">₹${formatCurrency(amount)}</div>
            <button class="order-item-remove" aria-label="Remove item">✕</button>
          </div>
        </div>
      `;
    }).join('');

    updateOrderTotals();
    updateActionButtons();
  };

  const updateOrderTotals = () => {
    // Calculate total quantity and amount
    state.currentOrder.total_qty = state.currentOrder.items.reduce((total, item) => total + (item.qty || 0), 0);
    state.currentOrder.total_amount = state.currentOrder.items.reduce((total, item) => {
      return total + ((item.rate || 0) * (item.qty || 0));
    }, 0);
    
    // Update display
    if (elements.orderTotalQty) {
      elements.orderTotalQty.textContent = state.currentOrder.total_qty;
    }
    
    if (elements.orderTotalAmount) {
      elements.orderTotalAmount.textContent = `₹${formatCurrency(state.currentOrder.total_amount)}`;
    }
  };

  const updateActionButtons = () => {
    // "Send to Kitchen" button is active if a table is selected and order is not empty
    if (elements.sendToKitchenBtn) {
      if (state.selectedTable && state.currentOrder.items.length > 0) {
        elements.sendToKitchenBtn.classList.remove('disabled-btn');
      } else {
        elements.sendToKitchenBtn.classList.add('disabled-btn');
      }
    }

    // "Send Additional Items" button is active if there are new items not yet sent
    if (elements.sendAdditionalBtn) {
      const hasNewItems = state.currentOrder.items.some(item => 
        !state.currentOrder.sentItems.some(
          sent => sent.item_code === item.item_code && 
                  JSON.stringify(sent.attributes || {}) === JSON.stringify(item.attributes || {})
        )
      );

      if (state.selectedTable && hasNewItems && state.currentOrder.sentItems.length > 0) {
        elements.sendAdditionalBtn.classList.remove('disabled-btn');
      } else {
        elements.sendAdditionalBtn.classList.add('disabled-btn');
      }
    }
    
    // "Cancel Order" button is active if a table is selected and order is sent to kitchen
    if (elements.cancelOrderBtn) {
      if (state.selectedTable && state.currentOrder.sentItems.length > 0) {
        elements.cancelOrderBtn.classList.remove('disabled-btn');
      } else {
        elements.cancelOrderBtn.classList.add('disabled-btn');
      }
    }
  };

  const updateSelectedTableDisplay = () => {
    if (!elements.selectedTableDisplay) return;
    
    if (state.selectedTable) {
      const capacityDisplay = state.selectedTable.seating_capacity ? 
        ` (${state.selectedTable.seating_capacity} seats)` : '';
      
      elements.selectedTableDisplay.textContent = `Selected Table: ${state.selectedTable.table_number || state.selectedTable.name}${capacityDisplay}`;
    } else {
      elements.selectedTableDisplay.textContent = 'No table selected';
    }
  };

  // Event handlers
  const setupEventListeners = () => {
    // Event for selecting active tables (edit order)
    elements.tablesContainer?.addEventListener('click', handleTableSelection);
    
    // Event for "New Order" button
    elements.newOrderBtn?.addEventListener('click', handleNewOrder);

    // Event for item selection
    elements.itemsContainer?.addEventListener('click', handleItemSelection);
    
    // Event for item search
    elements.itemSearch?.addEventListener('input', handleItemSearch);
    
    // Events for order item operations
    elements.orderItemsContainer?.addEventListener('click', handleOrderItemActions);
    
    // Send order to kitchen button
    elements.sendToKitchenBtn?.addEventListener('click', handleSendToKitchen);
    
    // Send additional items button
    elements.sendAdditionalBtn?.addEventListener('click', handleSendAdditionalItems);
    
    // Cancel order button
    elements.cancelOrderBtn?.addEventListener('click', handleCancelOrder);

    // Branch change
    elements.branchSelector?.addEventListener('change', handleBranchChange);
    
    // Events for variant modal
    elements.cancelVariantBtn?.addEventListener('click', closeVariantModal);
    elements.addVariantBtn?.addEventListener('click', handleAddVariant);
    elements.modalOverlay?.addEventListener('click', (e) => {
      // Only close if clicking on the overlay itself, not the modal content
      if (e.target === elements.modalOverlay) {
        closeVariantModal();
      }
    });
  };

  // Handle selecting an active table (from grid)
  const handleTableSelection = (event) => {
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
  };

  // Handle creating a new order
  const handleNewOrder = () => {
    if (!elements.newOrderTableNumber) return;
    
    const tableNo = elements.newOrderTableNumber.value.trim();
    if (!tableNo) {
      frappe.msgprint(__('Please enter a table number'));
      return;
    }
    // Find table by table_number or name
    const table = state.tables.find(t => (t.table_number || t.name) == tableNo);
    if (!table) {
      frappe.msgprint(__('No table found with that number'));
      return;
    }
    // If table is already in use, show notification
    if (!table.is_available) {
      frappe.msgprint(__('Table is not available. It already has an active order.'));
      return;
    }
    // Select the table
    state.selectedTable = table;
    updateSelectedTableDisplay();
    // Clear current order
    state.currentOrder = { items: [], sentItems: [], total_qty: 0, total_amount: 0 };
    renderOrderItems();
    // Re-render tables to show selection
    renderTables();
    frappe.show_alert({
      message: __('Table selected. Add items to create new order.'),
      indicator: 'green'
    }, 3);
  };

  const handleBranchChange = async () => {
    state.selectedBranch = elements.branchSelector ? elements.branchSelector.value : null;
    state.selectedTable = null;
    state.currentOrder = { items: [], sentItems: [], total_qty: 0, total_amount: 0 };
    updateSelectedTableDisplay();
    renderOrderItems();
    updateActionButtons();
    await loadTables();
    await loadItems();
  };

  const handleItemSelection = async (event) => {
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
      // Fetch rate if not already cached
      if (state.itemRates[itemCode] === undefined) {
        const rate = await fetchItemRate(itemCode);
        state.itemRates[itemCode] = rate;
      }
      
      // Add item directly to order with rate
      addItemToOrder({
        item_code: itemCode,
        item_name: item.item_name,
        rate: state.itemRates[itemCode]
      });
    }
  };

  const handleItemSearch = (event) => {
    const searchQuery = event.target.value;
    const activeGroupElem = document.querySelector('.nav-tab.active');
    const activeGroup = activeGroupElem ? activeGroupElem.getAttribute('data-group') : 'all';
    renderItems(activeGroup, searchQuery);
  };

  const handleOrderItemActions = (event) => {
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
  };

  const handleSendToKitchen = async () => {
    if (!state.selectedTable) {
      frappe.msgprint(__('Please select a table first'));
      return;
    }
    
    if (!state.currentOrder.items.length) {
      frappe.msgprint(__('Please add items to the order'));
      return;
    }
    
    if (!elements.sendToKitchenBtn || elements.sendToKitchenBtn.classList.contains('disabled-btn')) {
      return;
    }
    
    try {
      ensureElements();
      showLoading();
      
      const orderData = {
        table: state.selectedTable.name,
        items: state.currentOrder.items,
        total_qty: state.currentOrder.total_qty,
        total_amount: state.currentOrder.total_amount
      };
      
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.send_order_to_kitchen',
        args: { order_data: orderData },
        freeze: true,
        freeze_message: __('Sending order to kitchen...')
      });
      
      if (result.message && result.message.success) {
        // Mark items as sent
        state.currentOrder.sentItems = [...state.currentOrder.items];
        frappe.show_alert({
          message: __('Order sent to kitchen successfully'),
          indicator: 'green'
        }, 5);
        // Refresh table list to update availability
        await loadTables();
        updateActionButtons();
      } else {
        frappe.msgprint(__('Failed to send order to kitchen. Please try again.'));
      }
      hideLoading();
    } catch (error) {
      log('error', 'Error sending order to kitchen:', error);
      frappe.msgprint(__('Failed to send order to kitchen. Error: ' + (error.message || 'Unknown error')));
      hideLoading();
    }
  };

  const handleSendAdditionalItems = async () => {
    if (!state.selectedTable) {
      frappe.msgprint(__('Please select a table first'));
      return;
    }
    
    if (!elements.sendAdditionalBtn || elements.sendAdditionalBtn.classList.contains('disabled-btn')) {
      return;
    }
    
    const newItems = state.currentOrder.items.filter(item => 
      !state.currentOrder.sentItems.some(
        sent => sent.item_code === item.item_code && 
                JSON.stringify(sent.attributes || {}) === JSON.stringify(item.attributes || {})
      )
    );
    
    if (!newItems.length) {
      frappe.msgprint(__('No new items to send'));
      return;
    }
    
    try {
      ensureElements();
      showLoading();
      
      const orderData = {
        table: state.selectedTable.name,
        items: newItems,
        is_additional: true,
        total_qty: state.currentOrder.total_qty,
        total_amount: state.currentOrder.total_amount
      };
      
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.send_additional_items',
        args: { order_data: orderData },
        freeze: true,
        freeze_message: __('Sending additional items to kitchen...')
      });
      
      if (result.message && result.message.success) {
        state.currentOrder.sentItems = [...state.currentOrder.items];
        frappe.show_alert({
          message: __('Additional items sent to kitchen successfully'),
          indicator: 'green'
        }, 5);
        updateActionButtons();
      } else {
        frappe.msgprint(__('Failed to send additional items to kitchen. Please try again.'));
      }
      hideLoading();
    } catch (error) {
      log('error', 'Error sending additional items:', error);
      frappe.msgprint(__('Failed to send additional items to kitchen. Error: ' + (error.message || 'Unknown error')));
      hideLoading();
    }
  };
  
  const handleCancelOrder = async () => {
    if (!state.selectedTable) {
      frappe.msgprint(__('Please select a table first'));
      return;
    }
    
    if (!elements.cancelOrderBtn || elements.cancelOrderBtn.classList.contains('disabled-btn')) {
      return;
    }
    
    // Confirm cancellation
    if (!confirm(__('Are you sure you want to cancel this order? This action cannot be undone.'))) {
      return;
    }
    
    try {
      ensureElements();
      showLoading();
      
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.cancel_order',
        args: { 
          table: state.selectedTable.name
        },
        freeze: true,
        freeze_message: __('Cancelling order...')
      });
      
      if (result.message && result.message.success) {
        // Clear current order
        state.currentOrder = { items: [], sentItems: [], total_qty: 0, total_amount: 0 };
        renderOrderItems();
        
        frappe.show_alert({
          message: __('Order cancelled successfully'),
          indicator: 'green'
        }, 5);
        
        // Refresh table list to update availability
        await loadTables();
        
        // Reset selected table
        state.selectedTable = null;
        updateSelectedTableDisplay();
        updateActionButtons();
      } else {
        frappe.msgprint(__('Failed to cancel order. Please try again.'));
      }
      hideLoading();
    } catch (error) {
      log('error', 'Error cancelling order:', error);
      frappe.msgprint(__('Failed to cancel order. Error: ' + (error.message || 'Unknown error')));
      hideLoading();
    }
  };

  // Variant handling
  const showVariantModal = async (item) => {
    if (!elements.variantItemName || !elements.modalOverlay || !elements.variantModal || !elements.variantAttributes) return;

    // Fetch rate for the template item
    if (state.itemRates[item.item_code] === undefined) {
      const rate = await fetchItemRate(item.item_code);
      state.itemRates[item.item_code] = rate;
    }

    // Display item name with price
    elements.variantItemName.textContent = `${item.item_name} - ₹${formatCurrency(state.itemRates[item.item_code])}`;
    
    // Clear previous content
    elements.variantAttributes.innerHTML = '<div class="loading-attributes">Loading variant options...</div>';
    
    // Show the modal
    elements.modalOverlay.style.display = 'block';
    elements.variantModal.style.display = 'block';

    try {
      // Get variant attributes
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_item_variant_attributes',
        args: { template_item_code: item.item_code },
        freeze: false
      });
      
      if (result.message) {
        state.variantAttributes = result.message;
        renderVariantAttributes(result.message);
      } else {
        elements.variantAttributes.innerHTML = '<div class="empty-message">No variant options found</div>';
        frappe.msgprint(__('No variant attributes found for this item'));
      }
    } catch (error) {
      log('error', 'Error loading variant attributes:', error);
      elements.variantAttributes.innerHTML = '<div class="error-message">Failed to load variant options</div>';
      frappe.msgprint(__('Failed to get variant attributes'));
    }
  };

  const renderVariantAttributes = (attributes) => {
    if (!elements.variantAttributes) return;
    
    // Clear previous content
    elements.variantAttributes.innerHTML = '';
    
    if (!attributes || attributes.length === 0) {
      elements.variantAttributes.innerHTML = '<div class="empty-message">No variant options found</div>';
      return;
    }

    // Create attribute selectors dynamically
    const attributesHtml = attributes.map(attr => {
      const attributeName = attr.field_name || attr.attribute;
      const options = attr.options.split('\n').map(option =>
        `<option value="${option.trim()}">${option.trim()}</option>`
      ).join('');

      return `
        <div class="form-group variant-form-group">
          <label for="attr-${attr.name}">${attributeName}</label>
          <select class="form-control variant-attribute" 
                  id="attr-${attr.name}" 
                  data-attribute="${attributeName}" 
                  aria-label="Select ${attributeName}">
            <option value="">Select ${attributeName}</option>
            ${options}
          </select>
        </div>
      `;
    }).join('');

    elements.variantAttributes.innerHTML = attributesHtml;
  };

  const closeVariantModal = () => {
    if (!elements.modalOverlay || !elements.variantModal) return;
    
    elements.modalOverlay.style.display = 'none';
    elements.variantModal.style.display = 'none';
    state.selectedItemTemplate = null;
    state.variantAttributes = []; // Clear variant attributes
  };

  const handleAddVariant = async () => {
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
      frappe.msgprint(__('Please select all variant attributes'));
      return;
    }
    
    try {
      ensureElements();
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
        
        // Fetch rate for the variant
        let variantRate = await fetchItemRate(variant.item_code);
        
        // If variant doesn't have a specific rate, use the template's rate
        if (!variantRate && state.itemRates[state.selectedItemTemplate.item_code]) {
          variantRate = state.itemRates[state.selectedItemTemplate.item_code];
        }
        
        // Create a descriptive name that includes the variant attributes
        let displayName = variant.item_name;
        const attributeDesc = Object.entries(attributes)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
          
        // Add the variant to the order
        addItemToOrder({
          item_code: variant.item_code,
          item_name: displayName,
          variant_of: state.selectedItemTemplate.item_code,
          rate: variantRate,
          attributes: attributes
        });
        
        // Show success message
        frappe.show_alert({
          message: __(`Added ${displayName} to order`),
          indicator: 'green'
        }, 3);
        
        closeVariantModal();
      } else {
        frappe.msgprint(__('Failed to find a matching variant. Please try different options or contact support.'));
      }
      
      hideLoading();
    } catch (error) {
      log('error', 'Error resolving variant:', error);
      frappe.msgprint(__('Failed to resolve variant. Error: ' + (error.message || 'Unknown error')));
      hideLoading();
    }
  };

  // Helper: Add item to order
  const addItemToOrder = (item) => {
    // Check if this exact item (including attributes) already exists
    const existingItemIndex = state.currentOrder.items.findIndex(orderItem => 
      orderItem.item_code === item.item_code && 
      JSON.stringify(orderItem.attributes || {}) === JSON.stringify(item.attributes || {})
    );
    
    if (existingItemIndex !== -1) {
      // If the item already exists, increment quantity
      state.currentOrder.items[existingItemIndex].qty += 1;
    } else {
      // Otherwise, add as a new item
      state.currentOrder.items.push({
        item_code: item.item_code,
        item_name: item.item_name,
        variant_of: item.variant_of || null,
        rate: item.rate || 0,
        qty: 1,
        attributes: item.attributes || null
      });
    }
    
    // Update order display
    renderOrderItems();
  };

  // Helper: Format currency for display
  const formatCurrency = (amount) => {
    try {
      return parseFloat(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
    } catch (e) {
      return '0.00';
    }
  };

  const showLoading = () => {
    state.loading = true;
    if (!elements.loadingOverlay) return;
    elements.loadingOverlay.style.display = 'flex';
  };

  const hideLoading = () => {
    state.loading = false;
    if (!elements.loadingOverlay) return;
    elements.loadingOverlay.style.display = 'none';
  };
});