import axios from 'axios';

// Using Vite proxies defined in vite.config.js
const NODE_API_URL = '/api/v1';
const PYTHON_API_URL = '/ml-api';

const nodeApi = axios.create({ baseURL: NODE_API_URL });
const pythonApi = axios.create({ baseURL: PYTHON_API_URL });

let currentToken = null;

export const setAuthToken = (token) => {
    currentToken = token;
};

// Request interceptor to add JWT token
nodeApi.interceptors.request.use((config) => {
    // Access token lives in memory only (dual-token system — NOT localStorage)
    const token = currentToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Response interceptor: on 401, trigger a silent refresh attempt via the auth context
nodeApi.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                // If already refreshing, wait for it to finish then retry
                return new Promise(function(resolve, reject) {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers['Authorization'] = 'Bearer ' + token;
                    return nodeApi(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // Attempt silent token refresh
                const refreshResponse = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true });
                const { token: newToken } = refreshResponse.data;
                
                // Update in-memory token
                currentToken = newToken;
                
                // Process the queued requests with the new token
                processQueue(null, newToken);
                
                // Retry original request with new token
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return nodeApi(originalRequest);
            } catch (err) {
                processQueue(err, null);
                // Refresh failed — clear state and redirect to login
                currentToken = null;
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
                return Promise.reject(err);
            } finally {
                isRefreshing = false;
            }
        }
        return Promise.reject(error);
    }
);

