import { useState } from 'react';
import { useSupplierData } from '../hooks/useSupplierData';
import { useLiveAlerts } from '../hooks/useLiveAlerts';
import { useSupplierRisk } from '../context/SupplierRiskContext';
import KPIBanner from '../components/KPIBanner';
import SupplierTable from '../components/SupplierTable';
import LiveAlertsPanel from '../components/LiveAlertsPanel';
import SupplierDrawer from '../components/SupplierDrawer';

export default function SupplierRiskRadar() {
    // 1. Initialize data hooks. 
    // This starts polling Flask (every 30s) AND connects to Node SSE stream automatically.
    useSupplierData();
    useLiveAlerts();

    // 2. Access the shared global state
    const { state } = useSupplierRisk();
    const { error } = state;

    // 3. Page specific local state (which supplier is clicked for the drawer)
    const [selectedSupplier, setSelected] = useState(null);

    return (
        <div style={{ padding: '0 24px', maxWidth: 1600, margin: '0 auto' }}>
            {/* Header */}
            <header style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>Supplier Risk Radar</h1>
                    <p style={{ margin: 0, color: '#64748b', fontSize: 15 }}>Live Procurement Threat Intelligence</p>
                </div>
                {error && (
                    <div style={{ background: '#FEF2F2', padding: '8px 16px', borderRadius: 8, color: '#991B1B', fontSize: 13, border: '1px solid #FCA5A5' }}>
                        ⚠️ {error}
                    </div>
                )}
            </header>

            {/* KPI Banner */}
            <div style={{ marginBottom: 32 }}>
                <KPIBanner />
            </div>

            {/* Main Content Grid: Table | Alerts panel */}
            <div className="risk-radar-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 340px',
                gap: 24,
                alignItems: 'start'
            }}>
                <SupplierTable onViewProfile={setSelected} />
                <div style={{ position: 'sticky', top: 24, height: 'calc(100vh - 100px)' }}>
                    <LiveAlertsPanel />
                </div>
            </div>

            {/* Drill-down side drawer overlay */}
            {selectedSupplier && (
                <SupplierDrawer
                    supplier={selectedSupplier}
                    onClose={() => setSelected(null)}
                />
            )}

            {/* Fix for mobile stacking */}
            <style>{`
                @media (max-width: 1024px) {
                    .risk-radar-grid { grid-template-columns: 1fr !important; }
                    .table-responsive-wrapper { overflow-x: auto; }
                }
            `}</style>
        </div>
    );
}
