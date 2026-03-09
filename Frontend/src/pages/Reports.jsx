import React, { useState, useMemo } from 'react';
import {
    FileText, Download, Trash2, RefreshCw, ChevronRight,
    Package, Warehouse, TrendingUp, DollarSign, AlertTriangle,
    CheckCircle, Clock, XCircle, Sparkles, Eye, BarChart3,
    PieChart as PieChartIcon, Activity, Zap, ArrowRight, Filter
} from 'lucide-react';
import {
    PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useReportsData } from '../hooks/useReportsData';
import '../styles/Reports.css';

// Report type configuration
const REPORT_CATEGORIES = {
    inventory: {
        label: 'Inventory',
        icon: Package,
        color: '#6366f1',
        gradient: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
        types: [
            { id: 'inventory-summary', name: 'Inventory Summary', description: 'Complete inventory overview with AI insights across all depots', icon: '📊' },
            { id: 'stock-levels', name: 'Stock Levels', description: 'Current stock distribution analysis per depot', icon: '📦' },
            { id: 'low-stock', name: 'Low Stock Alert', description: 'Critical items needing immediate reorder attention', icon: '⚠️' },
            { id: 'stock-movement', name: 'Stock Movement', description: 'Inflow/outflow patterns and trends analysis', icon: '🔄' }
        ]
    },
    depot: {
        label: 'Depot & Warehouse',
        icon: Warehouse,
        color: '#0891b2',
        gradient: 'linear-gradient(135deg, #0891b2 0%, #22d3ee 100%)',
        types: [
            { id: 'depot-analysis', name: 'Depot Analysis', description: 'Deep dive into specific depot performance metrics', icon: '🏭', needsDepot: true },
            { id: 'capacity-analysis', name: 'Capacity Analysis', description: 'Utilization rates and capacity optimization insights', icon: '📏' },
            { id: 'depot-comparison', name: 'Depot Comparison', description: 'Side-by-side comparative analysis of all depots', icon: '⚖️' }
        ]
    },
    financial: {
        label: 'Financial',
        icon: DollarSign,
        color: '#059669',
        gradient: 'linear-gradient(135deg, #059669 0%, #34d399 100%)',
        types: [
            { id: 'inventory-valuation', name: 'Inventory Valuation', description: 'Total value assessment across categories and storage', icon: '💰' },
            { id: 'cost-analysis', name: 'Cost Analysis', description: 'Holding, operational & transaction cost breakdown', icon: '📉' },
            { id: 'profit-loss', name: 'Profit & Loss', description: 'Revenue vs costs with margin analysis', icon: '💹' }
        ]
    },
    analytics: {
        label: 'Analytics & Forecasting',
        icon: TrendingUp,
        color: '#dc2626',
        gradient: 'linear-gradient(135deg, #dc2626 0%, #f87171 100%)',
        types: [
            { id: 'trend-analysis', name: 'Trend Analysis', description: 'Movement patterns, seasonality and future projections', icon: '📈' },
            { id: 'forecast-accuracy', name: 'Forecast Accuracy', description: 'AI prediction accuracy metrics and variance analysis', icon: '🎯' },
            { id: 'turnover-rate', name: 'Turnover Rate', description: 'Inventory turnover and fast/slow mover identification', icon: '🔁' }
        ]
    }
};

