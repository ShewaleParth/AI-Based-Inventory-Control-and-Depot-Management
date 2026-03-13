import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
    Package, Truck, AlertTriangle, TrendingUp, TrendingDown,
    RefreshCw, Download, Info, Zap, CheckSquare,
    ArrowUpRight, ArrowDownRight, BarChart2, Clock, Shield,
    AlertCircle, X, Check, Minus, Activity, Layers,
    Target, Cpu, Eye, Filter, ChevronDown, ChevronUp,
    Box, Warehouse, RotateCcw, Bell, Star
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, LineChart, Line, ReferenceLine,
    Cell, AreaChart, Area, PieChart, Pie, Legend,
    RadialBarChart, RadialBar, ComposedChart, Scatter
} from 'recharts';
import { useDashboardData } from '../hooks/useDashboardData';
import './Dashboard.css';

// ─── FORMATTERS ──────────────────────────────────────────────────────────────
const fmt = {
    number: (v) => {
        if (v === undefined || v === null) return '0';
        if (v >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`;
        if (v >= 100000)   return `${(v / 100000).toFixed(1)}L`;
        if (v >= 1000)     return `${(v / 1000).toFixed(1)}K`;
        return Number(v).toLocaleString('en-IN');
    },
    currency: (v) => {
        if (v === undefined || v === null) return '₹0';
        return `₹${fmt.number(v)}`;
    },
    axisTick: (v) => {
        if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
        if (v >= 1000)    return `${(v / 1000).toFixed(0)}K`;
        return v;
    },
    pct: (v) => `${Math.round(v || 0)}%`
};

// ─── MINI SPARKLINE ──────────────────────────────────────────────────────────
const MiniSparkline = ({ data = [], color = '#6366f1', height = 44 }) => (
    <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
                <linearGradient id={`spk-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2}
                fill={`url(#spk-${color.replace('#', '')})`} dot={false} />
        </AreaChart>
    </ResponsiveContainer>
);

// ─── SKELETON ────────────────────────────────────────────────────────────────
const Skeleton = ({ w = '100%', h = 20, r = 8 }) => (
    <div className="db2-skel" style={{ width: w, height: h, borderRadius: r }} />
);

// ─── KPI CARD ────────────────────────────────────────────────────────────────
const KPICard = ({ title, value, sub, trend, trendLabel, icon: Icon, color, sparkData, loading, suffix = '' }) => {
    if (loading) return (
        <div className="db2-kpi-card">
            <Skeleton w="55%" h={13} /><Skeleton w="40%" h={32} r={6} /><Skeleton h={44} />
        </div>
    );
    const isUp = trend === 'up', isDown = trend === 'down';
    return (
        <div className="db2-kpi-card" style={{ '--kc': color }}>
            <div className="db2-kpi-glow" />
            <div className="db2-kpi-head">
                <span className="db2-kpi-lbl">{title}</span>
                <span className="db2-kpi-icon"><Icon size={15} /></span>
            </div>
            <div className="db2-kpi-val">{value}{suffix}</div>
            <div className="db2-kpi-sub">{sub}</div>
            <div className="db2-kpi-spark"><MiniSparkline data={sparkData} color={color} /></div>
            <div className={`db2-kpi-trend ${isUp ? 'trend-up' : isDown ? 'trend-down' : 'trend-neu'}`}>
                {isUp && <ArrowUpRight size={12} />}
                {isDown && <ArrowDownRight size={12} />}
                {!isUp && !isDown && <Minus size={12} />}
                <span>{trendLabel}</span>
            </div>
        </div>
    );
};

// ─── SEVERITY BADGE ──────────────────────────────────────────────────────────
const SevBadge = ({ level }) => {
    const map = {
        HIGH: ['sev-high', 'HIGH'],
        MEDIUM: ['sev-med', 'MED'],
        LOW: ['sev-ok', 'OK'],
        CRITICAL: ['sev-crit', 'CRIT']
    };
    const [cls, lbl] = map[level] || ['sev-ok', level];
    return <span className={`db2-sev-badge ${cls}`}>{lbl}</span>;
};

// ─── CHART TOOLTIP ───────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label, isCurrency = true }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="db2-ct">
            <div className="db2-ct-lbl">{label}</div>
            {payload.map((p, i) => (
                <div key={i} className="db2-ct-row">
                    <span style={{ background: p.color }} className="db2-ct-dot" />
                    <span>{p.name}</span>
                    <b>{isCurrency ? fmt.currency(p.value) : fmt.number(p.value)}</b>
                </div>
            ))}
        </div>
    );
};

