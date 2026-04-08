import React, { useState, useEffect } from 'react';
import { ArrowLeft, Warehouse, MapPin, Package, TrendingUp, AlertTriangle, Activity, Calendar, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const DepotDetails = ({ depotId, onBack }) => {
    const { isAdmin } = useAuth();
    const [depot, setDepot] = useState(null);
    const [products, setProducts] = useState([]);
    const [recentMovements, setRecentMovements] = useState([]);
    const [utilizationHistory, setUtilizationHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchDepotDetails();
    }, [depotId]);

    const fetchDepotDetails = async () => {
        setLoading(true);
        try {
            const response = await api.getDepotDetails(depotId);
            console.log('🔍 Depot Details Response:', response);
            console.log('📦 Depot Object:', response.depot);
            console.log('📋 Inventory Array:', response.depot?.inventory);
            console.log('🔄 Recent Transactions:', response.depot?.recentTransactions);

            setDepot(response.depot);
            setProducts(response.depot.inventory || []);
            setRecentMovements(response.depot.recentTransactions || []);
            setUtilizationHistory(response.utilizationHistory || []);
        } catch (error) {
            console.error('Error fetching depot details:', error);
        } finally {
            setLoading(false);
        }
    };

    const broadcastSync = (type, payload = {}) => {
        try {
            const bc = new BroadcastChannel('sangrahak_inventory_sync');
            bc.postMessage({ type, ...payload });
            bc.close();
        } catch (_) {
            // BroadcastChannel not supported in this environment
        }
    };

    const handleClearInventory = async () => {
        if (!window.confirm(`Are you sure you want to permanently remove ALL inventory from ${depot.name}?\n\nProducts whose entire stock was in this depot will be permanently deleted from inventory.\nThis cannot be undone.`)) return;
        
        try {
            const result = await api.clearDepotInventory(depotId);
            broadcastSync('depot:inventory-cleared', { depotId });
            fetchDepotDetails(); // Refresh

            // Inform the user if products were fully deleted
            const deleted = result?.autoDeletedProducts || 0;
            if (deleted > 0) {
                alert(`✅ Cleared successfully.\n\n${deleted} product(s) had all their stock in this depot and have been permanently removed from inventory.`);
            }
        } catch (error) {
            console.error('Error clearing inventory:', error);
            alert(error.response?.data?.message || 'Failed to clear inventory');
        }
    };

    const handleRemoveProduct = async (sku, productName) => {
        if (!window.confirm(`Remove all units of "${productName}" (${sku}) from this depot?\n\nIf this is the product's only depot, it will be permanently deleted from inventory.`)) return;

        try {
            const result = await api.removeProductFromDepot(depotId, sku);
            broadcastSync('depot:product-removed', { depotId, productSku: sku });
            fetchDepotDetails(); // Refresh

            if (result?.productAutoDeleted) {
                alert(`✅ "${productName}" has been permanently removed from inventory (zero stock across all depots).`);
            }
        } catch (error) {
            console.error('Error removing product:', error);
            alert(error.response?.data?.message || 'Failed to remove product');
        }
    };

    if (loading) {
        return (
            <div className="loading-state-purple">
                <div className="spinner"></div>
                <p>Loading depot details...</p>
            </div>
        );
    }

    if (!depot) {
        return (
            <div className="placeholder-view">
                <h2>Depot Not Found</h2>
                <button onClick={onBack} className="reorder-btn">Go Back</button>
            </div>
        );
    }

    const utilizationPercent = depot.capacity > 0 ? ((depot.currentUtilization / depot.capacity) * 100).toFixed(1) : 0;
    const getStatusColor = (status) => {
        if (status === 'critical') return '#ef4444';
        if (status === 'warning') return '#f59e0b';
        return '#10b981';
    };

    const filteredProducts = products.filter(p =>
        p.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.productSku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    console.log('📊 Products State:', products);
    console.log('🔍 Filtered Products:', filteredProducts);
    console.log('📏 Products Length:', products.length);

    return (
        <div className="depot-details-container">
            {/* Header */}
            <div className="depot-details-header">
                <button onClick={onBack} className="back-btn">
                    <ArrowLeft size={20} /> Back to Depots
                </button>
                <div className="depot-title-section">
                    <div className="depot-icon-large">
                        <Warehouse size={32} />
                    </div>
                    <div>
                        <h1>{depot.name}</h1>
                        <div className="location-info">
                            <MapPin size={16} /> {depot.location}
                        </div>
                    </div>
                    <div className={`status-badge status-${depot.status}`}>
                        {depot.status.toUpperCase()}
                    </div>
                </div>
            </div>

            {/* KPI Statistics Cards */}
            <div className="depot-kpi-grid">
                <div className="depot-kpi-card">
                    <div className="depot-kpi-icon total-skus">
                        <Package size={24} />
                    </div>
                    <div className="depot-kpi-content">
                        <h4>Total SKUs</h4>
                        <div className="kpi-value">{depot.itemsStored || products.length}</div>
                        <p className="kpi-trend positive">↑ 12% vs last month</p>
                    </div>
                </div>

                <div className="depot-kpi-card">
                    <div className="depot-kpi-icon stock-value">
                        <TrendingUp size={24} />
                    </div>
                    <div className="depot-kpi-content">
                        <h4>Stock Value</h4>
                        <div className="kpi-value">
                            ₹{products.reduce((acc, p) => acc + (p.quantity * (p.price || 100)), 0).toLocaleString()}
                        </div>
                        <p className="kpi-trend neutral">Total inventory value</p>
                    </div>
                </div>

                <div className="depot-kpi-card">
                    <div className="depot-kpi-icon turnover">
                        <Activity size={24} />
                    </div>
                    <div className="depot-kpi-content">
                        <h4>Turnover Rate</h4>
                        <div className="kpi-value">
                            {recentMovements.length > 0 ? (recentMovements.length / 30).toFixed(1) : '0'}/day
                        </div>
                        <p className="kpi-trend positive">↑ 8% efficiency</p>
                    </div>
                </div>

                <div className="depot-kpi-card">
                    <div className="depot-kpi-icon inflow-outflow">
                        <AlertTriangle size={24} />
                    </div>
                    <div className="depot-kpi-content">
                        <h4>Daily Movement</h4>
                        <div className="kpi-value">
                            {recentMovements.filter(m => m.type === 'stock-in').length} in /
                            {recentMovements.filter(m => m.type === 'stock-out').length} out
                        </div>
                        <p className="kpi-trend neutral">Last 24 hours</p>
                    </div>
                </div>
            </div>

            {/* Health Score & Quick Stats */}
            <div className="depot-analytics-row">
                <div className="health-score-card">
                    <h3>Depot Health Score</h3>
                    <div className="health-score-circle">
                        <svg width="120" height="120" viewBox="0 0 120 120">
                            <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                            <circle
                                cx="60"
                                cy="60"
                                r="54"
                                fill="none"
                                stroke={utilizationPercent <= 60 ? '#10b981' : utilizationPercent <= 85 ? '#f59e0b' : '#ef4444'}
                                strokeWidth="8"
                                strokeDasharray={`${(utilizationPercent / 100) * 339.292} 339.292`}
                                strokeLinecap="round"
                                transform="rotate(-90 60 60)"
                            />
                        </svg>
                        <div className="health-score-value">
                            {Math.round(100 - (utilizationPercent > 80 ? (utilizationPercent - 80) * 2 : 0))}
                        </div>
                    </div>
                    <p className="health-score-label">
                        {utilizationPercent <= 60 ? 'Excellent' : utilizationPercent <= 85 ? 'Good' : 'Needs Attention'}
                    </p>
                </div>

                <div className="quick-stats-grid">
                    <div className="quick-stat-item">
                        <span className="stat-label">Avg Days in Stock</span>
                        <span className="stat-value success">45</span>
                    </div>
                    <div className="quick-stat-item">
                        <span className="stat-label">Low Stock Items</span>
                        <span className="stat-value warning">
                            {products.filter(p => p.quantity < 50).length}
                        </span>
                    </div>
                    <div className="quick-stat-item">
                        <span className="stat-label">Overstock Items</span>
                        <span className="stat-value">
                            {products.filter(p => p.quantity > 500).length}
                        </span>
                    </div>
                    <div className="quick-stat-item">
                        <span className="stat-label">Dead Stock</span>
                        <span className="stat-value danger">3</span>
                    </div>
                </div>
            </div>

            {/* Capacity Overview */}
            <div className="capacity-overview-card">
                <h2>Capacity Overview</h2>
                <div className="capacity-stats">
                    <div className="capacity-stat">
                        <span className="label">Current Occupancy</span>
                        <span className="value">{depot.currentUtilization?.toLocaleString()} units</span>
                    </div>
                    <div className="capacity-stat">
                        <span className="label">Total Capacity</span>
                        <span className="value">{depot.capacity?.toLocaleString()} units</span>
                    </div>
                    <div className="capacity-stat">
                        <span className="label">Utilization</span>
                        <span className="value" style={{ color: getStatusColor(depot.status) }}>
                            {utilizationPercent}%
                        </span>
                    </div>
                </div>
                <div className="capacity-bar-container">
                    <div
                        className="capacity-bar-fill"
                        style={{
                            width: `${Math.min(utilizationPercent, 100)}%`,
                            backgroundColor: getStatusColor(depot.status)
                        }}
                    ></div>
                    {utilizationPercent >= 85 && (
                        <div className="capacity-threshold warning" style={{ left: '85%' }}></div>
                    )}
                    {utilizationPercent >= 95 && (
                        <div className="capacity-threshold critical" style={{ left: '95%' }}></div>
                    )}
                </div>
                {utilizationPercent >= 85 && (
                    <div className="capacity-warning">
                        <AlertTriangle size={16} />
                        <span>
                            {utilizationPercent >= 95
                                ? 'Critical: Depot is at or near maximum capacity!'
                                : 'Warning: Depot utilization is high. Consider redistribution.'}
                        </span>
                    </div>
                )}
            </div>

            {/* Inventory Table */}
            <div className="inventory-section">
                <div className="section-header">
                    <h2><Package size={20} /> Inventory ({depot.itemsStored} SKUs)</h2>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="Search by SKU or name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                        {isAdmin && products.length > 0 && (
                            <button className="delete-depot-btn" onClick={handleClearInventory} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#fee2e2', color: '#ef4444', border: '1px solid #f87171', borderRadius: '0.5rem', fontWeight: 600 }}>
                                <Trash2 size={16} /> Clear All
                            </button>
                        )}
                    </div>
                </div>
                <div className="inventory-table-container">
                    <table className="inventory-table enhanced">
                        <thead>
                            <tr>
                                <th>SKU</th>
                                <th>Product Name</th>
                                <th>Category</th>
                                <th>Quantity</th>
                                <th>Value</th>
                                <th>Days in Stock</th>
                                <th>Status</th>
                                <th>Last Updated</th>
                                {isAdmin && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.length > 0 ? (
                                filteredProducts.map((item, idx) => {
                                    const itemValue = (item.quantity * (item.price || 100));
                                    const daysInStock = item.lastUpdated
                                        ? Math.floor((new Date() - new Date(item.lastUpdated)) / (1000 * 60 * 60 * 24))
                                        : 0;
                                    const status = item.quantity < 50 ? 'low' : item.quantity > 500 ? 'overstock' : 'optimal';

                                    return (
                                        <tr key={idx}>
                                            <td><code>{item.sku}</code></td>
                                            <td><strong>{item.productName}</strong></td>
                                            <td>{item.category || 'N/A'}</td>
                                            <td><strong>{item.quantity}</strong></td>
                                            <td className="value-cell">₹{itemValue.toLocaleString()}</td>
                                            <td>{daysInStock} days</td>
                                            <td>
                                                <span className={`status-pill ${status}`}>
                                                    {status === 'low' ? 'Low Stock' : status === 'overstock' ? 'Overstock' : 'Optimal'}
                                                </span>
                                            </td>
                                            <td>{new Date(item.lastUpdated).toLocaleDateString()}</td>
                                            {isAdmin && (
                                                <td>
                                                    <button 
                                                        onClick={() => handleRemoveProduct(item.sku, item.productName)}
                                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}
                                                        title="Remove product from depot"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={isAdmin ? "9" : "8"} style={{ textAlign: 'center', padding: '2rem' }}>
                                        {searchTerm ? 'No products match your search' : 'No inventory in this depot'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Recent Movements */}
            <div className="movements-section">
                <h2><Activity size={20} /> Recent Inventory Movements</h2>
                <div className="movements-list">
                    {recentMovements && recentMovements.length > 0 ? (
                        recentMovements.slice(0, 20).map((movement, idx) => (
                            <div key={idx} className="movement-item">
                                <div className="movement-icon">
                                    <Calendar size={16} />
                                </div>
                                <div className="movement-details">
                                    <div className="movement-header">
                                        <span className={`movement-type ${movement.type}`}>
                                            {movement.type.toUpperCase()}
                                        </span>
                                        <span className="movement-date">
                                            {new Date(movement.timestamp).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="movement-info">
                                        <strong>{movement.productName}</strong> ({movement.productSku})
                                        <span className="movement-quantity">Qty: {movement.quantity}</span>
                                    </div>
                                    {movement.fromDepot && movement.toDepot && (
                                        <div className="movement-route">
                                            {movement.fromDepot} → {movement.toDepot}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-muted">No recent movements recorded</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DepotDetails;
