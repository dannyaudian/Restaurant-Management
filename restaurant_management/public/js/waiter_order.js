frappe.ready(function() {
  // State management with default values
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

  // Initialize element references safely using a function to prevent null errors
  const elements = {};
  
  /**
   * Safely gets DOM elements and creates fallbacks when needed
   * This helps prevent "Cannot read property 'style' of null" errors
   */
  function initializeElements() {
    // Main containers
    elements.tablesContainer = document.getElementById('tables-container') || createFallbackElement('tables-container', 'div', 'tables-grid');
    elements.itemList = document.getElementById('item-list') || createFallbackElement('item-list', 'div', 'item-list');
    elements.orderItems = document.getElementById('order-items') || createFallbackElement('order-items', 'div', 'order-items');
    elements.itemCategories = document.getElementById('item-categories') || createFallbackElement('item-categories', 'div', 'item-categories');
    
    // UI Controls
    elements.itemSearch = document.getElementById('item-search');
    elements.selectedTableDisplay = document.getElementById('selected-table-display') || createFallbackElement('selected-table-display', 'div', 'selected-table');
    
    // Action buttons
    elements.btnSendKitchen = document.getElementById('btn-send-kitchen') || createFallbackElement('btn-send-kitchen', 'button', 'action-btn btn-kitchen disabled-btn', 'Send to Kitchen');
    elements.btnSendAdditional = document.getElementById('btn-send-additional') || createFallbackElement('btn-send-additional', 'button', 'action-btn btn-additional disabled-btn', 'Send Additional Items');
    elements.btnMarkServedAll = document.getElementById('btn-mark-served-all') || createFallbackElement('btn-mark-served-all', 'button', 'action-btn btn-served disabled-btn', 'Mark All as Served');
    elements.btnPrintOrder = document.getElementById('btn-print-order') || createFallbackElement('btn-print-order', 'button', 'action-btn btn-print disabled-btn', 'Print Order');
    
    // Modals and overlays
    elements.variantModal = document.getElementById('variant-modal') || createModalElement('variant-modal', 'Select Variant Options');
    elements.variantOverlay = document.getElementById('variant-overlay') || createOverlayElement('variant-overlay');
    elements.notesModal = document.getElementById('notes-modal') || createModalElement('notes-modal', 'Add Notes');
    elements.notesOverlay = document.getElementById('notes-overlay') || createOverlayElement('notes-overlay');
    elements.loadingOverlay = document.getElementById('loading-overlay') || createLoadingOverlay();
    
    // Modal elements
    elements.variantAttributes = document.getElementById('variant-attributes') || createFallbackElement('variant-attributes', 'div', 'variant-attributes');
    elements.btnCancelVariant = document.getElementById('btn-cancel-variant') || createButtonElement('btn-cancel-variant', 'Cancel', 'modal-btn btn-cancel');
    elements.btnAddVariant = document.getElementById('btn-add-variant') || createButtonElement('btn-add-variant', 'Add to Order', 'modal-btn btn-add');
    
    // Notes modal elements
    elements.itemNotesTextarea = document.getElementById('item-notes-textarea') || createTextareaElement('item-notes-textarea', 'Add special instructions...');
    elements.btnCancelNotes = document.getElementById('btn-cancel-notes') || createButtonElement('btn-cancel-notes', 'Cancel', 'modal-btn btn-cancel');
    elements.btnSaveNotes = document.getElementById('btn-save-notes') || createButtonElement('btn-save-notes', 'Save Notes', 'modal-btn btn-add');
    
    // Attach parent-child relationships for modals
    if (!elements.variantModal.parentElement) {
      document.body.appendChild(elements.variantOverlay);
      document.body.appendChild(elements.variantModal);
    }
    
    if (!elements.notesModal.parentElement) {
      document.body.appendChild(elements.notesOverlay);
      document.body.appendChild(elements.notesModal);
    }
    
    if (!elements.loadingOverlay.parentElement) {
      document.body.appendChild(elements.loadingOverlay);
    }
  }
  
  /**
   * Creates a fallback element when the original is not found
   * @param {string} id - Element id
   * @param {string} tagName - HTML tag name
   * @param {string} className - CSS class names
   * @param {string} [text] - Optional inner text
   * @returns {HTMLElement} - The created element
   */
  function createFallbackElement(id, tagName, className, text) {
    console.log(`Element '${id}' not found, creating fallback`);
    const element = document.createElement(tagName);
    element.id = id;
    element.className = className;
    if (text) element.textContent = text;
    return element;
  }
  
  /**
   * Creates a modal element
   * @param {string} id - Modal id
   * @param {string} title - Modal title
   * @returns {HTMLElement} - The modal element
   */
  function createModalElement(id, title) {
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = id.includes('variant') ? 'variant-modal' : 'notes-modal';
    
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.id = id + '-title';
    header.textContent = title;
    
    const content = document.createElement('div');
    content.className = id.includes('variant') ? 'variant-attributes' : '';
    content.id = id.includes('variant') ? 'variant-attributes' : '';
    
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    
    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(actions);
    
    return modal;
  }
  
  /**
   * Creates an overlay element
   * @param {string} id - Overlay id
   * @returns {HTMLElement} - The overlay element
   */
  function createOverlayElement(id) {
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'modal-overlay';
    return overlay;
  }
  
  /**
   * Creates a loading overlay
   * @returns {HTMLElement} - The loading overlay element
   */
  function createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'loading-overlay';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    
    overlay.appendChild(spinner);
    return overlay;
  }
  
  /**
   * Creates a button element
   * @param {string} id - Button id
   * @param {string} text - Button text
   * @param {string} className - CSS class names
   * @returns {HTMLElement} - The button element
   */
  function createButtonElement(id, text, className) {
    const button = document.createElement('button');
    button.id = id;
    button.className = className;
    button.textContent = text;
    return button;
  }
  
  /**
   * Creates a textarea element
   * @param {string} id - Textarea id
   * @param {string} placeholder - Placeholder text
   * @returns {HTMLElement} - The textarea element
   */
  function createTextareaElement(id, placeholder) {
    const textarea = document.createElement('textarea');
    textarea.id = id;
    textarea.className = 'notes-textarea';
    textarea.placeholder = placeholder;
    return textarea;
  }

  /**
   * Initialize the application
   */
  async function init() {
    try {
      // Create elements first to avoid null references
      initializeElements();
      
      showLoading();
      
      // Load data in parallel
      await Promise.all([
        loadTables(),
        loadItems(),
        loadItemGroups()
      ]);
      
      renderItemCategories();
      setupEventListeners();
      hideLoading();
    } catch (error) {
      console.error('Initialization error:', error);
      hideLoading();
      frappe.throw(__('Failed to initialize waiter order page'));
    }
  }

  /**
   * Show loading overlay
   */
  function showLoading() {
    state.loading = true;
    if (elements.loadingOverlay) {
      elements.loadingOverlay.style.display = 'flex';
    }
  }

  /**
   * Hide loading overlay
   */
  function hideLoading() {
    state.loading = false;
    if (elements.loadingOverlay) {
      elements.loadingOverlay.style.display = 'none';
    }
  }

  /**
   * Load table data from server
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
      frappe.throw(__('Failed to load tables'));
    }
  }

  /**
   * Load menu items from server
   */
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
      frappe.throw(__('Failed to load menu items'));
    }
  }

  /**
   * Load item groups from server
   */
  async function loadItemGroups() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_item_groups',
        freeze: false
      });
      
      state.itemGroups = result.message || [];
    } catch (error) {
      console.error('Error loading item groups:', error);
      frappe.throw(__('Failed to load item groups'));
    }
  }

  /**
   * Render tables to UI
   */
  function renderTables() {
    if (!elements.tablesContainer) return;
    
    const tables = state.tables;
    
    if (!tables.length) {
      elements.tablesContainer.innerHTML = '<div class="empty-message">No tables available</div>';
      return;
    }

    elements.tablesContainer.innerHTML = tables.map(table => {
      const isSelected = state.selectedTable && state.selectedTable.name === table.name;
      const isOccupied = table.current_pos_order;
      
      return `
        <div class="table-button ${isSelected ? 'selected' : ''} ${isOccupied ? 'occupied' : ''}" 
             data-table-id="${table.name}">
          ${table.table_number || table.name}
        </div>
      `;
    }).join('');
  }

  /**
   * Render all menu items or filtered items
   * @param {string} filterGroup - Item group to filter by
   * @param {string} searchQuery - Search query to filter by
   */
  function renderItems(filterGroup = 'all', searchQuery = '') {
    if (!elements.itemList) return;
    
    let filteredItems = state.items;
    
    // Apply filters
    if (filterGroup !== 'all') {
      filteredItems = filteredItems.filter(item => item.item_group === filterGroup);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredItems = filteredItems.filter(item => 
        item.item_name.toLowerCase().includes(query) || 
        item.item_code.toLowerCase().includes(query)
      );
    }

    // Display items or a message
    if (!filteredItems.length) {
      elements.itemList.innerHTML = '<div class="empty-message">No items found</div>';
      return;
    }

    elements.itemList.innerHTML = filteredItems.map(item => `
      <div class="item-card" data-item-code="${item.item_code}">
        ${item.has_variants ? '<div class="variant-badge">Variants</div>' : ''}
        <div class="item-name">${item.item_name}</div>
        <div class="item-price">${frappe.format(item.standard_rate || 0, {fieldtype: 'Currency'})}</div>
      </div>
    `).join('');
  }

  /**
   * Render item category tabs
   */
  function renderItemCategories() {
    if (!elements.itemCategories || !state.itemGroups.length) return;
    
    const categoriesHtml = [
      '<div class="category-button active" data-group="all">All</div>'
    ];
    
    state.itemGroups.forEach(group => {
      categoriesHtml.push(`
        <div class="category-button" data-group="${group.name}">
          ${group.item_group_name}
        </div>
      `);
    });
    
    elements.itemCategories.innerHTML = categoriesHtml.join('');
  }

  /**
   * Render order items in the cart
   */
  function renderOrderItems() {
    if (!elements.orderItems) return;
    
    if (!state.currentOrder.items.length) {
      elements.orderItems.innerHTML = '<div class="empty-order-message">No items added to order</div>';
      updateActionButtons();
      return;
    }

    let orderTotal = 0;
    const orderItemsHtml = state.currentOrder.items.map((orderItem, index) => {
      const isSent = state.currentOrder.sentItems.some(
        sent => sent.item_code === orderItem.item_code && 
                JSON.stringify(sent.attributes || {}) === JSON.stringify(orderItem.attributes || {})
      );
      
      // Calculate item subtotal and add to order total
      const subtotal = (orderItem.price || 0) * orderItem.qty;
      orderTotal += subtotal;
      
      return `
        <div class="order-item" data-index="${index}">
          <div class="item-info">
            <div class="item-details">
              <span class="item-title">${orderItem.item_name}</span>
              <span class="item-subtotal">${frappe.format(subtotal, {fieldtype: 'Currency'})}</span>
            </div>
            ${orderItem.attributes ? 
              `<div class="item-attributes">${Object.entries(orderItem.attributes)
                .map(([k, v]) => `${k}: ${v}`).join(', ')}</div>` : ''}
            ${orderItem.notes ? `<div class="item-notes">${orderItem.notes}</div>` : ''}
            ${isSent ? `<span class="status-badge status-sent">Sent</span>` : 
                       `<span class="status-badge status-new">New</span>`}
          </div>
          <div class="quantity-control">
            <div class="qty-btn minus">-</div>
            <div class="qty-display">${orderItem.qty}</div>
            <div class="qty-btn plus">+</div>
          </div>
          <div class="remove-item">✕</div>
        </div>
      `;
    }).join('');
    
    elements.orderItems.innerHTML = orderItemsHtml;
    
    // Update total amount
    const totalElement = document.getElementById('order-total-amount');
    if (totalElement) {
      totalElement.textContent = frappe.format(orderTotal, {fieldtype: 'Currency'});
    }
    
    updateActionButtons();
  }

  /**
   * Update action buttons state based on current order
   */
  function updateActionButtons() {
    // Send to Kitchen button is active if table is selected and there are items
    if (elements.btnSendKitchen) {
      if (state.selectedTable && state.currentOrder.items.length > 0) {
        elements.btnSendKitchen.classList.remove('disabled-btn');
      } else {
        elements.btnSendKitchen.classList.add('disabled-btn');
      }
    }

    // Send Additional Items button is active if there are new items and some already sent
    if (elements.btnSendAdditional) {
      const hasNewItems = state.currentOrder.items.some(item => 
        !state.currentOrder.sentItems.some(
          sent => sent.item_code === item.item_code && 
                  JSON.stringify(sent.attributes || {}) === JSON.stringify(item.attributes || {})
        )
      );

      if (state.selectedTable && hasNewItems && state.currentOrder.sentItems.length > 0) {
        elements.btnSendAdditional.classList.remove('disabled-btn');
      } else {
        elements.btnSendAdditional.classList.add('disabled-btn');
      }
    }
    
    // Mark All as Served button is active if there are ready items
    if (elements.btnMarkServedAll) {
      const hasReadyItems = state.currentOrder.sentItems.some(item => item.status === 'Ready');
      
      if (state.selectedTable && hasReadyItems) {
        elements.btnMarkServedAll.classList.remove('disabled-btn');
      } else {
        elements.btnMarkServedAll.classList.add('disabled-btn');
      }
    }
    
    // Print Order button is active if there are sent items
    if (elements.btnPrintOrder) {
      if (state.selectedTable && state.currentOrder.sentItems.length > 0) {
        elements.btnPrintOrder.classList.remove('disabled-btn');
      } else {
        elements.btnPrintOrder.classList.add('disabled-btn');
      }
    }
  }

  /**
   * Update the selected table display
   */
  function updateSelectedTableDisplay() {
    if (!elements.selectedTableDisplay) return;
    
    if (state.selectedTable) {
      elements.selectedTableDisplay.textContent = `Table: ${state.selectedTable.table_number || state.selectedTable.name}`;
    } else {
      elements.selectedTableDisplay.textContent = 'No table selected';
    }
  }

  /**
   * Set up all event listeners
   */
  function setupEventListeners() {
    // Table selection
    if (elements.tablesContainer) {
      elements.tablesContainer.addEventListener('click', handleTableSelection);
    }
    
    // Item selection
    if (elements.itemList) {
      elements.itemList.addEventListener('click', handleItemSelection);
    }
    
    // Item search
    if (elements.itemSearch) {
      elements.itemSearch.addEventListener('input', handleItemSearch);
    }
    
    // Item categories
    if (elements.itemCategories) {
      elements.itemCategories.addEventListener('click', handleItemCategorySelection);
    }
    
    // Order item actions
    if (elements.orderItems) {
      elements.orderItems.addEventListener('click', handleOrderItemActions);
    }
    
    // Action buttons
    if (elements.btnSendKitchen) {
      elements.btnSendKitchen.addEventListener('click', handleSendToKitchen);
    }
    
    if (elements.btnSendAdditional) {
      elements.btnSendAdditional.addEventListener('click', handleSendAdditionalItems);
    }
    
    if (elements.btnMarkServedAll) {
      elements.btnMarkServedAll.addEventListener('click', handleMarkAllAsServed);
    }
    
    if (elements.btnPrintOrder) {
      elements.btnPrintOrder.addEventListener('click', handlePrintOrder);
    }
    
    // Modal buttons
    if (elements.btnCancelVariant) {
      elements.btnCancelVariant.addEventListener('click', closeVariantModal);
    }
    
    if (elements.btnAddVariant) {
      elements.btnAddVariant.addEventListener('click', handleAddVariant);
    }
    
    if (elements.variantOverlay) {
      elements.variantOverlay.addEventListener('click', closeVariantModal);
    }
    
    if (elements.btnCancelNotes) {
      elements.btnCancelNotes.addEventListener('click', closeNotesModal);
    }
    
    if (elements.btnSaveNotes) {
      elements.btnSaveNotes.addEventListener('click', handleSaveNotes);
    }
    
    if (elements.notesOverlay) {
      elements.notesOverlay.addEventListener('click', closeNotesModal);
    }
  }

  /**
   * Handle table selection
   * @param {Event} event - Click event
   */
  function handleTableSelection(event) {
    const tableButton = event.target.closest('.table-button');
    if (!tableButton) return;
    
    const tableId = tableButton.getAttribute('data-table-id');
    const table = state.tables.find(t => t.name === tableId);
    
    if (!table) return;
    
    state.selectedTable = table;
    
    // Load existing orders for this table
    loadActiveOrders(tableId);
    
    renderTables();
    updateSelectedTableDisplay();
  }

  /**
   * Load active orders for a table
   * @param {string} tableId - Table ID
   */
  async function loadActiveOrders(tableId) {
    try {
      showLoading();
      
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_active_orders',
        args: { table_id: tableId },
        freeze: false
      });
      
      if (result.message && result.message.length) {
        const order = result.message[0]; // Get the first active order
        
        // Update current order with server data
        state.currentOrder.items = order.items.map(item => ({
          item_code: item.item_code,
          item_name: item.item_name,
          qty: item.qty,
          price: item.price,
          notes: item.notes,
          status: item.status
        }));
        
        // Mark all items as already sent
        state.currentOrder.sentItems = [...state.currentOrder.items];
      } else {
        // Reset current order if no active orders
        state.currentOrder.items = [];
        state.currentOrder.sentItems = [];
      }
      
      renderOrderItems();
      hideLoading();
    } catch (error) {
      console.error('Error loading active orders:', error);
      hideLoading();
    }
  }

  /**
   * Handle item category selection
   * @param {Event} event - Click event
   */
  function handleItemCategorySelection(event) {
    const categoryButton = event.target.closest('.category-button');
    if (!categoryButton) return;
    
    // Update active class
    const allCategoryButtons = elements.itemCategories.querySelectorAll('.category-button');
    allCategoryButtons.forEach(btn => btn.classList.remove('active'));
    categoryButton.classList.add('active');
    
    // Filter items by selected category
    const categoryGroup = categoryButton.getAttribute('data-group');
    const searchQuery = elements.itemSearch ? elements.itemSearch.value : '';
    renderItems(categoryGroup, searchQuery);
  }

  /**
   * Handle item selection
   * @param {Event} event - Click event
   */
  function handleItemSelection(event) {
    const itemCard = event.target.closest('.item-card');
    if (!itemCard) return;
    
    const itemCode = itemCard.getAttribute('data-item-code');
    const item = state.items.find(i => i.item_code === itemCode);
    
    if (!item) return;
    
    if (item.has_variants) {
      // Show variant selection modal
      state.selectedItemTemplate = item;
      showVariantModal(item);
    } else {
      // Add item directly to order
      addItemToOrder({
        item_code: item.item_code,
        item_name: item.item_name,
        price: item.standard_rate || 0,
        qty: 1
      });
    }
  }

  /**
   * Handle item search
   * @param {Event} event - Input event
   */
  function handleItemSearch(event) {
    const searchQuery = event.target.value;
    const activeCategoryButton = elements.itemCategories.querySelector('.category-button.active');
    const categoryGroup = activeCategoryButton ? activeCategoryButton.getAttribute('data-group') : 'all';
    renderItems(categoryGroup, searchQuery);
  }

  /**
   * Handle order item actions (quantity change, removal)
   * @param {Event} event - Click event
   */
  function handleOrderItemActions(event) {
    const orderItem = event.target.closest('.order-item');
    if (!orderItem) return;
    
    const index = parseInt(orderItem.getAttribute('data-index'), 10);
    if (isNaN(index) || index < 0 || index >= state.currentOrder.items.length) return;
    
    if (event.target.classList.contains('plus')) {
      state.currentOrder.items[index].qty += 1;
    } else if (event.target.classList.contains('minus')) {
      if (state.currentOrder.items[index].qty > 1) {
        state.currentOrder.items[index].qty -= 1;
      }
    } else if (event.target.classList.contains('remove-item')) {
      state.currentOrder.items.splice(index, 1);
    } else {
      return;
    }
    
    renderOrderItems();
  }

  /**
   * Send order to kitchen
   */
  async function handleSendToKitchen() {
    if (!state.selectedTable || !state.currentOrder.items.length || 
        elements.btnSendKitchen.classList.contains('disabled-btn')) {
      return;
    }
    
    try {
      showLoading();
      
      const orderData = {
        table: state.selectedTable.name,
        branch_code: state.selectedTable.branch_code, // Include branch_code from table
        items: state.currentOrder.items.map(item => ({
          item_code: item.item_code,
          item_name: item.item_name,
          qty: item.qty,
          price: item.price || 0,
          notes: item.notes || '',
          attributes: item.attributes || {}
        }))
      };
      
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.send_order_to_kitchen',
        args: { order_data: orderData },
        freeze: true,
        freeze_message: __('Sending order to kitchen...')
      });
      
      if (result.message && result.message.success) {
        // Mark all items as sent
        state.currentOrder.sentItems = [...state.currentOrder.items];
        
        frappe.show_alert({
          message: __('Order sent to kitchen successfully'),
          indicator: 'green'
        }, 5);
        
        if (result.message.print_url) {
          // Open print dialog in new window
          window.open(result.message.print_url, '_blank');
        }
        
        // Refresh tables to update status
        await loadTables();
        updateActionButtons();
      } else {
        const errorMsg = result.message && result.message.error 
          ? result.message.error 
          : __('Failed to send order to kitchen');
        frappe.throw(errorMsg);
      }
      
      hideLoading();
    } catch (error) {
      console.error('Error sending order to kitchen:', error);
      frappe.throw(__('Failed to send order to kitchen: ') + (error.message || ''));
      hideLoading();
    }
  }

  /**
   * Send additional items to kitchen
   */
  async function handleSendAdditionalItems() {
    if (!state.selectedTable || elements.btnSendAdditional.classList.contains('disabled-btn')) {
      return;
    }
    
    // Filter out items that have already been sent
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
        order_id: state.currentOrder.order_id, // If available
        table: state.selectedTable.name,
        branch_code: state.selectedTable.branch_code,
        items: newItems.map(item => ({
          item_code: item.item_code,
          item_name: item.item_name,
          qty: item.qty,
          price: item.price || 0,
          notes: item.notes || '',
          attributes: item.attributes || {}
        }))
      };
      
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.send_additional_items',
        args: { order_data: orderData },
        freeze: true,
        freeze_message: __('Sending additional items to kitchen...')
      });
      
      if (result.message && result.message.success) {
        // Mark all items as sent
        state.currentOrder.sentItems = [...state.currentOrder.items];
        
        frappe.show_alert({
          message: __('Additional items sent to kitchen successfully'),
          indicator: 'green'
        }, 5);
        
        if (result.message.print_url) {
          // Open print dialog in new window
          window.open(result.message.print_url, '_blank');
        }
        
        updateActionButtons();
      } else {
        const errorMsg = result.message && result.message.error 
          ? result.message.error 
          : __('Failed to send additional items to kitchen');
        frappe.throw(errorMsg);
      }
      
      hideLoading();
    } catch (error) {
      console.error('Error sending additional items:', error);
      frappe.throw(__('Failed to send additional items: ') + (error.message || ''));
      hideLoading();
    }
  }

  /**
   * Mark all ready items as served
   */
  async function handleMarkAllAsServed() {
    if (!state.selectedTable || elements.btnMarkServedAll.classList.contains('disabled-btn')) {
      return;
    }
    
    try {
      showLoading();
      
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.mark_items_as_served',
        args: {
          order_id: state.currentOrder.order_id,
          item_ids: [], // Empty array means all items
          all_ready: true
        },
        freeze: true,
        freeze_message: __('Marking items as served...')
      });
      
      if (result.message && result.message.success) {
        // Refresh order items from server
        await loadActiveOrders(state.selectedTable.name);
        
        frappe.show_alert({
          message: __('Items marked as served successfully'),
          indicator: 'green'
        }, 5);
      } else {
        const errorMsg = result.message && result.message.error 
          ? result.message.error 
          : __('Failed to mark items as served');
        frappe.throw(errorMsg);
      }
      
      hideLoading();
    } catch (error) {
      console.error('Error marking items as served:', error);
      frappe.throw(__('Failed to mark items as served: ') + (error.message || ''));
      hideLoading();
    }
  }

  /**
   * Print order
   */
  async function handlePrintOrder() {
    if (!state.selectedTable || elements.btnPrintOrder.classList.contains('disabled-btn')) {
      return;
    }
    
    try {
      showLoading();
      
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_print_url',
        args: {
          order_id: state.currentOrder.order_id,
          additional: false
        },
        freeze: false
      });
      
      if (result.message && result.message.print_url) {
        window.open(result.message.print_url, '_blank');
      } else {
        frappe.throw(__('Print URL not available'));
      }
      
      hideLoading();
    } catch (error) {
      console.error('Error printing order:', error);
      frappe.throw(__('Failed to print order: ') + (error.message || ''));
      hideLoading();
    }
  }

  /**
   * Show variant selection modal
   * @param {Object} item - Item template
   */
  function showVariantModal(item) {
    if (!elements.variantModal || !elements.variantOverlay || !elements.variantAttributes) return;
    
    // Set modal title
    const modalTitle = elements.variantModal.querySelector('.modal-header');
    if (modalTitle) {
      modalTitle.textContent = `Select Options for ${item.item_name}`;
    }
    
    // Get variant attributes
    frappe.call({
      method: 'restaurant_management.api.waiter_order.get_item_variant_attributes',
      args: { template_item_code: item.item_code },
      callback: function(response) {
        if (response.message && response.message.length) {
          renderVariantAttributes(response.message);
          elements.variantOverlay.style.display = 'block';
          elements.variantModal.style.display = 'block';
        } else {
          frappe.msgprint(__('No variant attributes found for this item'));
        }
      }
    });
  }

  /**
   * Render variant attributes in modal
   * @param {Array} attributes - Variant attributes
   */
  function renderVariantAttributes(attributes) {
    if (!elements.variantAttributes) return;
    
    elements.variantAttributes.innerHTML = attributes.map(attr => {
      // Parse options (may be newline separated or JSON array)
      let options = attr.options;
      if (typeof options === 'string') {
        options = options.split('\n').map(o => o.trim()).filter(Boolean);
      }
      
      const optionsHtml = options.map(option => 
        `<option value="${option}">${option}</option>`
      ).join('');
      
      return `
        <div class="attribute-group">
          <label class="attribute-label" for="attr-${attr.attribute}">${attr.attribute}</label>
          <select class="attribute-select variant-attribute" id="attr-${attr.attribute}" data-attribute="${attr.attribute}">
            <option value="">Select ${attr.attribute}</option>
            ${optionsHtml}
          </select>
        </div>
      `;
    }).join('');
  }

  /**
   * Close variant selection modal
   */
  function closeVariantModal() {
    if (!elements.variantModal || !elements.variantOverlay) return;
    
    elements.variantModal.style.display = 'none';
    elements.variantOverlay.style.display = 'none';
    state.selectedItemTemplate = null;
  }

  /**
   * Add selected variant to order
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
      frappe.msgprint(__('Please select all variant attributes'));
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
          price: variant.standard_rate || 0,
          attributes: attributes
        });
        closeVariantModal();
      } else {
        frappe.msgprint(__('No matching variant found for the selected attributes'));
      }
      
      hideLoading();
    } catch (error) {
      console.error('Error resolving variant:', error);
      frappe.throw(__('Failed to resolve variant: ') + (error.message || ''));
      hideLoading();
    }
  }

  /**
   * Show notes input modal for an item
   * @param {number} index - Item index in the order
   */
  function showNotesModal(index) {
    if (!elements.notesModal || !elements.notesOverlay || !elements.itemNotesTextarea) return;
    
    // Store the current item index
    state.currentNoteItemIndex = index;
    
    // Fill textarea with existing notes
    if (index >= 0 && index < state.currentOrder.items.length) {
      elements.itemNotesTextarea.value = state.currentOrder.items[index].notes || '';
    } else {
      elements.itemNotesTextarea.value = '';
    }
    
    elements.notesOverlay.style.display = 'block';
    elements.notesModal.style.display = 'block';
    elements.itemNotesTextarea.focus();
  }

  /**
   * Close notes modal
   */
  function closeNotesModal() {
    if (!elements.notesModal || !elements.notesOverlay) return;
    
    elements.notesModal.style.display = 'none';
    elements.notesOverlay.style.display = 'none';
    state.currentNoteItemIndex = -1;
  }

  /**
   * Save notes for an item
   */
  function handleSaveNotes() {
    if (state.currentNoteItemIndex === undefined || 
        state.currentNoteItemIndex < 0 || 
        state.currentNoteItemIndex >= state.currentOrder.items.length) {
      closeNotesModal();
      return;
    }
    
    // Save the notes
    state.currentOrder.items[state.currentNoteItemIndex].notes = 
      elements.itemNotesTextarea.value.trim();
    
    closeNotesModal();
    renderOrderItems();
  }

  /**
   * Add an item to the current order
   * @param {Object} item - Item to add
   */
  function addItemToOrder(item) {
    if (!item) return;
    
    // Check if item already exists in order with same attributes
    const existingItemIndex = state.currentOrder.items.findIndex(orderItem => 
      orderItem.item_code === item.item_code && 
      JSON.stringify(orderItem.attributes || {}) === JSON.stringify(item.attributes || {})
    );
    
    if (existingItemIndex !== -1) {
      // Update quantity if item exists
      state.currentOrder.items[existingItemIndex].qty += 1;
    } else {
      // Add new item
      state.currentOrder.items.push({
        item_code: item.item_code,
        item_name: item.item_name,
        qty: 1,
        price: item.price || 0,
        attributes: item.attributes || {},
        notes: item.notes || ''
      });
    }
    
    renderOrderItems();
  }

  // Start the application
  init();
});
