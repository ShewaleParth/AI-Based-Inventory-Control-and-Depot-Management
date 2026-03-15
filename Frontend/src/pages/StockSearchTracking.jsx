import React, { useState, useEffect } from 'react';
import {
    Search, Package, MapPin, TrendingUp, TrendingDown,
    Filter, Download, Eye, BarChart3, Clock, AlertCircle,
    CheckCircle, XCircle, RefreshCw, Grid, List, SlidersHorizontal,
    ArrowUpDown, Maximize2, ChevronRight, Box
} from 'lucide-react';
import { api } from '../utils/api';
import '../styles/StockSearchTracking.css';

const StockSearchTracking = () => {
    const [products, setProducts] = useState([]);
    const [depots, setDepots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    
    const [filters, setFilters] = useState({
        search: '',
        category: 'all',
        depot: 'all',
        stockLevel: 'all', // 'all', 'in-stock', 'low-stock', 'out-of-stock'
        riskLevel: 'all', // 'all', 'high', 'medium', 'safe'
        sortBy: 'name' // 'name', 'stock', 'price', 'risk'
    });

    const [stats, setStats] = useState({
        totalProducts: 0,
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
        totalValue: 0
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [productsData, depotsData] = await Promise.all([
                api.getProducts({ limit: 1000 }),
                api.getDepots()
            ]);

            setProducts(productsData.products || []);
            setDepots(depotsData.depots || []);
            calculateStats(productsData.products || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (productList) => {
        const stats = {
            totalProducts: productList.length,
            inStock: productList.filter(p => p.status === 'in-stock' || p.status === 'overstock').length,
            lowStock: productList.filter(p => p.status === 'low-stock').length,
            outOfStock: productList.filter(p => p.status === 'out-of-stock').length,
            totalValue: productList.reduce((sum, p) => sum + (p.stock * p.price), 0)
        };
        setStats(stats);
    };

    const filteredProducts = products.filter(product => {
        // Search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const matchesSearch = 
                product.name?.toLowerCase().includes(searchLower) ||
                product.sku?.toLowerCase().includes(searchLower) ||
                product.category?.toLowerCase().includes(searchLower) ||
                product.supplier?.toLowerCase().includes(searchLower);
            if (!matchesSearch) return false;
        }

        // Category filter
        if (filters.category !== 'all' && product.category !== filters.category) {
            return false;
        }

        // Depot filter
        if (filters.depot !== 'all') {
            const hasDepot = product.depotDistribution?.some(
                d => d.depotId?.toString() === filters.depot
            );
            if (!hasDepot) return false;
        }

        // Stock level filter
        if (filters.stockLevel !== 'all' && product.status !== filters.stockLevel) {
            return false;
        }

        // Risk level filter
        if (filters.riskLevel !== 'all' && product.riskLevel?.toLowerCase() !== filters.riskLevel) {
            return false;
        }

        return true;
    }).sort((a, b) => {
        switch (filters.sortBy) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'stock':
                return b.stock - a.stock;
            case 'price':
                return b.price - a.price;
            case 'risk':
                const riskOrder = { 'HIGH': 3, 'MEDIUM': 2, 'SAFE': 1 };
                return (riskOrder[b.riskLevel] || 0) - (riskOrder[a.riskLevel] || 0);
            default:
                return 0;
        }
    });

    const getCategories = () => {
        const categories = [...new Set(products.map(p => p.category))];
        return categories.sort();
    };

    const getRiskColor = (riskLevel) => {
        switch (riskLevel?.toUpperCase()) {
            case 'HIGH': return 'high';
            case 'MEDIUM': return 'medium';
            default: return 'safe';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'in-stock':
            case 'overstock':
                return <CheckCircle size={16} />;
            case 'low-stock':
                return <AlertCircle size={16} />;
            case 'out-of-stock':
                return <XCircle size={16} />;
            default:
                return <Package size={16} />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'in-stock':
            case 'overstock':
                return 'success';
            case 'low-stock':
                return 'warning';
            case 'out-of-stock':
                return 'danger';
            default:
                return 'muted';
        }
    };

    const handleProductClick = (product) => {
        setSelectedProduct(product);
        setShowDetailModal(true);
    };

    const handleExportResults = () => {
        const headers = ['SKU', 'Name', 'Category', 'Stock', 'Price', 'Status', 'Risk Level', 'Supplier'];
        const rows = filteredProducts.map(p => [
            p.sku,
            p.name,
            p.category,
            p.stock,
            p.price,
            p.status,
            p.riskLevel || 'N/A',
            p.supplier
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stock_search_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    return (
        <div className="stock-search-container">
            {/* Stats Cards */}
            <div className="sst-stats-grid">
                <div className="sst-stat-card">
                    <div className="sst-stat-icon total">
                        <Package size={24} />
                    </div>
                    <div className="sst-stat-content">
                        <div className="sst-stat-label">Total Products</div>
                        <div className="sst-stat-value">{stats.totalProducts}</div>
                        <div className="sst-stat-subtitle">tracked items</div>
                    </div>
                </div>

                <div className="sst-stat-card">
                    <div className="sst-stat-icon success">
                        <CheckCircle size={24} />
                    </div>
                    <div className="sst-stat-content">
                        <div className="sst-stat-label">In Stock</div>
                        <div className="sst-stat-value">{stats.inStock}</div>
                        <div className="sst-stat-subtitle">available items</div>
                    </div>
                </div>

                <div className="sst-stat-card">
                    <div className="sst-stat-icon warning">
                        <AlertCircle size={24} />
                    </div>
                    <div className="sst-stat-content">
                        <div className="sst-stat-label">Low Stock</div>
                        <div className="sst-stat-value">{stats.lowStock}</div>
                        <div className="sst-stat-subtitle">needs attention</div>
                    </div>
                </div>

                <div className="sst-stat-card">
                    <div className="sst-stat-icon primary">
                        <BarChart3 size={24} />
                    </div>
                    <div className="sst-stat-content">
                        <div className="sst-stat-label">Total Value</div>
                        <div className="sst-stat-value">₹{(stats.totalValue / 1000).toFixed(1)}K</div>
                        <div className="sst-stat-subtitle">inventory worth</div>
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="sst-search-section">
                <div className="sst-search-header">
                    <h2>Search & Track Inventory</h2>
                    <div className="sst-view-controls">
                        <button 
                            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                            onClick={() => setViewMode('grid')}
                        >
                            <Grid size={18} />
                        </button>
                        <button 
                            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => setViewMode('list')}
                        >
                            <List size={18} />
                        </button>
                    </div>
                </div>

                <div className="sst-search-bar">
                    <Search size={20} />
                    <input
                        type="text"
                        placeholder="Search by name, SKU, category, or supplier..."
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    />
                    {filters.search && (
                        <button 
                            className="clear-search"
                            onClick={() => setFilters({ ...filters, search: '' })}
                        >
                            <XCircle size={18} />
                        </button>
                    )}
                </div>

                <div className="sst-filters-bar">
                    <select
                        className="sst-filter-select"
                        value={filters.category}
                        onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                    >
                        <option value="all">All Categories</option>
                        {getCategories().map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>

                    <select
                        className="sst-filter-select"
                        value={filters.depot}
                        onChange={(e) => setFilters({ ...filters, depot: e.target.value })}
                    >
                        <option value="all">All Depots</option>
                        {depots.map(depot => (
                            <option key={depot._id || depot.id} value={depot._id || depot.id}>
                                {depot.name}
                            </option>
                        ))}
                    </select>

                    <select
                        className="sst-filter-select"
                        value={filters.stockLevel}
                        onChange={(e) => setFilters({ ...filters, stockLevel: e.target.value })}
                    >
                        <option value="all">All Stock Levels</option>
                        <option value="in-stock">In Stock</option>
                        <option value="low-stock">Low Stock</option>
                        <option value="out-of-stock">Out of Stock</option>
                    </select>

                    <select
                        className="sst-filter-select"
                        value={filters.riskLevel}
                        onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value })}
                    >
                        <option value="all">All Risk Levels</option>
                        <option value="high">High Risk</option>
                        <option value="medium">Medium Risk</option>
                        <option value="safe">Safe</option>
                    </select>

                    <select
                        className="sst-filter-select"
                        value={filters.sortBy}
                        onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                    >
                        <option value="name">Sort by Name</option>
                        <option value="stock">Sort by Stock</option>
                        <option value="price">Sort by Price</option>
                        <option value="risk">Sort by Risk</option>
                    </select>

                    <button className="sst-action-btn" onClick={handleExportResults}>
                        <Download size={16} />
                        Export
                    </button>

                    <button className="sst-action-btn" onClick={fetchData}>
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                </div>

                <div className="sst-results-info">
                    <span className="results-count">
                        {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'} found
                    </span>
                </div>
            </div>

            {/* Results */}
            <div className={`sst-results ${viewMode}`}>
                {loading ? (
                    <div className="sst-loading">
                        <div className="spinner"></div>
                        <p>Loading inventory...</p>
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className="sst-empty">
                        <Package size={64} />
                        <h3>No Products Found</h3>
                        <p>Try adjusting your search criteria or filters</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="sst-grid">
                        {filteredProducts.map(product => (
                            <div 
                                key={product.id || product._id} 
                                className="sst-product-card"
                                onClick={() => handleProductClick(product)}
                            >
                                <div className="sst-card-image">
                                    <img 
                                        src={product.image || `https://api.dicebear.com/7.x/shapes/svg?seed=${product.sku}`}
                                        alt={product.name}
                                    />
                                    <span className={`sst-risk-badge ${getRiskColor(product.riskLevel)}`}>
                                        {product.riskLevel || 'SAFE'}
                                    </span>
                                </div>
                                <div className="sst-card-content">
                                    <h4>{product.name}</h4>
                                    <p className="sst-sku">{product.sku}</p>
                                    
                                    <div className="sst-card-stats">
                                        <div className="stat-item">
                                            <Package size={14} />
                                            <span>{product.stock} units</span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="price">₹{product.price}</span>
                                        </div>
                                    </div>

                                    <div className="sst-card-footer">
                                        <span className={`status-badge ${getStatusColor(product.status)}`}>
                                            {getStatusIcon(product.status)}
                                            {product.status}
                                        </span>
                                        <span className="depot-count">
                                            <MapPin size={12} />
                                            {product.depotDistribution?.length || 0} depots
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="sst-list">
                        <table className="sst-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Category</th>
                                    <th>Stock</th>
                                    <th>Price</th>
                                    <th>Status</th>
                                    <th>Risk</th>
                                    <th>Depots</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.map(product => (
                                    <tr key={product.id || product._id} className="sst-table-row">
                                        <td>
                                            <div className="product-cell">
                                                <img 
                                                    src={product.image || `https://api.dicebear.com/7.x/shapes/svg?seed=${product.sku}`}
                                                    alt={product.name}
                                                    className="product-thumb"
                                                />
                                                <div>
                                                    <div className="product-name">{product.name}</div>
                                                    <div className="product-sku">{product.sku}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{product.category}</td>
                                        <td>
                                            <span className="stock-value">{product.stock} units</span>
                                        </td>
                                        <td>₹{product.price}</td>
                                        <td>
                                            <span className={`status-badge ${getStatusColor(product.status)}`}>
                                                {getStatusIcon(product.status)}
                                                {product.status}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`risk-badge ${getRiskColor(product.riskLevel)}`}>
                                                {product.riskLevel || 'SAFE'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="depot-count">
                                                <MapPin size={14} />
                                                {product.depotDistribution?.length || 0}
                                            </span>
                                        </td>
                                        <td>
                                            <button 
                                                className="action-icon-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleProductClick(product);
                                                }}
                                            >
                                                <Eye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Product Detail Modal */}
            {showDetailModal && selectedProduct && (
                <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
                    <div className="sst-detail-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Product Details</h2>
                            <button onClick={() => setShowDetailModal(false)} className="close-btn">
                                <XCircle size={24} />
                            </button>
                        </div>
                        
                        <div className="modal-body">
                            <div className="detail-header">
                                <img 
                                    src={selectedProduct.image || `https://api.dicebear.com/7.x/shapes/svg?seed=${selectedProduct.sku}`}
                                    alt={selectedProduct.name}
                                    className="detail-image"
                                />
                                <div className="detail-info">
                                    <h3>{selectedProduct.name}</h3>
                                    <p className="detail-sku">{selectedProduct.sku}</p>
                                    <div className="detail-badges">
                                        <span className={`status-badge ${getStatusColor(selectedProduct.status)}`}>
                                            {getStatusIcon(selectedProduct.status)}
                                            {selectedProduct.status}
                                        </span>
                                        <span className={`risk-badge ${getRiskColor(selectedProduct.riskLevel)}`}>
                                            {selectedProduct.riskLevel || 'SAFE'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="detail-grid">
                                <div className="detail-item">
                                    <label>Category</label>
                                    <span>{selectedProduct.category}</span>
                                </div>
                                <div className="detail-item">
                                    <label>Supplier</label>
                                    <span>{selectedProduct.supplier}</span>
                                </div>
                                <div className="detail-item">
                                    <label>Total Stock</label>
                                    <span>{selectedProduct.stock} units</span>
                                </div>
                                <div className="detail-item">
                                    <label>Price</label>
                                    <span>₹{selectedProduct.price}</span>
                                </div>
                                <div className="detail-item">
                                    <label>Reorder Point</label>
                                    <span>{selectedProduct.reorderPoint} units</span>
                                </div>
                                <div className="detail-item">
                                    <label>Total Value</label>
                                    <span>₹{(selectedProduct.stock * selectedProduct.price).toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="depot-distribution">
                                <h4>Depot Distribution</h4>
                                {selectedProduct.depotDistribution && selectedProduct.depotDistribution.length > 0 ? (
                                    <div className="depot-list">
                                        {selectedProduct.depotDistribution.map((depot, index) => (
                                            <div key={index} className="depot-item">
                                                <div className="depot-info">
                                                    <MapPin size={16} />
                                                    <span className="depot-name">{depot.depotName}</span>
                                                </div>
                                                <span className="depot-quantity">{depot.quantity} units</span>
                                                <div className="depot-bar">
                                                    <div 
                                                        className="depot-bar-fill"
                                                        style={{ 
                                                            width: `${(depot.quantity / selectedProduct.stock) * 100}%` 
                                                        }}
                                                    ></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="no-depots">No depot distribution available</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockSearchTracking;
