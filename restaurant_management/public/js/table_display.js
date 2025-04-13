frappe.ready(function() {
  // State management
  const state = {
    tables: [],
    branches: [],
    selectedBranch: localStorage.getItem('table_overview_selected_branch') || '',
    refreshInterval: 30, // seconds
    countdownInterval: null,
    currentCount: 30,
    isLoading: false,
    config: {
      refresh_interval: 30,
      status_color_map: {
        'Waiting': '#e74c3c',
        'Cooking': '#f39c12',
        'Ready': '#2ecc71',
        'Served': '#95a5a6'
      },
      default_branch_code: ''
    }
  };

  // DOM Elements
  const elements = {
    tablesContainer: document.getElementById('tables-container'),
    branchCodeSelect: document.getElementById('branch-code'),
    refreshCountdown: document.getElementById('refresh-countdown'),
    loadingOverlay: document.getElementById('loading-overlay')
  };

  // Initialize the Table Overview
  init();

  async function init() {
    try {
      showLoading();
      
      // Load configuration
      await loadConfig();
      
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
      console.error('Error initializing Table Overview:', error);
      frappe.msgprint({
        title: __('Error'),
        indicator: 'red',
        message: __('Failed to initialize Table Overview')
      });
      hideLoading();
    }
  }

  // Load configuration from server
  async function loadConfig() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.table_display.get_table_display_config',
        freeze: false
      });
      
      if (result.message) {
        // Update config with server values
        Object.assign(state.config, result.message);
        
        // Apply configuration
        state.refreshInterval = state.config.refresh_interval || 30;
        state.currentCount = state.refreshInterval;
        
        // Set default branch if configured and no user selection
        if (!state.selectedBranch && state.config.default_branch_code) {
          state.selectedBranch = state.config.default_branch_code;
          localStorage.setItem('table_overview_selected_branch', state.selectedBranch);
        }
      }
    } catch (error) {
      console.error('Error loading Table Overview config:', error);
      // Use default config values
    }
  }

  // Load branches
  async function loadBranches() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.table_display.get_branches',
        freeze: false
      });
      
      state.branches = result.message || [];
      renderBranchOptions();
    } catch (error) {
      console.error('Error loading branches:', error);
      frappe.msgprint({
        title: __('Error'),
        indicator: 'red',
        message: __('Failed to load branches')
      });
    }
  }

  // Refresh table data
  async function refreshTableData() {
    if (state.isLoading) return;
    
    try {
      state.isLoading = true;
      
      const result = await frappe.call({
        method: 'restaurant_management.api.table_display.get_table_overview',
        args: {
          branch_code: state.selectedBranch
        },
        freeze: false
      });
      
      state.tables = result.message || [];
      renderTables();
      
      state.isLoading = false;
    } catch (error) {
      console.error('Error refreshing table data:', error);
      state.isLoading = false;
    }
  }

  // Render branch options
  function renderBranchOptions() {
    let options = '<option value="">All Branches</option>';
    
    state.branches.forEach(branch => {
      options += `<option value="${branch.branch_code}" ${state.selectedBranch === branch.branch_code ? 'selected' : ''}>${branch.branch_name} (${branch.branch_code})</option>`;
    });
    
    elements.branchCodeSelect.innerHTML = options;
  }

  // Render tables
  function renderTables() {
    if (!state.tables.length) {
      elements.tablesContainer.innerHTML = `
        <div class="empty-state">
          No active tables found for the selected branch
        </div>
      `;
      return;
    }

    elements.tablesContainer.innerHTML = state.tables.map(table => {
      // Generate summary statistics display
      const summaryStats = `
        <div class="table-summary">
          <div class="summary-stat">
            <div class="stat-value">${table.summary.total_items}</div>
            <div class="stat-label">Total Items</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${table.summary.items_in_progress}</div>
            <div class="stat-label">In Progress</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${table.summary.items_ready}</div>
            <div class="stat-label">Ready</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${table.summary.items_served}</div>
            <div class="stat-label">Served</div>
          </div>
        </div>
      `;
      
      // Generate items list
      const itemsList = table.items.length ? 
        table.items.map(item => `
          <div class="item-row">
            <div class="item-info">
              <span class="item-name">${item.item_name}</span>
              <span class="item-quantity">x${item.qty}</span>
            </div>
            <div class="item-status status-${item.status.toLowerCase()}">${item.status}</div>
          </div>
        `).join('') : 
        '<div class="empty-items">No items</div>';
      
      return `
        <div class="table-card">
          <div class="table-header">
            <div class="table-number">Table ${table.table_number}</div>
            <div class="table-status status-${table.status.toLowerCase()}">${table.status}</div>
          </div>
          
          ${summaryStats}
          
          <div class="table-items">
            ${itemsList}
          </div>
          
          <div class="total-amount">
            Total: ₹${formatCurrency(table.summary.total_amount)}
          </div>
        </div>
      `;
    }).join('');
  }

  // Set up event listeners
  function setupEventListeners() {
    // Branch select change
    elements.branchCodeSelect.addEventListener('change', function() {
      state.selectedBranch = this.value;
      localStorage.setItem('table_overview_selected_branch', state.selectedBranch);
      refreshTableData();
    });
  }

  // Start refresh timer
  function startRefreshTimer() {
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
    }
    
    state.currentCount = state.refreshInterval;
    updateCountdownDisplay();
    
    state.countdownInterval = setInterval(() => {
      state.currentCount -= 1;
      updateCountdownDisplay();
      
      if (state.currentCount <= 0) {
        state.currentCount = state.refreshInterval;
        refreshTableData();
      }
    }, 1000);
  }

  // Update countdown display
  function updateCountdownDisplay() {
    elements.refreshCountdown.textContent = state.currentCount;
  }

  // Helper Functions
  function formatCurrency(amount) {
    return parseFloat(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
  }

  function showLoading() {
    elements.loadingOverlay.style.display = 'flex';
  }

  function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
  }
});
