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

  // Check if required DOM elements exist and create fallbacks if needed
  function checkElements() {
    // If tables container is missing, find another container or create one
    if (!elements.tablesContainer) {
      elements.tablesContainer = document.querySelector('.tables-grid') || 
                                document.querySelector('.overview-content');
      
      // If still not found, create a fallback
      if (!elements.tablesContainer) {
        const container = document.createElement('div');
        container.id = 'tables-container';
        container.className = 'tables-grid';
        document.body.appendChild(container);
        elements.tablesContainer = container;
      }
    }
    
    // If branch select is missing, create a fallback
    if (!elements.branchCodeSelect) {
      // Try to find it by class
      elements.branchCodeSelect = document.querySelector('.branch-select');
      
      if (!elements.branchCodeSelect) {
        console.warn('Branch select dropdown not found in DOM');
        // We won't create this as it's less critical
      }
    }
    
    // If refresh countdown is missing, create a fallback
    if (!elements.refreshCountdown) {
      elements.refreshCountdown = document.querySelector('#refresh-countdown');
      
      if (!elements.refreshCountdown) {
        console.warn('Refresh countdown element not found in DOM');
        // Not critical, so we won't create it
      }
    }
    
    // If loading overlay is missing, create one
    if (!elements.loadingOverlay) {
      const loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'loading-overlay';
      loadingOverlay.className = 'loading-overlay';
      loadingOverlay.style.position = 'fixed';
      loadingOverlay.style.top = '0';
      loadingOverlay.style.left = '0';
      loadingOverlay.style.right = '0';
      loadingOverlay.style.bottom = '0';
      loadingOverlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
      loadingOverlay.style.display = 'none';
      loadingOverlay.style.justifyContent = 'center';
      loadingOverlay.style.alignItems = 'center';
      loadingOverlay.style.zIndex = '1000';
      loadingOverlay.style.color = 'white';
      loadingOverlay.style.fontSize = '20px';
      
      loadingOverlay.innerHTML = '<div class="spinner" style="border: 4px solid rgba(255,255,255,0.3); border-radius: 50%; border-top: 4px solid white; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-right: 15px;"></div><div>Loading...</div>';
      
      // Add spin animation if needed
      if (!document.getElementById('spin-animation')) {
        const style = document.createElement('style');
        style.id = 'spin-animation';
        style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }
      
      document.body.appendChild(loadingOverlay);
      elements.loadingOverlay = loadingOverlay;
    }
  }

  // Initialize the Table Overview
  init();

  async function init() {
    try {
      // First ensure all required elements exist
      checkElements();
      
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
      
      // Show error message in a more reliable way
      try {
        frappe.show_alert({
          message: __('Failed to initialize Table Overview'),
          indicator: 'red'
        });
      } catch (alertError) {
        console.error('Could not show alert:', alertError);
        
        // Fallback to basic alert if frappe.show_alert fails
        try {
          alert('Failed to initialize Table Overview');
        } catch (e) { /* Last resort - just log it */ }
      }
      
      hideLoading();
    }
  }

  // Load configuration from server
  async function loadConfig() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.table_display.get_table_display_config',
        freeze: false
      }).catch(error => {
        console.warn("API call failed for config:", error);
        return { message: null }; // Return empty result on failure
      });
      
      if (result && result.message) {
        // Update config with server values
        Object.assign(state.config, result.message);
        
        // Apply configuration
        state.refreshInterval = state.config.refresh_interval || 30;
        state.currentCount = state.refreshInterval;
        
        // Set default branch if configured and no user selection
        if (!state.selectedBranch && state.config.default_branch_code) {
          state.selectedBranch = state.config.default_branch_code;
          try {
            localStorage.setItem('table_overview_selected_branch', state.selectedBranch);
          } catch (e) {
            console.warn('Could not store branch preference in localStorage', e);
          }
        }
      }
    } catch (error) {
      console.error('Error loading Table Overview config:', error);
      // Use default config values (already set in state initialization)
    }
  }

  // Load branches
  async function loadBranches() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.table_display.get_branches',
        freeze: false
      }).catch(error => {
        console.warn("API call failed for branches:", error);
        return { message: [] }; // Return empty result on failure
      });
      
      state.branches = result && result.message ? result.message : [];
      renderBranchOptions();
    } catch (error) {
      console.error('Error loading branches:', error);
      state.branches = []; // Set empty branches array
      renderBranchOptions(); // Render with empty data
      
      try {
        frappe.show_alert({
          message: __('Failed to load branches'),
          indicator: 'red'
        });
      } catch (e) {
        console.warn('Could not show alert', e);
      }
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
      }).catch(error => {
        console.warn("API call failed for table data:", error);
        return { message: [] }; // Return empty result on failure
      });
      
      state.tables = result && result.message ? result.message : [];
      renderTables();
      
      state.isLoading = false;
    } catch (error) {
      console.error('Error refreshing table data:', error);
      state.tables = []; // Set empty tables array
      renderTables(); // Render with empty data
      state.isLoading = false;
    }
  }

  // Render branch options
  function renderBranchOptions() {
    // Safety check for the select element
    if (!elements.branchCodeSelect) return;
    
    let options = '<option value="">All Branches</option>';
    
    if (state.branches && state.branches.length) {
      state.branches.forEach(branch => {
        if (branch && branch.branch_code) {
          options += `<option value="${branch.branch_code}" ${state.selectedBranch === branch.branch_code ? 'selected' : ''}>${branch.branch_name || branch.branch_code} (${branch.branch_code})</option>`;
        }
      });
    }
    
    elements.branchCodeSelect.innerHTML = options;
  }

  // Render tables
  function renderTables() {
    // Safety check for the container element
    if (!elements.tablesContainer) return;
    
    if (!state.tables || !state.tables.length) {
      elements.tablesContainer.innerHTML = `
        <div class="empty-state">
          No active tables found for the selected branch
        </div>
      `;
      return;
    }

    elements.tablesContainer.innerHTML = state.tables.map(table => {
      if (!table) return ''; // Skip invalid table objects
      
      // Generate summary statistics display with safe fallbacks
      const summary = table.summary || {
        total_items: 0,
        items_in_progress: 0,
        items_ready: 0,
        items_served: 0,
        total_amount: 0
      };
      
      const summaryStats = `
        <div class="table-summary">
          <div class="summary-stat">
            <div class="stat-value">${summary.total_items || 0}</div>
            <div class="stat-label">Total Items</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${summary.items_in_progress || 0}</div>
            <div class="stat-label">In Progress</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${summary.items_ready || 0}</div>
            <div class="stat-label">Ready</div>
          </div>
          <div class="summary-stat">
            <div class="stat-value">${summary.items_served || 0}</div>
            <div class="stat-label">Served</div>
          </div>
        </div>
      `;
      
      // Generate items list with safety checks
      const items = table.items || [];
      const itemsList = items.length ? 
        items.map(item => {
          if (!item) return ''; // Skip invalid items
          
          return `
            <div class="item-row">
              <div class="item-info">
                <span class="item-name">${item.item_name || 'Unknown Item'}</span>
                <span class="item-quantity">x${item.qty || 1}</span>
              </div>
              <div class="item-status status-${(item.status || 'waiting').toLowerCase()}">${item.status || 'Waiting'}</div>
            </div>
          `;
        }).join('') : 
        '<div class="empty-items">No items</div>';
      
      return `
        <div class="table-card">
          <div class="table-header">
            <div class="table-number">Table ${table.table_number || table.name || 'Unknown'}</div>
            <div class="table-status status-${(table.status || 'available').toLowerCase()}">${table.status || 'Available'}</div>
          </div>
          
          ${summaryStats}
          
          <div class="table-items">
            ${itemsList}
          </div>
          
          <div class="total-amount">
            Total: ₹${formatCurrency(summary.total_amount || 0)}
          </div>
        </div>
      `;
    }).join('');
  }

  // Set up event listeners
  function setupEventListeners() {
    // Branch select change - with safety check
    if (elements.branchCodeSelect) {
      elements.branchCodeSelect.addEventListener('change', function() {
        state.selectedBranch = this.value;
        try {
          localStorage.setItem('table_overview_selected_branch', state.selectedBranch);
        } catch (e) {
          console.warn('Could not store branch preference in localStorage', e);
        }
        refreshTableData();
      });
    }
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

  // Update countdown display with safety check
  function updateCountdownDisplay() {
    if (elements.refreshCountdown) {
      elements.refreshCountdown.textContent = state.currentCount;
    }
  }

  // Helper Functions
  function formatCurrency(amount) {
    try {
      return parseFloat(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
    } catch (e) {
      return '0.00'; // Return default value if formatting fails
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