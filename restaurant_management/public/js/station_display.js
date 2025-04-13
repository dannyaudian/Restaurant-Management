frappe.ready(function() {
  // State management
  const state = {
    queue: [],
    kitchenStations: [],
    branches: [],
    selectedStation: localStorage.getItem('kds_selected_station') || '',
    selectedBranch: localStorage.getItem('kds_selected_branch') || '',
    refreshInterval: 10, // seconds
    countdownInterval: null,
    currentCount: 10,
    isLoading: false,
    config: {
      refresh_interval: 10,
      default_kitchen_station: '',
      status_color_map: {
        'Waiting': '#e74c3c',
        'Cooking': '#f39c12',
        'Ready': '#2ecc71'
      },
      enable_sound_on_ready: true
    }
  };

  // DOM Elements
  const elements = {
    queueItems: document.getElementById('queue-items'),
    kitchenStationSelect: document.getElementById('kitchen-station'),
    branchCodeSelect: document.getElementById('branch-code'),
    refreshCountdown: document.getElementById('refresh-countdown'),
    loadingOverlay: document.getElementById('kds-loading')
  };

  function checkElements() {
    if (!elements.loadingOverlay) {
      const loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'loading-overlay';
      loadingOverlay.className = 'loading-overlay';
      loadingOverlay.innerHTML = '<div class="spinner"></div><div>Loading...</div>';
      document.body.appendChild(loadingOverlay);
      elements.loadingOverlay = loadingOverlay;
    }
  };

  // Sound for notifications
  let readySound = null;
  if (state.config.enable_sound_on_ready) {
    readySound = new Audio('/assets/restaurant_management/sounds/ready_alert.mp3');
  }

  // Initialize the KDS
  init();

  async function init() {
    try {
      showLoading();
      
      // Load configuration
      await loadConfig();
      
      // Load kitchen stations and branches
      await Promise.all([
        loadKitchenStations(),
        loadBranches()
      ]);
      
      // Set up event listeners
      setupEventListeners();
      
      // Load initial queue data
      await refreshQueueData();
      
      // Start auto-refresh
      startRefreshTimer();
      
      hideLoading();
    } catch (error) {
      console.error('Error initializing KDS:', error);
      frappe.msgprint({
        title: __('Error'),
        indicator: 'red',
        message: __('Failed to initialize Kitchen Display System')
      });
      hideLoading();
    }
  }

  // Load configuration from server
  async function loadConfig() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.kds_display.get_kds_config',
        freeze: false
      });
      
      if (result.message) {
        // Update config with server values
        Object.assign(state.config, result.message);
        
        // Apply configuration
        state.refreshInterval = state.config.refresh_interval || 10;
        state.currentCount = state.refreshInterval;
        
        // Set default station if configured and no user selection
        if (!state.selectedStation && state.config.default_kitchen_station) {
          state.selectedStation = state.config.default_kitchen_station;
          localStorage.setItem('kds_selected_station', state.selectedStation);
        }
      }
    } catch (error) {
      console.error('Error loading KDS config:', error);
      // Use default config values
    }
  }

  // Load kitchen stations
  async function loadKitchenStations() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.kds_display.get_kitchen_stations',
        freeze: false
      });
      
      state.kitchenStations = result.message || [];
      renderKitchenStationOptions();
    } catch (error) {
      console.error('Error loading kitchen stations:', error);
      frappe.msgprint({
        title: __('Error'),
        indicator: 'red',
        message: __('Failed to load kitchen stations')
      });
    }
  }

  // Load branches
  async function loadBranches() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.kds_display.get_branches',
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

  // Refresh queue data
  async function refreshQueueData() {
    if (state.isLoading) return;
    
    try {
      state.isLoading = true;
      
      const result = await frappe.call({
        method: 'restaurant_management.api.kds_display.get_kitchen_item_queue',
        args: {
          kitchen_station: state.selectedStation,
          branch_code: state.selectedBranch
        },
        freeze: false
      });
      
      // Check for new "Ready" items to play sound
      if (state.config.enable_sound_on_ready && state.queue.length > 0) {
        const newReadyItems = (result.message || []).filter(item => 
          item.status === 'Ready' && 
          !state.queue.some(existingItem => 
            existingItem.id === item.id && existingItem.status === 'Ready'
          )
        );
        
        if (newReadyItems.length > 0 && readySound) {
          readySound.play().catch(e => console.error('Error playing sound:', e));
        }
      }
      
      state.queue = result.message || [];
      renderQueueItems();
      
      state.isLoading = false;
    } catch (error) {
      console.error('Error refreshing queue data:', error);
      state.isLoading = false;
    }
  }

  // Render kitchen station options
  function renderKitchenStationOptions() {
    let options = '<option value="">All Stations</option>';
    
    state.kitchenStations.forEach(station => {
      options += `<option value="${station.name}" ${state.selectedStation === station.name ? 'selected' : ''}>${station.station_name}</option>`;
    });
    
    elements.kitchenStationSelect.innerHTML = options;
  }

  // Render branch options
  function renderBranchOptions() {
    let options = '<option value="">All Branches</option>';
    
    state.branches.forEach(branch => {
      options += `<option value="${branch.branch_code}" ${state.selectedBranch === branch.branch_code ? 'selected' : ''}>${branch.branch_name} (${branch.branch_code})</option>`;
    });
    
    elements.branchCodeSelect.innerHTML = options;
  }

  // Render queue items
  function renderQueueItems() {
    if (!state.queue.length) {
      elements.queueItems.innerHTML = `
        <tr>
          <td colspan="5" class="kds-empty">No items in queue</td>
        </tr>
      `;
      return;
    }

    elements.queueItems.innerHTML = state.queue.map(item => {
      const queueTime = formatQueueTime(item.time_in_queue);
      const isUrgent = item.time_in_queue > 15 * 60; // More than 15 minutes
      
      const nextStatus = getNextStatus(item.status);
      const actionButton = nextStatus ? 
        `<button class="kds-action-btn kds-action-${item.status.toLowerCase()}" data-item-id="${item.id}" data-next-status="${nextStatus}">
           Mark ${nextStatus}
         </button>` : 
        '';
      
      return `
        <tr class="item-row status-row-${item.status.toLowerCase()}">
          <td>
            <strong>${item.item_name}</strong>
            ${item.notes ? `<div><small>${item.notes}</small></div>` : ''}
          </td>
          <td>${item.table_number}</td>
          <td class="kds-time ${isUrgent ? 'urgent' : ''}">${queueTime}</td>
          <td><span class="status-${item.status.toLowerCase()}">${item.status}</span></td>
          <td>${actionButton}</td>
        </tr>
      `;
    }).join('');
  }

  // Set up event listeners
  function setupEventListeners() {
    // Kitchen station select change
    elements.kitchenStationSelect.addEventListener('change', function() {
      state.selectedStation = this.value;
      localStorage.setItem('kds_selected_station', state.selectedStation);
      refreshQueueData();
    });
    
    // Branch select change
    elements.branchCodeSelect.addEventListener('change', function() {
      state.selectedBranch = this.value;
      localStorage.setItem('kds_selected_branch', state.selectedBranch);
      refreshQueueData();
    });
    
    // Action buttons (event delegation)
    elements.queueItems.addEventListener('click', async function(event) {
      const actionButton = event.target.closest('.kds-action-btn');
      if (!actionButton) return;
      
      const itemId = actionButton.getAttribute('data-item-id');
      const nextStatus = actionButton.getAttribute('data-next-status');
      
      if (itemId && nextStatus) {
        try {
          showLoading();
          
          const result = await frappe.call({
            method: 'restaurant_management.api.kds_display.update_item_status',
            args: {
              item_id: itemId,
              new_status: nextStatus
            },
            freeze: true,
            freeze_message: __(`Updating status to ${nextStatus}...`)
          });
          
          if (result.message && result.message.success) {
            // Update local state
            const itemIndex = state.queue.findIndex(item => item.id === itemId);
            if (itemIndex !== -1) {
              state.queue[itemIndex].status = nextStatus;
            }
            
            renderQueueItems();
            
            frappe.show_alert({
              message: __(`Item status updated to ${nextStatus}`),
              indicator: 'green'
            }, 3);
          } else {
            frappe.msgprint({
              title: __('Error'),
              indicator: 'red',
              message: result.message.error || __('Failed to update item status')
            });
          }
          
          hideLoading();
        } catch (error) {
          console.error('Error updating item status:', error);
          frappe.msgprint({
            title: __('Error'),
            indicator: 'red',
            message: __('Failed to update item status')
          });
          hideLoading();
        }
      }
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
        refreshQueueData();
      }
    }, 1000);
  }

  // Update countdown display
  function updateCountdownDisplay() {
    elements.refreshCountdown.textContent = state.currentCount;
  }

  // Helper Functions
  function formatQueueTime(seconds) {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  function getNextStatus(currentStatus) {
    switch (currentStatus) {
      case 'Waiting':
        return 'Cooking';
      case 'Cooking':
        return 'Ready';
      case 'Ready':
        return null; // No next status
      default:
        return null;
    }
  }

  function showLoading() {
    elements.loadingOverlay.style.display = 'flex';
  }

  function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
  }
});