export const api = {
    // Authentication
    login: async (email, password) => {
        const response = await nodeApi.post('/auth/login', { email, password });
        return response.data;
    },

    signup: async (data) => {
        const response = await nodeApi.post('/auth/signup', data);
        return response.data;
    },

    verifyOTP: async (email, otp) => {
        const response = await nodeApi.post('/auth/verify-otp', { email, otp });
        return response.data;
    },

    forgotPassword: async (email) => {
        const response = await nodeApi.post('/auth/forgot-password', { email });
        return response.data;
    },

    resetPassword: async (data) => {
        const response = await nodeApi.post('/auth/reset-password', data);
        return response.data;
    },

    // Products
    getProducts: async (params) => {
        const response = await nodeApi.get('/products', { params });
        return response.data;
    },

    createProduct: async (productData) => {
        const response = await nodeApi.post('/products', productData);
        return response.data;
    },

    updateProduct: async (id, productData) => {
        const response = await nodeApi.put(`/products/${id}`, productData);
        return response.data;
    },

    deleteProduct: async (id) => {
        const response = await nodeApi.delete(`/products/${id}`);
        return response.data;
    },


    // Product Details
    getProductDetails: async (id) => {
        const response = await nodeApi.get(`/products/${id}/details`);
        return response.data;
    },

    // Transaction Management
    addStockIn: async (data) => {
        const response = await nodeApi.post('/transactions/stock-in', data);
        return response.data;
    },

    addStockOut: async (data) => {
        const response = await nodeApi.post('/transactions/stock-out', data);
        return response.data;
    },

    transferStock: async (data) => {
        const response = await nodeApi.post('/transactions/transfer', data);
        return response.data;
    },

    bulkUpload: async (data) => {
        const response = await nodeApi.post('/products/bulk', data);
        return response.data;
    },

    // Forecasts
    getForecasts: async () => {
        const response = await nodeApi.get('/forecasts');
        return response.data;
    },

    getForecastInsights: async () => {
        const response = await nodeApi.get('/forecasts/analytics/insights');
        return response.data;
    },

    // Transactions
    getTransactions: async (params) => {
        const response = await nodeApi.get('/transactions', { params });
        return response.data;
    },

    importTransactionsCSV: async (csvText) => {
        const response = await nodeApi.post('/transactions/import-csv', { csvText });
        return response.data;
    },

    // Dashboard
    getDashboardStats: async () => {
        const response = await nodeApi.get('/dashboard/stats');
        return response.data;
    },

    getTopSKUs: async () => {
        const response = await nodeApi.get('/dashboard/top-skus');
        return response.data;
    },

    getSalesTrend: async (params) => {
        const response = await nodeApi.get('/dashboard/sales-trend', { params });
        return response.data;
    },

    // Depots
    getDepots: async () => {
        const response = await nodeApi.get('/depots');
        return response.data;
    },

    createDepot: async (depotData) => {
        const response = await nodeApi.post('/depots', depotData);
        return response.data;
    },

    updateDepot: async (depotId, depotData) => {
        const response = await nodeApi.put(`/depots/${depotId}`, depotData);
        return response.data;
    },

    getDepotDetails: async (depotId) => {
        const response = await nodeApi.get(`/depots/${depotId}/details`);
        return response.data;
    },

    getNetworkMetrics: async () => {
        const response = await nodeApi.get('/depots/network/metrics');
        return response.data;
    },

    deleteDepot: async (depotId) => {
        const response = await nodeApi.delete(`/depots/${depotId}`);
        return response.data;
    },

    updateDepotCoordinates: async (depotId, lat, lng) => {
        const response = await nodeApi.patch(`/depots/${depotId}/coordinates`, { lat, lng });
        return response.data;
    },

    // Python AI Backend
    // Note: pythonApi baseURL is '/ml-api' which Vite proxy rewrites to 'http://127.0.0.1:5001/api/ml'
    predictCustom: async (data) => {
        const response = await pythonApi.post('/predict/custom', data);
        return response.data;
    },

    removeProductFromDepot: async (depotId, sku) => {
        const response = await nodeApi.delete(`/depots/${depotId}/products/${sku}`);
        return response.data;
    },

    clearDepotInventory: async (depotId) => {
        const response = await nodeApi.delete(`/depots/${depotId}/products`);
        return response.data;
    },

    runScenario: async (data) => {
        const response = await pythonApi.post('/scenario-planning', data);
        return response.data;
    },

    // Health check for Flask AI server — uses /ml-api proxy (→ /api/ml/health doesn't exist on Flask)
    // Flask health is at /api/health — call it directly via axios since there's no proxy rule for it
    getAIStatus: async () => {
        const response = await axios.get('http://localhost:5001/api/health');
        return response.data;
    },

    // Get AI products list from Python
    getAIProducts: async () => {
        const response = await pythonApi.get('/products');
        return response.data;
    },

    // Supplier Risk — uses /supplier-api proxy (→ Flask /api/supplier/*)
    getSupplierRiskOverview: async () => {
        const response = await axios.get('/supplier-api/risk-overview');
        return response.data;
    },

    getSupplierKPIs: async () => {
        const response = await axios.get('/supplier-api/kpis');
        return response.data;
    },


    // Reports API
    getReportStats: async () => {
        const response = await nodeApi.get('/reports/stats');
        return response.data;
    },

    getReportAnalytics: async () => {
        const response = await nodeApi.get('/reports/analytics');
        return response.data;
    },

    getReportsList: async (params) => {
        const response = await nodeApi.get('/reports/list', { params });
        return response.data;
    },

    generateReport: async (reportData) => {
        const response = await nodeApi.post('/reports/generate', reportData);
        return response.data;
    },

    getReportStatus: async (reportId) => {
        const response = await nodeApi.get(`/reports/${reportId}/status`);
        return response.data;
    },

    downloadReport: async (reportId) => {
        const response = await nodeApi.get(`/reports/${reportId}/download`, {
            responseType: 'blob'
        });
        return response.data;
    },

    deleteReport: async (reportId) => {
        const response = await nodeApi.delete(`/reports/${reportId}`);
        return response.data;
    },

    // Alerts/Notifications
    getAlerts: async (params) => {
        const response = await nodeApi.get('/alerts', { params });
        return response.data;
    },

    getUnreadCount: async () => {
        const response = await nodeApi.get('/alerts/unread/count');
        return response.data;
    },

    markAlertAsRead: async (alertId) => {
        const response = await nodeApi.patch(`/alerts/${alertId}/read`);
        return response.data;
    },

    markAllAlertsAsRead: async () => {
        const response = await nodeApi.patch('/alerts/mark-all-read');
        return response.data;
    },

    deleteAlert: async (alertId) => {
        const response = await nodeApi.delete(`/alerts/${alertId}`);
        return response.data;
    }
};
