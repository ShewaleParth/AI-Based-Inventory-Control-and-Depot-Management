import React from 'react';
import { Package, Truck, AlertCircle, Sparkles, Search, TrendingUp, Bell } from 'lucide-react';
import MetricCard from '../components/MetricCard';
import { useDashboardData } from '../hooks/useDashboardData';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const Dashboard = () => {
    const {
        metrics,
        chartData,
        transactions,
        loading,
        alerts,
        depots,
        topSKUs,
        selectedDepot,
        setSelectedDepot,
        handleReorder
    } = useDashboardData();

    if (loading || !metrics) {
        return (
            <div className="loading-state-purple">
                <div className="spinner"></div>
                <p>Initializing Logistics Network...</p>
                <span className="text-muted-sm">Syncing with AI Forecasting Nodes</span>
            </div>
        );
    }

    const formatValue = (val, isCurrency = false) => {
        if (val === undefined || val === null) return isCurrency ? '₹0' : '0';
        const formatted = val.toLocaleString('en-IN');
        return isCurrency ? `₹${formatted}` : formatted;
    };

    return (
        <div className="dashboard-container">
            <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', width: '100%' }}>
                <MetricCard
                    title="Inbound Stock"
                    value={formatValue(metrics?.incoming?.value, false)}
                    trend={metrics?.incoming?.trend}
                    trendValue={metrics?.incoming?.trendValue}
                    icon={Package}
                    categories={metrics?.incoming?.categories || []}
                />
                <MetricCard
                    title="Outbound Stock"
                    value={formatValue(metrics?.outgoing?.value, true)}
                    trend={metrics?.outgoing?.trend}
                    trendValue={metrics?.outgoing?.trendValue}
                    icon={Truck}
                    categories={metrics?.outgoing?.categories || []}
                />
                <MetricCard
                    title="Stockout Risk"
                    value={formatValue(metrics?.undetected?.value)}
                    trend={metrics?.undetected?.trend}
                    trendValue={metrics?.undetected?.trendValue}
                    icon={AlertCircle}
                    categories={metrics?.undetected?.categories || []}
                />
            </div>

            {/* Floating Alerts Container */}
            <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 9999 }}>
                {alerts && alerts.map(alert => (
                    <div key={alert.id} style={{
                        padding: '12px 20px',
                        background: alert.type === 'error' ? 'var(--danger)' : 'var(--success)',
                        color: '#fff',
                        borderRadius: '8px',
                        boxShadow: 'var(--shadow-md)',
                        fontSize: '13px',
                        fontWeight: '600',
                        animation: 'fadeInUp 0.3s ease forwards'
                    }}>
                        {alert.message}
                    </div>
                ))}
            </div>

            <div className="main-content-row">
                <div className="chart-section">
                    <div className="section-header">
                        <h3>Inventory Overview</h3>
                        <div className="header-controls">
                            <select
                                className="card-select depot-switcher"
                                value={selectedDepot}
                                onChange={(e) => setSelectedDepot(e.target.value)}
                            >
                                <option value="all">Global Network</option>
                                {depots.map(depot => (
                                    <option key={depot._id || depot.id} value={depot._id || depot.id}>{depot.name}</option>
                                ))}
                            </select>
                            <select className="card-select">
                                <option>Weekly Scale</option>
                            </select>
                        </div>
                    </div>
                    <div className="chart-container">
                        {chartData && chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={350}>
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                                    <Tooltip
                                        cursor={{ fill: 'var(--bg-main)' }}
                                        contentStyle={{
                                            backgroundColor: 'var(--bg-card)',
                                            borderColor: 'var(--border)',
                                            borderRadius: '8px',
                                            color: 'var(--text-main)'
                                        }}
                                    />
                                    <Bar dataKey="actual" fill="#cbd5e1" radius={[4, 4, 0, 0]} name="Actual Sales (₹)" />
                                    <Bar dataKey="predicted" fill="#2563eb" radius={[4, 4, 0, 0]} name="AI Predicted Demand (₹)" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="no-data-placeholder">
                                <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                                    No sales transactions recorded yet
                                </p>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                    Sales trend will appear once you record stock-out transactions
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="chart-footer">
                        <div className="footer-btns">
                            <button className="export-btn">CSV ↓</button>
                            <button className="export-btn">PDF ↓</button>
                        </div>
                        <div className="trend-stat">
                            <TrendingUp size={14} className="positive" />
                            <span className="positive">Updated Live</span>
                        </div>
                    </div>
                </div>

                <div className="dashboard-grid">
                    <div className="dashboard-section forecast-section full-width">
                        <div className="section-header">
                            <h3>Demand Intelligence</h3>
                            <div className="ai-badge">ARIMA V2.1 ACTIVE</div>
                        </div>
                        <div className="forecast-list">
                            {topSKUs.map((sku, index) => {
                                const isHigh = sku.riskLevel === 'HIGH';
                                const isMedium = sku.riskLevel === 'MEDIUM';
                                const isArima = sku.forecastSource === 'arima';

                                // Stock health: how full is the bar relative to reorder threshold
                                const threshold = Math.max(sku.reorderPoint || sku.calculatedReorderPoint || 1, 1);
                                const stockPct = Math.min((sku.currentStock / (threshold * 3)) * 100, 100);
                                // Prefer atOrBelowReorder from backend (uses actual DB reorderPoint)
                                const belowReorder = sku.atOrBelowReorder ?? (sku.currentStock <= threshold);

                                const riskClass = isHigh ? 'risk-high' : isMedium ? 'risk-medium' : 'risk-safe';
                                const barClass = isHigh ? 'bar-high' : isMedium ? 'bar-medium' : 'bar-safe';

                                return (
                                    <div key={index} className={`forecast-item ${isHigh ? 'forecast-item--urgent' : ''}`}>
                                        {/* Left: Product identity */}
                                        <div className="forecast-info">
                                            <div className="forecast-badges">
                                                <span className={`fi-source-badge ${isArima ? 'arima' : 'estimated'}`}>
                                                    {isArima ? '⬡ ARIMA' : '~ Est.'}
                                                </span>
                                                <span className={`fi-risk-badge ${riskClass}`}>
                                                    {sku.riskLevel}
                                                </span>
                                            </div>
                                            <span className="sku-label">{sku.sku}</span>
                                            <div className="product-name">{sku.name}</div>
                                            {sku.aiMessage && (
                                                <div className="fi-ai-message">{sku.aiMessage}</div>
                                            )}
                                        </div>

                                        {/* Middle: Demand prediction + stockout */}
                                        <div className="forecast-stats">
                                            <div className="demand-stat">
                                                <TrendingUp size={14} className="trend-up" />
                                                <span>7d demand: <b>{sku.predictedDemand} units</b></span>
                                            </div>
                                            <div className={`fi-days-stat ${isHigh ? 'text-danger' : isMedium ? 'text-warning' : 'text-muted'}`}>
                                                <span>
                                                    {sku.currentStock === 0
                                                        ? '⚠ Out of stock'
                                                        : sku.daysToStockOut >= 99
                                                            ? 'Stocks out in 99+ days'
                                                            : `Stocks out in ${sku.daysToStockOut}d`}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Right: Stock bar + reorder info + button */}
                                        <div className="forecast-action">
                                            <div className="stock-level">
                                                <div className="stock-label-row">
                                                    <span className="stock-label-text">
                                                        Stock: <b>{sku.currentStock}</b>
                                                    </span>
                                                    <span className={`stock-reorder-label ${belowReorder ? 'text-danger' : 'text-muted'}`}>
                                                        Reorder @ {sku.calculatedReorderPoint ?? sku.reorderPoint}
                                                    </span>
                                                </div>
                                                <div className="stock-bar">
                                                    <div
                                                        className={`stock-fill ${barClass}`}
                                                        style={{ width: `${Math.max(stockPct, 2)}%` }}
                                                    />
                                                    {/* Reorder threshold marker */}
                                                    <div
                                                        className="reorder-marker"
                                                        style={{ left: `${Math.min((threshold / (threshold * 3)) * 100, 97)}%` }}
                                                    />
                                                </div>
                                                <div className="fi-reorder-hint">
                                                    Suggest reorder: <b>{sku.recommendedReorder} units</b>
                                                </div>
                                            </div>
                                            <button
                                                className={`reorder-btn ${isHigh ? 'reorder-btn--urgent' : ''}`}
                                                onClick={() => handleReorder(sku)}
                                            >
                                                {isHigh ? '⚡ Reorder Now' : 'Quick Reorder'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {topSKUs.length === 0 && (
                                <div className="no-data-placeholder">No demand intelligence data available yet.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="dashboard-section full-width">
                <div className="section-header">
                    <h3>Logistics Ledger</h3>
                    <div className="header-controls">
                        <input type="text" placeholder="Filter by SKU or Depot..." className="search-input" />
                    </div>
                </div>
                <div className="table-container">
                    <table className="transaction-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>SKU / Product</th>
                                <th>Movement</th>
                                <th>Origin Depot</th>
                                <th>Destination Depot</th>
                                <th>Qty</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map((tx) => (
                                <tr key={tx.id}>
                                    <td className="text-muted">{new Date(tx.timestamp).toLocaleDateString()}</td>
                                    <td>
                                        <div className="sku-cell">
                                            <span className="sku">{tx.sku}</span>
                                            <span className="name">{tx.name}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`transaction-type ${tx.type.toLowerCase()}`}>
                                            {tx.type}
                                        </span>
                                    </td>
                                    <td>{tx.fromDepot || 'Supplier / External'}</td>
                                    <td>{tx.toDepot || 'Customer / Outbound'}</td>
                                    <td className="font-medium">{tx.quantity}</td>
                                    <td>
                                        <span className={`status-badge ${tx.status.toLowerCase()}`}>
                                            {tx.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
