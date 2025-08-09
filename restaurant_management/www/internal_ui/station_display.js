"use strict";

/**
 * Station Display JS for Kitchen Display System
 * Enhanced to support guest access and improve error handling
 */

// Element references with 'queue-' prefix to avoid ID collisions
const ELEMENT_IDS = {
    queueItems: 'queue-items',
    kitchenStation: 'kitchen-station',
    branchCode: 'branch-code',
    refreshCountdown: 'refresh-countdown',
    loading: 'kds-loading',
    errorContainer: 'kds-error-container'
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
    queueItems: [],
    isGuest: false,
    accessToken: null,
    hasError: false,
    errorMessage: ''
};

// Sound for ready alerts (load lazily)
let readySound = null;

/**
 * Logging helper function
 * @param {string} level - Log level (log, info, warn, error)
 * @param {string} message - Message to log
 * @param {any} [data] - Optional data to log
 */
function log(level, message, data) {
    const levels = ['log', 'info', 'warn', 'error'];
    const logLevel = levels.includes(level) ? level : 'log';
    
    // Add timestamp to logs
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const formattedMessage = `[KDS ${timestamp}] ${message}`;
    
    if (data) {
        console[logLevel](formattedMessage, data);
    } else {
        console[logLevel](formattedMessage);
    }
}

/**
 * Initialize sound assets
 */
function initSounds() {
    try {
        readySound = new Audio('/assets/restaurant_management/sounds/ready_alert.mp3');
        readySound.addEventListener('error', (e) => log('error', 'Sound file could not be loaded:', e));
        
        // Pre-load sound
        readySound.load();
    } catch (e) {
        log('warn', 'Audio not supported in this browser:', e);
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
 * Display error notification
 * @param {string} message - Error message to display
 * @param {boolean} [isWarning=false] - Whether error is a warning
 */
function showError(message, isWarning = false) {
    log(isWarning ? 'warn' : 'error', message);
    
    state.hasError = true;
    state.errorMessage = message;
    
    // Find or create error container
    let errorContainer = document.getElementById(ELEMENT_IDS.errorContainer);
    
    if (!errorContainer) {
        errorContainer = createElement('div', {
            id: ELEMENT_IDS.errorContainer,
            className: `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${isWarning ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-red-50 border-l-4 border-red-400'}`,
            innerHTML: `
                <div class="flex items-start">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 ${isWarning ? 'text-yellow-400' : 'text-red-400'}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                        </svg>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm ${isWarning ? 'text-yellow-700' : 'text-red-700'} message-text"></p>
                    </div>
                    <div class="ml-auto pl-3">
                        <div class="-mx-1.5 -my-1.5">
                            <button class="inline-flex rounded-md p-1.5 ${isWarning ? 'text-yellow-500 hover:bg-yellow-100' : 'text-red-500 hover:bg-red-100'} close-btn">
                                <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `
        });
        
        document.body.appendChild(errorContainer);
        
        // Add click handler to close button
        errorContainer.querySelector('.close-btn')?.addEventListener('click', () => {
            errorContainer.remove();
            state.hasError = false;
        });
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (errorContainer.parentNode) {
                errorContainer.remove();
                state.hasError = false;
            }
        }, 10000);
    }
    
    // Update message
    const messageElement = errorContainer.querySelector('.message-text');
    if (messageElement) {
        messageElement.textContent = message;
    }
    
    // Make sure it's visible
    errorContainer.style.display = 'block';
}

/**
 * Ensure all required DOM elements exist, creating fallbacks if needed
 */
