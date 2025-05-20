"use strict";

/**
 * Station Display JS for Kitchen Display System
 */

// Element references
const ELEMENT_IDS = {
    queueItems: 'queue-items',
    kitchenSelect: 'kitchen-station',
    branchSelect: 'branch-code',
    countdown: 'refresh-countdown',
    loading: 'kds-loading'
};

// Global state
const state = {
    refreshInterval: 10,
    countdownValue: 10,
    refreshTimer: null,
    countdownTimer: null,
    config: null,
    stations: [],
    branches: [],
    queueItems: []
};

// Sound for ready alerts
const readySound = new Audio('/assets/restaurant_management/sounds/ready_alert.mp3');
readySound.addEventListener('error', (e) => log('error', 'Sound file could not be loaded:', e));

/**
 * Logging helper function
 * @param {string} level - Log level (log, info, warn, error)
 * @param {string} message - Message to log
 * @param {any} [data] - Optional data to log
 */
function log(level, message, data) {
    const levels = ['log', 'info', 'warn', 'error'];
    const logLevel = levels.includes(level) ? level : 'log';
    
    if (data) {
        console[logLevel](message, data);
    } else {
        console[logLevel](message);
    }
}

/**
 * Ensure all required DOM elements exist, creating fallbacks if needed
 */
