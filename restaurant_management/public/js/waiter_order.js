frappe.ready(function() {
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
    itemsContainer: document.getElementById('items-container'),
    itemSearch: document.getElementById('item-search'),
    navTabs: document.querySelector('.nav-tabs'),
    orderItemsContainer: document.getElementById('order-items-container'),
    selectedTableDisplay: document.getElementById('selected-table-display'),
    sendToKitchenBtn: document.getElementById('send-to-kitchen-btn'),
    sendAdditionalBtn: document.getElementById('send-additional-btn'),
    variantModal: document.getElementById('variant-modal'),
    modalOverlay: document.getElementById('modal-overlay'),
    variantItemName: document.getElementById('variant-item-name'),
    variantAttributesContainer: document.getElementById('variant-attributes-container'),
    cancelVariantBtn: document.getElementById('cancel-variant-btn'),
    addVariantBtn: document.getElementById('add-variant-btn'),
    loadingOverlay: document.getElementById('loading-overlay'),
    // New Order Elements
    newOrderBtn: document.getElementById('new-order-btn'),
    newOrderTableNumber: document.getElementById('new-order-table-number')
  };

  // Initialize the page
  init();

  async function init() {
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
      console.error('Initialization error:', error);
      frappe.throw(__('Failed to initialize waiter order page'));
      hideLoading();
    }
  }

  // Data loading functions
  async function loadTables() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.waiter_order.get_available_tables',
        freeze: false
      });
      
      // result.message diharapkan mengembalikan daftar semua meja dengan status aktif atau available
      state.tables = result.message || [];
      renderTables();
    } catch (error) {
      console.error('Error loading tables:', error);
      frappe.throw(__('Failed to load tables'));
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
      frappe.throw(__('Failed to load menu items'));
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
      frappe.throw(__('Failed to load item groups'));
    }
  }

  // Rendering functions
  function renderTables() {
    // Tampilkan hanya meja yang sedang dalam keadaan "active" (ada order aktif)
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
  }

  function renderItems(filterGroup = 'all', searchQuery = '') {
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
  }

  function renderItemGroupTabs() {
    // Tambahkan tab kategori item
    const tabsHtml = state.itemGroups.map(group => 
      `<div class="nav-tab" data-group="${group.name}">${group.item_group_name}</div>`
    ).join('');
    
    // Anggap elemen navTabs sudah ada di HTML; jika tidak, bisa dihilangkan
    if (elements.navTabs) {
      elements.navTabs.innerHTML = '<div class="nav-tab active" data-group="all">All</div>' + tabsHtml;
    
      // Event listener untuk tab
      document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
          document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
          this.classList.add('active');
          renderItems(this.getAttribute('data-group'), elements.itemSearch.value);
        });
      });
    }
  }

  function renderOrderItems() {
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
  }

  function updateActionButtons() {
    // Tombol "Send to Kitchen" aktif jika ada meja yang dipilih dan order tidak kosong
    if (state.selectedTable && state.currentOrder.items.length > 0) {
      elements.sendToKitchenBtn.classList.remove('disabled-btn');
    } else {
      elements.sendToKitchenBtn.classList.add('disabled-btn');
    }

    // Tombol "Send Additional Items" aktif jika ada item baru yang belum dikirim
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

  function updateSelectedTableDisplay() {
    if (state.selectedTable) {
      elements.selectedTableDisplay.textContent = `Selected Table: ${state.selectedTable.table_number || state.selectedTable.name}`;
    } else {
      elements.selectedTableDisplay.textContent = 'No table selected';
    }
  }

  // Event handlers
  function setupEventListeners() {
    // Event untuk pemilihan meja aktif (edit order)
    elements.tablesContainer.addEventListener('click', handleTableSelection);
    
    // Event untuk tombol "New Order"
    if (elements.newOrderBtn) {
      elements.newOrderBtn.addEventListener('click', handleNewOrder);
    }

    // Event untuk pilihan item
    elements.itemsContainer.addEventListener('click', handleItemSelection);
    
    // Event pencarian item
    elements.itemSearch.addEventListener('input', handleItemSearch);
    
    // Event operasi item pada ringkasan order
    elements.orderItemsContainer.addEventListener('click', handleOrderItemActions);
    
    // Tombol kirim order ke dapur
    elements.sendToKitchenBtn.addEventListener('click', handleSendToKitchen);
    
    // Tombol kirim item tambahan
    elements.sendAdditionalBtn.addEventListener('click', handleSendAdditionalItems);
    
    // Event untuk modal varian
    elements.cancelVariantBtn.addEventListener('click', closeVariantModal);
    elements.addVariantBtn.addEventListener('click', handleAddVariant);
    elements.modalOverlay.addEventListener('click', closeVariantModal);
  }

  // Handle pemilihan meja aktif (dari grid)
  function handleTableSelection(event) {
    const tableButton = event.target.closest('.table-button');
    if (!tableButton) return;
    
    const tableId = tableButton.getAttribute('data-table-id');
    const table = state.tables.find(t => t.name === tableId);
    
    // Pilih atau batalkan pilihan
    if (state.selectedTable && state.selectedTable.name === tableId) {
      state.selectedTable = null;
    } else {
      state.selectedTable = table;
    }
    
    renderTables();
    updateSelectedTableDisplay();
    updateActionButtons();
  }

  // Handle pembuatan new order
  function handleNewOrder() {
    const tableNo = elements.newOrderTableNumber.value.trim();
    if (!tableNo) {
      frappe.msgprint(__('Please enter a table number'));
      return;
    }
    // Cari meja berdasarkan table_number atau name
    const table = state.tables.find(t => (t.table_number || t.name) == tableNo);
    if (!table) {
      frappe.msgprint(__('No table found with that number'));
      return;
    }
    // Jika meja sudah dipakai, beri notifikasi
    if (table.current_pos_order) {
      frappe.msgprint(__('Table is not available. It already has an active order.'));
      return;
    }
    // Jika meja tersedia, tandai sebagai order baru (misalnya dengan mengeset properti current_pos_order)
    table.current_pos_order = {};  // Ini simulasi pembuatan order baru; di real implementation, Anda bisa panggil API buat create order
    state.selectedTable = table;
    updateSelectedTableDisplay();
    // Re-render tabel: karena sekarang meja yang dibuat new order tidak akan tampil di grid active (grid hanya memuat meja dengan order aktif)
    renderTables();
    frappe.msgprint(__('New order created at Table ') + tableNo);
  }

  function handleItemSelection(event) {
    const itemButton = event.target.closest('.item-button');
    if (!itemButton) return;
    
    const itemCode = itemButton.getAttribute('data-item-code');
    const item = state.items.find(i => i.item_code === itemCode);
    
    if (!item) return;
    
    if (item.has_variants) {
      // Tampilkan modal pilihan varian
      state.selectedItemTemplate = item;
      showVariantModal(item);
    } else {
      // Tambahkan item langsung ke order
      addItemToOrder(item);
    }
  }

  function handleItemSearch(event) {
    const searchQuery = event.target.value;
    const activeGroupElem = document.querySelector('.nav-tab.active');
    const activeGroup = activeGroupElem ? activeGroupElem.getAttribute('data-group') : 'all';
    renderItems(activeGroup, searchQuery);
  }

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

  async function handleSendToKitchen() {
    if (!state.selectedTable || !state.currentOrder.items.length || 
        elements.sendToKitchenBtn.classList.contains('disabled-btn')) {
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
      
      if (result.message && result.message.success) {
        // Tandai item sebagai sudah terkirim
        state.currentOrder.sentItems = [...state.currentOrder.items];
        frappe.show_alert({
          message: __('Order sent to kitchen successfully'),
          indicator: 'green'
        }, 5);
        // Refresh daftar meja untuk update occupancy
        await loadTables();
        updateActionButtons();
      } else {
        frappe.throw(__('Failed to send order to kitchen'));
      }
      hideLoading();
    } catch (error) {
      console.error('Error sending order to kitchen:', error);
      frappe.throw(__('Failed to send order to kitchen'));
      hideLoading();
    }
  }

  async function handleSendAdditionalItems() {
    if (!state.selectedTable || elements.sendAdditionalBtn.classList.contains('disabled-btn')) {
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
      console.error('Error sending additional items:', error);
      frappe.throw(__('Failed to send additional items to kitchen'));
      hideLoading();
    }
  }

  // Variant handling
  function showVariantModal(item) {
    elements.variantItemName.textContent = item.item_name;
    
    // Ambil atribut varian
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
  }

  function renderVariantAttributes(attributes) {
    elements.variantAttributesContainer.innerHTML = attributes.map(attr => {
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

  function closeVariantModal() {
    elements.modalOverlay.style.display = 'none';
    elements.variantModal.style.display = 'none';
    state.selectedItemTemplate = null;
  }

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
      frappe.throw(__('Please select all variant attributes'));
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
        frappe.throw(__('Failed to resolve variant'));
      }
      
      hideLoading();
    } catch (error) {
      console.error('Error resolving variant:', error);
      frappe.throw(__('Failed to resolve variant'));
      hideLoading();
    }
  }

  // Helper: Tambahkan item ke order
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

  function showLoading() {
    state.loading = true;
    elements.loadingOverlay.style.display = 'flex';
  }

  function hideLoading() {
    state.loading = false;
    elements.loadingOverlay.style.display = 'none';
  }
});
