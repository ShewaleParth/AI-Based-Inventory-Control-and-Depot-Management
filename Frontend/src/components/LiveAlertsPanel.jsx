import { useState } from 'react';
import { useSupplierRisk } from '../context/SupplierRiskContext';
import { BrainCircuit, CheckCircle, AlertCircle, AlertTriangle, X } from 'lucide-react';

export default function LiveAlertsPanel() {
    const { state } = useSupplierRisk();
    const { alerts } = state;
    const [dismissed, setDismissed] = useState(new Set());

    const handleDismiss = (id) => {
        setDismissed(prev => new Set(prev).add(id));
    };

    const clearAll = () => {
        const newSet = new Set(dismissed);
        alerts.forEach(a => newSet.add(a._id));
        setDismissed(newSet);
    };

    const visibleAlerts = alerts.filter(a => !dismissed.has(a._id));

    return (
        <aside className="ai-ops-feed" style={{ background: '#fff', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="feed-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <BrainCircuit size={20} className="text-primary" />
                    Live Alerts Panel
                    <div style={{ width: 8, height: 8, background: '#22C55E', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
                </div>
                {visibleAlerts.length > 0 && (
                    <button onClick={clearAll} style={{ fontSize: 12, color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}>Clear all</button>
                )}
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {visibleAlerts.length === 0 && (
                    <div className="alert-item" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#F0FDFA', borderRadius: 8 }}>
                        <div className="alert-icon" style={{ backgroundColor: '#D1FAE5', color: '#10B981', padding: 8, borderRadius: '50%' }}>
                            <CheckCircle size={18} />
                        </div>
                        <div className="alert-content">
                            <div className="alert-text" style={{ fontSize: 14, fontWeight: 500 }}>System stable</div>
                            <div className="alert-meta" style={{ fontSize: 12, color: '#666' }}>No active alerts</div>
                        </div>
                    </div>
                )}

                {visibleAlerts.map(alert => {
                    const isCritical = alert.severity === 'high' || alert.type === 'stockout';
                    const isWarning = alert.severity === 'medium' || alert.type === 'low_stock';

                    return (
                        <div key={alert._id} className={`alert-item ${isCritical ? 'pulse-red' : ''}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, background: isCritical ? '#FEF2F2' : isWarning ? '#FFFBEB' : '#F0F9FF', borderRadius: 8, position: 'relative' }}>
                            <div className="alert-icon" style={{
                                backgroundColor: isCritical ? '#FEE2E2' : isWarning ? '#FEF3C7' : '#DBEAFE',
                                color: isCritical ? '#EF4444' : isWarning ? '#F59E0B' : '#3B82F6',
                                padding: 8, borderRadius: '50%', flexShrink: 0
                            }}>
                                {isCritical ? <AlertCircle size={18} /> : isWarning ? <AlertTriangle size={18} /> : <BrainCircuit size={18} />}
                            </div>
                            <div className="alert-content" style={{ flex: 1 }}>
                                <div className="alert-text" style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>{alert.message}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                    <div className="alert-meta" style={{ fontSize: 11, color: '#666' }}>{new Date(alert.createdAt).toLocaleTimeString()}</div>
                                </div>
                            </div>
                            <button onClick={() => handleDismiss(alert._id)} aria-label="Dismiss alert" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#999', position: 'absolute', right: 4, top: 4 }}>
                                <X size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