function ensureElements() {
    // Queue items container (should be tbody element)
    const queueItems = document.getElementById(ELEMENT_IDS.queueItems);
    if (!queueItems) {
        log('warn', 'Queue items container not found, creating fallback');
        const tbody = document.createElement('tbody');
        tbody.id = ELEMENT_IDS.queueItems;
        
        // Try to find a table to append to
        const table = document.querySelector('table');
        if (table) {
            table.appendChild(tbody);
        } else {
            // Create a minimal table structure
            const table = document.createElement('table');
            table.className = 'min-w-full divide-y divide-gray-200';
            
            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr>
                    <th>Item</th>
                    <th>Table</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Action</th>
                </tr>
            `;
            
            table.appendChild(thead);
            table.appendChild(tbody);
            
            document.body.appendChild(table);
        }
    }
    
    // Kitchen station select
    const kitchenSelect = document.getElementById(ELEMENT_IDS.kitchenSelect);
    if (!kitchenSelect) {
        log('warn', 'Kitchen station select not found, creating fallback');
        const select = document.createElement('select');
        select.id = ELEMENT_IDS.kitchenSelect;
        select.className = 'rounded bg-gray-700 border-gray-600 text-white py-1 px-3 text-sm';
        select.innerHTML = '<option value="">All Stations</option>';
        document.body.appendChild(select);
    }
    
    // Branch select
    const branchSelect = document.getElementById(ELEMENT_IDS.branchSelect);
    if (!branchSelect) {
        log('warn', 'Branch select not found, creating fallback');
        const select = document.createElement('select');
        select.id = ELEMENT_IDS.branchSelect;
        select.className = 'rounded bg-gray-700 border-gray-600 text-white py-1 px-3 text-sm';
        select.innerHTML = '<option value="">All Branches</option>';
        document.body.appendChild(select);
    }
    
    // Refresh countdown
    const countdown = document.getElementById(ELEMENT_IDS.countdown);
    if (!countdown) {
        log('warn', 'Refresh countdown not found, creating fallback');
        const span = document.createElement('span');
        span.id = ELEMENT_IDS.countdown;
        span.className = 'text-sm';
        span.textContent = state.refreshInterval;
        document.body.appendChild(span);
    }
    
    // Loading overlay
    const loading = document.getElementById(ELEMENT_IDS.loading);
    if (!loading) {
        log('warn', 'Creating loading overlay');
        const div = document.createElement('div');
        div.id = ELEMENT_IDS.loading;
        div.className = 'fixed inset-0 hidden items-center justify-center bg-black/60 z-50';
        div.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-lg text-center">
                <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
                <p class="mt-4 text-gray-700">Loading...</p>
            </div>
        `;
        document.body.appendChild(div);
    }
}

/**
 * Show loading overlay
 */
function showLoading() {
    const loading = document.getElementById(ELEMENT_IDS.loading);
    if (loading) {
        loading.style.display = 'flex';
    }
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    const loading = document.getElementById(ELEMENT_IDS.loading);
    if (loading) {
        loading.style.display = 'none';
    }
}

/**
 * Format time in queue from seconds to minutes and seconds
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
function formatTimeInQueue(seconds) {
    if (seconds < 60) {
        return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (remainingSeconds === 0) {
        return `${minutes}m`;
    }
    
    return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Check if a time is urgent (more than 10 minutes)
 * @param {number} seconds - Time in seconds
 * @returns {boolean} True if time is urgent
 */
function isTimeUrgent(seconds) {
    return seconds > 600; // 10 minutes
}

/**
 * Load KDS configuration from server
 * @returns {Promise<Object>} Configuration object
 */
async function loadConfig() {
    try {
        const response = await frappe.call({
            method: 'restaurant_management.api.kds_display.get_kds_config',
            args: {}
        });
        
        if (response.message) {
            return response.message;
        }
    } catch (error) {
        log('error', 'Error loading KDS configuration:', error);
    }
    
    // Default config if loading fails
    return {
        refresh_interval: 10,
        default_kitchen_station: '',
        status_color_map: {
            "Waiting": "#e74c3c",
            "Cooking": "#f39c12",
            "Ready": "#2ecc71"
        },
        enable_sound_on_ready: true
    };
}

/**
 * Load kitchen stations from server
 * @returns {Promise<Array>} List of kitchen stations
 */
async function loadStations() {
    try {
        const response = await frappe.call({
            method: 'restaurant_management.api.kds_display.get_kitchen_stations',
            args: {}
        });
        
        if (response.message) {
            return response.message;
        }
    } catch (error) {
        log('error', 'Error loading kitchen stations:', error);
    }
    
    return [];
}

/**
 * Load branches from server
 * @returns {Promise<Array>} List of branches
 */
async function loadBranches() {
    try {
        const response = await frappe.call({
            method: 'restaurant_management.api.kds_display.get_branches',
            args: {}
        });
        
        if (response.message) {
            return response.message;
        }
    } catch (error) {
        log('error', 'Error loading branches:', error);
    }
    
    return [];
}

/**
 * Populate dropdown with options
 * @param {string} selectId - ID of select element
 * @param {Array} options - List of options
 * @param {string} valueField - Field to use for option value
 * @param {string} textField - Field to use for option text
 * @param {string} selectedValue - Value to select
 */
function populateDropdown(selectId, options, valueField, textField, selectedValue = '') {
    const selectElement = document.getElementById(selectId);
    if (!selectElement) return;
    
    // Save current value if any
    const currentValue = selectElement.value || selectedValue;
    
    // Clear existing options except first "All" option
    const firstOption = selectElement.options[0];
    selectElement.innerHTML = '';
    
    if (firstOption) {
        selectElement.appendChild(firstOption);
    }
    
    // Add new options
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option[valueField];
        optionElement.textContent = option[textField];
        selectElement.appendChild(optionElement);
    });
    
    // Restore selection if possible
    if (currentValue) {
        for (let i = 0; i < selectElement.options.length; i++) {
            if (selectElement.options[i].value === currentValue) {
                selectElement.selectedIndex = i;
                break;
            }
        }
    }
}

/**
 * Update countdown display
 */
function updateCountdown() {
    state.countdownValue -= 1;
    
    const countdownElement = document.getElementById(ELEMENT_IDS.countdown);
    if (countdownElement) {
        countdownElement.textContent = state.countdownValue;
    }
    
    if (state.countdownValue <= 0) {
        refreshQueueData();
    }
}

/**
 * Start countdown timer
 */