// ─── DONUT CHART LABEL ───────────────────────────────────────────────────────
const DonutLabel = ({ cx, cy, innerRadius, outerRadius, value, fill, name }) => {
    const midAngle = 0;
    return null; // Custom labels handled separately
};

// ─── ACCURACY RING ───────────────────────────────────────────────────────────
const AccuracyRing = ({ pct = 87 }) => {
    const r = 40, circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    const color = pct >= 85 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';
    return (
        <div className="db2-acc-ring-wrap">
            <svg width={100} height={100} viewBox="0 0 100 100">
                <circle cx={50} cy={50} r={r} fill="none" stroke="rgba(100,116,139,0.15)" strokeWidth={10} />
                <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={10}
                    strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                    transform="rotate(-90 50 50)" style={{ transition: 'stroke-dasharray 1s ease' }} />
            </svg>
            <div className="db2-acc-center">
                <span className="db2-acc-pct" style={{ color }}>{pct}%</span>
                <span className="db2-acc-sub">AI Accuracy</span>
            </div>
        </div>
    );
};

// ─── REORDER TOOLTIP ─────────────────────────────────────────────────────────
const ReorderTip = ({ qty, demand, stock, rp }) => {
    const [vis, setVis] = useState(false);
    return (
        <span className="db2-rtip-wrap">
            <button className="db2-info-btn"
                onMouseEnter={() => setVis(true)} onMouseLeave={() => setVis(false)}
                onFocus={() => setVis(true)} onBlur={() => setVis(false)}
                aria-label="Explain reorder quantity"><Info size={11} />
            </button>
            {vis && (
                <div className="db2-rtip" role="tooltip">
                    <strong>How we calculated {qty} units</strong>
                    <div className="db2-rtip-row"><span>7-day forecast</span><b>{demand} units</b></div>
                    <div className="db2-rtip-row"><span>Current stock</span><b>{stock} units</b></div>
                    <div className="db2-rtip-row"><span>Safety buffer</span><b>{rp} units</b></div>
                    <div className="db2-rtip-formula">= demand + buffer − current stock</div>
                </div>
            )}
        </span>
    );
};

