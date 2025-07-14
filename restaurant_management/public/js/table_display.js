frappe.ready(function() {
  // State management
  const state = {
    tables: [],
    branches: [],
    selectedBranch: localStorage.getItem('selected_branch') || '',
    refreshInterval: 30, // seconds
    countdownInterval: null,
    currentCount: 30,
    isLoading: false,
    config: {
      refresh_interval: 30,
      status_colors: {
        'Available': '#2ecc71', // green
        'In Progress': '#e74c3c', // red
        'Paid': '#3498db'        // blue
      }
    }
  };

  // DOM Elements
  const elements = {
    tablesContainer: document.getElementById('tables-container'),
    branchSelector: document.getElementById('branch-selector'),
    refreshCountdown: document.getElementById('refresh-countdown'),
    refreshNowBtn: document.getElementById('refresh-now-btn'),
    loadingOverlay: document.getElementById('loading-overlay')
  };

  // Initialize the page
  init();

  async function init() {
    try {
      ensureElements();
      showLoading();
      
      // Load branches
      await loadBranches();
      
      // Set up event listeners
      setupEventListeners();
      
      // Load initial table data
      await refreshTableData();
      
      // Start auto-refresh
      startRefreshTimer();
      
      hideLoading();
    } catch (error) {
      console.error('Error initializing Table Display:', error);
      frappe.msgprint(__('Failed to initialize Table Display'));
      hideLoading();
    }
  }

  // Ensure all required elements exist
  function ensureElements() {
    if (!elements.tablesContainer) {
      elements.tablesContainer = document.getElementById('tables-container');
    }
    if (!elements.tablesContainer) {
      const container = document.createElement('div');
      container.id = 'tables-container';
      container.className = 'tables-grid';
      document.body.appendChild(container);
      elements.tablesContainer = container;
    }

    if (!elements.loadingOverlay) {
      elements.loadingOverlay = document.getElementById('loading-overlay');
    }
    if (!elements.loadingOverlay) {
      const loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'loading-overlay';
      loadingOverlay.className = 'loading-overlay';
      loadingOverlay.innerHTML = '<div class="spinner"></div><div>Loading...</div>';
      document.body.appendChild(loadingOverlay);
      elements.loadingOverlay = loadingOverlay;
    }

    if (!elements.branchSelector) {
      elements.branchSelector = document.getElementById('branch-selector');
    }
    
  }

  // Load branches from server
  async function loadBranches() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.table_display.get_branches',
        freeze: false
      });
      
      state.branches = result.message || [];
      renderBranchSelector();
    } catch (error) {
      console.error('Error loading branches:', error);
      frappe.msgprint(__('Failed to load branches'));
      state.branches = [];
    }
  }

  // Refresh table data
  async function refreshTableData() {
    if (state.isLoading) return;
    
    try {
      state.isLoading = true;
      
      const result = await frappe.call({
        method: 'restaurant_management.api.table_display.get_table_status',
        args: {
          branch: state.selectedBranch
        },
        freeze: false
      });
      
      state.tables = result.message || [];

      // Add fallback for empty results
    if (!state.tables.length) {
        frappe.msgprint(__('No tables available in this branch.'));
      }

      renderTables();
      
      state.isLoading = false;
    } catch (error) {
      console.error('Error refreshing table data:', error);
      frappe.msgprint(__('Failed to load table status'));
      state.isLoading = false;
    }
  }

  // Render branch selector
  function renderBranchSelector() {
    if (!elements.branchSelector) return;
    
    let options = '<option value="">All Branches</option>';
    
    state.branches.forEach(branch => {
      options += `<option value="${branch.name}" ${state.selectedBranch === branch.name ? 'selected' : ''}>${branch.branch_name || branch.name}</option>`;
    });
    
    elements.branchSelector.innerHTML = options;
  }

  // Render tables
  function renderTables() {
    if (!elements.tablesContainer) return;
    
    if (!state.tables.length) {
      elements.tablesContainer.innerHTML = `
        <div class="empty-state">
          <h3>No tables found</h3>
          <p>No tables are available for the selected branch</p>
        </div>
      `;
      return;
    }

    elements.tablesContainer.innerHTML = state.tables.map(table => {
      // Get status color
      const statusColor = state.config.status_colors[table.status] || '#95a5a6'; // Default gray
      
      // Get capacity display
      const capacityDisplay = table.seating_capacity ? 
        `<span class="capacity-indicator">(${table.seating_capacity} seats)</span>` : '';
      
      // Create waiter info if available
      let waiterInfo = '';
      if (table.current_pos_order) {
        waiterInfo = `
          <div class="table-info">
            <p>Order: ${table.current_pos_order}</p>
            ${table.waiter ? `<p class="waiter-name">Waiter: ${table.waiter}</p>` : ''}
            ${table.order_time ? `<p>Since: ${formatTime(table.order_time)}</p>` : ''}
          </div>
        `;
      }
      
      return `
        <div class="table-card" data-table-id="${table.name}" data-order-id="${table.current_pos_order || ''}">
          <div class="table-status" style="background-color: ${statusColor};"></div>
          <div class="table-number">
            Table ${table.table_number || table.name}
            ${capacityDisplay}
          </div>
          <div class="table-branch">${table.branch_code || table.branch || ''}</div>
          ${waiterInfo}
        </div>
      `;
    }).join('');
  }

  // Set up event listeners
  function setupEventListeners() {
    // Branch selector change
    if (elements.branchSelector) {
      elements.branchSelector.addEventListener('change', function() {
        state.selectedBranch = this.value;
        localStorage.setItem('selected_branch', state.selectedBranch);
        refreshTableData();
        resetRefreshTimer();
      });
    }
    
    // Refresh now button
    if (elements.refreshNowBtn) {
      elements.refreshNowBtn.addEventListener('click', function() {
        refreshTableData();
        resetRefreshTimer();
      });
    }
    
    // Table card click - use event delegation
    if (elements.tablesContainer) {
      elements.tablesContainer.addEventListener('click', function(e) {
        const tableCard = e.target.closest('.table-card');
        if (!tableCard) return;
        
        const tableId = tableCard.getAttribute('data-table-id');
        const orderId = tableCard.getAttribute('data-order-id');
        
        if (orderId) {
          // If there's an active order, go to the order page
          window.location.href = `/app/waiter-order/${orderId}`;
        } else {
          // If table is available, go to new order page with table pre-selected
          window.location.href = `/app/waiter-order/new-waiter-order?table=${tableId}`;
        }
      });
    }
  }

  // Start refresh timer
  function startRefreshTimer() {
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
    }
    
    state.currentCount = state.config.refresh_interval;
    updateCountdownDisplay();
    
    state.countdownInterval = setInterval(() => {
      state.currentCount -= 1;
      updateCountdownDisplay();
      
      if (state.currentCount <= 0) {
        state.currentCount = state.config.refresh_interval;
        refreshTableData();
      }
    }, 1000);
  }

  // Reset refresh timer
  function resetRefreshTimer() {
    state.currentCount = state.config.refresh_interval;
    updateCountdownDisplay();
  }

  // Update countdown display
  function updateCountdownDisplay() {
    if (elements.refreshCountdown) {
      elements.refreshCountdown.textContent = state.currentCount;
    }
  }

  // Helper Functions
  function formatTime(datetime) {
    if (!datetime) return '';
    
    try {
      const date = new Date(datetime);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch (e) {
      return datetime;
    }
  }

  function showLoading() {
    if (elements.loadingOverlay) {
      elements.loadingOverlay.style.display = 'flex';
    }
  }

  function hideLoading() {
    if (elements.loadingOverlay) {
      elements.loadingOverlay.style.display = 'none';
    }
  }
});