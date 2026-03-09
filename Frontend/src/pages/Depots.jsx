import React, { useState, useEffect } from 'react';
import { Warehouse, MapPin, BarChart3, Package, ShieldCheck, AlertTriangle, Search, Plus, ExternalLink, X, Trash2, Lock, Eye } from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import DepotDetails from './DepotDetails';

const AddDepotModal = ({ isOpen, onClose, onAdd }) => {
    const [formData, setFormData] = useState({
        name: '',
        location: '',
        capacity: 10000,
        currentUtilization: 0,
        itemsStored: 0
    });

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onAdd(formData);
        onClose();
        setFormData({ name: '', location: '', capacity: 10000, currentUtilization: 0, itemsStored: 0 });
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Register New Depot</h2>
                    <button onClick={onClose} className="close-btn"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="add-item-form">
                    <div className="form-group">
                        <label>Depot Name</label>
                        <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Bangalore Distribution Center" />
                    </div>
                    <div className="form-group">
                        <label>Location</label>
                        <input type="text" required value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="e.g. Karnataka, India" />
                    </div>
                    <div className="form-group">
                        <label>Total Capacity (Units)</label>
                        <input type="number" required value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: e.target.value })} placeholder="10000" />
                    </div>
                    <button type="submit" className="submit-btn-purple">Create Depot</button>
                </form>
            </div>
        </div>
    );
};