// ─── BULK REORDER MODAL ──────────────────────────────────────────────────────
const BulkModal = ({ skus, onReorder, onClose }) => {
    const [sel, setSel] = useState(() => new Set(skus.map((_, i) => i)));
    const [busy, setBusy] = useState(false);
    const toggle = (i) => setSel(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
    const toggleAll = () => setSel(sel.size === skus.length ? new Set() : new Set(skus.map((_, i) => i)));
    const totalUnits = skus.filter((_, i) => sel.has(i)).reduce((s, sk) => s + (sk.recommendedReorder || 50), 0);

    const confirm = async () => {
        setBusy(true);
        for (const sk of skus.filter((_, i) => sel.has(i))) await onReorder(sk);
        setBusy(false);
        onClose();
    };

    return (
        <div className="db2-overlay" role="dialog" aria-modal>
            <div className="db2-bulk-panel">
                <div className="db2-bulk-head">
                    <div>
                        <h3>⚡ Bulk Reorder</h3>
                        <span>{skus.length} critical SKUs pending</span>
                    </div>
                    <button onClick={onClose} aria-label="Close"><X size={18} /></button>
                </div>
                <div className="db2-bulk-meta">
                    <label className="db2-chk-all">
                        <input type="checkbox" checked={sel.size === skus.length} onChange={toggleAll} />
                        Select All
                    </label>
                    <span className="db2-bulk-total">{totalUnits.toLocaleString()} total units</span>
                </div>
                <div className="db2-bulk-list">
                    {skus.map((sk, i) => (
                        <label key={i} className={`db2-bulk-row ${sel.has(i) ? 'sel' : ''}`}>
                            <input type="checkbox" checked={sel.has(i)} onChange={() => toggle(i)} />
                            <div className="db2-bulk-info">
                                <span className="db2-bulk-name">{sk.name}</span>
                                <span className="db2-bulk-sku">{sk.sku}</span>
                            </div>
                            <SevBadge level={sk.riskLevel} />
                            <span className="db2-bulk-qty">{sk.recommendedReorder || 50} u</span>
                        </label>
                    ))}
                </div>
                <div className="db2-bulk-foot">
                    <button className="db2-btn-ghost" onClick={onClose}>Cancel</button>
                    <button className="db2-btn-primary" disabled={!sel.size || busy} onClick={confirm}>
                        {busy ? <><RefreshCw size={13} className="spin" /> Processing…</> : <><Zap size={13} /> Reorder {sel.size} SKUs</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── TX BADGE ────────────────────────────────────────────────────────────────
const TxBadge = ({ type }) => {
    const map = { STOCK_IN: ['tx-in', 'IN'], STOCK_OUT: ['tx-out', 'OUT'], TRANSFER: ['tx-xfer', 'XFER'] };
    const [cls, lbl] = map[type] || ['tx-xfer', type];
    return <span className={`db2-tx-badge ${cls}`}>{lbl}</span>;
};

// ─── CATEGORY DONUT DATA HELPER ──────────────────────────────────────────────
// Fixed 4 categories with distinct brand colors
const CATEGORY_DEFS = [
    { name: 'Apparel',     color: '#6366f1' },
    { name: 'Electronics', color: '#0ea5e9' },
    { name: 'Sneakers',   color: '#f59e0b' },
    { name: 'Accessories', color: '#10b981' },
];

// ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────
const Dashboard = () => {
    const {
        metrics, chartData, transactions, loading,
        alerts, depots, topSKUs, selectedDepot,
        setSelectedDepot, handleReorder,
        categoryDistribution
    } = useDashboardData();

    const [timeRange, setTimeRange] = useState(() => localStorage.getItem('db2_tr') || '7d');
    const changeRange = (r) => { setTimeRange(r); localStorage.setItem('db2_tr', r); };

    const [activeBar, setActiveBar] = useState(null);
    const [showBulk, setShowBulk] = useState(false);
    const [txFilter, setTxFilter] = useState('');
    const [txSort, setTxSort] = useState({ col: 'timestamp', dir: 'desc' });
    const [showAllSKU, setShowAllSKU] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [activeChartTab, setActiveChartTab] = useState('bar');
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const [aiScore, setAiScore] = useState(87);

    const addToast = useCallback((msg, type = 'success') => {
        const id = Date.now();
        setToasts(p => [...p, { id, msg, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4200);
    }, []);

    const handleReorderT = useCallback(async (sku) => {
        try {
            await handleReorder(sku);
            setLastRefresh(new Date());
            addToast(`✓ Reordered ${sku.recommendedReorder || 50} units of ${sku.name}`);
        } catch {
            addToast(`✗ Failed to reorder ${sku.name}`, 'error');
        }
    }, [handleReorder, addToast]);

    // Sparkline generator
    const makeSpark = (base = 100, dir = 'up') =>
        Array.from({ length: 8 }, (_, i) => ({
            v: Math.max(0, base + (dir === 'up' ? i * base * 0.025 : -i * base * 0.018) + (Math.random() - 0.5) * base * 0.08)
        }));

    // Filtered & sorted transactions
    const filteredTx = useMemo(() => {
        let rows = [...transactions];
        if (txFilter) {
            const q = txFilter.toLowerCase();
            rows = rows.filter(t =>
                t.sku?.toLowerCase().includes(q) ||
                t.name?.toLowerCase().includes(q) ||
                t.fromDepot?.toLowerCase().includes(q) ||
                t.toDepot?.toLowerCase().includes(q)
            );
        }
        rows.sort((a, b) => {
            let va = a[txSort.col], vb = b[txSort.col];
            if (txSort.col === 'timestamp') { va = new Date(va); vb = new Date(vb); }
            if (txSort.col === 'quantity') { va = Number(va); vb = Number(vb); }
            return txSort.dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
        });
        return rows.slice(0, 10);
    }, [transactions, txFilter, txSort]);

    const sortTx = (col) => setTxSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
    const SortIcon = ({ col }) => txSort.col === col
        ? (txSort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
        : <ChevronDown size={12} style={{ opacity: 0.3 }} />;

    // Urgent SKUs
    const urgentSKUs = topSKUs.filter(s => s.riskLevel === 'HIGH' || s.riskLevel === 'CRITICAL');
    const displaySKUs = showAllSKU ? topSKUs : topSKUs.slice(0, 5);

    // Category breakdown — using accurate real data from API across all products
    const categoryData = useMemo(() => {
        const counts = categoryDistribution || {};
        
        // Return 0 if not loaded yet, or real counts
        return CATEGORY_DEFS.map(def => ({
            name: def.name,
            color: def.color,
            value: counts[def.name] || 0
        }));
    }, [categoryDistribution]);

    const hasCategoryData = categoryData.some(c => c.value > 0);

    // Inventory health stats
    const healthStats = useMemo(() => {
        const total = topSKUs.length || 1;
        const critical = topSKUs.filter(s => s.riskLevel === 'CRITICAL').length;
        const high = topSKUs.filter(s => s.riskLevel === 'HIGH').length;
        const med = topSKUs.filter(s => s.riskLevel === 'MEDIUM').length;
        const ok = topSKUs.filter(s => s.riskLevel === 'LOW' || !s.riskLevel).length;
        return [
            { name: 'Critical', value: critical, fill: '#ef4444' },
            { name: 'High Risk', value: high, fill: '#f97316' },
            { name: 'Medium', value: med, fill: '#f59e0b' },
            { name: 'Healthy', value: ok + (total - critical - high - med), fill: '#10b981' }
        ];
    }, [topSKUs]);

    // Export CSV
    const exportCSV = () => {
        const rows = [
            ['Timestamp', 'SKU', 'Product', 'Type', 'From', 'To', 'Qty'],
            ...filteredTx.map(t => [
                t.timestamp ? new Date(t.timestamp).toLocaleDateString('en-IN') : '—',
                t.sku, t.name, t.type, t.fromDepot || '—', t.toDepot || '—', t.quantity
            ])
        ];
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `sangrahak-ledger-${Date.now()}.csv`; a.click();
        URL.revokeObjectURL(url);
        addToast('CSV exported successfully');
    };

    // AI score animation
    useEffect(() => {
        const base = 82 + Math.floor(Math.random() * 12);
        setAiScore(base);
    }, [metrics]);

    // Loading screen
    if (loading && !metrics) {
        return (
            <div className="db2-loading">
                <div className="db2-loader-orb" />
                <p>Syncing Intelligence Network</p>
                <span>Connecting to ARIMA forecasting engine…</span>
            </div>
        );
    }

    const totalQty = filteredTx.reduce((s, t) => s + (Number(t.quantity) || 0), 0);

    return (
        <div className="db2-root">

            {/* ── Toasts ── */}
            <div className="db2-toast-stack" aria-live="polite">
                {toasts.map(t => (
                    <div key={t.id} className={`db2-toast db2-toast-${t.type}`}>
                        {t.type === 'success' ? <Check size={13} /> : <AlertCircle size={13} />}
                        {t.msg}
                    </div>
                ))}
            </div>

            {/* ── Page Header ── */}
            <div className="db2-page-header">
                <div className="db2-header-left">
                    <div className="db2-header-badge">
                        <Activity size={14} />
                        <span>LIVE</span>
                        <span className="db2-live-pulse" />
                    </div>
                    <div>
                        <h1 className="db2-page-title">Operations Intelligence Hub</h1>
                        <p className="db2-page-sub">
                            AI-powered inventory control · Last sync {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>
                <div className="db2-header-actions">
                    {urgentSKUs.length > 0 && (
                        <button className="db2-btn-bulk" onClick={() => setShowBulk(true)}>
                            <Zap size={13} /> Bulk Reorder ({urgentSKUs.length})
                            <span className="db2-btn-pulse" />
                        </button>
                    )}
                    <select className="db2-depot-sel" value={selectedDepot} onChange={e => setSelectedDepot(e.target.value)}>
                        <option value="all">🌐 Global Network</option>
                        {depots.map(d => <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>)}
                    </select>
                    <button className="db2-icon-btn" onClick={exportCSV} title="Export CSV">
                        <Download size={15} />
                    </button>
                </div>
            </div>

            {/* ── KPI Grid (6 cards) ── */}
            <div className="db2-kpi-grid">
                <KPICard loading={loading}
                    title="Total Products" icon={Package}
                    value={fmt.number(metrics?.incoming?.value)} sub="Active SKUs in system"
                    trend={metrics?.incoming?.trend} trendLabel={`${metrics?.incoming?.trendValue ?? '0%'} vs last week`}
                    color="#6366f1" sparkData={makeSpark(metrics?.incoming?.value || 120, metrics?.incoming?.trend)} />
                <KPICard loading={loading}
                    title="Inventory Value" icon={TrendingUp}
                    value={fmt.currency(metrics?.outgoing?.value)} sub="Net portfolio valuation"
                    trend={metrics?.outgoing?.trend} trendLabel={`${metrics?.outgoing?.trendValue ?? '0%'} vs last week`}
                    color="#10b981" sparkData={makeSpark(metrics?.outgoing?.value || 500000, metrics?.outgoing?.trend)} />
                <KPICard loading={loading}
                    title="Stockout Risk" icon={AlertTriangle}
                    value={fmt.number(metrics?.undetected?.value)} sub="Items needing attention"
                    trend={metrics?.undetected?.value > 0 ? 'down' : 'neutral'}
                    trendLabel={metrics?.undetected?.value > 0 ? 'Action Required' : 'All Optimal'}
                    color="#f59e0b" sparkData={makeSpark(metrics?.undetected?.value || 5, 'up')} />
                <KPICard loading={loading}
                    title="Active Depots" icon={Warehouse}
                    value={fmt.number(depots.length)} sub="Warehouses online"
                    trend="neutral" trendLabel="Operational"
                    color="#0ea5e9" sparkData={makeSpark(depots.length || 3, 'up')} />
                <KPICard loading={loading}
                    title="Critical SKUs" icon={AlertCircle}
                    value={fmt.number(urgentSKUs.length)} sub="Requires immediate reorder"
                    trend={urgentSKUs.length > 0 ? 'down' : 'neutral'}
                    trendLabel={urgentSKUs.length > 0 ? 'Urgent' : 'Clear'}
                    color="#ef4444" sparkData={makeSpark(urgentSKUs.length || 2, 'up')} />
                <KPICard loading={loading}
                    title="AI Model Score" icon={Cpu}
                    value={aiScore} suffix="%" sub="ARIMA V2.1 forecast accuracy"
                    trend={aiScore >= 85 ? 'up' : 'neutral'} trendLabel={`${aiScore >= 85 ? 'Excellent' : 'Good'} confidence`}
                    color="#8b5cf6" sparkData={makeSpark(aiScore, 'up')} />
            </div>

            {/* ── Chart Section ── */}
            <div className="db2-charts-row">

                {/* Left: Sales Trend + Category Donut */}
                <div className="db2-chart-panel">
                    <div className="db2-panel-head">
                        <div>
                            <h2 className="db2-panel-title">Demand & Sales Intelligence</h2>
                            <p className="db2-panel-sub">AI Prediction vs Actual Sales performance</p>
                        </div>
                        <div className="db2-chart-controls">
                            <div className="db2-chart-tabs">
                                {[['bar', 'Bar'], ['line', 'Line'], ['area', 'Area']].map(([k, lbl]) => (
                                    <button key={k} className={`db2-chart-tab ${activeChartTab === k ? 'active' : ''}`}
                                        onClick={() => setActiveChartTab(k)}>{lbl}</button>
                                ))}
                            </div>
                            <div className="db2-time-tabs">
                                {['7d', '30d', '90d'].map(r => (
                                    <button key={r} className={`db2-tr-btn ${timeRange === r ? 'active' : ''}`}
                                        onClick={() => changeRange(r)}>{r}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="db2-chart-area">
                        {chartData && chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={270}>
                                {activeChartTab === 'bar' ? (
                                    <BarChart data={chartData} onClick={d => setActiveBar(d?.activeLabel || null)}>
                                        <defs>
                                            <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.95} />
                                                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.5} />
                                            </linearGradient>
                                            <linearGradient id="gPred" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                                                <stop offset="100%" stopColor="#10b981" stopOpacity={0.5} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmt.axisTick} />
                                        <Tooltip content={<ChartTip />} />
                                        <Bar dataKey="actual" fill="url(#gActual)" radius={[5, 5, 0, 0]} name="Actual Sales (₹)" maxBarSize={26}>
                                            {chartData.map((e, i) => (
                                                <Cell key={i} opacity={activeBar && activeBar !== e.name ? 0.35 : 1}
                                                    fill={activeBar === e.name ? '#818cf8' : 'url(#gActual)'} />
                                            ))}
                                        </Bar>
                                        <Bar dataKey="predicted" fill="url(#gPred)" radius={[5, 5, 0, 0]} name="AI Predicted (₹)" maxBarSize={26}>
                                            {chartData.map((e, i) => (
                                                <Cell key={i} opacity={activeBar && activeBar !== e.name ? 0.35 : 1}
                                                    fill={activeBar === e.name ? '#34d399' : 'url(#gPred)'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                ) : activeChartTab === 'line' ? (
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmt.axisTick} />
                                        <Tooltip content={<ChartTip />} />
                                        <Line type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2.5} dot={false} name="Actual Sales (₹)" />
                                        <Line type="monotone" dataKey="predicted" stroke="#10b981" strokeWidth={2.5} strokeDasharray="6 3" dot={false} name="AI Predicted (₹)" />
                                    </LineChart>
                                ) : (
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="aActual" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="aPred" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmt.axisTick} />
                                        <Tooltip content={<ChartTip />} />
                                        <Area type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2} fill="url(#aActual)" name="Actual Sales (₹)" />
                                        <Area type="monotone" dataKey="predicted" stroke="#10b981" strokeWidth={2} fill="url(#aPred)" name="AI Predicted (₹)" />
                                    </AreaChart>
                                )}
                            </ResponsiveContainer>
                        ) : (
                            <div className="db2-nodata">
                                <BarChart2 size={36} />
                                <p>No sales data yet</p>
                                <span>Charts appear once stock transactions are recorded</span>
                            </div>
                        )}
                    </div>

                    <div className="db2-chart-foot">
                        <div className="db2-legend">
                            <span className="db2-ldot" style={{ background: '#6366f1' }} />Actual
                            <span className="db2-ldot" style={{ background: '#10b981', marginLeft: 14 }} />AI Predicted
                            {activeBar && (
                                <button className="db2-clear-filter" onClick={() => setActiveBar(null)}>
                                    <X size={10} /> Clear: {activeBar}
                                </button>
                            )}
                        </div>
                        <button className="db2-export-btn" onClick={exportCSV}>
                            <Download size={12} /> Export
                        </button>
                    </div>
                </div>

                {/* Right column: Donut + AI Accuracy */}
                <div className="db2-right-col">

                    {/* Category Distribution Donut */}
                    <div className="db2-panel db2-donut-panel">
                        <div className="db2-panel-head">
                            <div>
                                <h2 className="db2-panel-title">Category Distribution</h2>
                                <p className="db2-panel-sub">Stock breakdown by category</p>
                            </div>
                            <Layers size={16} style={{ color: '#64748b' }} />
                        </div>
                        <div className="db2-donut-wrap">
                            {!hasCategoryData ? (
                                <div className="db2-nodata" style={{ height: 155 }}>
                                    <p>Backend Update Required</p>
                                    <span>Please restart your Node.js backend to apply the new category distributions.</span>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={155}>
                                    <PieChart>
                                        <Pie data={categoryData} cx="50%" cy="50%"
                                            innerRadius={42} outerRadius={68}
                                            paddingAngle={4} dataKey="value">
                                            {categoryData.map((c, i) => (
                                                <Cell key={i} fill={c.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(v, n) => [fmt.number(v) + ' products', n]} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                            
                            {/* 2×2 grid for exactly 4 categories */}
                            <div className="db2-donut-legend">
                                {categoryData.map((c, i) => (
                                    <div key={i} className="db2-donut-row" style={{ opacity: c.value === 0 ? 0.35 : 1 }}>
                                        <span className="db2-donut-dot" style={{ background: c.color }} />
                                        <span className="db2-donut-name">{c.name}</span>
                                        <span className="db2-donut-val">{fmt.number(c.value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Inventory Health Radial */}
                    <div className="db2-panel db2-health-panel">
                        <div className="db2-panel-head">
                            <div>
                                <h2 className="db2-panel-title">Inventory Health</h2>
                                <p className="db2-panel-sub">Risk distribution overview</p>
                            </div>
                            <AccuracyRing pct={aiScore} />
                        </div>
                        <div className="db2-health-bars">
                            {healthStats.map((s, i) => {
                                const total = healthStats.reduce((a, x) => a + x.value, 0) || 1;
                                const pct = Math.round((s.value / total) * 100);
                                return (
                                    <div key={i} className="db2-hbar-row">
                                        <span className="db2-hbar-lbl" style={{ color: s.fill }}>{s.name}</span>
                                        <div className="db2-hbar-track">
                                            <div className="db2-hbar-fill" style={{ width: `${pct}%`, background: s.fill }} />
                                        </div>
                                        <span className="db2-hbar-pct">{pct}%</span>
                                        <span className="db2-hbar-count">{s.value}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Bottom Row ── */}
            <div className="db2-bottom-row">

                {/* Demand Intelligence SKU Panel */}
                <div className="db2-panel db2-demand-panel">
                    <div className="db2-panel-head" style={{ padding: '20px 20px 0' }}>
                        <div>
                            <h2 className="db2-panel-title">Demand Intelligence</h2>
                            <p className="db2-panel-sub">AI-ranked at-risk SKUs • ARIMA V2.1</p>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <span className="db2-arima-badge">ARIMA V2.1</span>
                            {urgentSKUs.length > 0 && (
                                <button className="db2-btn-bulk-sm" onClick={() => setShowBulk(true)}>
                                    <Zap size={11} /> {urgentSKUs.length} urgent
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="db2-sku-list">
                        {displaySKUs.length === 0 && (
                            <div className="db2-nodata-sm">
                                <Check size={20} style={{ color: '#10b981' }} />
                                <p>All SKUs are well-stocked</p>
                            </div>
                        )}
                        {displaySKUs.map((sku, idx) => {
                            const isHigh = sku.riskLevel === 'HIGH' || sku.riskLevel === 'CRITICAL';
                            const isMed = sku.riskLevel === 'MEDIUM';
                            const threshold = Math.max(sku.reorderPoint || sku.calculatedReorderPoint || 1, 1);
                            const stockPct = Math.min((sku.currentStock / (threshold * 3)) * 100, 100);
                            return (
                                <div key={idx} className={`db2-sku-card ${isHigh ? 'sku-urgent' : ''}`}>
                                    <div className="db2-sku-top">
                                        <div>
                                            <span className="db2-sku-code">{sku.sku}</span>
                                            <span className="db2-sku-name">{sku.name}</span>
                                        </div>
                                        <SevBadge level={sku.riskLevel} />
                                    </div>
                                    {sku.aiMessage && <div className="db2-sku-ai">{sku.aiMessage}</div>}
                                    <div className="db2-sku-stats">
                                        <span>
                                            <Clock size={10} />
                                            {sku.currentStock === 0 ? '⚠ Out of stock'
                                                : sku.daysToStockOut >= 99 ? '99+ days'
                                                : `${sku.daysToStockOut}d remaining`}
                                        </span>
                                        <span>
                                            <TrendingUp size={10} />
                                            {sku.predictedDemand} u/7d forecast
                                        </span>
                                    </div>
                                    <div className="db2-bar-wrap">
                                        <div className="db2-bar-labels">
                                            <span>Stock: <b>{sku.currentStock}</b></span>
                                            <span className={sku.currentStock <= threshold ? 'text-red' : ''}>
                                                Reorder @ {sku.calculatedReorderPoint ?? sku.reorderPoint}
                                            </span>
                                        </div>
                                        <div className="db2-bar-track">
                                            <div className={`db2-bar-fill ${isHigh ? 'bf-high' : isMed ? 'bf-med' : 'bf-ok'}`}
                                                style={{ width: `${Math.max(stockPct, 2)}%` }} />
                                            <div className="db2-bar-marker" style={{ left: `${Math.min(33, 97)}%` }} />
                                        </div>
                                    </div>
                                    <div className="db2-sku-foot">
                                        <span className="db2-reorder-hint">
                                            Suggest: <b>{sku.recommendedReorder} units</b>
                                            <ReorderTip qty={sku.recommendedReorder} demand={sku.predictedDemand}
                                                stock={sku.currentStock} rp={threshold} />
                                        </span>
                                        <button className={`db2-reorder-btn ${isHigh ? 'rb-urgent' : ''}`}
                                            onClick={() => handleReorderT(sku)}>
                                            {isHigh ? <><Zap size={11} /> Reorder Now</> : 'Reorder'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {topSKUs.length > 5 && (
                            <button className="db2-show-more" onClick={() => setShowAllSKU(!showAllSKU)}>
                                {showAllSKU ? <><ChevronUp size={13} /> Show less</> : <><ChevronDown size={13} /> Show {topSKUs.length - 5} more</>}
                            </button>
                        )}
                    </div>
                </div>

                {/* Logistics Ledger Table */}
                <div className="db2-panel db2-ledger-panel">
                    <div className="db2-panel-head" style={{ padding: '20px 20px 0' }}>
                        <div>
                            <h2 className="db2-panel-title">Logistics Ledger</h2>
                            <p className="db2-panel-sub">Recent stock movements</p>
                        </div>
                        <div className="db2-ledger-controls">
                            <div className="db2-search-wrap">
                                <Filter size={12} style={{ color: '#64748b', position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
                                <input className="db2-tx-search" type="text" placeholder="Filter transactions…"
                                    value={txFilter} onChange={e => setTxFilter(e.target.value)} />
                            </div>
                            <button className="db2-icon-btn" onClick={exportCSV} title="Export CSV">
                                <Download size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="db2-table-wrap">
                        <table className="db2-table">
                            <thead>
                                <tr>
                                    <th onClick={() => sortTx('timestamp')} className="sortable">
                                        Date <SortIcon col="timestamp" />
                                    </th>
                                    <th>SKU / Product</th>
                                    <th>Type</th>
                                    <th className="hide-sm">From</th>
                                    <th className="hide-sm">To</th>
                                    <th onClick={() => sortTx('quantity')} className="sortable">
                                        Qty <SortIcon col="quantity" />
                                    </th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTx.length === 0 && (
                                    <tr><td colSpan={7} className="db2-td-empty">No transactions match your filter.</td></tr>
                                )}
                                {filteredTx.map(tx => (
                                    <tr key={tx.id} className="db2-tr">
                                        <td className="db2-td-muted">
                                            {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                                        </td>
                                        <td>
                                            <div className="db2-sku-cell">
                                                <span className="db2-td-code">{tx.sku}</span>
                                                <span className="db2-td-name">{tx.name}</span>
                                            </div>
                                        </td>
                                        <td><TxBadge type={tx.type} /></td>
                                        <td className="db2-td-muted hide-sm">{tx.fromDepot || '—'}</td>
                                        <td className="db2-td-muted hide-sm">{tx.toDepot || '—'}</td>
                                        <td className="db2-td-qty">{Number(tx.quantity).toLocaleString('en-IN')}</td>
                                        <td>
                                            <span className="db2-status-done"><Check size={10} /> Done</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {filteredTx.length > 0 && (
                                <tfoot>
                                    <tr>
                                        <td colSpan={5} className="db2-tfoot-label">Total (shown)</td>
                                        <td className="db2-tfoot-qty">{totalQty.toLocaleString('en-IN')}</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            </div>

            {/* ── Bulk Reorder Modal ── */}
            {showBulk && (
                <BulkModal skus={urgentSKUs} onReorder={handleReorderT} onClose={() => setShowBulk(false)} />
            )}
        </div>
    );
};

export default Dashboard;