function startCountdown() {
    // Clear any existing timer
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
    }
    
    // Reset countdown value
    state.countdownValue = state.refreshInterval;
    
    // Update display initially
    const countdownElement = document.getElementById(ELEMENT_IDS.countdown);
    if (countdownElement) {
        countdownElement.textContent = state.countdownValue;
    }
    
    // Start new timer
    state.countdownTimer = setInterval(updateCountdown, 1000);
}

/**
 * Update item status on server
 * @param {string} itemId - ID of item to update
 * @param {string} newStatus - New status
 * @returns {Promise<boolean>} Success status
 */
async function updateItemStatus(itemId, newStatus) {
    try {
        showLoading();
        
        const response = await frappe.call({
            method: 'restaurant_management.api.kds_display.update_item_status',
            args: {
                item_id: itemId,
                new_status: newStatus
            }
        });
        
        if (response.message && response.message.success) {
            // Immediately refresh the data
            await refreshQueueData();
            return true;
        } else {
            const errorMsg = response.message?.error || 'Unknown error';
            log('error', `Error updating status: ${errorMsg}`);
            return false;
        }
    } catch (error) {
        log('error', 'Error updating item status:', error);
        return false;
    } finally {
        hideLoading();
    }
}

/**
 * Create action button for item
 * @param {Object} item - Queue item
 * @returns {HTMLButtonElement} Action button element
 */
function createActionButton(item) {
    const button = document.createElement('button');
    
    if (item.status === 'Waiting') {
        button.textContent = 'Start Cooking';
        button.className = 'py-1 px-3 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium';
        button.onclick = () => updateItemStatus(item.id, 'Cooking');
    } else if (item.status === 'Cooking') {
        button.textContent = 'Mark Ready';
        button.className = 'py-1 px-3 bg-green-500 hover:bg-green-600 text-white rounded text-sm font-medium';
        button.onclick = () => updateItemStatus(item.id, 'Ready');
    } else {
        button.textContent = 'No Action';
        button.className = 'py-1 px-3 bg-gray-300 text-gray-500 rounded text-sm font-medium';
        button.disabled = true;
    }
    
    return button;
}

/**
 * Get status badge element
 * @param {string} status - Item status
 * @returns {HTMLSpanElement} Status badge element
 */
function getStatusBadge(status) {
    const badge = document.createElement('span');
    badge.textContent = status;
    
    const colorMap = {
        'Waiting': 'bg-red-500',
        'Cooking': 'bg-orange-500',
        'Ready': 'bg-green-500',
    };
    
    badge.className = `inline-block py-1 px-2 rounded text-white text-xs font-medium ${colorMap[status] || 'bg-gray-500'}`;
    return badge;
}

/**
 * Render queue items in the table
 * @param {Array} items - List of queue items
 */
