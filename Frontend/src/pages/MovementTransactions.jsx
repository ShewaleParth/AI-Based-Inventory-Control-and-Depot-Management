import React, { useState, useEffect, useRef } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { 
    TrendingUp, TrendingDown, ArrowRightLeft, Package, 
    Filter, Download, Calendar, Search, RefreshCw,
    Clock, MapPin, User, ChevronDown, Plus, Eye, X
} from 'lucide-react';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { api } from '../utils/api';
import AddTransactionModal from '../components/AddTransactionModal';
import '../styles/MovementTransactions.css';

const MovementTransactions = () => {
    const [transactions, setTransactions] = useState([]);
    const [products, setProducts] = useState([]);
    const [depots, setDepots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        type: 'all',
        depotId: 'all',
        productId: 'all',
        dateRange: '7days',
        search: ''
    });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [productSearch, setProductSearch] = useState('');
    const [initialTab, setInitialTab] = useState('stock-in');
    const [initialQuantity, setInitialQuantity] = useState('');
    const { navigationState, setNavigationState } = useNavigation();
    const autoOpenHandled = useRef(false);
    const [stats, setStats] = useState({
        totalTransactions: 0,
        stockIn: 0,
        stockOut: 0,
        transfers: 0
    });

    useEffect(() => {
        fetchData();
    }, [filters]);

    // Auto-open modal when navigated from Dashboard "Reorder" button
    useEffect(() => {
        if (!navigationState?.openNewTransaction || autoOpenHandled.current) return;
        
        // Wait until products are loaded to set the selected product
        if (products.length > 0) {
            autoOpenHandled.current = true;
            setInitialTab(navigationState.defaultTab || 'stock-in');
            setInitialQuantity(navigationState.suggestedQty?.toString() || '');
            
            if (navigationState.productId) {
                const match = products.find(
                    p => (p._id || p.id)?.toString() === navigationState.productId?.toString()
                );
                if (match) setSelectedProduct(match);
            }
            
            setIsModalOpen(true);
            setNavigationState(null); // Clear state so we don't re-trigger
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigationState, products]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [txData, productsData, depotsData] = await Promise.all([
                api.getTransactions(buildQueryParams()),
                api.getProducts(),
                api.getDepots()
            ]);

            setTransactions(txData.transactions || []);
            setProducts(productsData.products || []);
            setDepots(depotsData.depots || []);
            
            calculateStats(txData.transactions || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const buildQueryParams = () => {
        const params = {};
        if (filters.type !== 'all') params.type = filters.type;
        if (filters.depotId !== 'all') params.depotId = filters.depotId;
        if (filters.productId !== 'all') params.productId = filters.productId;
        
        // Date range filtering
        if (filters.dateRange !== 'all') {
            const now = new Date();
            const daysMap = { '7days': 7, '30days': 30, '90days': 90 };
            const days = daysMap[filters.dateRange];
            if (days) {
                const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
                params.startDate = startDate.toISOString();
            }
        }
        
        return params;
    };

    const calculateStats = (txList) => {
        const stats = {
            totalTransactions: txList.length,
            stockIn: txList.filter(t => t.transactionType === 'stock-in').reduce((sum, t) => sum + t.quantity, 0),
            stockOut: txList.filter(t => t.transactionType === 'stock-out').reduce((sum, t) => sum + t.quantity, 0),
            transfers: txList.filter(t => t.transactionType === 'transfer').length
        };
        setStats(stats);
    };

    const getTransactionTypeData = () => {
        const stockIn = transactions.filter(t => t.transactionType === 'stock-in').length;
        const stockOut = transactions.filter(t => t.transactionType === 'stock-out').length;
        const transfers = transactions.filter(t => t.transactionType === 'transfer').length;

        return [
            { name: 'Stock In', value: stockIn, color: '#10b981' },
            { name: 'Stock Out', value: stockOut, color: '#ef4444' },
            { name: 'Transfer', value: transfers, color: '#3b82f6' }
        ];
    };

    const getDailyTrendData = () => {
        const last7Days = [];
        const now = new Date();
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            const dayTransactions = transactions.filter(t => {
                const txDate = new Date(t.timestamp);
                return txDate.toDateString() === date.toDateString();
            });

            last7Days.push({
                date: dateStr,
                stockIn: dayTransactions.filter(t => t.transactionType === 'stock-in').reduce((sum, t) => sum + t.quantity, 0),
                stockOut: dayTransactions.filter(t => t.transactionType === 'stock-out').reduce((sum, t) => sum + t.quantity, 0),
                transfers: dayTransactions.filter(t => t.transactionType === 'transfer').length
            });
        }
        
        return last7Days;
    };

    const getDepotActivityData = () => {
        const depotActivity = {};
        
        transactions.forEach(tx => {
            const depotName = tx.toDepot || tx.fromDepot || 'Unknown';
            if (!depotActivity[depotName]) {
                depotActivity[depotName] = 0;
            }
            depotActivity[depotName]++;
        });

        return Object.entries(depotActivity)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    };

    const filteredTransactions = transactions.filter(tx => {
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            return tx.productName?.toLowerCase().includes(searchLower) ||
                   tx.productSku?.toLowerCase().includes(searchLower) ||
                   tx.toDepot?.toLowerCase().includes(searchLower) ||
                   tx.fromDepot?.toLowerCase().includes(searchLower);
        }
        return true;
    });

    const filteredProducts = products.filter(p => {
        if (productSearch) {
            const searchLower = productSearch.toLowerCase();
            return p.name?.toLowerCase().includes(searchLower) ||
                   p.sku?.toLowerCase().includes(searchLower) ||
                   p.category?.toLowerCase().includes(searchLower);
        }
        return true;
    });

    const getTransactionIcon = (type) => {
        switch (type) {
            case 'stock-in': return <TrendingUp size={16} />;
            case 'stock-out': return <TrendingDown size={16} />;
            case 'transfer': return <ArrowRightLeft size={16} />;
            default: return <Package size={16} />;
        }
    };

    const getTransactionColor = (type) => {
        switch (type) {
            case 'stock-in': return 'success';
            case 'stock-out': return 'danger';
            case 'transfer': return 'primary';
            default: return 'muted';
        }
    };

    const handleExportCSV = () => {
        const headers = ['Date', 'Type', 'Product', 'SKU', 'Quantity', 'From', 'To', 'Reason', 'Performed By'];
        const rows = filteredTransactions.map(tx => [
            new Date(tx.timestamp).toLocaleString(),
            tx.transactionType,
            tx.productName,
            tx.productSku,
            tx.quantity,
            tx.fromDepot || 'N/A',
            tx.toDepot || 'N/A',
            tx.reason || 'N/A',
            tx.performedBy
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const handleProductSelect = (product) => {
        setSelectedProduct(product);
        setIsProductSelectorOpen(false);
        setIsModalOpen(true);
        setProductSearch('');
    };

    return (
        <div className="movement-transactions-container">
            {/* Product Selector Modal */}
            {isProductSelectorOpen && (
                <div className="modal-overlay">
                    <div className="product-selector-modal">
                        <div className="modal-header">
                            <h2>Select Product for Transaction</h2>
                            <button 
                                onClick={() => {
                                    setIsProductSelectorOpen(false);
                                    setProductSearch('');
                                }} 
                                className="close-btn"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="product-search-box">
                            <Search size={20} />
                            <input
                                type="text"
                                placeholder="Search products by name, SKU, or category..."
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="product-grid">
                            {filteredProducts.length === 0 ? (
                                <div className="no-products">
                                    <Package size={48} />
                                    <p>No products found</p>
                                </div>
                            ) : (
                                filteredProducts.map(product => (
                                    <div 
                                        key={product.id || product._id} 
                                        className="product-card"
                                        onClick={() => handleProductSelect(product)}
                                    >
                                        <div className="product-card-image">
                                            <img 
                                                src={product.image || `https://api.dicebear.com/7.x/identicon/svg?seed=${product.sku}`} 
                                                alt={product.name}
                                            />
                                        </div>
                                        <div className="product-card-content">
                                            <h4>{product.name}</h4>
                                            <p className="product-sku">{product.sku}</p>
                                            <div className="product-card-footer">
                                                <span className="product-stock">
                                                    <Package size={14} />
                                                    {product.stock} units
                                                </span>
                                                <span className={`product-risk ${product.riskLevel?.toLowerCase() || 'safe'}`}>
                                                    {product.riskLevel || 'SAFE'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            <AddTransactionModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedProduct(null);
                    setInitialTab('stock-in');
                    setInitialQuantity('');
                }}
                product={selectedProduct}
                depots={depots}
                initialTab={initialTab}
                initialQuantity={initialQuantity}
                onSuccess={() => {
                    fetchData();
                    setIsModalOpen(false);
                    setSelectedProduct(null);
                    setInitialTab('stock-in');
                    setInitialQuantity('');
                }}
            />

            {/* Stats Cards */}
            <div className="mt-stats-grid">
                <div className="mt-stat-card">
                    <div className="mt-stat-icon total">
                        <Package size={24} />
                    </div>
                    <div className="mt-stat-content">
                        <div className="mt-stat-label">Total Transactions</div>
                        <div className="mt-stat-value">{stats.totalTransactions}</div>
                        <div className="mt-stat-trend positive">
                            <TrendingUp size={14} />
                            <span>Live tracking</span>
                        </div>
                    </div>
                </div>

                <div className="mt-stat-card">
                    <div className="mt-stat-icon success">
                        <TrendingUp size={24} />
                    </div>
                    <div className="mt-stat-content">
                        <div className="mt-stat-label">Stock In</div>
                        <div className="mt-stat-value">{stats.stockIn.toLocaleString()}</div>
                        <div className="mt-stat-subtitle">units received</div>
                    </div>
                </div>

                <div className="mt-stat-card">
                    <div className="mt-stat-icon danger">
                        <TrendingDown size={24} />
                    </div>
                    <div className="mt-stat-content">
                        <div className="mt-stat-label">Stock Out</div>
                        <div className="mt-stat-value">{stats.stockOut.toLocaleString()}</div>
                        <div className="mt-stat-subtitle">units dispatched</div>
                    </div>
                </div>

                <div className="mt-stat-card">
                    <div className="mt-stat-icon primary">
                        <ArrowRightLeft size={24} />
                    </div>
                    <div className="mt-stat-content">
                        <div className="mt-stat-label">Transfers</div>
                        <div className="mt-stat-value">{stats.transfers}</div>
                        <div className="mt-stat-subtitle">inter-depot moves</div>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="mt-charts-grid">
                <div className="mt-chart-card">
                    <div className="mt-chart-header">
                        <h3>Transaction Trends</h3>
                        <div className="mt-chart-legend">
                            <span className="legend-item">
                                <span className="legend-dot success"></span>
                                Stock In
                            </span>
                            <span className="legend-item">
                                <span className="legend-dot danger"></span>
                                Stock Out
                            </span>
                            <span className="legend-item">
                                <span className="legend-dot primary"></span>
                                Transfers
                            </span>
                        </div>
                    </div>
                    <div className="mt-chart-body">
                        <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={getDailyTrendData()}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis 
                                    dataKey="date" 
                                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                    axisLine={{ stroke: 'var(--border)' }}
                                />
                                <YAxis 
                                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                    axisLine={{ stroke: 'var(--border)' }}
                                />
                                <Tooltip 
                                    contentStyle={{
                                        backgroundColor: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px'
                                    }}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="stockIn" 
                                    stroke="#10b981" 
                                    strokeWidth={2}
                                    dot={{ fill: '#10b981', r: 4 }}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="stockOut" 
                                    stroke="#ef4444" 
                                    strokeWidth={2}
                                    dot={{ fill: '#ef4444', r: 4 }}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="transfers" 
                                    stroke="#3b82f6" 
                                    strokeWidth={2}
                                    dot={{ fill: '#3b82f6', r: 4 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="mt-chart-card">
                    <div className="mt-chart-header">
                        <h3>Transaction Distribution</h3>
                    </div>
                    <div className="mt-chart-body">
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie
                                    data={getTransactionTypeData()}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {getTransactionTypeData().map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="mt-pie-legend">
                            {getTransactionTypeData().map((item, index) => (
                                <div key={index} className="mt-pie-legend-item">
                                    <span className="mt-pie-dot" style={{ backgroundColor: item.color }}></span>
                                    <span className="mt-pie-label">{item.name}</span>
                                    <span className="mt-pie-value">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-chart-card">
                    <div className="mt-chart-header">
                        <h3>Top Active Depots</h3>
                    </div>
                    <div className="mt-chart-body">
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={getDepotActivityData()}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                <XAxis 
                                    dataKey="name" 
                                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                    axisLine={{ stroke: 'var(--border)' }}
                                />
                                <YAxis 
                                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                    axisLine={{ stroke: 'var(--border)' }}
                                />
                                <Tooltip 
                                    contentStyle={{
                                        backgroundColor: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px'
                                    }}
                                />
                                <Bar 
                                    dataKey="count" 
                                    fill="var(--primary)" 
                                    radius={[8, 8, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Filters and Table */}
            <div className="mt-table-section">
                <div className="mt-table-header">
                    <h3>Transaction History</h3>
                    <div className="mt-table-actions">
                        <button className="mt-action-btn refresh" onClick={fetchData}>
                            <RefreshCw size={16} />
                            Refresh
                        </button>
                        <button className="mt-action-btn export" onClick={handleExportCSV}>
                            <Download size={16} />
                            Export CSV
                        </button>
                        <button 
                            className="mt-action-btn primary"
                            onClick={() => setIsProductSelectorOpen(true)}
                        >
                            <Plus size={16} />
                            New Transaction
                        </button>
                    </div>
                </div>

                <div className="mt-filters-bar">
                    <div className="mt-search-box">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search by product, SKU, or depot..."
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        />
                    </div>

                    <select
                        className="mt-filter-select"
                        value={filters.type}
                        onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                    >
                        <option value="all">All Types</option>
                        <option value="stock-in">Stock In</option>
                        <option value="stock-out">Stock Out</option>
                        <option value="transfer">Transfer</option>
                    </select>

                    <select
                        className="mt-filter-select"
                        value={filters.depotId}
                        onChange={(e) => setFilters({ ...filters, depotId: e.target.value })}
                    >
                        <option value="all">All Depots</option>
                        {depots.map(depot => (
                            <option key={depot._id || depot.id} value={depot._id || depot.id}>
                                {depot.name}
                            </option>
                        ))}
                    </select>

                    <select
                        className="mt-filter-select"
                        value={filters.dateRange}
                        onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                    >
                        <option value="7days">Last 7 Days</option>
                        <option value="30days">Last 30 Days</option>
                        <option value="90days">Last 90 Days</option>
                        <option value="all">All Time</option>
                    </select>
                </div>

                <div className="mt-table-container">
                    {loading ? (
                        <div className="mt-loading-state">
                            <div className="spinner"></div>
                            <p>Loading transactions...</p>
                        </div>
                    ) : filteredTransactions.length === 0 ? (
                        <div className="mt-empty-state">
                            <Package size={48} className="empty-icon" />
                            <h3>No Transactions Found</h3>
                            <p>Try adjusting your filters or add a new transaction</p>
                        </div>
                    ) : (
                        <table className="mt-table">
                            <thead>
                                <tr>
                                    <th>Date & Time</th>
                                    <th>Type</th>
                                    <th>Product</th>
                                    <th>Quantity</th>
                                    <th>From</th>
                                    <th>To</th>
                                    <th>Reason</th>
                                    <th>Performed By</th>
                                    <th>Stock Change</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTransactions.map((tx) => (
                                    <tr key={tx._id || tx.id} className="mt-table-row">
                                        <td>
                                            <div className="mt-date-cell">
                                                <Clock size={14} />
                                                <span>{new Date(tx.timestamp).toLocaleDateString()}</span>
                                                <span className="time-text">
                                                    {new Date(tx.timestamp).toLocaleTimeString([], { 
                                                        hour: '2-digit', 
                                                        minute: '2-digit' 
                                                    })}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`mt-type-badge ${getTransactionColor(tx.transactionType)}`}>
                                                {getTransactionIcon(tx.transactionType)}
                                                {tx.transactionType}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="mt-product-cell">
                                                <span className="product-name">{tx.productName}</span>
                                                <span className="product-sku">{tx.productSku}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="mt-quantity">{tx.quantity} units</span>
                                        </td>
                                        <td>
                                            <div className="mt-depot-cell">
                                                {tx.fromDepot ? (
                                                    <>
                                                        <MapPin size={14} />
                                                        <span>{tx.fromDepot}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-muted">External</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="mt-depot-cell">
                                                {tx.toDepot ? (
                                                    <>
                                                        <MapPin size={14} />
                                                        <span>{tx.toDepot}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-muted">External</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="mt-reason">{tx.reason || 'N/A'}</span>
                                        </td>
                                        <td>
                                            <div className="mt-user-cell">
                                                <User size={14} />
                                                <span>{tx.performedBy}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="mt-stock-change">
                                                <span className="prev-stock">{tx.previousStock}</span>
                                                <span className="arrow">→</span>
                                                <span className="new-stock">{tx.newStock}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MovementTransactions;
