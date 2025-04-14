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

  // Comprehensive check for required elements
  function checkElements() {
    // Queue items table body
    if (!elements.queueItems) {
      elements.queueItems = document.querySelector('.kds-queue tbody');
      
      if (!elements.queueItems) {
        console.warn('Queue items container not found, creating fallback');
        const tableBody = document.createElement('tbody');
        tableBody.id = 'queue-items';
        
        // Try to find the table
        const table = document.querySelector('.kds-queue') || document.createElement('table');
        if (!table.classList.contains('kds-queue')) {
          table.className = 'kds-queue';
          table.style.width = '100%';
          table.style.borderCollapse = 'collapse';
          
          // Create header if needed
          if (!table.querySelector('thead')) {
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
          
          // Find a container to append the table
          const container = document.querySelector('.kds-content') || document.body;
          container.appendChild(table);
        }
        
        table.appendChild(tableBody);
        elements.queueItems = tableBody;
      }
    }
    
    // Kitchen station select
    if (!elements.kitchenStationSelect) {
      elements.kitchenStationSelect = document.querySelector('#kitchen-station') || 
                                     document.querySelector('.kds-select');
      
      if (!elements.kitchenStationSelect) {
        console.warn('Kitchen station select not found, creating fallback');
        const select = document.createElement('select');
        select.id = 'kitchen-station';
        select.className = 'kds-select';
        select.innerHTML = '<option value="">All Stations</option>';
        
        // Try to find a container
        const container = document.querySelector('.kds-controls') || document.body;
        container.appendChild(select);
        elements.kitchenStationSelect = select;
      }
    }
    
    // Branch select
    if (!elements.branchCodeSelect) {
      elements.branchCodeSelect = document.querySelector('#branch-code');
      
      if (!elements.branchCodeSelect) {
        console.warn('Branch select not found, creating fallback');
        const select = document.createElement('select');
        select.id = 'branch-code';
        select.className = 'kds-select';
        select.innerHTML = '<option value="">All Branches</option>';
        
        // Try to find a container
        const container = document.querySelector('.kds-controls') || document.body;
        container.appendChild(select);
        elements.branchCodeSelect = select;
      }
    }
    
    // Refresh countdown
    if (!elements.refreshCountdown) {
      elements.refreshCountdown = document.querySelector('#refresh-countdown');
      
      if (!elements.refreshCountdown) {
        console.warn('Refresh countdown not found, creating fallback');
        const span = document.createElement('span');
        span.id = 'refresh-countdown';
        span.textContent = state.currentCount;
        
        // Try to find the refresh info container
        const container = document.querySelector('.kds-refresh-info');
        if (container) {
          // If we found the container, replace its contents
          container.innerHTML = `Auto-refresh: <span id="refresh-countdown">${state.currentCount}</span>s`;
          elements.refreshCountdown = container.querySelector('#refresh-countdown');
        } else {
          // Otherwise create the container
          const refreshInfo = document.createElement('div');
          refreshInfo.className = 'kds-refresh-info';
          refreshInfo.innerHTML = `Auto-refresh: <span id="refresh-countdown">${state.currentCount}</span>s`;
          
          // Find a place to put it
          const header = document.querySelector('.kds-header') || 
                        document.querySelector('.kds-controls') || 
                        document.body;
          header.appendChild(refreshInfo);
          elements.refreshCountdown = refreshInfo.querySelector('#refresh-countdown');
        }
      }
    }
    
    // Loading overlay
    if (!elements.loadingOverlay) {
      elements.loadingOverlay = document.querySelector('#kds-loading');
      
      if (!elements.loadingOverlay) {
        console.log('Creating loading overlay');
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'kds-loading';
        loadingOverlay.className = 'kds-loading';
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
        
        // Add the animation keyframes if they don't exist
        if (!document.getElementById('kds-spin-animation')) {
          const style = document.createElement('style');
          style.id = 'kds-spin-animation';
          style.textContent = '@keyframes kdsspin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
          document.head.appendChild(style);
        }
        
        document.body.appendChild(loadingOverlay);
        elements.loadingOverlay = loadingOverlay;
      }
    }
  }

  // Sound for notifications - with error handling
  let readySound = null;
  try {
    if (state.config.enable_sound_on_ready) {
      readySound = new Audio('/assets/restaurant_management/sounds/ready_alert.mp3');
      
      // Add error handling for the audio
      readySound.addEventListener('error', function(e) {
        console.warn('Sound file could not be loaded:', e);
        // Disable sound to prevent further errors
        state.config.enable_sound_on_ready = false;
      });
    }
  } catch (error) {
    console.warn('Audio not supported in this browser:', error);
    state.config.enable_sound_on_ready = false;
  }

  // Initialize the KDS
  init();

  async function init() {
    try {
      // Ensure DOM elements exist
      checkElements();
      
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
      
      try {
        frappe.show_alert({
          message: __('Failed to initialize Kitchen Display System'),
          indicator: 'red'
        });
      } catch (alertError) {
        console.error('Could not show alert:', alertError);
        
        // Fallback to basic alert if frappe.show_alert fails
        try {
          alert('Failed to initialize Kitchen Display System');
        } catch (e) { /* Last resort - just log it */ }
      }
      
      hideLoading();
    }
  }

  // Load configuration from server
  async function loadConfig() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.kds_display.get_kds_config',
        freeze: false
      }).catch(error => {
        console.warn("API call failed for config:", error);
        return { message: null }; // Return empty result on failure
      });
      
      if (result && result.message) {
        // Update config with server values
        Object.assign(state.config, result.message);
        
        // Apply configuration
        state.refreshInterval = state.config.refresh_interval || 10;
        state.currentCount = state.refreshInterval;
        
        // Initialize sound if needed
        if (state.config.enable_sound_on_ready && !readySound) {
          try {
            readySound = new Audio('/assets/restaurant_management/sounds/ready_alert.mp3');
          } catch (error) {
            console.warn('Could not initialize sound:', error);
            state.config.enable_sound_on_ready = false;
          }
        }
        
        // Set default station if configured and no user selection
        if (!state.selectedStation && state.config.default_kitchen_station) {
          state.selectedStation = state.config.default_kitchen_station;
          try {
            localStorage.setItem('kds_selected_station', state.selectedStation);
          } catch (e) {
            console.warn('Could not store station preference in localStorage', e);
          }
        }
      }
    } catch (error) {
      console.error('Error loading KDS config:', error);
      // Use default config values (already set in state initialization)
    }
  }

  // Load kitchen stations
  async function loadKitchenStations() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.kds_display.get_kitchen_stations',
        freeze: false
      }).catch(error => {
        console.warn("API call failed for kitchen stations:", error);
        return { message: [] }; // Return empty result on failure
      });
      
      state.kitchenStations = result && result.message ? result.message : [];
      renderKitchenStationOptions();
    } catch (error) {
      console.error('Error loading kitchen stations:', error);
      state.kitchenStations = []; // Set empty stations array
      renderKitchenStationOptions(); // Still try to render with empty data
      
      try {
        frappe.show_alert({
          message: __('Failed to load kitchen stations'),
          indicator: 'red'
        });
      } catch (e) {
        console.warn('Could not show alert', e);
      }
    }
  }

  // Load branches
  async function loadBranches() {
    try {
      const result = await frappe.call({
        method: 'restaurant_management.api.kds_display.get_branches',
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
      renderBranchOptions(); // Still try to render with empty data
      
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
      }).catch(error => {
        console.warn("API call failed for queue data:", error);
        return { message: [] }; // Return empty result on failure
      });
      
      // Check for new "Ready" items to play sound
      if (state.config.enable_sound_on_ready && readySound && state.queue && state.queue.length > 0) {
        try {
          const newReadyItems = (result.message || []).filter(item => 
            item && item.status === 'Ready' && 
            !state.queue.some(existingItem => 
              existingItem && existingItem.id === item.id && existingItem.status === 'Ready'
            )
          );
          
          if (newReadyItems.length > 0) {
            readySound.play().catch(e => console.error('Error playing sound:', e));
          }
        } catch (soundError) {
          console.warn('Error with sound notification:', soundError);
        }
      }
      
      state.queue = result && result.message ? result.message : [];
      renderQueueItems();
      
      state.isLoading = false;
    } catch (error) {
      console.error('Error refreshing queue data:', error);
      state.isLoading = false;
      // Don't reset queue - keep showing old data rather than empty
    }
  }

  // Render kitchen station options
  function renderKitchenStationOptions() {
    // Safety check
    if (!elements.kitchenStationSelect) return;
    
    let options = '<option value="">All Stations</option>';
    
    if (state.kitchenStations && state.kitchenStations.length) {
      state.kitchenStations.forEach(station => {
        if (station && station.name) {
          options += `<option value="${station.name}" ${state.selectedStation === station.name ? 'selected' : ''}>${station.station_name || station.name}</option>`;
        }
      });
    }
    
    elements.kitchenStationSelect.innerHTML = options;
  }

  // Render branch options
  function renderBranchOptions() {
    // Safety check
    if (!elements.branchCodeSelect) return;
    
    let options = '<option value="">All Branches</option>';
    
    if (state.branches && state.branches.length) {
      state.branches.forEach(branch => {
        if (branch && branch.branch_code) {
          options += `<option value="${branch.branch_code}" ${state.selectedBranch === branch.branch_code ? 'selected' : ''}>${branch.name || branch.branch_code} (${branch.branch_code})</option>`;
        }
      });
    }
    
    elements.branchCodeSelect.innerHTML = options;
  }

  // Render queue items
  function renderQueueItems() {
    // Safety check
    if (!elements.queueItems) return;
    
    if (!state.queue || !state.queue.length) {
      elements.queueItems.innerHTML = `
        <tr>
          <td colspan="5" class="kds-empty">No items in queue</td>
        </tr>
      `;
      return;
    }

    elements.queueItems.innerHTML = state.queue.map(item => {
      if (!item) return ''; // Skip invalid items
      
      // Use safe values with fallbacks
      const queueTime = formatQueueTime(item.time_in_queue || 0);
      const isUrgent = (item.time_in_queue || 0) > 15 * 60; // More than 15 minutes
      const status = item.status || 'Waiting';
      
      const nextStatus = getNextStatus(status);
      const actionButton = nextStatus ? 
        `<button class="kds-action-btn kds-action-${status.toLowerCase()}" data-item-id="${item.id}" data-next-status="${nextStatus}">
           Mark ${nextStatus}
         </button>` : 
        '';
      
      return `
        <tr class="item-row status-row-${status.toLowerCase()}">
          <td>
            <strong>${item.item_name || 'Unknown Item'}</strong>
            ${item.notes ? `<div><small>${item.notes}</small></div>` : ''}
          </td>
          <td>${item.table_number || 'Unknown'}</td>
          <td class="kds-time ${isUrgent ? 'urgent' : ''}">${queueTime}</td>
          <td><span class="status-${status.toLowerCase()}">${status}</span></td>
          <td>${actionButton}</td>
        </tr>
      `;
    }).join('');
  }

  // Set up event listeners
  function setupEventListeners() {
    // Kitchen station select change
    if (elements.kitchenStationSelect) {
      elements.kitchenStationSelect.addEventListener('change', function() {
        state.selectedStation = this.value;
        try {
          localStorage.setItem('kds_selected_station', state.selectedStation);
        } catch (e) {
          console.warn('Could not store station preference in localStorage', e);
        }
        refreshQueueData();
      });
    }
    
    // Branch select change
    if (elements.branchCodeSelect) {
      elements.branchCodeSelect.addEventListener('change', function() {
        state.selectedBranch = this.value;
        try {
          localStorage.setItem('kds_selected_branch', state.selectedBranch);
        } catch (e) {
          console.warn('Could not store branch preference in localStorage', e);
        }
        refreshQueueData();
      });
    }
    
    // Action buttons (event delegation)
    if (elements.queueItems) {
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
            }).catch(error => {
              console.warn("API call failed for status update:", error);
              return { message: { success: false, error: "Connection error" } };
            });
            
            if (result && result.message && result.message.success) {
              // Update local state
              const itemIndex = state.queue.findIndex(item => item && item.id === itemId);
              if (itemIndex !== -1) {
                state.queue[itemIndex].status = nextStatus;
              }
              
              renderQueueItems();
              
              try {
                frappe.show_alert({
                  message: __(`Item status updated to ${nextStatus}`),
                  indicator: 'green'
                }, 3);
              } catch (e) {
                console.warn('Could not show alert', e);
              }
            } else {
              try {
                frappe.msgprint({
                  title: __('Error'),
                  indicator: 'red',
                  message: result.message && result.message.error ? result.message.error : __('Failed to update item status')
                });
              } catch (e) {
                console.warn('Could not show message', e);
                alert(__('Failed to update item status'));
              }
            }
            
            hideLoading();
          } catch (error) {
            console.error('Error updating item status:', error);
            
            try {
              frappe.msgprint({
                title: __('Error'),
                indicator: 'red',
                message: __('Failed to update item status')
              });
            } catch (e) {
              console.warn('Could not show message', e);
              alert(__('Failed to update item status'));
            }
            
            hideLoading();
          }
        }
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
        refreshQueueData();
      }
    }, 1000);
  }

  // Update countdown display
  function updateCountdownDisplay() {
    if (elements.refreshCountdown) {
      elements.refreshCountdown.textContent = state.currentCount;
    }
  }

  // Helper Functions
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
      console.warn('Error formatting queue time:', error);
      return '0s'; // Fallback
    }
  }

  function getNextStatus(currentStatus) {
    try {
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
    } catch (error) {
      console.warn('Error getting next status:', error);
      return null;
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