const CHART_COLORS = ['#6366f1', '#0891b2', '#059669', '#dc2626', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="reports-chart-tooltip">
                <p className="tooltip-label">{label}</p>
                {payload.map((entry, index) => (
                    <p key={index} className="tooltip-value" style={{ color: entry.color }}>
                        {entry.name}: <strong>{typeof entry.value === 'number' ? entry.value.toLocaleString('en-IN') : entry.value}</strong>
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

const Reports = () => {
    const {
        stats, analytics, reports, depots,
        loading, generatingType, activeReport, error,
        generateReport, downloadReport, deleteReport,
        dismissActiveReport, refreshData
    } = useReportsData();

    const [activeCategory, setActiveCategory] = useState('inventory');
    const [selectedDepotId, setSelectedDepotId] = useState('');
    const [reportFilter, setReportFilter] = useState('all');
    const [expandedInsight, setExpandedInsight] = useState(null);

    // Derive latest completed report with AI summary 
    const latestAISummary = useMemo(() => {
        const completed = reports.filter(r => r.status === 'completed' && r.aiSummary?.executive);
        return completed.length > 0 ? completed[0] : null;
    }, [reports]);

    const filteredReports = useMemo(() => {
        if (reportFilter === 'all') return reports;
        return reports.filter(r => r.status === reportFilter);
    }, [reports, reportFilter]);

    const handleGenerate = async (reportType, needsDepot = false) => {
        const targetId = needsDepot ? selectedDepotId : null;
        if (needsDepot && !targetId) {
            alert('Please select a depot first');
            return;
        }
        try {
            await generateReport(reportType, targetId, 'pdf');
        } catch (err) {
            // error already set by hook
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const formatCurrency = (value) => {
        if (!value && value !== 0) return '₹0';
        if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
        if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
        if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
        return `₹${value.toLocaleString('en-IN')}`;
    };

    if (loading) {
        return (
            <div className="loading-state-purple">
                <div className="spinner"></div>
                <p>Loading Reports Intelligence...</p>
                <span className="text-muted-sm">Aggregating data from all depots</span>
            </div>
        );
    }

    return (
        <div className="reports-page">
            {/* Header */}
            <div className="reports-header">
                <div className="reports-header-left">
                    <h1 className="reports-title">Reports & Intelligence</h1>
                    <p className="reports-subtitle">AI-powered insights for better decision making</p>
                </div>
                <div className="reports-header-right">
                    <button className="reports-refresh-btn" onClick={refreshData} title="Refresh data">
                        <RefreshCw size={16} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="reports-stats-grid">
                <div className="report-stat-card">
                    <div className="stat-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                        <FileText size={20} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Total Reports</span>
                        <span className="stat-value">{stats?.totalReports || 0}</span>
                    </div>
                </div>
                <div className="report-stat-card">
                    <div className="stat-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                        <Zap size={20} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Generated Today</span>
                        <span className="stat-value">{stats?.generatedToday || 0}</span>
                    </div>
                </div>
                <div className="report-stat-card">
                    <div className="stat-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                        <Sparkles size={20} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">AI Analyses</span>
                        <span className="stat-value">{reports.filter(r => r.aiSummary?.executive).length}</span>
                    </div>
                </div>
                <div className="report-stat-card">
                    <div className="stat-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                        <AlertTriangle size={20} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Critical Alerts</span>
                        <span className="stat-value">{analytics?.summaryMetrics?.criticalAlerts || 0}</span>
                    </div>
                </div>
            </div>

            {/* Active Report Processing Banner */}
            {activeReport && activeReport.status === 'processing' && (
                <div className="report-processing-banner">
                    <div className="processing-content">
                        <div className="processing-spinner-sm"></div>
                        <div className="processing-info">
                            <span className="processing-title">AI is analyzing your data...</span>
                            <span className="processing-sub">{activeReport.reportType?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                        </div>
                    </div>
                    <div className="processing-progress">
                        <div className="progress-bar-track">
                            <div className="progress-bar-fill" style={{ width: `${activeReport.progress || 10}%` }}></div>
                        </div>
                        <span className="progress-text">{activeReport.progress || 10}%</span>
                    </div>
                </div>
            )}

            {/* Completed Report Banner */}
            {activeReport && activeReport.status === 'completed' && (
                <div className="report-completed-banner">
                    <div className="completed-content">
                        <CheckCircle size={20} />
                        <div className="completed-info">
                            <span className="completed-title">Report ready!</span>
                            <span className="completed-sub">{activeReport.reportType?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                        </div>
                    </div>
                    <div className="completed-actions">
                        <button className="btn-download-sm" onClick={() => downloadReport(activeReport.id, activeReport.fileName)}>
                            <Download size={14} /> Download
                        </button>
                        <button className="btn-dismiss" onClick={dismissActiveReport}>
                            <XCircle size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* AI Insights Section */}
            {activeReport?.status === 'completed' && activeReport?.aiSummary?.executive && (
                <div className="ai-insights-panel">
                    <div className="insights-header">
                        <div className="insights-header-left">
                            <Sparkles size={18} className="sparkle-icon" />
                            <h3>AI Executive Summary</h3>
                        </div>
                        <span className="ai-badge-sm">Powered by LLaMA-3.3-70B</span>
                    </div>

                    <div className="executive-summary-card">
                        <p>{activeReport.aiSummary.executive}</p>
                    </div>

                    {activeReport.aiSummary.metrics && (
                        <div className="ai-metrics-row">
                            {Object.entries(activeReport.aiSummary.metrics).map(([key, value]) => (
                                <div key={key} className="ai-metric-chip">
                                    <span className="metric-chip-label">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                    <span className="metric-chip-value">{value}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="insights-grid">
                        {activeReport.aiSummary.keyInsights?.length > 0 && (
                            <div className="insight-column">
                                <h4><Eye size={14} /> Key Insights</h4>
                                <ul>
                                    {activeReport.aiSummary.keyInsights.map((insight, i) => (
                                        <li key={i}>{insight}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {activeReport.aiSummary.recommendations?.length > 0 && (
                            <div className="insight-column recommendations">
                                <h4><Zap size={14} /> Recommendations</h4>
                                <ul>
                                    {activeReport.aiSummary.recommendations.map((rec, i) => (
                                        <li key={i}>{rec}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {activeReport.aiSummary.alerts?.length > 0 && activeReport.aiSummary.alerts[0] !== 'None' && (
                        <div className="ai-alerts-row">
                            {activeReport.aiSummary.alerts.map((alert, i) => (
                                <div key={i} className="ai-alert-item">
                                    <AlertTriangle size={14} />
                                    <span>{alert}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Visual Analytics Section */}
            {analytics && (
                <div className="visual-analytics-section">
                    <div className="section-header-reports">
                        <h2><BarChart3 size={20} /> Inventory Analytics Overview</h2>
                        <span className="live-data-badge"><Activity size={12} /> Live Data</span>
                    </div>

                    <div className="charts-grid">
                        {/* Stock Distribution Pie Chart */}
                        <div className="chart-card">
                            <div className="chart-card-header">
                                <h3><PieChartIcon size={16} /> Stock Distribution</h3>
                            </div>
                            <div className="chart-card-body">
                                {analytics.stockDistribution?.some(d => d.value > 0) ? (
                                    <ResponsiveContainer width="100%" height={250}>
                                        <PieChart>
                                            <Pie
                                                data={analytics.stockDistribution.filter(d => d.value > 0)}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={55}
                                                outerRadius={90}
                                                dataKey="value"
                                                stroke="none"
                                                paddingAngle={3}
                                            >
                                                {analytics.stockDistribution.filter(d => d.value > 0).map((entry, index) => (
                                                    <Cell key={index} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="no-chart-data"><Package size={24} /><span>No product data available</span></div>
                                )}
                                <div className="chart-legend-custom">
                                    {analytics.stockDistribution?.map((item, i) => (
                                        <div key={i} className="legend-item-custom">
                                            <span className="legend-dot" style={{ background: item.color }}></span>
                                            <span className="legend-label">{item.name}</span>
                                            <span className="legend-value">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Transaction Trends Bar Chart */}
                        <div className="chart-card">
                            <div className="chart-card-header">
                                <h3><BarChart3 size={16} /> Transaction Trends (7 Days)</h3>
                            </div>
                            <div className="chart-card-body">
                                {analytics.transactionTrends?.some(t => t.stockIn > 0 || t.stockOut > 0 || t.transfers > 0) ? (
                                    <ResponsiveContainer width="100%" height={280}>
                                        <BarChart data={analytics.transactionTrends} barGap={2}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                            <Bar dataKey="stockIn" name="Stock In" fill="#10b981" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="stockOut" name="Stock Out" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="transfers" name="Transfers" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="no-chart-data"><Activity size={24} /><span>No transactions in last 7 days</span></div>
                                )}
                            </div>
                        </div>

                        {/* Category Value Breakdown */}
                        <div className="chart-card">
                            <div className="chart-card-header">
                                <h3><DollarSign size={16} /> Category Value Breakdown</h3>
                            </div>
                            <div className="chart-card-body">
                                {analytics.categoryBreakdown?.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={280}>
                                        <BarChart data={analytics.categoryBreakdown.slice(0, 8)} layout="vertical" barSize={18}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                                            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                                tickFormatter={(v) => v >= 100000 ? `₹${(v / 100000).toFixed(0)}L` : `₹${(v / 1000).toFixed(0)}K`} />
                                            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false}
                                                width={100} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="value" name="Value (₹)" radius={[0, 6, 6, 0]}>
                                                {analytics.categoryBreakdown.slice(0, 8).map((entry, index) => (
                                                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="no-chart-data"><DollarSign size={24} /><span>No category data available</span></div>
                                )}
                            </div>
                        </div>

                        {/* Depot Utilization */}
                        <div className="chart-card">
                            <div className="chart-card-header">
                                <h3><Warehouse size={16} /> Depot Utilization</h3>
                            </div>
                            <div className="chart-card-body">
                                {analytics.depotUtilization?.length > 0 ? (
                                    <div className="depot-bars-list">
                                        {analytics.depotUtilization.map((depot, i) => (
                                            <div key={i} className="depot-bar-item">
                                                <div className="depot-bar-header">
                                                    <span className="depot-bar-name">{depot.name}</span>
                                                    <span className={`depot-bar-pct ${depot.percentage >= 90 ? 'critical' : depot.percentage >= 75 ? 'warning' : 'normal'}`}>
                                                        {depot.percentage}%
                                                    </span>
                                                </div>
                                                <div className="depot-bar-track">
                                                    <div
                                                        className={`depot-bar-fill ${depot.percentage >= 90 ? 'critical' : depot.percentage >= 75 ? 'warning' : 'normal'}`}
                                                        style={{ width: `${Math.min(depot.percentage, 100)}%` }}
                                                    ></div>
                                                </div>
                                                <div className="depot-bar-footer">
                                                    <span>{depot.used.toLocaleString()} / {depot.capacity.toLocaleString()} units</span>
                                                    <span>{depot.products} SKUs</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="no-chart-data"><Warehouse size={24} /><span>No depot data available</span></div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Low Stock Table */}
                    {analytics.lowStockItems?.length > 0 && (
                        <div className="low-stock-section">
                            <div className="chart-card-header">
                                <h3><AlertTriangle size={16} /> Critical Low-Stock Items</h3>
                                <span className="urgency-count">{analytics.lowStockItems.length} items at risk</span>
                            </div>
                            <div className="low-stock-table-wrap">
                                <table className="low-stock-table">
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th>SKU</th>
                                            <th>Current Stock</th>
                                            <th>Reorder Point</th>
                                            <th>Urgency</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics.lowStockItems.map((item, i) => (
                                            <tr key={i}>
                                                <td className="product-name-cell">{item.name}</td>
                                                <td className="sku-cell-report">{item.sku}</td>
                                                <td className="stock-cell">
                                                    <span className={`stock-value ${item.stock === 0 ? 'zero' : 'low'}`}>{item.stock}</span>
                                                </td>
                                                <td>{item.reorderPoint}</td>
                                                <td>
                                                    <span className={`urgency-badge ${item.urgency}`}>
                                                        {item.urgency === 'critical' ? '🔴' : item.urgency === 'high' ? '🟠' : '🟡'} {item.urgency}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Generate Report Section */}
            <div className="generate-reports-section">
                <div className="section-header-reports">
                    <h2><Sparkles size={20} /> Generate AI Report</h2>
                    <p className="section-desc">Select a category and report type to generate an AI-analyzed report with actionable insights</p>
                </div>

                {/* Category Tabs */}
                <div className="category-tabs">
                    {Object.entries(REPORT_CATEGORIES).map(([key, category]) => (
                        <button
                            key={key}
                            className={`category-tab ${activeCategory === key ? 'active' : ''}`}
                            onClick={() => setActiveCategory(key)}
                            style={activeCategory === key ? { borderColor: category.color, color: category.color } : {}}
                        >
                            <category.icon size={16} />
                            <span>{category.label}</span>
                        </button>
                    ))}
                </div>

                {/* Depot Selector for depot reports */}
                {activeCategory === 'depot' && (
                    <div className="depot-selector">
                        <label>Select Depot:</label>
                        <select
                            value={selectedDepotId}
                            onChange={(e) => setSelectedDepotId(e.target.value)}
                            className="depot-select"
                        >
                            <option value="">Choose a depot...</option>
                            {depots.map(depot => {
                                const depotId = depot._id || depot.id;
                                return (
                                    <option key={depotId} value={depotId}>{depot.name} — {depot.location}</option>
                                );
                            })}
                        </select>
                    </div>
                )}

                {/* Report Type Cards */}
                <div className="report-types-grid">
                    {REPORT_CATEGORIES[activeCategory].types.map((type) => (
                        <div key={type.id} className="report-type-card" style={{ '--accent-color': REPORT_CATEGORIES[activeCategory].color }}>
                            <div className="rtc-header">
                                <span className="rtc-icon">{type.icon}</span>
                                <h4>{type.name}</h4>
                            </div>
                            <p className="rtc-description">{type.description}</p>
                            <button
                                className="rtc-generate-btn"
                                onClick={() => handleGenerate(type.id, type.needsDepot)}
                                disabled={generatingType !== null}
                                style={{ background: REPORT_CATEGORIES[activeCategory].gradient }}
                            >
                                {generatingType === type.id ? (
                                    <>
                                        <div className="btn-spinner"></div>
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={14} />
                                        Generate Report
                                        <ArrowRight size={14} />
                                    </>
                                )}
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Latest AI Analysis Insight Panel */}
            {latestAISummary && !activeReport?.aiSummary?.executive && (
                <div className="latest-ai-panel">
                    <div className="insights-header">
                        <div className="insights-header-left">
                            <Sparkles size={18} className="sparkle-icon" />
                            <h3>Latest AI Analysis — {latestAISummary.title || latestAISummary.reportType?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3>
                        </div>
                        <span className="ai-timestamp">{formatDate(latestAISummary.generatedAt)}</span>
                    </div>
                    <div className="executive-summary-card">
                        <p>{latestAISummary.aiSummary.executive}</p>
                    </div>
                    <div className="insights-grid">
                        {latestAISummary.aiSummary.keyInsights?.length > 0 && (
                            <div className="insight-column">
                                <h4><Eye size={14} /> Key Insights</h4>
                                <ul>
                                    {latestAISummary.aiSummary.keyInsights.slice(0, 4).map((insight, i) => (
                                        <li key={i}>{insight}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {latestAISummary.aiSummary.recommendations?.length > 0 && (
                            <div className="insight-column recommendations">
                                <h4><Zap size={14} /> Recommendations</h4>
                                <ul>
                                    {latestAISummary.aiSummary.recommendations.slice(0, 4).map((rec, i) => (
                                        <li key={i}>{rec}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Report History */}
            <div className="report-history-section">
                <div className="section-header-reports">
                    <h2><Clock size={20} /> Report History</h2>
                    <div className="history-controls">
                        <div className="filter-tabs">
                            {['all', 'completed', 'processing', 'failed'].map(f => (
                                <button
                                    key={f}
                                    className={`filter-tab ${reportFilter === f ? 'active' : ''}`}
                                    onClick={() => setReportFilter(f)}
                                >
                                    {f.charAt(0).toUpperCase() + f.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {filteredReports.length > 0 ? (
                    <div className="reports-list">
                        {filteredReports.map(report => (
                            <div key={report._id || report.id} className="report-list-item">
                                <div className="rli-main">
                                    <div className={`rli-status-dot ${report.status}`}></div>
                                    <div className="rli-info">
                                        <span className="rli-title">{report.title || report.reportType?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                                        <span className="rli-meta">
                                            {formatDate(report.createdAt)} • {report.targetName || 'System Wide'}
                                            {report.fileSize ? ` • ${(report.fileSize / 1024).toFixed(0)} KB` : ''}
                                        </span>
                                    </div>
                                </div>
                                <div className="rli-actions">
                                    {report.status === 'completed' && (
                                        <>
                                            <button
                                                className="rli-action-btn view"
                                                onClick={() => setExpandedInsight(expandedInsight === (report._id || report.id) ? null : (report._id || report.id))}
                                                title="View AI Analysis"
                                            >
                                                <Eye size={14} />
                                            </button>
                                            <button
                                                className="rli-action-btn download"
                                                onClick={() => downloadReport(report._id || report.id, report.fileName)}
                                                title="Download PDF"
                                            >
                                                <Download size={14} />
                                            </button>
                                        </>
                                    )}
                                    {report.status === 'processing' && (
                                        <span className="processing-badge">
                                            <div className="processing-spinner-xs"></div>
                                            {report.progress || 0}%
                                        </span>
                                    )}
                                    {report.status === 'failed' && (
                                        <span className="failed-badge">
                                            <XCircle size={12} /> Failed
                                        </span>
                                    )}
                                    <button
                                        className="rli-action-btn delete"
                                        onClick={() => deleteReport(report._id || report.id)}
                                        title="Delete Report"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>

                                {/* Expanded Insight Panel */}
                                {expandedInsight === (report._id || report.id) && report.aiSummary?.executive && (
                                    <div className="rli-expanded-insights">
                                        <div className="expanded-summary">
                                            <strong>AI Summary:</strong> {report.aiSummary.executive}
                                        </div>
                                        {report.aiSummary.keyInsights?.length > 0 && (
                                            <div className="expanded-insights-list">
                                                <strong>Key Insights:</strong>
                                                <ul>
                                                    {report.aiSummary.keyInsights.map((ins, i) => (
                                                        <li key={i}>{ins}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {report.aiSummary.recommendations?.length > 0 && (
                                            <div className="expanded-insights-list">
                                                <strong>Recommendations:</strong>
                                                <ul>
                                                    {report.aiSummary.recommendations.map((rec, i) => (
                                                        <li key={i}>{rec}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-reports">
                        <FileText size={48} className="empty-icon" />
                        <h3>No reports yet</h3>
                        <p>Generate your first AI-powered report to see it appear here</p>
                    </div>
                )}
            </div>

            {/* Error Toast */}
            {error && (
                <div className="reports-error-toast">
                    <XCircle size={16} />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
};

export default Reports;