function ensureElements() {
    // Queue items container (should be tbody element)
    const queueItems = document.getElementById(ELEMENT_IDS.queueItems);
    if (!queueItems) {
        log('warn', 'Queue items container not found, creating fallback');
        
        // Look for any table and try to find its tbody
        const existingTable = document.querySelector('table');
        const existingTbody = existingTable?.querySelector('tbody');
        
        if (existingTbody) {
            existingTbody.id = ELEMENT_IDS.queueItems;
        } else if (existingTable) {
            const tbody = createElement('tbody', { id: ELEMENT_IDS.queueItems });
            existingTable.appendChild(tbody);
        } else {
            // Create a complete fallback table structure
            const table = createElement('table', {
                className: 'min-w-full divide-y divide-gray-200'
            });
            
            const thead = createElement('thead', {
                className: 'bg-gray-700 text-white',
                innerHTML: `
                    <tr>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Item</th>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Table</th>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Time</th>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Action</th>
                    </tr>
                `
            });
            
            const tbody = createElement('tbody', { 
                id: ELEMENT_IDS.queueItems,
                className: 'bg-white divide-y divide-gray-200'
            });
            
            table.appendChild(thead);
            table.appendChild(tbody);
            
            // Try to find a main element to append to
            const main = document.querySelector('main');
            if (main) {
                main.appendChild(table);
            } else {
                document.body.appendChild(table);
            }
        }
    }
    
    // Kitchen station select
    const kitchenSelect = document.getElementById(ELEMENT_IDS.kitchenStation);
    if (!kitchenSelect) {
        log('warn', 'Kitchen station select not found, using native ID');
        
        // Try to find by native ID without our prefix
        const nativeSelect = document.getElementById('kitchen-station');
        if (nativeSelect) {
            nativeSelect.id = ELEMENT_IDS.kitchenStation;
        } else {
            // Create a fallback select
            const select = createElement('select', {
                id: ELEMENT_IDS.kitchenStation,
                className: 'rounded bg-gray-700 border-gray-600 text-white py-1 px-3 text-sm',
                innerHTML: '<option value="">All Stations</option>'
            });
            document.body.appendChild(select);
        }
    }
    
    // Branch select
    const branchSelect = document.getElementById(ELEMENT_IDS.branchCode);
    if (!branchSelect) {
        log('warn', 'Branch select not found, using native ID');
        
        // Try to find by native ID without our prefix
        const nativeSelect = document.getElementById('branch-code');
        if (nativeSelect) {
            nativeSelect.id = ELEMENT_IDS.branchCode;
        } else {
            // Create a fallback select
            const select = createElement('select', {
                id: ELEMENT_IDS.branchCode,
                className: 'rounded bg-gray-700 border-gray-600 text-white py-1 px-3 text-sm',
                innerHTML: '<option value="">All Branches</option>'
            });
            document.body.appendChild(select);
        }
    }
    
    // Refresh countdown
    const countdown = document.getElementById(ELEMENT_IDS.refreshCountdown);
    if (!countdown) {
        log('warn', 'Refresh countdown not found, using native ID');
        
        // Try to find by native ID without our prefix
        const nativeCountdown = document.getElementById('refresh-countdown');
        if (nativeCountdown) {
            nativeCountdown.id = ELEMENT_IDS.refreshCountdown;
        } else {
            // Create a fallback span
            const span = createElement('span', {
                id: ELEMENT_IDS.refreshCountdown,
                className: 'text-sm ml-1 font-medium',
                textContent: state.refreshInterval
            });
            document.body.appendChild(span);
        }
    }
    
    // Loading overlay
    const loading = document.getElementById(ELEMENT_IDS.loading);
    if (!loading) {
        log('warn', 'Loading overlay not found, creating fallback');
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
    if (typeof seconds !== 'number' || isNaN(seconds)) {
        return '0s';
    }
    
    if (seconds < 60) {
        return `${Math.floor(seconds)}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
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
    return typeof seconds === 'number' && seconds > 600; // 10 minutes
}

/**
 * Get access token for API calls (for guest users)
 * @returns {string|null} Access token or null
 */
function getAccessToken() {
    // Check if we already have a token in state
    if (state.accessToken) {
        return state.accessToken;
    }
    
    // Try to get token from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
        // Save token to state
        state.accessToken = token;
        return token;
    }
    
    // Try to get token from localStorage
    const storedToken = localStorage.getItem('kds_access_token');
    if (storedToken) {
        state.accessToken = storedToken;
        return storedToken;
    }
    
    return null;
}

/**
 * Make a safe API call with error handling and guest support
 * @param {string} method - API method name
 * @param {Object} args - API arguments
 * @param {Object} options - Additional options
 * @returns {Promise<any>} API response
 */
async function safeApiCall(method, args = {}, options = {}) {
    const { defaultValue = null, errorMessage = 'API call failed' } = options;
    
    try {
        // Add access token for guest users
        if (state.isGuest) {
            args.access_token = getAccessToken();
        }
        
        const response = await frappe.call({
            method,
            args,
            // Don't show the standard error dialog
            freeze: false,
            show_spinner: false
        });
        
        // Check for error messages in response
        if (response.exc_type || response.exc) {
            throw new Error(response.exc || 'Unknown error');
        }
        
        return response.message || defaultValue;
    } catch (error) {
        // Log error
        log('error', `${errorMessage}: ${method}`, error);
        
        // Show user-friendly error message
        const friendlyMessage = state.isGuest
            ? 'Unable to fetch data. This may be due to missing permissions or authentication.'
            : errorMessage;
            
        showError(friendlyMessage, true);
        
        return defaultValue;
    }
}

/**
 * Load KDS configuration from server
 * @returns {Promise<Object>} Configuration object
 */
async function loadConfig() {
    // Try to get config from cache first
    const cachedConfig = localStorage.getItem('kds_config');
    if (cachedConfig) {
        try {
            const parsedConfig = JSON.parse(cachedConfig);
            // Check if cache is recent (less than 1 hour old)
            if (parsedConfig.timestamp && (Date.now() - parsedConfig.timestamp < 3600000)) {
                return parsedConfig.data;
            }
        } catch (e) {
            log('warn', 'Failed to parse cached config', e);
        }
    }
    
    // Get fresh config from server
    const config = await safeApiCall(
        'restaurant_management.api.kds_display.get_kds_config',
        {},
        {
            errorMessage: 'Error loading KDS configuration',
            defaultValue: {
                refresh_interval: 10,
                default_kitchen_station: '',
                status_color_map: {
                    "Waiting": "#e74c3c",
                    "Cooking": "#f39c12",
                    "Ready": "#2ecc71"
                },
                enable_sound_on_ready: true
            }
        }
    );
    
    // Cache the config
    localStorage.setItem('kds_config', JSON.stringify({
        timestamp: Date.now(),
        data: config
    }));
    
    return config;
}

/**
 * Load kitchen stations from server
 * @returns {Promise<Array>} List of kitchen stations
 */
async function loadStations() {
    // Try to get stations from cache first
    const cachedStations = localStorage.getItem('kds_stations');
    if (cachedStations) {
        try {
            const parsedStations = JSON.parse(cachedStations);
            // Check if cache is recent (less than 10 minutes old)
            if (parsedStations.timestamp && (Date.now() - parsedStations.timestamp < 600000)) {
                return parsedStations.data;
            }
        } catch (e) {
            log('warn', 'Failed to parse cached stations', e);
        }
    }
    
    // Get fresh stations from server
    const stations = await safeApiCall(
        'restaurant_management.api.kds_display.get_kitchen_stations',
        {},
        {
            errorMessage: 'Error loading kitchen stations',
            defaultValue: []
        }
    );
    
    // Cache the stations
    localStorage.setItem('kds_stations', JSON.stringify({
        timestamp: Date.now(),
        data: stations
    }));
    
    return stations;
}

/**
 * Load branches from server
 * @returns {Promise<Array>} List of branches
 */
async function loadBranches() {
    // Try to get branches from cache first
    const cachedBranches = localStorage.getItem('kds_branches');
    if (cachedBranches) {
        try {
            const parsedBranches = JSON.parse(cachedBranches);
            // Check if cache is recent (less than 10 minutes old)
            if (parsedBranches.timestamp && (Date.now() - parsedBranches.timestamp < 600000)) {
                return parsedBranches.data;
            }
        } catch (e) {
            log('warn', 'Failed to parse cached branches', e);
        }
    }
    
    // Get fresh branches from server
    const branches = await safeApiCall(
        'restaurant_management.api.kds_display.get_branches',
        {},
        {
            errorMessage: 'Error loading branches',
            defaultValue: []
        }
    );
    
    // Cache the branches
    localStorage.setItem('kds_branches', JSON.stringify({
        timestamp: Date.now(),
        data: branches
    }));
    
    return branches;
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
    if (!selectElement) {
        log('warn', `Select element with ID ${selectId} not found`);
        return;
    }
    
    // Save current value if any
    const currentValue = selectElement.value || selectedValue;
    
    // Clear existing options except first "All" option
    const firstOption = selectElement.options[0];
    selectElement.innerHTML = '';
    
    if (firstOption) {
        selectElement.appendChild(firstOption);
    }
    
    // Add new options
    if (Array.isArray(options) && options.length > 0) {
        options.forEach(option => {
            // Safety check for option properties
            const value = option[valueField] || '';
            const text = option[textField] || 'Unnamed';
            
            const optionElement = createElement('option', {
                value: value,
                textContent: text
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
    } else {
        log('warn', `No options to populate ${selectId} dropdown`);
    }
}

/**
 * Update countdown display
 */
function updateCountdown() {
    state.countdownValue -= 1;
    
    const countdownElement = document.getElementById(ELEMENT_IDS.refreshCountdown);
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
    const countdownElement = document.getElementById(ELEMENT_IDS.refreshCountdown);
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
        
        const args = {
            item_id: itemId,
            new_status: newStatus
        };
        
        // Add access token for guest users
        if (state.isGuest) {
            args.access_token = getAccessToken();
        }
        
        const result = await safeApiCall(
            'restaurant_management.api.kds_display.update_item_status',
            args,
            {
                errorMessage: 'Error updating item status',
                defaultValue: { success: false }
            }
        );
        
        if (result && result.success) {
            // Immediately refresh the data
            await refreshQueueData();
            return true;
        } else {
            const errorMsg = result?.error || 'Unknown error';
            showError(`Error updating status: ${errorMsg}`);
            return false;
        }
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
        'Sent to Kitchen': 'bg-red-500',
        'Cooking': 'bg-orange-500',
        'Ready': 'bg-green-500',
    };
    
    return createElement('span', {
        textContent: status || 'Unknown',
        className: `inline-block py-1 px-2 rounded text-white text-xs font-medium ${colorMap[status] || 'bg-gray-500'}`
    });
}

/**
 * Create action button for item
 * @param {Object} item - Queue item
 * @returns {HTMLButtonElement} Action button element
 */
function createActionButton(item) {
    // Default button configuration
    let buttonConfig = {
        textContent: 'No Action',
        className: 'py-1 px-3 bg-gray-300 text-gray-500 rounded text-sm font-medium',
        disabled: true
    };
    
    // Create specific buttons based on status
    if (item.status === 'Waiting' || item.status === 'Sent to Kitchen') {
        buttonConfig = {
            textContent: 'Start Cooking',
            className: 'py-1 px-3 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition',
            onClick: () => updateItemStatus(item.id, 'Cooking')
        };
    } else if (item.status === 'Cooking') {
        buttonConfig = {
            textContent: 'Mark Ready',
            className: 'py-1 px-3 bg-green-500 hover:bg-green-600 text-white rounded text-sm font-medium transition',
            onClick: () => updateItemStatus(item.id, 'Ready')
        };
    }
    
    // Create button element
    return createElement('button', buttonConfig);
}

/**
 * Render queue items in the table
 * @param {Array} items - List of queue items
 */
function renderQueueItems(items) {
    const queueContainer = document.getElementById(ELEMENT_IDS.queueItems);
    if (!queueContainer) {
        log('error', 'Queue container not found', ELEMENT_IDS.queueItems);
        return;
    }
    
    // Show empty state if no items
    if (!Array.isArray(items) || items.length === 0) {
        queueContainer.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                    ${state.isGuest ? 
                        'No items in queue. This may be because you are viewing as a guest.' : 
                        'No items in queue'
                    }
                </td>
            </tr>
        `;
        return;
    }
    
    // Clear existing items
    queueContainer.innerHTML = '';
    
    // Add new items
    items.forEach(item => {
        try {
            // Create time in queue element with safe value handling
            const timeInQueue = typeof item.time_in_queue === 'number' ? item.time_in_queue : 0;
            const timeSpan = createElement('span', {
                textContent: formatTimeInQueue(timeInQueue),
                className: isTimeUrgent(timeInQueue) ? 'font-medium text-red-600' : ''
            });
            
            // Create table row
            const row = createElement('tr', { className: 'hover:bg-gray-50' });
            
            // Add cells to row with safe value handling
            row.appendChild(createElement('td', { 
                className: 'px-6 py-4 whitespace-nowrap', 
                textContent: item.item_name || 'Unknown Item' 
            }));
            
            row.appendChild(createElement('td', { 
                className: 'px-6 py-4 whitespace-nowrap text-sm', 
                textContent: item.table_number || 'Unknown Table' 
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
        } catch (error) {
            log('error', 'Error rendering queue item:', error);
        }
    });
    
    // Play sound if there are any ready items and sound is enabled
    if (state.config?.enable_sound_on_ready && 
        items.some(item => item.status === 'Ready') && 
        readySound) {
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
    const kitchenStation = document.getElementById(ELEMENT_IDS.kitchenStation)?.value || '';
    const branchCode = document.getElementById(ELEMENT_IDS.branchCode)?.value || '';
    
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
        
        // Prepare arguments for API call
        const args = {
            kitchen_station: kitchenStation,
            branch_code: branchCode
        };
        
        // Add access token for guest users
        if (state.isGuest) {
            args.access_token = getAccessToken();
        }
        
        // Fetch queue items from API
        const items = await safeApiCall(
            'restaurant_management.api.kds_display.kds_items',
            args,
            {
                errorMessage: 'Error fetching queue items',
                defaultValue: []
            }
        );
        
        // Update state and render items
        state.queueItems = items;
        renderQueueItems(items);
        
        // Reset countdown
        startCountdown();
    } catch (error) {
        log('error', 'Error refreshing queue data:', error);
        renderQueueItems([]);
        startCountdown();
    } finally {
        hideLoading();
    }
}

/**
 * Check if user is guest and handle accordingly
 */
function handleGuestAccess() {
    // Check if user is guest
    state.isGuest = window.kdsContext?.isGuest || false;
    
    if (state.isGuest) {
        log('info', 'Running in guest mode - some features may be limited');
        
        // Add a notification banner for guest users if not already present
        if (!document.querySelector('.guest-notification')) {
            const notification = createElement('div', {
                className: 'guest-notification bg-blue-50 border-l-4 border-blue-400 p-4 mb-4',
                innerHTML: `
                    <p class="text-blue-700">
                        You are viewing in guest mode. Some features may be limited.
                        <a href="/login" class="underline">Log in</a> for full functionality.
                    </p>
                `
            });
            
            // Try to insert at the top of the main content
            const mainContent = document.querySelector('main');
            if (mainContent) {
                mainContent.insertBefore(notification, mainContent.firstChild);
            } else {
                // Fallback to body insertion
                document.body.insertBefore(notification, document.body.firstChild);
            }
        }
        
        // Try to get access token from URL params or local storage
        const token = getAccessToken();
        if (token) {
            log('info', 'Access token found for guest user');
        } else {
            log('warn', 'No access token found for guest user');
        }
    }
}

/**
 * Check connection to server
 * @returns {Promise<boolean>} True if connection is successful
 */
async function checkConnection() {
    try {
        const args = {};
        if (state.isGuest) {
            args.access_token = getAccessToken();
        }
        
        const result = await safeApiCall(
            'restaurant_management.api.kds_display.check_connection',
            args,
            {
                errorMessage: 'Failed to connect to server',
                defaultValue: { success: false }
            }
        );
        
        if (result && result.success) {
            log('info', 'Connected to server successfully', result);
            return true;
        }
        
        log('warn', 'Connection check failed', result);
        return false;
    } catch (error) {
        log('error', 'Error checking connection:', error);
        return false;
    }
}

/**
 * Initialize the page
 */
async function init() {
    try {
        log('info', 'Initializing Kitchen Display System');
        
        // Load context from window if available
        if (window.kdsContext) {
            state.isGuest = !!window.kdsContext.isGuest;
            
            // If access token is provided in context, use it
            if (window.kdsContext.accessToken) {
                state.accessToken = window.kdsContext.accessToken;
                // Store for future page loads
                localStorage.setItem('kds_access_token', state.accessToken);
            }
        }
        
        // Initialize sound
        initSounds();
        
        // Ensure all required elements exist
        ensureElements();
        
        // Handle guest access if applicable
        handleGuestAccess();
        
        // Show loading indicator
        showLoading();
        
        // Check connection first
        const isConnected = await checkConnection();
        if (!isConnected && state.isGuest) {
            showError('Unable to connect to server. This may be due to missing authentication or network issues.', true);
        }
        
        // Load configuration
        state.config = await loadConfig();
        if (state.config && state.config.refresh_interval) {
            state.refreshInterval = Number(state.config.refresh_interval) || 10;
        }
        
        // Load stations and populate dropdown
        state.stations = await loadStations();
        populateDropdown(
            ELEMENT_IDS.kitchenStation, 
            state.stations, 
            'name', 
            'station_name', 
            state.config?.default_kitchen_station || ''
        );
        
        // Load branches and populate dropdown
        state.branches = await loadBranches();
        populateDropdown(ELEMENT_IDS.branchCode, state.branches, 'branch_code', 'name');
        
        // If there's only one branch, select it automatically
        const branchSelect = document.getElementById(ELEMENT_IDS.branchCode);
        if (branchSelect && state.branches.length === 1) {
            branchSelect.value = state.branches[0].branch_code;
        }
        
        // Add event listeners for dropdowns
        document.getElementById(ELEMENT_IDS.kitchenStation)?.addEventListener('change', refreshQueueData);
        document.getElementById(ELEMENT_IDS.branchCode)?.addEventListener('change', refreshQueueData);
        
        // Initial data load
        await refreshQueueData();
        
        // Handle refresh via url parameter
        const urlParams = new URLSearchParams(window.location.search);
        const autoRefresh = urlParams.get('autorefresh');
        
        // Don't auto-refresh if explicitly disabled
        if (autoRefresh === 'false' || autoRefresh === '0') {
            log('info', 'Auto-refresh disabled via URL parameter');
            if (state.countdownTimer) {
                clearInterval(state.countdownTimer);
                state.countdownTimer = null;
            }
            
            // Update countdown display
            const countdownElement = document.getElementById(ELEMENT_IDS.refreshCountdown);
            if (countdownElement) {
                countdownElement.parentElement.textContent = 'Auto-refresh disabled';
            }
        }
        
        // Clean up before page unload
        window.addEventListener('beforeunload', () => {
            if (state.countdownTimer) clearInterval(state.countdownTimer);
            if (state.refreshTimer) clearInterval(state.refreshTimer);
        });
        
        log('info', 'Kitchen Display System initialized successfully');
    } catch (error) {
        log('error', 'Error initializing station display:', error);
        showError('Error initializing display. Please reload the page or contact your administrator.');
    } finally {
        hideLoading();
    }
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', init);