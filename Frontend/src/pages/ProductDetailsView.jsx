import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Package, TrendingUp, TrendingDown, DollarSign,
    Warehouse, Calendar, Filter, Download, Plus, AlertCircle
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { api } from '../utils/api';
import AddTransactionModal from '../components/AddTransactionModal';
import '../styles/ProductDetails.css';

const ProductDetailsView = () => {
    const { productId } = useParams();
    const navigate = useNavigate();
    const [productData, setProductData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [timeFilter, setTimeFilter] = useState('monthly');
    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
    const [depots, setDepots] = useState([]);

    useEffect(() => {
        fetchProductDetails();
        fetchDepots();
    }, [productId]);

    const fetchProductDetails = async () => {
        setLoading(true);
        try {
            const data = await api.getProductDetails(productId);
            console.log('🔍 Received Product Details:', data);
            setProductData(data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load product details');
        } finally {
            setLoading(false);
        }
    };

    const fetchDepots = async () => {
        try {
            const data = await api.getDepots();
            setDepots(data.depots || []);
        } catch (err) {
            console.error('Failed to fetch depots:', err);
        }
    };

    if (loading) {
        return (
            <div className="loading-state-purple">
                <div className="spinner"></div>
                <p>Loading product details...</p>
            </div>
        );
    }

    if (error || !productData) {
        return (
            <div className="error-state">
                <AlertCircle size={48} color="#ef4444" />
                <h3>Failed to Load Product</h3>
                <p>{error}</p>
                <button onClick={() => navigate('/dashboard')} className="back-btn">
                    <ArrowLeft size={18} /> Back to Inventory
                </button>
            </div>
        );
    }

    const { product, transactions, analytics } = productData;

    // Prepare depot distribution data for pie chart
    const depotChartData = (product?.depotDistribution || []).map((depot, idx) => ({
        name: depot.depotName || 'Unknown Depot',
        value: depot.quantity || 0,
        color: ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'][idx % 5]
    }));

    // Get stats based on selected time filter
    const getStats = () => {
        if (!analytics) return null;
        if (timeFilter === 'weekly') return analytics.weeklyStats;
        if (timeFilter === 'yearly') return analytics.yearlyStats;
        return analytics.monthlyStats;
    };

    const stats = getStats() || { stockIn: 0, stockOut: 0, netChange: 0, transfers: 0, total: 0 };
    const stockValue = (product?.stock || 0) * (product?.price || 0);

    return (
        <div className="product-details-container">
            <AddTransactionModal
                isOpen={isTransactionModalOpen}
                onClose={() => setIsTransactionModalOpen(false)}
                product={product}
                depots={depots}
                onSuccess={fetchProductDetails}
            />

            {/* Header */}
            <div className="product-details-header">
                <button onClick={() => navigate('/dashboard')} className="back-btn">
                    <ArrowLeft size={20} /> Back to Inventory
                </button>
                <div className="header-actions">
                    <button className="action-btn secondary" onClick={() => navigate('/dashboard')}>
                        <Package size={18} /> View All Products
                    </button>
                    <button className="action-btn primary" onClick={() => setIsTransactionModalOpen(true)}>
                        <Plus size={18} /> Add Transaction
                    </button>
                </div>
            </div>

            {/* Product Overview Card */}
            <div className="product-overview-card">
                <div className="product-image-section">
                    <img
                        src={product.image || `https://api.dicebear.com/7.x/identicon/svg?seed=${product.sku}`}
                        alt={product.name}
                        className="product-image-large"
                    />
                </div>
                <div className="product-info-section">
                    <div className="product-title-row">
                        <div>
                            <h1>{product.name}</h1>
                            <p className="product-sku">SKU: {product.sku}</p>
                        </div>
                        <span className={`status-badge status-${product.status || 'unknown'}`}>
                            {(product.status || 'unknown').toUpperCase()}
                        </span>
                    </div>
                    <div className="product-meta-grid">
                        <div className="meta-item">
                            <span className="meta-label">Category</span>
                            <span className="meta-value">{product.category}</span>
                        </div>
                        <div className="meta-item">
                            <span className="meta-label">Brand</span>
                            <span className="meta-value">{product.brand}</span>
                        </div>
                        <div className="meta-item">
                            <span className="meta-label">Supplier</span>
                            <span className="meta-value">{product.supplier}</span>
                        </div>
                        <div className="meta-item">
                            <span className="meta-label">Lead Time</span>
                            <span className="meta-value">{product.leadTime || 0} days</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Key Metrics */}
            <div className="metrics-grid">
                <div className="metric-card">
                    <div className="metric-icon" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                        <Package size={24} color="#8b5cf6" />
                    </div>
                    <div className="metric-content">
                        <span className="metric-label">Current Stock</span>
                        <span className="metric-value">{product.stock} units</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                        <DollarSign size={24} color="#10b981" />
                    </div>
                    <div className="metric-content">
                        <span className="metric-label">Stock Value</span>
                        <span className="metric-value">₹{stockValue.toLocaleString()}</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon" style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                        <TrendingUp size={24} color="#3b82f6" />
                    </div>
                    <div className="metric-content">
                        <span className="metric-label">Avg. Daily Sales</span>
                        <span className="metric-value">{product.dailySales} units</span>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                        <AlertCircle size={24} color="#f59e0b" />
                    </div>
                    <div className="metric-content">
                        <span className="metric-label">Reorder Point</span>
                        <span className="metric-value">{product.reorderPoint} units</span>
                    </div>
                </div>
            </div>

            {/* Time Filter Tabs */}
            <div className="time-filter-tabs">
                <button
                    className={`filter-tab ${timeFilter === 'weekly' ? 'active' : ''}`}
                    onClick={() => setTimeFilter('weekly')}
                >
                    Weekly
                </button>
                <button
                    className={`filter-tab ${timeFilter === 'monthly' ? 'active' : ''}`}
                    onClick={() => setTimeFilter('monthly')}
                >
                    Monthly
                </button>
                <button
                    className={`filter-tab ${timeFilter === 'yearly' ? 'active' : ''}`}
                    onClick={() => setTimeFilter('yearly')}
                >
                    Yearly
                </button>
            </div>

            {/* Transaction Stats */}
            <div className="stats-cards-row">
                <div className="stat-card green">
                    <TrendingUp size={20} />
                    <div>
                        <div className="stat-value">{stats.stockIn}</div>
                        <div className="stat-label">Stock In</div>
                    </div>
                </div>
                <div className="stat-card red">
                    <TrendingDown size={20} />
                    <div>
                        <div className="stat-value">{stats.stockOut}</div>
                        <div className="stat-label">Stock Out</div>
                    </div>
                </div>
                <div className="stat-card blue">
                    <Package size={20} />
                    <div>
                        <div className="stat-value">{stats.netChange >= 0 ? '+' : ''}{stats.netChange}</div>
                        <div className="stat-label">Net Change</div>
                    </div>
                </div>
                <div className="stat-card purple">
                    <Calendar size={20} />
                    <div>
                        <div className="stat-value">{stats.total}</div>
                        <div className="stat-label">Total Transactions</div>
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="charts-row">
                {/* Transaction Volume Chart */}
                <div className="chart-card">
                    <h3>Transaction Volume</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analytics?.chartData || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                            <Tooltip
                                contentStyle={{
                                    background: '#1e1b4b',
                                    border: '1px solid #4c1d95',
                                    borderRadius: '8px'
                                }}
                            />
                            <Legend />
                            <Bar dataKey="stockIn" fill="#10b981" name="Stock In" />
                            <Bar dataKey="stockOut" fill="#ef4444" name="Stock Out" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Depot Distribution Chart */}
                <div className="chart-card">
                    <h3>Depot Distribution</h3>
                    {depotChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={depotChartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {depotChartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="empty-chart">
                            <Warehouse size={48} color="#64748b" />
                            <p>No depot distribution data</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Depot Distribution Table */}
            <div className="section-card">
                <h3><Warehouse size={20} /> Depot Distribution</h3>
                <div className="depot-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Depot Name</th>
                                <th>Quantity</th>
                                <th>Percentage</th>
                                <th>Last Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(product.depotDistribution || []).length > 0 ? (
                                product.depotDistribution.map((depot, idx) => (
                                    <tr key={idx}>
                                        <td><strong>{depot.depotName}</strong></td>
                                        <td>{depot.quantity} units</td>
                                        <td>
                                            <div className="percentage-bar">
                                                <div
                                                    className="percentage-fill"
                                                    style={{
                                                        width: `${product.stock > 0 ? (depot.quantity / product.stock) * 100 : 0}%`,
                                                        background: depotChartData[idx]?.color || '#8b5cf6'
                                                    }}
                                                ></div>
                                                <span>{product.stock > 0 ? ((depot.quantity / product.stock) * 100).toFixed(1) : 0}%</span>
                                            </div>
                                        </td>
                                        <td>{depot.lastUpdated ? new Date(depot.lastUpdated).toLocaleDateString() : 'Never'}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>
                                        No depot distribution data
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Transaction History */}
            <div className="section-card">
                <div className="section-header">
                    <h3><Calendar size={20} /> Transaction History</h3>
                    <div className="section-actions">
                        <span className="transaction-count">{transactions.length} transactions</span>
                    </div>
                </div>
                <div className="transactions-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Quantity</th>
                                <th>From/To</th>
                                <th>Reason</th>
                                <th>Stock Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.length > 0 ? (
                                transactions.map((tx) => (
                                    <tr key={tx.id}>
                                        <td>{new Date(tx.timestamp).toLocaleString()}</td>
                                        <td>
                                            <span className={`transaction-type-badge ${tx.type || 'unknown'}`}>
                                                {tx.type === 'stock-in' && <TrendingUp size={14} />}
                                                {tx.type === 'stock-out' && <TrendingDown size={14} />}
                                                {tx.type === 'transfer' && '↔'}
                                                {tx.type ? tx.type.replace('-', ' ').toUpperCase() : 'UNKNOWN'}
                                            </span>
                                        </td>
                                        <td><strong>{tx.quantity}</strong></td>
                                        <td>
                                            {tx.type === 'stock-in' && tx.toDepot}
                                            {tx.type === 'stock-out' && tx.fromDepot}
                                            {tx.type === 'transfer' && `${tx.fromDepot} → ${tx.toDepot}`}
                                        </td>
                                        <td>{tx.reason || '-'}</td>
                                        <td>
                                            <span className="stock-change">
                                                {tx.previousStock} → {tx.newStock}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                                        No transactions recorded
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
};

export default ProductDetailsView;
