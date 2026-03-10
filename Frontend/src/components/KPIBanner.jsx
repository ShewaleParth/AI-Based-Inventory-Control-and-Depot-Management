import { AlertCircle, Clock, ShieldAlert, CreditCard, Layers } from 'lucide-react';
import { useSupplierRisk } from '../context/SupplierRiskContext';
import { motion } from 'framer-motion';

export default function KPIBanner() {
    const { state } = useSupplierRisk();
    const { kpis, loading } = state;

    const cards = [
        { label: 'Active Risk Events', value: kpis?.activeRiskEvents || 0, icon: <ShieldAlert />, color: '#EF4444', suffix: ' Alerts' },
        { label: 'Avg Delivery Delay', value: kpis?.avgDeliveryDelayDays || 0, icon: <Clock />, color: '#F59E0B', suffix: ' Days' },
        { label: 'Quality Failures', value: kpis?.qualityFailurePercent || 0, icon: <AlertCircle />, color: '#22C55E', suffix: '%' },
        { label: 'Procurement Loss Risk', value: kpis?.procurementLossRiskINR?.toLocaleString() || 0, icon: <CreditCard />, color: '#6366F1', prefix: '₹' },
    ];

    if (loading || !kpis) {
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="kpi-skeleton" style={{ height: 110, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: 24, gap: 16 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f1f5f9' }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ width: '60%', height: 12, background: '#f1f5f9', borderRadius: 4, marginBottom: 8 }} />
                            <div style={{ width: '40%', height: 20, background: '#f1f5f9', borderRadius: 4 }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {cards.map((card, i) => (
                <motion.div
                    key={card.label}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    style={{
                        background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
                        padding: 24, display: 'flex', alignItems: 'center', gap: 20,
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        position: 'relative', overflow: 'hidden'
                    }}
                >
                    <div style={{
                        width: 48, height: 48, borderRadius: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${card.color}15`, color: card.color,
                        boxShadow: `0 0 20px -5px ${card.color}40`,
                    }}>
                        {card.icon}
                    </div>
                    <div>
                        <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{card.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#94a3b8' }}>{card.prefix}</span>
                            {card.value}
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>{card.suffix}</span>
                        </div>
                    </div>
                    {/* Subtle accent border */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${card.color}00, ${card.color}, ${card.color}00)` }} />
                </motion.div>
            ))}
        </div>
    );
}
