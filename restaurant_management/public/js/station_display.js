"use strict";

/**
 * Station Display JS for Kitchen Display System
 */

// Element references with 'kds-' prefix to avoid ID collisions
const ELEMENT_IDS = {
    queueItems: 'kds-queue-items',
    kitchenSelect: 'kds-kitchen-station',
    branchSelect: 'kds-branch-code',
    countdown: 'kds-refresh-countdown',
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
 * Create an HTML element with specified attributes
 * @param {string} tag - Element tag name
 * @param {Object} attrs - Element attributes
 * @param {string|HTMLElement} [content] - Element content
 * @returns {HTMLElement} Created element
 */
function createElement(tag, attrs = {}, content = '') {
    const element = document.createElement(tag);
    
    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'textContent') {
            element.textContent = value;
        } else if (key === 'innerHTML') {
            element.innerHTML = value;
        } else if (key.startsWith('on') && typeof value === 'function') {
            const eventName = key.slice(2).toLowerCase();
            element.addEventListener(eventName, value);
        } else {
            element.setAttribute(key, value);
        }
    });
    
    if (content) {
        if (typeof content === 'string') {
            element.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            element.appendChild(content);
        }
    }
    
    return element;
}

/**
 * Ensure all required DOM elements exist, creating fallbacks if needed
 */
