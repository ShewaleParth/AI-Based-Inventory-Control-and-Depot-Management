import { useEffect, useState } from 'react';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Line } from 'recharts';
import { motion } from 'framer-motion';
import { X, Zap } from 'lucide-react';

const FLASK = import.meta.env.VITE_FLASK_URL || 'http://localhost:5001';

export default function SupplierDrawer({ supplier, onClose }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionPlan, setActionPlan] = useState(null);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        if (!supplier) return;
        setLoading(true);
        axios.get(`${FLASK}/api/supplier/history/${encodeURIComponent(supplier.supplierName)}`)
            .then(res => setHistory(res.data.trend || []))
            .catch(() => setHistory([]))
            .finally(() => setLoading(false));
    }, [supplier]);

    const handleGenerateMockPlan = () => {
        setGenerating(true);
        setTimeout(() => {
            setActionPlan({
                id: `CAP-${Math.floor(Math.random() * 9000) + 1000}`,
                timestamp: new Date().toLocaleString(),
                supplier: supplier.supplierName,
                priority: supplier.overallRiskScore > 70 ? "CRITICAL" : "HIGH",
                actions: [
                    { title: "Immediate Logistic Diversification", detail: `Relocate 25% of current pending volume for ${supplier.category} to secondary back-up vendors.` },
                    { title: "Payment Cycle Audit", detail: "Investigate recorded payment lags in regional transit hubs mentioned in AI analysis." },
                    { title: "Quality Threshold Clause", detail: "Enforce strict quality inspection at source for the next 4 shipment cycles." },
                    { title: "Executive Review", detail: "Schedule a high-priority procurement meeting with vendor leadership." }
                ]
            });
            setGenerating(false);
        }, 1500);
    };

    if (!supplier) return null;

    return (
        <div className="intel-drawer-overlay" onClick={onClose} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', justifyContent: 'flex-end'
        }}>
            <motion.div
                className="intel-drawer"
                onClick={e => e.stopPropagation()}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{ width: '100%', maxWidth: 700, background: '#fff', height: '100vh', overflowY: 'auto' }}
            >
                <div className="drawer-header" style={{ borderBottom: '1px solid #eee', padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div>
                        <h2 className="text-2xl font-black" style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{supplier.supplierName}</h2>
                        <p className="text-muted font-bold text-xs uppercase" style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                            {supplier.category} Intelligence Profile
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: '#e2e8f0', border: 'none', padding: 8, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={20} />
                    </button>
                </div>

                <div className="drawer-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 0.8fr)', gap: 32, padding: 32 }}>
                    {/* Left Column - Charts & Metrics */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        <div className="drawer-chart-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                            <h3 className="font-bold mb-4" style={{ margin: '0 0 16px', fontSize: 16 }}>Delay & Quality Trends (30 Days)</h3>
                            <div style={{ height: 280 }}>
                                {loading ? (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Loading history...</div>
                                ) : history.length === 0 ? (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>No history available</div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={history}>
                                            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(val) => val.substring(5, 10)} />
                                            <YAxis />
                                            <Tooltip />
                                            <Area type="monotone" dataKey="fulfillment" stroke="#10b981" fill="#10b98122" name="Fulfillment %" />
                                            <Line type="monotone" dataKey="delay" stroke="#ef4444" strokeWidth={3} name="Delay Days" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 16 }}>
                            <div className="kpi-card-v2" style={{ flex: 1, padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                <span className="label" style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Fulfillment Reliability</span>
                                <div className="value" style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{supplier.fulfillmentRate}%</div>
                            </div>
                            <div className="kpi-card-v2" style={{ flex: 1, padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                <span className="label" style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Delay Risk Score</span>
                                <div className="value" style={{ fontSize: 24, fontWeight: 700, color: supplier.delayRiskScore > 50 ? '#ef4444' : '#10b981' }}>
                                    {supplier.delayRiskScore}
                                </div>
                            </div>
                        </div>

                        <div className="kpi-card-v2" style={{ width: '100%', padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <span className="label" style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Overall Machine Learning Risk Score</span>
                            <div className="value" style={{ fontSize: 24, fontWeight: 700, color: supplier.overallRiskScore >= 70 ? '#EF4444' : supplier.overallRiskScore >= 45 ? '#F59E0B' : supplier.overallRiskScore >= 25 ? '#EAB308' : '#22C55E' }}>
                                {supplier.overallRiskScore} / 100
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Insights & AI */}
                    <div className="drawer-insight-section" style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3 className="font-black text-lg mb-4" style={{ margin: '0 0 16px', fontSize: 18 }}>AI Explanation</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                            <div style={{ padding: 12, borderRadius: 8, borderLeft: `4px solid ${supplier.delayRiskScore > 50 ? '#ef4444' : '#10b981'}`, background: '#f8fafc', fontSize: 14, fontStyle: 'italic', color: '#334155' }}>
                                {supplier.delayRiskScore > 50
                                    ? `"High delay probability detected. ML model flags an elevated ${supplier.delayRiskScore}% risk of late deliveries based on historical lead times."`
                                    : `"Delivery patterns are stable. The ${supplier.delayRiskScore}% delay risk is well within industry tolerance."`}
                            </div>

                            <div style={{ padding: 12, borderRadius: 8, borderLeft: `4px solid ${supplier.qualityRiskScore > 50 ? '#ef4444' : '#10b981'}`, background: '#f8fafc', fontSize: 14, fontStyle: 'italic', color: '#334155' }}>
                                {supplier.qualityRiskScore > 50
                                    ? `"Quality defects predicted. The model flags a ${supplier.qualityRiskScore}% risk of stock rejection. Inspect incoming ${supplier.category} batches immediately."`
                                    : `"Quality metrics are excellent with a low ${supplier.qualityRiskScore}% rejection risk profile."`}
                            </div>

                            <div style={{ padding: 12, borderRadius: 8, borderLeft: `4px solid ${supplier.fulfillmentRate < 80 ? '#ef4444' : '#10b981'}`, background: '#f8fafc', fontSize: 14, fontStyle: 'italic', color: '#334155' }}>
                                {supplier.fulfillmentRate < 80
                                    ? `"Severe fulfillment failure predicted. The vendor is only fulfilling ${supplier.fulfillmentRate}% of orders. Critical disruption risk."`
                                    : `"Vendor is reliably fulfilling ${supplier.fulfillmentRate}% of ${supplier.category} orders."`}
                            </div>
                        </div>

                        {!actionPlan ? (
                            <button
                                style={{
                                    marginTop: 24, width: '100%', padding: '12px', background: '#4338ca', color: '#fff', borderRadius: 8,
                                    border: 'none', fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1
                                }}
                                onClick={handleGenerateMockPlan}
                                disabled={generating}
                            >
                                {generating ? 'Generating Corrective Plan...' : 'Generate Corrective Action Plan'}
                            </button>
                        ) : (
                            <div style={{ marginTop: 24, padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                                <h4 style={{ margin: '0 0 8px', color: '#166534', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Zap size={16} /> Action Plan Ready
                                </h4>
                                <p style={{ fontSize: 12, color: '#15803d', margin: '0 0 12px' }}>{actionPlan.id} • {actionPlan.priority} Priority</p>
                                <ul style={{ paddingLeft: 16, margin: 0, fontSize: 13, color: '#166534', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {actionPlan.actions.slice(0, 2).map((a, i) => <li key={i}>{a.title}</li>)}
                                </ul>
                                <button style={{ marginTop: 12, padding: '6px 12px', background: 'transparent', border: '1px solid #22c55e', color: '#15803d', borderRadius: 4, width: '100%', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Execute Plan</button>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
