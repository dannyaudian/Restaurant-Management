```javascript
/**
 * Kitchen Station Display System
 * Displays and manages food orders queue for kitchen stations
 */
(function() {
  'use strict';

  /**
   * Application state
   * @type {Object}
   */
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
    },
    readySound: null,
    soundErrorLogged: false
  };

  /**
   * DOM Elements map
   * @type {Object}
   */
  const elements = {
    'queue-items': null,
    'kitchen-station-select': null,
    'branch-select': null,
    'refresh-countdown': null,
    'loading-overlay': null
  };

  /**
   * Unified logging helper
   * @param {string} level - Log level (debug, info, warn, error)
   * @param {string} message - Message to log
   * @param {*} [data] - Optional data to include
   */
  function log(level, message, data) {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    const logLevel = validLevels.includes(level) ? level : 'info';
    
    if (data) {
      console[logLevel](`[KDS] ${message}`, data);
    } else {
      console[logLevel](`[KDS] ${message}`);
    }
  }

  /**
   * Checks if all required DOM elements exist, creates fallbacks if missing
   */
  function checkElements() {
    // Queue items container
    elements['queue-items'] = document.getElementById('queue-items') || 
                             document.querySelector('.kds-queue tbody');
    
    if (!elements['queue-items']) {
      log('warn', 'Creating fallback queue items container');
      const tableBody = document.createElement('tbody');
      tableBody.id = 'queue-items';
      
      // Try to find or create table
      let table = document.querySelector('.kds-queue');
      if (!table) {
        table = document.createElement('table');
        table.className = 'kds-queue';
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        
        // Create header
        const thead = document.createElement('thead');
        thead.innerHTML = `
          <tr>
            <th>Item</th>
            <th>Table</th>
            <th>Time in Queue</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        `;
        table.appendChild(thead);
      }
      
      table.appendChild(tableBody);
      
      // Find container or append to body
      const container = document.querySelector('.kds-content') || document.body;
      container.appendChild(table);
      elements['queue-items'] = tableBody;
    }
    
    // Kitchen station select
    elements['kitchen-station-select'] = document.getElementById('kitchen-station-select') || 
                                       document.getElementById('kitchen-station');
    
    if (!elements['kitchen-station-select']) {
      log('warn', 'Creating fallback kitchen station select');
      const select = document.createElement('select');
      select.id = 'kitchen-station-select';
      select.className = 'kds-select';
      select.innerHTML = '<option value="">All Stations</option>';
      
      // Find controls container or create one
      let container = document.querySelector('.kds-controls');
      if (!container) {
        container = document.createElement('div');
        container.className = 'kds-controls';
        document.body.prepend(container);
      }
      
      // Add label
      const label = document.createElement('label');
      label.htmlFor = 'kitchen-station-select';
      label.textContent = 'Station: ';
      container.appendChild(label);
      container.appendChild(select);
      elements['kitchen-station-select'] = select;
    }
    
    // Branch select
    elements['branch-select'] = document.getElementById('branch-select') || 
                              document.getElementById('branch-code');
    
    if (!elements['branch-select']) {
      log('warn', 'Creating fallback branch select');
      const select = document.createElement('select');
      select.id = 'branch-select';
      select.className = 'kds-select';
      select.innerHTML = '<option value="">All Branches</option>';
      
      // Find controls container or create one
      let container = document.querySelector('.kds-controls');
      if (!container) {
        container = document.createElement('div');
        container.className = 'kds-controls';
        document.body.prepend(container);
      }
      
      // Add label
      const label = document.createElement('label');
      label.htmlFor = 'branch-select';
      label.textContent = 'Branch: ';
      container.appendChild(label);
      container.appendChild(select);
      elements['branch-select'] = select;
    }
    
    // Refresh countdown
    elements['refresh-countdown'] = document.getElementById('refresh-countdown');
    
    if (!elements['refresh-countdown']) {
      log('warn', 'Creating fallback refresh countdown');
      
      // Try to find refresh info container
      let container = document.querySelector('.kds-refresh-info');
      if (!container) {
        container = document.createElement('div');
        container.className = 'kds-refresh-info';
        
        // Find a place to put it
        const header = document.querySelector('.kds-header') || 
                      document.querySelector('.kds-controls') || 
                      document.body;
        header.appendChild(container);
      }
      
      container.innerHTML = `Auto-refresh: <span id="refresh-countdown">${state.currentCount}</span>s`;
      elements['refresh-countdown'] = container.querySelector('#refresh-countdown');
    }
    
    // Loading overlay
    elements['loading-overlay'] = document.getElementById('loading-overlay') || 
                                 document.getElementById('kds-loading');
    
    if (!elements['loading-overlay']) {
      log('debug', 'Creating loading overlay');
      const loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'loading-overlay';
      loadingOverlay.className = 'kds-loading';
      
      // Style the overlay
      Object.assign(loadingOverlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'none',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: '1000',
        color: 'white',
        fontSize: '20px'
      });
      
      // Add spinner and text
      loadingOverlay.innerHTML = `
        <div class="kds-spinner" style="
          border: 4px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          border-top: 4px solid white;
          width: 40px;
          height: 40px;
          animation: kdsspin 1s linear infinite;
          margin-right: 15px;
        "></div>
        <div>Loading...</div>
      `;
      
      // Add animation keyframes
      if (!document.getElementById('kds-spin-animation')) {
        const style = document.createElement('style');
        style.id = 'kds-spin-animation';
        style.textContent = '@keyframes kdsspin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }
      
      document.body.appendChild(loadingOverlay);
      elements['loading-overlay'] = loadingOverlay;
    }
  }

  /**
   * Initialize audio for notifications with error handling
   */
  function initAudio() {
    if (!state.config.enable_sound_on_ready) return;
    
    try {
      state.readySound = new Audio('/assets/restaurant_management/sounds/ready_alert.mp3');
      
      state.readySound.addEventListener('error', (e) => {
        if (!state.soundErrorLogged) {
          log('warn', 'Sound file could not be loaded:', e);
          state.soundErrorLogged = true;
          state.config.enable_sound_on_ready = false;
        }
      });
    } catch (error) {
      log('warn', 'Audio not supported in this browser:', error);
      state.config.enable_sound_on_ready = false;
    }
  }

  /**
   * Initialize the Kitchen Display System
   */
  async function init() {
    try {
      // Ensure DOM elements exist
      checkElements();
      
      showLoading();
      
      // Initialize audio
      initAudio();
      
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
      log('error', 'Error initializing KDS:', error);
      
      try {
        frappe?.show_alert?.({
          message: __('Failed to initialize Kitchen Display System'),
          indicator: 'red'
        });
      } catch (alertError) {
        log('error', 'Could not show alert:', alertError);
        alert('Failed to initialize Kitchen Display System');
      }
      
      hideLoading();
    }
  }

  /**
   * Load configuration from server
   */
  async function loadConfig() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.kds_display.get_kds_config',
        freeze: false
      }).catch(error => {
        log('warn', "API call failed for config:", error);
        return { message: null };
      });
      
      if (result?.message) {
        // Update config with server values
        Object.assign(state.config, result.message);
        
        // Apply configuration
        state.refreshInterval = state.config.refresh_interval ?? 10;
        state.currentCount = state.refreshInterval;
        
        // Set default station if configured and no user selection
        if (!state.selectedStation && state.config.default_kitchen_station) {
          state.selectedStation = state.config.default_kitchen_station;
          try {
            localStorage.setItem('kds_selected_station', state.selectedStation);
          } catch (e) {
            log('warn', 'Could not store station preference in localStorage', e);
          }
        }
      }
    } catch (error) {
      log('error', 'Error loading KDS config:', error);
      // Use default config values (already set in state initialization)
    }
  }

  /**
   * Load kitchen stations
   */
  async function loadKitchenStations() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.kds_display.get_kitchen_stations',
        freeze: false
      }).catch(error => {
        log('warn', "API call failed for kitchen stations:", error);
        return { message: [] };
      });
      
      state.kitchenStations = result?.message ?? [];
      renderKitchenStationOptions();
    } catch (error) {
      log('error', 'Error loading kitchen stations:', error);
      state.kitchenStations = [];
      renderKitchenStationOptions();
      
      try {
        frappe?.show_alert?.({
          message: __('Failed to load kitchen stations'),
          indicator: 'red'
        });
      } catch (e) {
        log('warn', 'Could not show alert', e);
      }
    }
  }

  /**
   * Load branches
   */
  async function loadBranches() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.kds_display.get_branches',
        freeze: false
      }).catch(error => {
        log('warn', "API call failed for branches:", error);
        return { message: [] };
      });
      
      state.branches = result?.message ?? [];
      renderBranchOptions();
    } catch (error) {
      log('error', 'Error loading branches:', error);
      state.branches = [];
      renderBranchOptions();
      
      try {
        frappe?.show_alert?.({
          message: __('Failed to load branches'),
          indicator: 'red'
        });
      } catch (e) {
        log('warn', 'Could not show alert', e);
      }
    }
  }

  /**
   * Refresh queue data
   */
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
      }).catch(error => {
        log('warn', "API call failed for queue data:", error);
        return { message: [] };
      });
      
      // Check for new "Ready" items to play sound
      if (state.config.enable_sound_on_ready && state.readySound && state.queue?.length > 0) {
        try {
          const newReadyItems = (result?.message ?? []).filter(item => 
            item?.status === 'Ready' && 
            !state.queue.some(existingItem => 
              existingItem?.id === item?.id && existingItem?.status === 'Ready'
            )
          );
          
          if (newReadyItems.length > 0) {
            state.readySound.play().catch(e => log('error', 'Error playing sound:', e));
          }
        } catch (soundError) {
          log('warn', 'Error with sound notification:', soundError);
        }
      }
      
      state.queue = result?.message ?? [];
      renderQueueItems();
      
      state.isLoading = false;
    } catch (error) {
      log('error', 'Error refreshing queue data:', error);
      state.isLoading = false;
    }
  }

  /**
   * Render kitchen station options
   */
  function renderKitchenStationOptions() {
    const kitchenStationSelect = elements['kitchen-station-select'];
    if (!kitchenStationSelect) return;
    
    let options = '<option value="">All Stations</option>';
    
    if (state.kitchenStations?.length) {
      state.kitchenStations.forEach(station => {
        if (station?.name) {
          const isSelected = state.selectedStation === station.name ? 'selected' : '';
          const displayName = station.station_name ?? station.name;
          options += `<option value="${station.name}" ${isSelected}>${displayName}</option>`;
        }
      });
    }
    
    kitchenStationSelect.innerHTML = options;
  }

  /**
   * Render branch options
   */
  function renderBranchOptions() {
    const branchSelect = elements['branch-select'];
    if (!branchSelect) return;
    
    let options = '<option value="">All Branches</option>';
    
    if (state.branches?.length) {
      state.branches.forEach(branch => {
        if (branch?.branch_code) {
          const isSelected = state.selectedBranch === branch.branch_code ? 'selected' : '';
          const displayName = branch.name ?? branch.branch_code;
          options += `<option value="${branch.branch_code}" ${isSelected}>${displayName} (${branch.branch_code})</option>`;
        }
      });
    }
    
    branchSelect.innerHTML = options;
  }

  /**
   * Render queue items
   */
  function renderQueueItems() {
    const queueItems = elements['queue-items'];
    if (!queueItems) return;
    
    if (!state.queue?.length) {
      queueItems.innerHTML = `
        <tr>
          <td colspan="5" class="kds-empty">No items in queue</td>
        </tr>
      `;
      return;
    }

    queueItems.innerHTML = state.queue.map(item => {
      if (!item) return ''; // Skip invalid items
      
      // Use safe values with fallbacks
      const queueTime = formatQueueTime(item?.time_in_queue ?? 0);
      const isUrgent = (item?.time_in_queue ?? 0) > 15 * 60; // More than 15 minutes
      const status = item?.status ?? 'Waiting';
      
      const nextStatus = getNextStatus(status);
      const actionButton = nextStatus ? 
        `<button class="kds-action-btn kds-action-${status.toLowerCase()}" data-item-id="${item.id}" data-next-status="${nextStatus}">
           Mark ${nextStatus}
         </button>` : 
        '';
      
      return `
        <tr class="item-row status-row-${status.toLowerCase()}">
          <td>
            <strong>${item.item_name ?? 'Unknown Item'}</strong>
            ${item.notes ? `<div><small>${item.notes}</small></div>` : ''}
          </td>
          <td>${item.table_number ?? 'Unknown'}</td>
          <td class="kds-time ${isUrgent ? 'urgent' : ''}">${queueTime}</td>
          <td><span class="status-${status.toLowerCase()}">${status}</span></td>
          <td>${actionButton}</td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Set up event listeners
   */
  function setupEventListeners() {
    // Kitchen station select change
    const kitchenStationSelect = elements['kitchen-station-select'];
    if (kitchenStationSelect) {
      kitchenStationSelect.addEventListener('change', function() {
        state.selectedStation = this.value;
        try {
          localStorage.setItem('kds_selected_station', state.selectedStation);
        } catch (e) {
          log('warn', 'Could not store station preference in localStorage', e);
        }
        refreshQueueData();
      });
    }
    
    // Branch select change
    const branchSelect = elements['branch-select'];
    if (branchSelect) {
      branchSelect.addEventListener('change', function() {
        state.selectedBranch = this.value;
        try {
          localStorage.setItem('kds_selected_branch', state.selectedBranch);
        } catch (e) {
          log('warn', 'Could not store branch preference in localStorage', e);
        }
        refreshQueueData();
      });
    }
    
    // Action buttons (event delegation)
    const queueItems = elements['queue-items'];
    if (queueItems) {
      queueItems.addEventListener('click', async function(event) {
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
            }).catch(error => {
              log('warn', "API call failed for status update:", error);
              return { message: { success: false, error: "Connection error" } };
            });
            
            if (result?.message?.success) {
              // Update local state
              const itemIndex = state.queue.findIndex(item => item?.id === itemId);
              if (itemIndex !== -1) {
                state.queue[itemIndex].status = nextStatus;
              }
              
              renderQueueItems();
              
              try {
                frappe?.show_alert?.({
                  message: __(`Item status updated to ${nextStatus}`),
                  indicator: 'green'
                }, 3);
              } catch (e) {
                log('warn', 'Could not show alert', e);
              }
            } else {
              try {
                frappe?.msgprint?.({
                  title: __('Error'),
                  indicator: 'red',
                  message: result?.message?.error ?? __('Failed to update item status')
                });
              } catch (e) {
                log('warn', 'Could not show message', e);
                alert(__('Failed to update item status'));
              }
            }
            
            hideLoading();
          } catch (error) {
            log('error', 'Error updating item status:', error);
            
            try {
              frappe?.msgprint?.({
                title: __('Error'),
                indicator: 'red',
                message: __('Failed to update item status')
              });
            } catch (e) {
              log('warn', 'Could not show message', e);
              alert(__('Failed to update item status'));
            }
            
            hideLoading();
          }
        }
      });
    }
    
    // Cleanup interval when page is unloaded
    window.addEventListener('beforeunload', () => {
      if (state.countdownInterval) {
        clearInterval(state.countdownInterval);
      }
    });
  }

  /**
   * Start refresh timer
   */
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

  /**
   * Update countdown display
   */
  function updateCountdownDisplay() {
    const refreshCountdown = elements['refresh-countdown'];
    if (refreshCountdown) {
      refreshCountdown.textContent = state.currentCount;
    }
  }

  /**
   * Format time in queue (seconds) to human-readable format
   * @param {number} seconds - Time in seconds
   * @return {string} Formatted time
   */
  function formatQueueTime(seconds) {
    try {
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
    } catch (error) {
      log('warn', 'Error formatting queue time:', error);
      return '0s';
    }
  }

  /**
   * Get next status based on current status
   * @param {string} currentStatus - Current item status
   * @return {string|null} Next status or null if end of flow
   */
  function getNextStatus(currentStatus) {
    try {
      switch (currentStatus) {
        case 'Waiting':
          return 'Cooking';
        case 'Cooking':
          return 'Ready';
        case 'Ready':
          return null;
        default:
          return null;
      }
    } catch (error) {
      log('warn', 'Error getting next status:', error);
      return null;
    }
  }

  /**
   * Show loading overlay
   */
  function showLoading() {
    const loadingOverlay = elements['loading-overlay'];
    if (loadingOverlay) {
      loadingOverlay.style.display = 'flex';
    }
  }

  /**
   * Hide loading overlay
   */
  function hideLoading() {
    const loadingOverlay = elements['loading-overlay'];
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
  }

  // Initialize on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', init);
  
  // Export initialization function if needed
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { init };
  }
})();
```
