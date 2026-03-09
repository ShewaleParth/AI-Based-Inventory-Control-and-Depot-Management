import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Filter, ChevronDown, MoreHorizontal, Grid, List, TrendingUp, Package, DollarSign, X, Upload, Eye, AlertCircle } from 'lucide-react';
import { api } from '../utils/api';
import ForecastModal from '../components/ForecastModal';

const AddItemModal = ({ isOpen, onClose, onAdd, depots }) => {
    const [formData, setFormData] = useState({
        name: '',
        sku: '',
        category: 'Sneakers',
        price: '',
        stock: '',
        size: '38 - 49',
        brand: 'Nike',
        supplier: 'Default Supplier',
        depotId: '',
        image: ''
    });

    useEffect(() => {
        if (isOpen && depots.length > 0 && !formData.depotId) {
            setFormData(prev => ({ ...prev, depotId: depots[0].id || depots[0]._id }));
        }
    }, [isOpen, depots]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onAdd(formData);
        onClose();
        setFormData({ name: '', sku: '', category: 'Sneakers', price: '', stock: '', size: '38 - 49', brand: 'Nike', supplier: 'Default Supplier', depotId: '', image: '' });
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, image: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Add New Inventory Item</h2>
                    <button onClick={onClose} className="close-btn"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="add-item-form">
                    <div className="form-group-row">
                        <div className="form-group">
                            <label>Product Name</label>
                            <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Air Jordan 1" />
                        </div>
                        <div className="form-group">
                            <label>SKU / ID Number</label>
                            <input type="text" required value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="e.g. AJ1-CHI" />
                        </div>
                    </div>
                    <div className="form-group-row">
                        <div className="form-group">
                            <label>Category</label>
                            <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                <option>Sneakers</option>
                                <option>Electronics</option>
                                <option>Apparel</option>
                                <option>Accessories</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Brand</label>
                            <input type="text" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} placeholder="Nike, Apple, etc." />
                        </div>
                    </div>
                    <div className="form-group-row">
                        <div className="form-group">
                            <label>Price (₹)</label>
                            <input type="number" required value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} placeholder="0.00" />
                        </div>
                        <div className="form-group">
                            <label>Initial Stock</label>
                            <input type="number" required value={formData.stock} onChange={e => setFormData({ ...formData, stock: e.target.value })} placeholder="0" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Storage Depot</label>
                        <select required value={formData.depotId} onChange={e => setFormData({ ...formData, depotId: e.target.value })}>
                            {depots.length === 0 && <option value="">Loading depots...</option>}
                            {depots.map(d => (
                                <option key={d.id || d._id} value={d.id || d._id}>{d.name} ({d.location})</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Product Image</label>
                        <div className="image-mode-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                            <span className="text-muted-sm">Paste URL or Upload File:</span>
                        </div>
                        <div className="image-inputs-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <input
                                type="text"
                                placeholder="https://example.com/image.jpg"
                                value={formData.image}
                                onChange={e => setFormData({ ...formData, image: e.target.value })}
                                className="url-input-custom"
                                style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '6px' }}
                            />
                            <div className="image-upload-row" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <input type="file" accept="image/*" onChange={handleImageUpload} className="file-input-custom" />
                                {formData.image && (
                                    <div className="preview-box">
                                        <img src={formData.image} alt="Preview" className="image-preview-small" style={{ display: 'block' }} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <button type="submit" className="submit-btn-purple">Create Item</button>
                </form>
            </div>
        </div>
    );
};

const InventoryOverview = () => {
    const navigate = useNavigate();
    const [expandedRow, setExpandedRow] = useState(null);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [depots, setDepots] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedDepot, setSelectedDepot] = useState('All');
    const [isForecastModalOpen, setIsForecastModalOpen] = useState(false);
    const [selectedProductForForecast, setSelectedProductForForecast] = useState(null);
    const fileInputRef = useRef(null);

    // ── Pagination state ────────────────────────────────────────────────────
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [totalItems, setTotalItems] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [allCategories, setAllCategories] = useState(['All']);
    // Stats tracked separately so KPI cards show correct totals across all pages
    const [statsData, setStatsData] = useState({ lowStock: 0, outOfStock: 0 });

    const fetchData = async (page = currentPage, limit = itemsPerPage) => {
        setLoading(true);
        try {
            const params = {
                page,
                limit,
                ...(searchQuery && { search: searchQuery }),
                ...(selectedCategory !== 'All' && { category: selectedCategory }),
            };

            const [productsData, depotsData] = await Promise.all([
                api.getProducts(params),
                api.getDepots()
            ]);

            if (productsData && productsData.products) {
                const enhancedProducts = productsData.products.map(p => ({
                    ...p,
                    size: p.size || '38 - 49',
                    brand: p.brand || 'Generic',
                    year: p.year || 2024,
                    cost: p.cost || '10%',
                    origin: p.origin || 'International',
                    displayImage: p.image && p.image.trim() !== '' ? p.image : `https://api.dicebear.com/7.x/identicon/svg?seed=${p.sku}`
                }));
                setProducts(enhancedProducts);
                setTotalItems(productsData.total || 0);
                setTotalPages(productsData.pages || 1);
                setCurrentPage(productsData.currentPage || page);

                // Build category list from current page (good enough for filter)
                const cats = ['All', ...new Set(enhancedProducts.map(p => p.category))];
                setAllCategories(prev => {
                    const merged = ['All', ...new Set([...prev.slice(1), ...cats.slice(1)])];
                    return merged;
                });

                // Track stats across visible page
                setStatsData({
                    lowStock: enhancedProducts.filter(p => p.riskLevel === 'HIGH' || p.riskLevel === 'MEDIUM').length,
                    outOfStock: enhancedProducts.filter(p => p.stock === 0).length,
                });
            } else {
                setProducts([]);
            }

            if (depotsData && depotsData.depots) {
                setDepots(depotsData.depots);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            setProducts([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData(1, itemsPerPage);
    }, []);

    // Re-fetch when search, category, or items-per-page changes
    useEffect(() => {
        fetchData(1, itemsPerPage);
    }, [searchQuery, selectedCategory, itemsPerPage]);

    const handleAddProduct = async (newProduct) => {
        try {
            if (!newProduct.depotId) {
                alert('Please select a storage depot.');
                return;
            }

            const payload = {
                ...newProduct,
                depotQuantity: parseInt(newProduct.stock),
                reorderPoint: Math.floor(parseInt(newProduct.stock) * 0.2)
            };

            const response = await api.createProduct(payload);
            if (response.message === 'Product created successfully') {
                fetchData();
                setIsModalOpen(false);
            }
        } catch (error) {
            console.error('Failed to add product:', error);
            alert(`Error: ${error.response?.data?.message || error.message}`);
        }
    };

    const handleDeleteProduct = async (id) => {
        if (window.confirm('Are you sure you want to delete this product?')) {
            try {
                await api.deleteProduct(id);
                fetchData();
            } catch (error) {
                console.error('Failed to delete product:', error);
                alert('Error deleting product.');
            }
        }
    };

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    const handleEditProduct = (product) => {
        // Use raw image when editing, not the identicon display image
        setEditingProduct({ ...product, image: product.image || '' });
        setIsEditModalOpen(true);
    };

    const handleUpdateProduct = async (id, updatedData) => {
        try {
            await api.updateProduct(id, updatedData);
            fetchData();
            setIsEditModalOpen(false);
            setEditingProduct(null);
        } catch (error) {
            console.error('Failed to update product:', error);
            alert('Error updating product.');
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target.result;
            const rows = text.split(/\r?\n/).filter(r => r.trim());
            const headers = rows[0].split(',').map(h => h.trim().toLowerCase());

            const items = rows.slice(1).map(row => {
                // Robust CSV splitting that handles empty fields and quoted commas
                const values = [];
                let current = "";
                let inQuotes = false;
                for (let i = 0; i < row.length; i++) {
                    const char = row[i];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        values.push(current.trim());
                        current = "";
                    } else {
                        current += char;
                    }
                }
                values.push(current.trim());

                const item = {};
                headers.forEach((h, i) => {
                    if (values[i] !== undefined) {
                        item[h] = values[i].replace(/^"|"$/g, '').trim();
                    }
                });
                return item;
            });

            try {
                const response = await api.bulkUpload(items);
                const { success, failed, errors } = response.results;

                let alertMsg = `Import Complete:\n✅ ${success} Succeeded`;
                if (failed > 0) {
                    alertMsg += `\n❌ ${failed} Failed`;
                    console.error('Import Errors:', errors);
                    alertMsg += `\n\nCheck browser console for details.`;
                }

                alert(alertMsg);
                fetchData();
            } catch (error) {
                console.error('Failed to upload CSV:', error);
                alert('Error uploading CSV. Please ensure the format is correct (sku, name, category, stock, price, etc.)');
            }
        };
        reader.readAsText(file);
    };

    const toggleRow = (id) => {
        setExpandedRow(expandedRow === id ? null : id);
    };

    const filteredProducts = products.filter(p => {
        // Search + depot filter (category already sent to server, depot still client-side)
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.sku.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDepot = selectedDepot === 'All' ||
            (p.depotDistribution && p.depotDistribution.some(d => d.depotId === selectedDepot || d.depotName === selectedDepot));
        return matchesSearch && matchesDepot;
    });

    const categories = allCategories;

    // Pagination helpers
    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > totalPages) return;
        setExpandedRow(null);
        fetchData(newPage, itemsPerPage);
    };

    const handleItemsPerPageChange = (newLimit) => {
        setItemsPerPage(newLimit);
        // useEffect will re-fetch automatically
    };

    // Generate page number buttons (max 5 visible)
    const getPageNumbers = () => {
        const range = [];
        const delta = 2;
        const left = Math.max(1, currentPage - delta);
        const right = Math.min(totalPages, currentPage + delta);
        for (let i = left; i <= right; i++) range.push(i);
        return range;
    };

    return (
        <div className="inventory-view-container">
            <ForecastModal
                isOpen={isForecastModalOpen}
                onClose={() => setIsForecastModalOpen(false)}
                product={selectedProductForForecast}
            />
            <AddItemModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={handleAddProduct}
                depots={depots}
            />

            {isEditModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>Edit Inventory Item</h2>
                            <button onClick={() => setIsEditModalOpen(false)} className="close-btn"><X size={20} /></button>
                        </div>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            handleUpdateProduct(editingProduct.id, editingProduct);
                        }} className="add-item-form">
                            <div className="form-group-row">
                                <div className="form-group">
                                    <label>Product Name</label>
                                    <input type="text" required value={editingProduct.name} onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>SKU</label>
                                    <input type="text" required value={editingProduct.sku} onChange={e => setEditingProduct({ ...editingProduct, sku: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group-row">
                                <div className="form-group">
                                    <label>Price (₹)</label>
                                    <input type="number" required value={editingProduct.price} onChange={e => setEditingProduct({ ...editingProduct, price: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Category</label>
                                    <input type="text" value={editingProduct.category} onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Stock (Read-only - Use Movement & Transactions to modify stock)</label>
                                <input type="number" disabled value={editingProduct.stock} style={{ background: 'var(--bg-secondary)', cursor: 'not-allowed' }} />
                            </div>
                            <div className="form-group">
                                <label>Image URL or Base64</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <input type="text" value={editingProduct.image} onChange={e => setEditingProduct({ ...editingProduct, image: e.target.value })} placeholder="Paste image URL or Base64" style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '6px' }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <input type="file" accept="image/*" onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    setEditingProduct({ ...editingProduct, image: reader.result });
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }} className="file-input-custom" />
                                        {editingProduct.image && <img src={editingProduct.image} alt="Preview" className="image-preview-small" />}
                                    </div>
                                </div>
                            </div>
                            <button type="submit" className="submit-btn-purple">Update Item</button>
                        </form>
                    </div>
                </div>
            )}

            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".csv"
                onChange={handleFileUpload}
            />


            <div className="inventory-main-content">
                {/* Inventory Statistics Cards */}
                <div className="inventory-stats-grid">
                    <div className="stat-card">
                        <div className="stat-card-icon total-items">
                            <Package size={24} />
                        </div>
                        <div className="stat-card-content">
                            <h4>Total Items</h4>
                            <p className="stat-description">Total items in stock</p>
                            <div className="stat-number">{totalItems}</div>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-card-icon low-stock">
                            <TrendingUp size={24} />
                        </div>
                        <div className="stat-card-content">
                            <h4>Low Stock Items</h4>
                            <p className="stat-description">Number of items that are running low</p>
                            <div className="stat-number">{statsData.lowStock}</div>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-card-icon expired">
                            <AlertCircle size={24} />
                        </div>
                        <div className="stat-card-content">
                            <h4>Expired Items</h4>
                            <p className="stat-description">Number of items past their expiration date</p>
                            <div className="stat-number">0</div>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-card-icon out-of-stock">
                            <Package size={24} />
                        </div>
                        <div className="stat-card-content">
                            <h4>Out of Stock Items</h4>
                            <p className="stat-description">Count of items currently out of stock</p>
                            <div className="stat-number">{statsData.outOfStock}</div>
                        </div>
                    </div>
                </div>

                <div className="inventory-header-filters">
                    <div className="filters-left">
                        <div className="filter-group-modern" style={{ display: 'flex', gap: '12px' }}>
                            <div className="filter-select-wrapper">
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>Category</label>
                                <select
                                    className="modern-select-sm"
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer' }}
                                >
                                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <div className="filter-select-wrapper">
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>Depot</label>
                                <select
                                    className="modern-select-sm"
                                    value={selectedDepot}
                                    onChange={(e) => setSelectedDepot(e.target.value)}
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer' }}
                                >
                                    <option value="All">All Depots</option>
                                    {depots.map(d => <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Search Bar in the Middle */}
                    <div className="search-input-wrapper-inline">
                        <Search size={18} className="search-icon-purple" />
                        <input
                            type="text"
                            placeholder="search for items"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="filters-right">
                        {/* Items per page selector */}
                        <select
                            value={itemsPerPage}
                            onChange={e => handleItemsPerPageChange(Number(e.target.value))}
                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer' }}
                            title="Items per page"
                        >
                            <option value={10}>10 / page</option>
                            <option value={20}>20 / page</option>
                            <option value={50}>50 / page</option>
                            <option value={100}>100 / page</option>
                        </select>
                        <button className="export-btn" onClick={() => fileInputRef.current.click()}>
                            Upload CSV <Upload size={18} style={{ marginLeft: '8px' }} />
                        </button>
                        <button className="add-items-btn" onClick={() => setIsModalOpen(true)}>
                            Add items <Plus size={18} />
                        </button>
                    </div>
                </div>

                <div className="modern-table-container">
                    {loading ? (
                        <div className="loading-state-purple">
                            <div className="spinner"></div>
                            <p>Loading Inventory...</p>
                        </div>
                    ) : products.length === 0 ? (
                        <div className="empty-state-card">
                            <Package size={48} className="text-muted" />
                            <h3>No items in inventory</h3>
                            <p>Upload a CSV or add an item manually to get started.</p>
                        </div>
                    ) : (
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}><input type="checkbox" /></th>
                                    <th style={{ width: '60px' }}>#</th>
                                    <th>ID Number</th>
                                    <th>Name</th>
                                    <th>Price</th>
                                    <th>Stock</th>
                                    <th>Stock-out In</th>
                                    <th>Reorder Qty</th>
                                    <th>Risk</th>
                                    <th style={{ width: '40px' }}>Forecast</th>
                                    <th style={{ width: '40px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.map((product) => (
                                    <React.Fragment key={product.id}>
                                        <tr className={expandedRow === product.id ? 'row-expanded' : ''} onClick={() => toggleRow(product.id)}>
                                            <td><input type="checkbox" onClick={(e) => e.stopPropagation()} /></td>
                                            <td>
                                                <div className="product-thumb">
                                                    <img src={product.displayImage} alt="" />
                                                </div>
                                            </td>
                                            <td className="sku-text font-bold">{product.sku}</td>
                                            <td>{product.name}</td>
                                            <td className="font-bold">₹{product.price}</td>
                                            <td className="font-bold">{product.stock} units</td>
                                            <td className="font-bold">{product.daysToStockOut ?? '??'} days</td>
                                            <td className="font-bold">{product.reorderQty ?? '??'} units</td>
                                            <td>
                                                <span className={`risk-badge ${product.riskLevel?.toLowerCase() || 'safe'}`} style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                                    {product.riskLevel || 'SAFE'}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    className="view-forecast-small-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedProductForForecast(product);
                                                        setIsForecastModalOpen(true);
                                                    }}
                                                    title="View AI Forecast"
                                                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '4px' }}
                                                >
                                                    <TrendingUp size={18} />
                                                </button>
                                            </td>
                                            <td><ChevronDown size={18} className={`expand-icon ${expandedRow === product.id ? 'rotated' : ''}`} /></td>
                                        </tr>
                                        {expandedRow === product.id && (
                                            <tr className="expanded-details-row">
                                                <td colSpan="11">
                                                    <div className="expanded-card">
                                                        <div className="product-big-preview">
                                                            <img src={product.displayImage} alt="" />
                                                        </div>
                                                        <div className="details-info-grid">
                                                            <div className="info-group">
                                                                <label>Name</label>
                                                                <div className="val">{product.name}</div>
                                                            </div>
                                                            <div className="info-group">
                                                                <label>Price</label>
                                                                <div className="val">₹{product.price}</div>
                                                            </div>
                                                            <div className="info-group">
                                                                <label>ID Number</label>
                                                                <div className="val">{product.sku}</div>
                                                            </div>
                                                            <div className="info-group">
                                                                <label>Brand</label>
                                                                <div className="val">{product.brand}</div>
                                                            </div>
                                                            <div className="info-group">
                                                                <label>Stock</label>
                                                                <div className="val">{product.stock} units</div>
                                                            </div>
                                                            <div className="info-group" style={{ gridColumn: 'span 2' }}>
                                                                <label>AI Forecast Insight</label>
                                                                <div className="val" style={{ color: 'var(--primary)', fontWeight: '600' }}>
                                                                    {product.aiExplanation}
                                                                </div>
                                                            </div>
                                                            <div className="info-group tags-group">
                                                                <label>Actions</label>
                                                                <div className="tags-list">
                                                                    <span className="tag" onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigate(`/product/${product.id}`);
                                                                    }} style={{ background: 'var(--primary)', color: 'white', cursor: 'pointer' }}>
                                                                        <Eye size={14} /> View Details
                                                                    </span>
                                                                    <span className="tag" onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedProductForForecast(product);
                                                                        setIsForecastModalOpen(true);
                                                                    }} style={{ background: '#3b82f6', color: 'white', cursor: 'pointer' }}>View Forecast</span>
                                                                    <span className="tag" onClick={(e) => { e.stopPropagation(); handleEditProduct(product); }} style={{ cursor: 'pointer' }}>Edit Item</span>
                                                                    <span className="tag" onClick={(e) => { e.stopPropagation(); handleDeleteProduct(product.id); }} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer' }}>Delete</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ── Pagination Bar ─────────────────────────────────────────── */}
                {!loading && totalPages > 1 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '16px 4px', marginTop: '8px', flexWrap: 'wrap', gap: '12px'
                    }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong>–<strong>{Math.min(currentPage * itemsPerPage, totalItems)}</strong> of <strong>{totalItems}</strong> products
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {/* First */}
                            <button
                                onClick={() => handlePageChange(1)}
                                disabled={currentPage === 1}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-main)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                            >«</button>

                            {/* Prev */}
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-main)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                            >‹ Prev</button>

                            {/* Page numbers */}
                            {getPageNumbers().map(num => (
                                <button
                                    key={num}
                                    onClick={() => handlePageChange(num)}
                                    style={{
                                        padding: '6px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
                                        fontWeight: num === currentPage ? 700 : 400,
                                        background: num === currentPage ? 'var(--primary)' : 'var(--bg-card)',
                                        color: num === currentPage ? '#fff' : 'var(--text-main)',
                                        border: `1px solid ${num === currentPage ? 'var(--primary)' : 'var(--border)'}`
                                    }}
                                >{num}</button>
                            ))}

                            {/* Next */}
                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-main)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                            >Next ›</button>

                            {/* Last */}
                            <button
                                onClick={() => handlePageChange(totalPages)}
                                disabled={currentPage === totalPages}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-main)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                            >»</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InventoryOverview;