function ensureElements() {
    // Queue items container (should be tbody element)
    const queueItems = document.getElementById(ELEMENT_IDS.queueItems);
    if (!queueItems) {
        log('warn', 'Queue items container not found, creating fallback');
        const tbody = createElement('tbody', { id: ELEMENT_IDS.queueItems });
        
        // Try to find a table to append to
        const table = document.querySelector('table');
        if (table) {
            table.appendChild(tbody);
        } else {
            // Create a minimal table structure
            const thead = createElement('thead', {
                innerHTML: `
                    <tr>
                        <th>Item</th>
                        <th>Table</th>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                `
            });
            
            const newTable = createElement('table', {
                className: 'min-w-full divide-y divide-gray-200'
            });
            
            newTable.appendChild(thead);
            newTable.appendChild(tbody);
            
            document.body.appendChild(newTable);
        }
    }
    
    // Kitchen station select
    const kitchenSelect = document.getElementById(ELEMENT_IDS.kitchenSelect);
    if (!kitchenSelect) {
        log('warn', 'Kitchen station select not found, creating fallback');
        const select = createElement('select', {
            id: ELEMENT_IDS.kitchenSelect,
            className: 'rounded bg-gray-700 border-gray-600 text-white py-1 px-3 text-sm',
            innerHTML: '<option value="">All Stations</option>'
        });
        document.body.appendChild(select);
    }
    
    // Branch select
    const branchSelect = document.getElementById(ELEMENT_IDS.branchSelect);
    if (!branchSelect) {
        log('warn', 'Branch select not found, creating fallback');
        const select = createElement('select', {
            id: ELEMENT_IDS.branchSelect,
            className: 'rounded bg-gray-700 border-gray-600 text-white py-1 px-3 text-sm',
            innerHTML: '<option value="">All Branches</option>'
        });
        document.body.appendChild(select);
    }
    
    // Refresh countdown
    const countdown = document.getElementById(ELEMENT_IDS.countdown);
    if (!countdown) {
        log('warn', 'Refresh countdown not found, creating fallback');
        const span = createElement('span', {
            id: ELEMENT_IDS.countdown,
            className: 'text-sm',
            textContent: state.refreshInterval
        });
        document.body.appendChild(span);
    }
    
    // Loading overlay
    const loading = document.getElementById(ELEMENT_IDS.loading);
    if (!loading) {
        log('warn', 'Creating loading overlay');
        const div = createElement('div', {
            id: ELEMENT_IDS.loading,
            className: 'fixed inset-0 hidden items-center justify-center bg-black/60 z-50',
            innerHTML: `
                <div class="bg-white p-6 rounded-lg shadow-lg text-center">
                    <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
                    <p class="mt-4 text-gray-700">Loading...</p>
                </div>
            `
        });
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
 * Load KDS configuration from server or localStorage if available
 * @returns {Promise<Object>} Configuration object
 */
async function loadConfig() {
    try {
        // Try to get config from localStorage first
        const cachedConfig = localStorage.getItem('kds_config');
        if (cachedConfig) {
            try {
                const parsedConfig = JSON.parse(cachedConfig);
                // Check if cache is recent (less than 1 hour old)
                if (parsedConfig.timestamp && 
                    (Date.now() - parsedConfig.timestamp < 3600000)) {
                    return parsedConfig.data;
                }
            } catch (e) {
                log('warn', 'Failed to parse cached config', e);
            }
        }
        
        // If no valid cached config, fetch from server
        const response = await frappe.call({
            method: 'restaurant_management.api.kds_display.get_kds_config',
            args: {}
        });
        
        if (response.message) {
            // Cache the config
            localStorage.setItem('kds_config', JSON.stringify({
                timestamp: Date.now(),
                data: response.message
            }));
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
 * Load kitchen stations from server or localStorage if available
 * @returns {Promise<Array>} List of kitchen stations
 */
async function loadStations() {
    try {
        // Try to get stations from localStorage first
        const cachedStations = localStorage.getItem('kds_stations');
        if (cachedStations) {
            try {
                const parsedStations = JSON.parse(cachedStations);
                // Check if cache is recent (less than 1 hour old)
                if (parsedStations.timestamp && 
                    (Date.now() - parsedStations.timestamp < 3600000)) {
                    return parsedStations.data;
                }
            } catch (e) {
                log('warn', 'Failed to parse cached stations', e);
            }
        }
        
        // If no valid cached stations, fetch from server
        const response = await frappe.call({
            method: 'restaurant_management.api.kds_display.get_kitchen_stations',
            args: {}
        });
        
        if (response.message) {
            // Cache the stations
            localStorage.setItem('kds_stations', JSON.stringify({
                timestamp: Date.now(),
                data: response.message
            }));
            return response.message;
        }
    } catch (error) {
        log('error', 'Error loading kitchen stations:', error);
    }
    
    return [];
}

/**
 * Load branches from server or localStorage if available
 * @returns {Promise<Array>} List of branches
 */
async function loadBranches() {
    try {
        // Try to get branches from localStorage first
        const cachedBranches = localStorage.getItem('kds_branches');
        if (cachedBranches) {
            try {
                const parsedBranches = JSON.parse(cachedBranches);
                // Check if cache is recent (less than 1 hour old)
                if (parsedBranches.timestamp && 
                    (Date.now() - parsedBranches.timestamp < 3600000)) {
                    return parsedBranches.data;
                }
            } catch (e) {
                log('warn', 'Failed to parse cached branches', e);
            }
        }
        
        // If no valid cached branches, fetch from server
        const response = await frappe.call({
            method: 'restaurant_management.api.kds_display.get_branches',
            args: {}
        });
        
        if (response.message) {
            // Cache the branches
            localStorage.setItem('kds_branches', JSON.stringify({
                timestamp: Date.now(),
                data: response.message
            }));
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
        const optionElement = createElement('option', {
            value: option[valueField],
            textContent: option[textField]
        });
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
 * Get status badge element
 * @param {string} status - Item status
 * @returns {HTMLSpanElement} Status badge element
 */
function getStatusBadge(status) {
    const colorMap = {
        'Waiting': 'bg-red-500',
        'Cooking': 'bg-orange-500',
        'Ready': 'bg-green-500',
    };
    
    return createElement('span', {
        textContent: status,
        className: `inline-block py-1 px-2 rounded text-white text-xs font-medium ${colorMap[status] || 'bg-gray-500'}`
    });
}

/**
 * Create action button for item
 * @param {Object} item - Queue item
 * @returns {HTMLButtonElement} Action button element
 */
function createActionButton(item) {
    let buttonConfig = {
        textContent: 'No Action',
        className: 'py-1 px-3 bg-gray-300 text-gray-500 rounded text-sm font-medium',
        disabled: true
    };
    
    if (item.status === 'Waiting') {
        buttonConfig = {
            textContent: 'Start Cooking',
            className: 'py-1 px-3 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium',
            onClick: () => updateItemStatus(item.id, 'Cooking')
        };
    } else if (item.status === 'Cooking') {
        buttonConfig = {
            textContent: 'Mark Ready',
            className: 'py-1 px-3 bg-green-500 hover:bg-green-600 text-white rounded text-sm font-medium',
            onClick: () => updateItemStatus(item.id, 'Ready')
        };
    }
    
    return createElement('button', buttonConfig);
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
        // Create time in queue element
        const timeSpan = createElement('span', {
            textContent: formatTimeInQueue(item.time_in_queue),
            className: isTimeUrgent(item.time_in_queue) ? 'font-medium text-red-600' : ''
        });
        
        // Create table row
        const row = createElement('tr', { className: 'hover:bg-gray-50' });
        
        // Add cells to row
        row.appendChild(createElement('td', { 
            className: 'px-6 py-4 whitespace-nowrap', 
            textContent: item.item_name 
        }));
        
        row.appendChild(createElement('td', { 
            className: 'px-6 py-4 whitespace-nowrap text-sm', 
            textContent: item.table_number 
        }));
        
        const timeCell = createElement('td', { 
            className: 'px-6 py-4 whitespace-nowrap text-sm'
        });
        timeCell.appendChild(timeSpan);
        row.appendChild(timeCell);
        
        const statusCell = createElement('td', { 
            className: 'px-6 py-4 whitespace-nowrap'
        });
        statusCell.appendChild(getStatusBadge(item.status));
        row.appendChild(statusCell);
        
        const actionCell = createElement('td', { 
            className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500'
        });
        actionCell.appendChild(createActionButton(item));
        row.appendChild(actionCell);
        
        queueContainer.appendChild(row);
    });
    
    // Play sound if there are any ready items and sound is enabled
    if (state.config?.enable_sound_on_ready && items.some(item => item.status === 'Ready')) {
        try {
            // Check if sound is currently paused before playing to prevent concurrent playback
            if (readySound.paused) {
                readySound.play().catch(error => {
                    log('warn', 'Could not play ready sound:', error);
                });
            }
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