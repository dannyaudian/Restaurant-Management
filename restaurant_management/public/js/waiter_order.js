'use strict';

frappe.ready(() => {
  // State management
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
    loading: false
  };

  // DOM Elements
  const elements = {
    tablesContainer: document.getElementById('tables-container'),
    itemsContainer: document.getElementById('item-list'),
    itemSearch: document.getElementById('item-search'),
    navTabs: document.querySelector('.nav-tabs'),
    orderItemsContainer: document.getElementById('order-items'),
    selectedTableDisplay: document.getElementById('selected-table-display'),
    sendToKitchenBtn: document.getElementById('send-to-kitchen-btn'),
    sendAdditionalBtn: document.getElementById('send-additional-btn'),
    variantModal: document.getElementById('variant-modal'),
    modalOverlay: document.getElementById('modal-overlay'),
    variantItemName: document.getElementById('variant-item-name'),
    variantAttributes: document.getElementById('variant-attributes'),
    cancelVariantBtn: document.getElementById('cancel-variant-btn'),
    addVariantBtn: document.getElementById('add-variant-btn'),
    loadingOverlay: document.getElementById('loading-overlay'),
    // New Order Elements
    newOrderBtn: document.getElementById('new-order-btn'),
    newOrderTableNumber: document.getElementById('new-order-table-number')
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

    if (!elements.variantAttributes) {
      const variantAttributes = document.createElement('div');
      variantAttributes.id = 'variant-attributes';
      elements.variantModal?.appendChild(variantAttributes);
      elements.variantAttributes = variantAttributes;
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
      frappe.throw(__('Failed to initialize waiter order page'));
      hideLoading();
    }
  }

  // Data loading functions
  const loadTables = async () => {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_available_tables',
        freeze: false
      });
      
      state.tables = result.message || [];
      renderTables();
    } catch (error) {
      log('error', 'Error loading tables:', error);
      frappe.throw(__('Failed to load tables'));
    }
  };

  const loadItems = async () => {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_menu_items',
        freeze: false
      });
      
      state.items = result.message || [];
      renderItems();
    } catch (error) {
      log('error', 'Error loading items:', error);
      frappe.throw(__('Failed to load menu items'));
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
      frappe.throw(__('Failed to load item groups'));
    }
  };

  // Rendering functions
  const renderTables = () => {
    if (!elements.tablesContainer) return;
    
    // Display only tables that are in "active" state (with active orders)
    const activeTables = state.tables.filter(table => table.current_pos_order);
    if (!activeTables.length) {
      elements.tablesContainer.innerHTML = '<div class="empty-message">No active orders</div>';
      return;
    }

    elements.tablesContainer.innerHTML = activeTables.map(table => {
      const isSelected = state.selectedTable && state.selectedTable.name === table.name;
      return `
        <div class="table-button ${isSelected ? 'selected' : ''}" 
             data-table-id="${table.name}">
          ${table.table_number || table.name}
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
      return `
        <div class="item-button" data-item-code="${item.item_code}">
          <div>${item.item_name}</div>
          <small>${item.has_variants ? '(Has variants)' : ''}</small>
        </div>
      `;
    }).join('');
  };

  const renderItemGroupTabs = () => {
    if (!elements.navTabs) return;
    
    const tabsHtml = state.itemGroups.map(group => 
      `<div class="nav-tab" data-group="${group.name}">${group.item_group_name}</div>`
    ).join('');
    
    elements.navTabs.innerHTML = '<div class="nav-tab active" data-group="all">All</div>' + tabsHtml;
  
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
      updateActionButtons();
      return;
    }

    elements.orderItemsContainer.innerHTML = state.currentOrder.items.map((orderItem, index) => {
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
  };

  const updateActionButtons = () => {
    // "Send to Kitchen" button is active if a table is selected and order is not empty
    if (!elements.sendToKitchenBtn) return;
    
    if (state.selectedTable && state.currentOrder.items.length > 0) {
      elements.sendToKitchenBtn.classList.remove('disabled-btn');
    } else {
      elements.sendToKitchenBtn.classList.add('disabled-btn');
    }

    // "Send Additional Items" button is active if there are new items not yet sent
    if (!elements.sendAdditionalBtn) return;
    
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
  };

  const updateSelectedTableDisplay = () => {
    if (!elements.selectedTableDisplay) return;
    
    if (state.selectedTable) {
      elements.selectedTableDisplay.textContent = `Selected Table: ${state.selectedTable.table_number || state.selectedTable.name}`;
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
    
    // Events for variant modal
    elements.cancelVariantBtn?.addEventListener('click', closeVariantModal);
    elements.addVariantBtn?.addEventListener('click', handleAddVariant);
    elements.modalOverlay?.addEventListener('click', closeVariantModal);
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
    if (table.current_pos_order) {
      frappe.msgprint(__('Table is not available. It already has an active order.'));
      return;
    }
    // Mark as new order (simulating creating a new order; in a real implementation, you could call an API to create an order)
    table.current_pos_order = {};
    state.selectedTable = table;
    updateSelectedTableDisplay();
    // Re-render tables: now the table with the new order won't appear in the active grid
    renderTables();
    frappe.msgprint(__('New order created at Table ') + tableNo);
  };

  const handleItemSelection = (event) => {
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
    if (!state.selectedTable || !state.currentOrder.items.length || 
        !elements.sendToKitchenBtn || elements.sendToKitchenBtn.classList.contains('disabled-btn')) {
      return;
    }
    
    try {
      ensureElements();
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
      
      if (result.message && result.message.success) {
        // Mark items as sent
        state.currentOrder.sentItems = [...state.currentOrder.items];
        frappe.show_alert({
          message: __('Order sent to kitchen successfully'),
          indicator: 'green'
        }, 5);
        // Refresh table list to update occupancy
        await loadTables();
        updateActionButtons();
      } else {
        frappe.throw(__('Failed to send order to kitchen'));
      }
      hideLoading();
    } catch (error) {
      log('error', 'Error sending order to kitchen:', error);
      frappe.throw(__('Failed to send order to kitchen'));
      hideLoading();
    }
  };

  const handleSendAdditionalItems = async () => {
    if (!state.selectedTable || 
        !elements.sendAdditionalBtn || elements.sendAdditionalBtn.classList.contains('disabled-btn')) {
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
      ensureElements();
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
      
      if (result.message && result.message.success) {
        state.currentOrder.sentItems = [...state.currentOrder.items];
        frappe.show_alert({
          message: __('Additional items sent to kitchen successfully'),
          indicator: 'green'
        }, 5);
        updateActionButtons();
      } else {
        frappe.throw(__('Failed to send additional items to kitchen'));
      }
      hideLoading();
    } catch (error) {
      log('error', 'Error sending additional items:', error);
      frappe.throw(__('Failed to send additional items to kitchen'));
      hideLoading();
    }
  };

  // Variant handling
  const showVariantModal = (item) => {
    if (!elements.variantItemName || !elements.modalOverlay || !elements.variantModal) return;
    
    elements.variantItemName.textContent = item.item_name;
    
    // Get variant attributes
    frappe.call({
      method: 'restaurant_management.api.waiter_order.get_item_variant_attributes',
      args: { item_code: item.item_code },
      callback: function(response) {
        if (response.message) {
          renderVariantAttributes(response.message);
          elements.modalOverlay.style.display = 'block';
          elements.variantModal.style.display = 'block';
        } else {
          frappe.throw(__('Failed to get variant attributes'));
        }
      }
    });
  };

  const renderVariantAttributes = (attributes) => {
    if (!elements.variantAttributes) return;
    
    elements.variantAttributes.innerHTML = attributes.map(attr => {
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
  };

  const closeVariantModal = () => {
    if (!elements.modalOverlay || !elements.variantModal) return;
    
    elements.modalOverlay.style.display = 'none';
    elements.variantModal.style.display = 'none';
    state.selectedItemTemplate = null;
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
      frappe.throw(__('Please select all variant attributes'));
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
        addItemToOrder({
          item_code: variant.item_code,
          item_name: variant.item_name,
          attributes: attributes
        });
        closeVariantModal();
      } else {
        frappe.throw(__('Failed to resolve variant'));
      }
      
      hideLoading();
    } catch (error) {
      log('error', 'Error resolving variant:', error);
      frappe.throw(__('Failed to resolve variant'));
      hideLoading();
    }
  };

  // Helper: Add item to order
  const addItemToOrder = (item) => {
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
