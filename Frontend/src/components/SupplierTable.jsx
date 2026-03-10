import { useState, useMemo } from 'react';
import { Search, Filter, ArrowUpDown, ChevronRight, Activity, Globe } from 'lucide-react';
import RiskBar from './RiskBar';
import { useSupplierRisk } from '../context/SupplierRiskContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function SupplierTable({ onViewProfile }) {
    const { state } = useSupplierRisk();
    const { suppliers, loading } = state;
    const [query, setQuery] = useState('');
    const [sortKey, setSortKey] = useState('overallRiskScore');
    const [sortDir, setSortDir] = useState('desc');
    const [categoryFilter, setCategoryFilter] = useState('All');

    const categories = useMemo(() => {
        const cats = new Set(suppliers.filter(s => s.category).map(s => s.category));
        return ['All', ...Array.from(cats).sort()];
    }, [suppliers]);

    const filteredAndSorted = useMemo(() => {
        let result = suppliers;
        if (query) {
            const q = query.toLowerCase();
            result = result.filter(s =>
                (s.supplierName?.toLowerCase().includes(q)) ||
                (s.category?.toLowerCase().includes(q))
            );
        }
        if (categoryFilter !== 'All') {
            result = result.filter(s => s.category === categoryFilter);
        }
        result = [...result].sort((a, b) => {
            const valA = a[sortKey] ?? 0;
            const valB = b[sortKey] ?? 0;
            if (typeof valA === 'string') {
                return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return sortDir === 'asc' ? valA - valB : valB - valA;
        });
        return result;
    }, [suppliers, query, sortKey, sortDir, categoryFilter]);

    const handleSort = (key) => {
        if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const getStatusStyles = (status) => {
        switch (status) {
            case 'CRITICAL': return { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', color: '#EF4444', text: 'Critical' };
            case 'HIGH': return { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', color: '#F59E0B', text: 'High Risk' };
            case 'MEDIUM': return { bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.3)', color: '#EAB308', text: 'Medium' };
            default: return { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', color: '#22C55E', text: 'Stable' };
        }
    };

    if (loading) return <div className="glass-panel" style={{ padding: 40, textAlign: 'center', height: 400 }}>
        <div className="loader-pulse" />
        <p style={{ marginTop: 16, color: '#64748b', fontWeight: 500 }}>Sourcing Live Intelligence...</p>
    </div>;

    return (
        <div className="table-panel-premium" style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Activity size={20} className="text-primary" /> Risk Intelligence Desk
                    </h2>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Filter command..."
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            style={{ padding: '8px 12px 8px 36px', borderRadius: 8, border: '1px solid #e2e8f0', width: 240, fontSize: 13 }}
                        />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Filter size={16} color="#64748b" />
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', fontWeight: 600 }}>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            {['supplierName', 'delayRiskScore', 'qualityRiskScore', 'fulfillmentRate', 'overallRiskScore'].map((key, i) => (
                                <th key={key} onClick={() => handleSort(key)} style={{ padding: '16px 24px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {key === 'supplierName' ? 'Supplier Entity' : key.replace(/RiskScore|Rate|Score/g, '')}
                                        <ArrowUpDown size={12} color={sortKey === key ? '#4338ca' : '#cbd5e1'} />
                                    </div>
                                </th>
                            ))}
                            <th style={{ padding: '16px 24px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Alert Status</th>
                            <th style={{ padding: '16px 24px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <AnimatePresence mode="popLayout">
                            {filteredAndSorted.map((s, idx) => {
                                const styles = getStatusStyles(s.status);
                                return (
                                    <motion.tr
                                        key={s.supplierName}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.03 }}
                                        style={{ borderBottom: '1px solid #f1f5f9' }}
                                        whileHover={{ background: '#f8fafc' }}
                                    >
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ width: 32, height: 32, background: '#eff6ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d4ed8' }}>
                                                    <Globe size={16} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{s.supplierName}</div>
                                                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{s.category}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}><RiskBar value={s.delayRiskScore ?? 0} /></td>
                                        <td style={{ padding: '16px 24px' }}><RiskBar value={s.qualityRiskScore ?? 0} /></td>
                                        <td style={{ padding: '16px 24px' }}><RiskBar value={s.fulfillmentRate ?? 0} /></td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ height: 32, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontWeight: 800, fontSize: 14, background: styles.color, color: '#fff' }}>
                                                {s.overallRiskScore}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700, background: styles.bg, border: `1px solid ${styles.border}`, color: styles.color, textTransform: 'uppercase' }}>
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: styles.color, animation: s.status === 'CRITICAL' ? 'pulse 1.5s infinite' : 'none' }} />
                                                {styles.text}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <button
                                                onClick={() => onViewProfile(s)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f1f5f9', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}
                                                className="hover-trigger"
                                            >
                                                Analysis <ChevronRight size={14} />
                                            </button>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            <style>{`
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
                .hover-trigger:hover { background: #4338ca !important; color: #fff !important; }
            `}</style>
        </div>
    );
}