function renderQueueItems(items) {
    const queueContainer = document.getElementById(ELEMENT_IDS.queueItems);
    if (!queueContainer) return;
    
    if (items.length === 0) {
        queueContainer.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                    No items in queue
                </td>
            </tr>
        `;
        return;
    }
    
    // Clear existing items
    queueContainer.innerHTML = '';
    
    // Add new items
    items.forEach(item => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        
        // Item name
        const nameCell = document.createElement('td');
        nameCell.className = 'px-6 py-4 whitespace-nowrap';
        nameCell.textContent = item.item_name;
        row.appendChild(nameCell);
        
        // Table number
        const tableCell = document.createElement('td');
        tableCell.className = 'px-6 py-4 whitespace-nowrap text-sm';
        tableCell.textContent = item.table_number;
        row.appendChild(tableCell);
        
        // Time in queue
        const timeCell = document.createElement('td');
        timeCell.className = 'px-6 py-4 whitespace-nowrap text-sm';
        
        const timeSpan = document.createElement('span');
        timeSpan.textContent = formatTimeInQueue(item.time_in_queue);
        
        if (isTimeUrgent(item.time_in_queue)) {
            timeSpan.className = 'font-medium text-red-600';
        }
        
        timeCell.appendChild(timeSpan);
        row.appendChild(timeCell);
        
        // Status
        const statusCell = document.createElement('td');
        statusCell.className = 'px-6 py-4 whitespace-nowrap';
        statusCell.appendChild(getStatusBadge(item.status));
        row.appendChild(statusCell);
        
        // Action
        const actionCell = document.createElement('td');
        actionCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
        actionCell.appendChild(createActionButton(item));
        row.appendChild(actionCell);
        
        queueContainer.appendChild(row);
    });
    
    // Play sound if there are any ready items and sound is enabled
    if (state.config?.enable_sound_on_ready && items.some(item => item.status === 'Ready')) {
        try {
            readySound.play().catch(error => {
                log('warn', 'Could not play ready sound:', error);
            });
        } catch (error) {
            log('warn', 'Error playing sound:', error);
        }
    }
}

/**
 * Get selected values from dropdowns
 * @returns {Object} Selected kitchen station and branch
 */
function getSelectedValues() {
    const kitchenStation = document.getElementById(ELEMENT_IDS.kitchenSelect)?.value || '';
    const branchCode = document.getElementById(ELEMENT_IDS.branchSelect)?.value || '';
    
    return { kitchenStation, branchCode };
}

/**
 * Refresh queue data from server
 */
async function refreshQueueData() {
    try {
        const { kitchenStation, branchCode } = getSelectedValues();
        
        // Don't proceed without branch code
        if (!branchCode) {
            log('warn', 'No branch selected, skipping queue refresh');
            renderQueueItems([]);
            startCountdown();
            return;
        }
        
        showLoading();
        
        // Use the new API endpoint
        const response = await frappe.call({
            method: 'restaurant_management.api.kds_display.kds_items',
            args: {
                kitchen_station: kitchenStation,
                branch_code: branchCode
            }
        });
        
        if (response.message) {
            state.queueItems = response.message;
            renderQueueItems(state.queueItems);
        } else {
            renderQueueItems([]);
        }
        
        // Reset countdown
        startCountdown();
    } catch (error) {
        log('error', 'API call failed for queue data:', error);
        renderQueueItems([]);
        startCountdown();
    } finally {
        hideLoading();
    }
}

/**
 * Initialize the page
 */
async function init() {
    try {
        // Ensure all required elements exist
        ensureElements();
        
        showLoading();
        
        // Load configuration
        state.config = await loadConfig();
        if (state.config.refresh_interval) {
            state.refreshInterval = state.config.refresh_interval;
        }
        
        // Load stations and populate dropdown
        state.stations = await loadStations();
        populateDropdown(ELEMENT_IDS.kitchenSelect, state.stations, 'name', 'station_name', state.config.default_kitchen_station);
        
        // Load branches and populate dropdown
        state.branches = await loadBranches();
        populateDropdown(ELEMENT_IDS.branchSelect, state.branches, 'branch_code', 'name');
        
        // If there's only one branch, select it automatically
        const branchSelect = document.getElementById(ELEMENT_IDS.branchSelect);
        if (branchSelect && state.branches.length === 1) {
            branchSelect.value = state.branches[0].branch_code;
        }
        
        // Add event listeners for dropdowns
        document.getElementById(ELEMENT_IDS.kitchenSelect)?.addEventListener('change', refreshQueueData);
        document.getElementById(ELEMENT_IDS.branchSelect)?.addEventListener('change', refreshQueueData);
        
        // Initial data load
        await refreshQueueData();
        
        // Clean up before page unload
        window.addEventListener('beforeunload', () => {
            if (state.countdownTimer) clearInterval(state.countdownTimer);
            if (state.refreshTimer) clearInterval(state.refreshTimer);
        });
    } catch (error) {
        log('error', 'Error initializing station display:', error);
    } finally {
        hideLoading();
    }
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', init);
