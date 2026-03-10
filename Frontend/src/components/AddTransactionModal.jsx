import React, { useState, useEffect } from 'react';
import { X, Package, TrendingUp, TrendingDown, ArrowRightLeft, AlertCircle } from 'lucide-react';
import { api } from '../utils/api';
import { riskApi } from './SupplierRiskRadar/riskApi';
import '../styles/TransactionModal.css';

const AddTransactionModal = ({ isOpen, onClose, product, depots, onSuccess, initialTab = 'stock-in', initialQuantity = '' }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [formData, setFormData] = useState({
        quantity: initialQuantity,
        depotId: '',
        fromDepotId: '',
        toDepotId: '',
        reason: '',
        notes: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null);
    const [riskWarning, setRiskWarning] = useState(null);

    // Apply initial configuration every time the modal opens
    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
            setFormData(prev => ({
                ...prev,
                quantity: initialQuantity || ''
            }));
        }
    }, [isOpen, initialTab, initialQuantity]);

    useEffect(() => {
        if (isOpen && depots.length > 0 && !formData.depotId) {
            setFormData(prev => ({ ...prev, depotId: depots[0]._id || depots[0].id }));
        }
    }, [isOpen, depots]);

    const calculatePreview = () => {
        const qty = parseInt(formData.quantity) || 0;
        if (qty === 0) {
            setPreview(null);
            return;
        }

        if (activeTab === 'stock-in') {
            // Get depot-specific stock
            const depotStock = product.depotDistribution?.find(d => d.depotId?.toString() === formData.depotId);
            const currentDepotStock = depotStock?.quantity || 0;
            const newDepotStock = currentDepotStock + qty;
            const newTotalStock = product.stock + qty;
            const belowReorder = newTotalStock < product.reorderPoint;
            
            setPreview({
                currentStock: currentDepotStock,
                newStock: newDepotStock,
                totalStock: product.stock,
                newTotalStock: newTotalStock,
                change: `+${qty}`,
                status: belowReorder ? 'warning' : 'safe',
                message: belowReorder ? 'Still below reorder point' : 'Stock level healthy',
                depotName: depots.find(d => (d._id || d.id) === formData.depotId)?.name
            });
        } else if (activeTab === 'stock-out') {
            // Get depot-specific stock
            const depotStock = product.depotDistribution?.find(d => d.depotId?.toString() === formData.depotId);
            const currentDepotStock = depotStock?.quantity || 0;
            const newDepotStock = currentDepotStock - qty;
            const newTotalStock = product.stock - qty;
            const belowReorder = newTotalStock < product.reorderPoint;
            const insufficientDepotStock = currentDepotStock < qty;
            
            setPreview({
                currentStock: currentDepotStock,
                newStock: Math.max(0, newDepotStock),
                totalStock: product.stock,
                newTotalStock: Math.max(0, newTotalStock),
                change: `-${qty}`,
                status: insufficientDepotStock ? 'critical' : (belowReorder ? 'warning' : 'safe'),
                message: insufficientDepotStock ? 'Insufficient stock in this depot!' : (belowReorder ? 'Below reorder point' : 'Stock level acceptable'),
                depotName: depots.find(d => (d._id || d.id) === formData.depotId)?.name
            });
        } else if (activeTab === 'transfer') {
            const fromDepot = product.depotDistribution?.find(d => d.depotId?.toString() === formData.fromDepotId);
            const toDepot = product.depotDistribution?.find(d => d.depotId?.toString() === formData.toDepotId);
            const fromQty = fromDepot?.quantity || 0;
            const toQty = toDepot?.quantity || 0;

            setPreview({
                fromCurrent: fromQty,
                fromNew: fromQty - qty,
                toCurrent: toQty,
                toNew: toQty + qty,
                valid: fromQty >= qty && formData.fromDepotId && formData.toDepotId && formData.fromDepotId !== formData.toDepotId
            });
        }
    };

    useEffect(() => {
        calculatePreview();
    }, [formData, activeTab, product]);

    if (!isOpen || !product) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // PHASE 7: Real-Time Supplier Risk Prediction
            if (activeTab === 'stock-in' && formData.reason === 'Purchase Order' && product.supplier) {
                try {
                    const riskResult = await riskApi.predictRisk({
                        supplier: product.supplier,
                        category: product.category,
                        qty: parseInt(formData.quantity),
                        price: product.price || 50
                    });

                    if (riskResult.success && riskResult.result.risk_score > 70) {
                        setRiskWarning({
                            score: riskResult.result.risk_score,
                            supplier: product.supplier
                        });
                        // Don't block submission, just warn
                    }
                } catch (riskErr) {
                    console.warn("Supplier risk prediction failed, continuing with submission...", riskErr);
                }
            }

            let response;
            const data = {
                productId: product.id || product._id,
                quantity: parseInt(formData.quantity),
                reason: formData.reason,
                notes: formData.notes
            };

            if (activeTab === 'stock-in') {
                response = await api.addStockIn({ ...data, depotId: formData.depotId });
            } else if (activeTab === 'stock-out') {
                response = await api.addStockOut({ ...data, depotId: formData.depotId });
            } else if (activeTab === 'transfer') {
                response = await api.transferStock({
                    ...data,
                    fromDepotId: formData.fromDepotId,
                    toDepotId: formData.toDepotId
                });
            }

            if (onSuccess) onSuccess(response);
            onClose();
            resetForm();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to process transaction');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            quantity: '',
            depotId: depots[0]?._id || depots[0]?.id || '',
            fromDepotId: '',
            toDepotId: '',
            reason: '',
            notes: ''
        });
        setPreview(null);
        setError(null);
    };

    const getReasonOptions = () => {
        if (activeTab === 'stock-in') {
            return ['Purchase Order', 'Return', 'Production', 'Adjustment', 'Other'];
        } else if (activeTab === 'stock-out') {
            return ['Sale', 'Damaged', 'Expired', 'Sample', 'Adjustment', 'Other'];
        } else {
            return ['Rebalancing', 'Customer Request', 'Optimization', 'Other'];
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content transaction-modal">
                <div className="modal-header">
                    <div>
                        <h2>Add Transaction</h2>
                        <p className="subtitle">{product.name} • {product.sku}</p>
                    </div>
                    <button onClick={onClose} className="close-btn"><X size={24} /></button>
                </div>

                {riskWarning && (
                    <div className="risk-warning-banner" style={{ background: '#fee2e2', border: '1.5px solid #ef4444', padding: '12px 20px', margin: '0 20px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <AlertCircle className="text-danger" size={24} />
                        <div style={{ flex: 1 }}>
                            <strong style={{ color: '#ef4444', fontSize: '13px', display: 'block' }}>High Risk Supplier Detected</strong>
                            <span style={{ fontSize: '12px', color: '#7f1d1d' }}>
                                {riskWarning.score}% probability of delivery delay. Suggested backup: Beta Corp.
                            </span>
                        </div>
                        <button className="close-btn" onClick={() => setRiskWarning(null)}><X size={16} /></button>
                    </div>
                )}

                <div className="transaction-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'stock-in' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('stock-in'); resetForm(); }}
                    >
                        <TrendingUp size={18} /> Stock In
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'stock-out' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('stock-out'); resetForm(); }}
                    >
                        <TrendingDown size={18} /> Stock Out
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'transfer' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('transfer'); resetForm(); }}
                    >
                        <ArrowRightLeft size={18} /> Transfer
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="transaction-form">
                    <div className="form-group">
                        <label>Quantity *</label>
                        <input
                            type="number"
                            required
                            min="1"
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                            placeholder="Enter quantity"
                        />
                    </div>

                    {activeTab === 'stock-in' && (
                        <div className="form-group">
                            <label>Destination Depot *</label>
                            <select
                                required
                                value={formData.depotId}
                                onChange={(e) => setFormData({ ...formData, depotId: e.target.value })}
                            >
                                {depots.map(d => (
                                    <option key={d._id || d.id} value={d._id || d.id}>
                                        {d.name} ({d.location})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {activeTab === 'stock-out' && (
                        <div className="form-group">
                            <label>Source Depot *</label>
                            <select
                                required
                                value={formData.depotId}
                                onChange={(e) => setFormData({ ...formData, depotId: e.target.value })}
                            >
                                {depots.map(d => (
                                    <option key={d._id || d.id} value={d._id || d.id}>
                                        {d.name} ({d.location})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {activeTab === 'transfer' && (
                        <>
                            <div className="form-group">
                                <label>From Depot *</label>
                                <select
                                    required
                                    value={formData.fromDepotId}
                                    onChange={(e) => setFormData({ ...formData, fromDepotId: e.target.value })}
                                >
                                    <option value="">Select source depot</option>
                                    {depots.map(d => (
                                        <option key={d._id || d.id} value={d._id || d.id}>
                                            {d.name} ({d.location})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>To Depot *</label>
                                <select
                                    required
                                    value={formData.toDepotId}
                                    onChange={(e) => setFormData({ ...formData, toDepotId: e.target.value })}
                                >
                                    <option value="">Select destination depot</option>
                                    {depots.map(d => (
                                        <option key={d._id || d.id} value={d._id || d.id}>
                                            {d.name} ({d.location})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    <div className="form-group">
                        <label>Reason</label>
                        <select
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        >
                            <option value="">Select reason</option>
                            {getReasonOptions().map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Notes</label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Additional notes (optional)"
                            rows="3"
                        />
                    </div>

                    {preview && activeTab !== 'transfer' && (
                        <div className={`preview-box ${preview.status}`}>
                            <div className="preview-header">
                                <Package size={16} />
                                <span>Stock Preview {preview.depotName && `- ${preview.depotName}`}</span>
                            </div>
                            <div className="preview-content">
                                <div className="preview-row">
                                    <span>Current Stock (in depot):</span>
                                    <strong>{preview.currentStock} units</strong>
                                </div>
                                <div className="preview-row">
                                    <span>Change:</span>
                                    <strong className={activeTab === 'stock-in' ? 'positive' : 'negative'}>
                                        {preview.change} units
                                    </strong>
                                </div>
                                <div className="preview-row">
                                    <span>New Stock (in depot):</span>
                                    <strong>{preview.newStock} units</strong>
                                </div>
                                {preview.totalStock !== undefined && (
                                    <div className="preview-row" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', fontSize: '12px', opacity: 0.8 }}>
                                        <span>Total Stock (all depots):</span>
                                        <span>{preview.totalStock} → {preview.newTotalStock} units</span>
                                    </div>
                                )}
                                <div className="preview-message">
                                    {preview.status !== 'safe' && <AlertCircle size={14} />}
                                    {preview.message}
                                </div>
                            </div>
                        </div>
                    )}

                    {preview && activeTab === 'transfer' && (
                        <div className={`preview-box ${preview.valid ? 'safe' : 'critical'}`}>
                            <div className="preview-header">
                                <ArrowRightLeft size={16} />
                                <span>Transfer Preview</span>
                            </div>
                            {preview.valid ? (
                                <div className="preview-content transfer-preview">
                                    <div className="transfer-column">
                                        <div className="transfer-label">From Depot</div>
                                        <div className="preview-row">
                                            <span>Current:</span>
                                            <strong>{preview.fromCurrent} units</strong>
                                        </div>
                                        <div className="preview-row">
                                            <span>After:</span>
                                            <strong>{preview.fromNew} units</strong>
                                        </div>
                                    </div>
                                    <div className="transfer-arrow">→</div>
                                    <div className="transfer-column">
                                        <div className="transfer-label">To Depot</div>
                                        <div className="preview-row">
                                            <span>Current:</span>
                                            <strong>{preview.toCurrent} units</strong>
                                        </div>
                                        <div className="preview-row">
                                            <span>After:</span>
                                            <strong>{preview.toNew} units</strong>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="preview-message">
                                    <AlertCircle size={14} />
                                    Please select valid depots and ensure sufficient stock
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="error-message">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="cancel-btn">
                            Cancel
                        </button>
                        <button type="submit" className="submit-btn" disabled={loading}>
                            {loading ? 'Processing...' : `Confirm ${activeTab === 'stock-in' ? 'Stock In' : activeTab === 'stock-out' ? 'Stock Out' : 'Transfer'}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddTransactionModal;