const DepotCard = ({ depot, onViewDetails, onDelete, canWrite, userIsAdmin }) => {
    const utilization = Math.round((depot.currentUtilization / depot.capacity) * 100) || 0;
    const getStatusColor = (u) => {
        if (u > 85) return '#ef4444'; // Critical
        if (u > 60) return '#f59e0b'; // Warning
        return '#10b981'; // Healthy
    };

    return (
        <div className="depot-card-premium">
            <div className="depot-card-header">
                <div className="depot-icon-wrapper">
                    <Warehouse size={24} />
                </div>
                <div className="depot-header-info">
                    <h3>{depot.name}</h3>
                    <div className="location-pill">
                        <MapPin size={12} /> {depot.location}
                    </div>
                </div>
                <div className="status-indicator" style={{ backgroundColor: getStatusColor(utilization) }}></div>
                {!canWrite && (
                    <span style={{
                        background: 'rgba(107,114,128,0.15)', color: '#6b7280',
                        borderRadius: '4px', padding: '0.1rem 0.4rem', fontSize: '0.65rem',
                        fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px'
                    }}>
                        <Eye size={10} /> READ-ONLY
                    </span>
                )}
                {canWrite && !userIsAdmin && (
                    <span style={{
                        background: 'rgba(16,185,129,0.15)', color: '#10b981',
                        borderRadius: '4px', padding: '0.1rem 0.4rem', fontSize: '0.65rem',
                        fontWeight: '600'
                    }}>ASSIGNED</span>
                )}
            </div>

            <div className="depot-stats-grid">
                <div className="depot-stat-item">
                    <span className="label">Utilization</span>
                    <div className="progress-bar-container">
                        <div className="progress-bar-fill" style={{ width: `${utilization}%`, backgroundColor: getStatusColor(utilization) }}></div>
                    </div>
                    <span className="value">{utilization}%</span>
                </div>
                <div className="depot-stat-item">
                    <span className="label">Items Stored</span>
                    <span className="value-large">{depot.itemsStored} <span className="text-muted-sm">SKUs</span></span>
                </div>
            </div>

            <div className="depot-footer">
                <div className="capacity-info">
                    <BarChart3 size={14} />
                    <span>Cap: {depot.capacity?.toLocaleString()} units</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {userIsAdmin && (
                    <button
                        className="delete-depot-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(depot.id || depot._id, depot.name);
                        }}
                        title="Delete depot"
                    >
                        <Trash2 size={14} />
                    </button>
                    )}
                    <button className="view-inventory-btn" onClick={() => onViewDetails(depot.id || depot._id)}>
                        View Details <ExternalLink size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const Depots = () => {
    const { isAdmin, canWriteDepot } = useAuth();
    const [depots, setDepots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentView, setCurrentView] = useState('list'); // 'list' or 'details'
    const [selectedDepotId, setSelectedDepotId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [stats, setStats] = useState({
        totalCapacity: 0,
        totalStored: 0,
        avgUtilization: 0
    });

    const fetchDepots = async () => {
        setLoading(true);
        try {
            const response = await api.getDepots();
            if (response && response.depots) {
                setDepots(response.depots);

                // Calculate summary stats
                const totalCap = response.depots.reduce((acc, d) => acc + (d.capacity || 0), 0);
                const totalStored = response.depots.reduce((acc, d) => acc + (d.currentUtilization || 0), 0);
                const avgUtil = totalCap > 0 ? (totalStored / totalCap) * 100 : 0;

                setStats({
                    totalCapacity: totalCap,
                    totalStored: totalStored,
                    avgUtilization: Math.round(avgUtil)
                });
            }
        } catch (error) {
            console.error('Error fetching depots:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDepots();
    }, []);

    const handleAddDepot = async (newDepot) => {
        try {
            const response = await api.createDepot(newDepot);
            if (response.message === 'Depot created successfully') {
                fetchDepots();
            }
        } catch (error) {
            console.error('Failed to add depot:', error);
            alert(`Error adding depot: ${error.response?.data?.message || error.message}`);
        }
    };

    const handleViewDetails = (depotId) => {
        setSelectedDepotId(depotId);
        setCurrentView('details');
    };

    const handleBackToList = () => {
        setCurrentView('list');
        setSelectedDepotId(null);
        fetchDepots(); // Refresh data when returning to list
    };

    const handleDeleteDepot = async (depotId, depotName) => {
        const confirmed = window.confirm(
            `Are you sure you want to delete "${depotName}"?\n\nThis will permanently remove the depot and update all products that have inventory in this depot. This action cannot be undone.`
        );

        if (!confirmed) return;

        try {
            const response = await api.deleteDepot(depotId);
            alert(`${response.message}\n${response.affectedProducts} product(s) updated.`);
            fetchDepots(); // Refresh the depot list
        } catch (error) {
            console.error('Failed to delete depot:', error);
            alert(`Error deleting depot: ${error.response?.data?.message || error.message}`);
        }
    };

    // Filter depots based on search and status
    const filteredDepots = depots.filter(depot => {
        const matchesSearch = depot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            depot.location.toLowerCase().includes(searchQuery.toLowerCase());

        if (statusFilter === 'All') return matchesSearch;

        const utilization = Math.round((depot.currentUtilization / depot.capacity) * 100) || 0;
        if (statusFilter === 'Healthy' && utilization <= 60) return matchesSearch;
        if (statusFilter === 'Warning' && utilization > 60 && utilization <= 85) return matchesSearch;
        if (statusFilter === 'Critical' && utilization > 85) return matchesSearch;

        return false;
    });

    // Calculate additional stats
    const activeDepots = depots.filter(d => (d.currentUtilization / d.capacity) > 0.1).length;
    const criticalDepots = depots.filter(d => ((d.currentUtilization / d.capacity) * 100) > 85).length;

    // Show depot details view
    if (currentView === 'details' && selectedDepotId) {
        return <DepotDetails depotId={selectedDepotId} onBack={handleBackToList} />;
    }

    return (
        <div className="depots-page-container">
            <AddDepotModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={handleAddDepot}
            />

            <div className="depots-header" style={{ marginBottom: '32px' }}>
                <div>
                    <h1>Depot Management</h1>
                    <p className="text-muted">Monitor storage capacity and SKU distribution across your network.</p>
                </div>
                {isAdmin() && (
                <button className="add-items-btn" onClick={() => setIsModalOpen(true)}>
                    Register New Depot <Plus size={18} />
                </button>
                )}
            </div>

            {/* Enhanced Statistics Cards */}
            <div className="depot-stats-cards-grid">
                <div className="depot-stat-card">
                    <div className="depot-stat-icon total-depots">
                        <Warehouse size={24} />
                    </div>
                    <div className="depot-stat-content">
                        <h4>Total Depots</h4>
                        <p className="stat-description">Active storage locations</p>
                        <div className="stat-number">{depots.length}</div>
                    </div>
                </div>

                <div className="depot-stat-card">
                    <div className="depot-stat-icon total-capacity">
                        <Package size={24} />
                    </div>
                    <div className="depot-stat-content">
                        <h4>Total Capacity</h4>
                        <p className="stat-description">Network storage capacity</p>
                        <div className="stat-number">{stats.totalCapacity.toLocaleString()}</div>
                    </div>
                </div>

                <div className="depot-stat-card">
                    <div className="depot-stat-icon active-depots">
                        <ShieldCheck size={24} />
                    </div>
                    <div className="depot-stat-content">
                        <h4>Active Depots</h4>
                        <p className="stat-description">Currently operational</p>
                        <div className="stat-number">{activeDepots}</div>
                    </div>
                </div>

                <div className="depot-stat-card">
                    <div className="depot-stat-icon critical-alerts">
                        <AlertTriangle size={24} />
                    </div>
                    <div className="depot-stat-content">
                        <h4>Critical Alerts</h4>
                        <p className="stat-description">Depots above 85% capacity</p>
                        <div className="stat-number">{criticalDepots}</div>
                    </div>
                </div>
            </div>

            {/* Search and Filter Section */}
            <div className="depot-filters-section">
                <div className="search-input-wrapper-inline">
                    <Search size={18} className="search-icon-purple" />
                    <input
                        type="text"
                        placeholder="Search depots by name or location..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="filter-buttons-group">
                    <button
                        className={`filter-btn ${statusFilter === 'All' ? 'active' : ''}`}
                        onClick={() => setStatusFilter('All')}
                    >
                        All Depots
                    </button>
                    <button
                        className={`filter-btn ${statusFilter === 'Healthy' ? 'active' : ''}`}
                        onClick={() => setStatusFilter('Healthy')}
                    >
                        Healthy
                    </button>
                    <button
                        className={`filter-btn ${statusFilter === 'Warning' ? 'active' : ''}`}
                        onClick={() => setStatusFilter('Warning')}
                    >
                        Warning
                    </button>
                    <button
                        className={`filter-btn ${statusFilter === 'Critical' ? 'active' : ''}`}
                        onClick={() => setStatusFilter('Critical')}
                    >
                        Critical
                    </button>
                </div>
            </div>


            {loading ? (
                <div className="loading-state-purple">
                    <div className="spinner"></div>
                    <p>Scanning network nodes...</p>
                </div>
            ) : (
                <div className="depots-grid">
                    {filteredDepots.map(depot => (
                        <DepotCard
                            key={depot._id || depot.id}
                            depot={depot}
                            onViewDetails={handleViewDetails}
                            onDelete={handleDeleteDepot}
                            canWrite={canWriteDepot(depot.id || depot._id)}
                            userIsAdmin={isAdmin()}
                        />
                    ))}

                    {filteredDepots.length === 0 && (
                        <div className="empty-state-card" style={{ gridColumn: '1 / -1' }}>
                            <Package size={48} className="text-muted" />
                            <h3>No depots found</h3>
                            <p>Try adjusting your search or filter criteria.</p>
                        </div>
                    )}

                    {statusFilter === 'All' && searchQuery === '' && isAdmin() && (
                        <div className="depot-card-add" onClick={() => setIsModalOpen(true)}>
                            <div className="add-icon"><Plus size={32} /></div>
                            <h3>Add New Node</h3>
                            <p>Expand your logistics network</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Depots;
