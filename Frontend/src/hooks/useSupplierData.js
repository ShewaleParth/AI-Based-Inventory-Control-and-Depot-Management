import { useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useSupplierRisk } from '../context/SupplierRiskContext';

const FLASK = import.meta.env.VITE_FLASK_URL || 'http://localhost:5001';
const POLL_MS = 30_000;

export function useSupplierData() {
    const { dispatch } = useSupplierRisk();
    const timerRef = useRef(null);

    const fetchAll = useCallback(async () => {
        try {
            const [suppRes, kpiRes] = await Promise.all([
                axios.get(`${FLASK}/api/supplier/risk-overview`),
                axios.get(`${FLASK}/api/supplier/kpis`),
            ]);
            dispatch({ type: 'SET_SUPPLIERS', payload: suppRes.data });
            dispatch({ type: 'SET_KPIS', payload: kpiRes.data });
            dispatch({ type: 'SET_ERROR', payload: null });
        } catch (err) {
            dispatch({
                type: 'SET_ERROR', payload:
                    'Backend unavailable — showing cached data. Check Flask server.'
            });
        }
    }, [dispatch]);

    useEffect(() => {
        fetchAll();
        timerRef.current = setInterval(fetchAll, POLL_MS);
        return () => clearInterval(timerRef.current);
    }, [fetchAll]);

    return { refetch: fetchAll };
}
