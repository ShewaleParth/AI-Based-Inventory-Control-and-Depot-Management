import { useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useSupplierRisk } from '../context/SupplierRiskContext';

// All supplier API calls go through the Vite proxy:
//   /supplier-api/* → http://localhost:5001/api/supplier/*
// This avoids direct cross-origin requests and browser CORS preflight issues.
// To override (e.g. production), set VITE_FLASK_URL env variable.
const SUPPLIER_BASE = import.meta.env.VITE_FLASK_URL
  ? `${import.meta.env.VITE_FLASK_URL}/api/supplier`
  : '/supplier-api';
const POLL_MS = 30_000;

export function useSupplierData() {
    const { dispatch } = useSupplierRisk();
    const timerRef = useRef(null);

    const fetchAll = useCallback(async () => {
        try {
            const [suppRes, kpiRes] = await Promise.all([
                axios.get(`${SUPPLIER_BASE}/risk-overview`),
                axios.get(`${SUPPLIER_BASE}/kpis`),
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
