import axios from 'axios';

// Using Vite proxies defined in vite.config.js
const NODE_API_URL = '/api';
const PYTHON_API_URL = '/ml-api';

const nodeApi = axios.create({ baseURL: NODE_API_URL });
const pythonApi = axios.create({ baseURL: PYTHON_API_URL });

// Request interceptor to add JWT token
nodeApi.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor to handle 401 errors
nodeApi.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
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

    addStock: async (productId, depotId, quantity, reason) => {
        const response = await nodeApi.post(`/products/${productId}/add-stock`, {
            depotId,
            quantity,
            reason
        });
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

    // Python AI Backend
    predictCustom: async (data) => {
        const response = await pythonApi.post('/predict/custom', data);
        return response.data;
    },

    runScenario: async (data) => {
        const response = await pythonApi.post('/scenario-planning', data);
        return response.data;
    },

    getAIStatus: async () => {
        const response = await pythonApi.get('/status');
        return response.data;
    },

    getForecastBySku: async (sku) => {
        const response = await pythonApi.get(`/forecast/${sku}`);
        return response.data;
    },

    // Reports API
    getReportStats: async () => {
        const response = await nodeApi.get('/reports/stats');
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
