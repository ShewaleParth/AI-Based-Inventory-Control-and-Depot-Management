import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../utils/api';

export const useReportsData = () => {
    const [stats, setStats] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [reports, setReports] = useState([]);
    const [depots, setDepots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generatingType, setGeneratingType] = useState(null);
    const [activeReport, setActiveReport] = useState(null);
    const [error, setError] = useState(null);
    const pollIntervalRef = useRef(null);
    const isGeneratingRef = useRef(false);

    const fetchData = useCallback(async () => {
        try {
            const [statsRes, analyticsRes, reportsRes, depotsRes] = await Promise.all([
                api.getReportStats().catch(() => null),
                api.getReportAnalytics().catch(() => null),
                api.getReportsList().catch(() => []),
                api.getDepots().catch(() => ({ depots: [] }))
            ]);

            if (statsRes) setStats(statsRes);
            if (analyticsRes) setAnalytics(analyticsRes);
            if (Array.isArray(reportsRes)) {
                setReports(reportsRes);
            } else if (reportsRes && Array.isArray(reportsRes.reports)) {
                setReports(reportsRes.reports);
            } else {
                setReports(reportsRes || []);
            }
            setDepots(depotsRes?.depots || []);
        } catch (err) {
            console.error('Error fetching reports data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const generateReport = useCallback(async (reportType, targetId = null, format = 'pdf') => {
        // Immediate lock using ref to prevent multiple clicks
        if (isGeneratingRef.current) return;
        isGeneratingRef.current = true;
        setGeneratingType(reportType);
        setError(null);
        try {
            const result = await api.generateReport({
                reportType,
                targetId,
                format
            });

            if (result?.reportId) {
                // Start polling for status
                const reportId = result.reportId;
                setActiveReport({ id: reportId, status: 'processing', progress: 10, reportType });

                pollIntervalRef.current = setInterval(async () => {
                    try {
                        const statusRes = await api.getReportStatus(reportId);
                        setActiveReport(prev => ({
                            ...prev,
                            ...statusRes,
                            id: reportId
                        }));

                        if (statusRes.status === 'completed' || statusRes.status === 'failed') {
                            clearInterval(pollIntervalRef.current);
                            pollIntervalRef.current = null;
                            isGeneratingRef.current = false;
                            setGeneratingType(null);
                            // Refresh reports list
                            fetchData();
                        }
                    } catch (pollErr) {
                        console.error('Polling error:', pollErr);
                    }
                }, 2000);
            } else {
                isGeneratingRef.current = false;
                setGeneratingType(null);
            }

            return result;
        } catch (err) {
            console.error('Error generating report:', err);
            setError(err.response?.data?.error || err.message);
            isGeneratingRef.current = false;
            setGeneratingType(null);
            throw err;
        }
    }, [fetchData]);

    const downloadReport = useCallback(async (reportId, fileName) => {
        try {
            const blob = await api.downloadReport(reportId);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName || 'report.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download error:', err);
            setError('Failed to download report');
        }
    }, []);

    const deleteReport = useCallback(async (reportId) => {
        try {
            await api.deleteReport(reportId);
            setReports(prev => prev.filter(r => (r._id || r.id) !== reportId));
            // Refresh stats
            const statsRes = await api.getReportStats().catch(() => null);
            if (statsRes) setStats(statsRes);
        } catch (err) {
            console.error('Delete error:', err);
            setError('Failed to delete report');
        }
    }, []);

    const dismissActiveReport = useCallback(() => {
        setActiveReport(null);
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, []);

    return {
        stats,
        analytics,
        reports,
        depots,
        loading,
        generatingType,
        activeReport,
        error,
        generateReport,
        downloadReport,
        deleteReport,
        dismissActiveReport,
        refreshData: fetchData
    };
};
