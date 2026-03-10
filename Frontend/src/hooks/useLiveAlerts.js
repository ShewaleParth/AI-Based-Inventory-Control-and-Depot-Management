import { useEffect } from 'react';
import { useSupplierRisk } from '../context/SupplierRiskContext';

const NODE = import.meta.env.VITE_NODE_URL || 'http://localhost:5000';

export function useLiveAlerts() {
    const { dispatch } = useSupplierRisk();

    useEffect(() => {
        const es = new EventSource(`${NODE}/api/alerts/stream`);

        es.onmessage = (event) => {
            try {
                const alert = JSON.parse(event.data);
                dispatch({ type: 'ADD_ALERT', payload: alert });
            } catch (_) { }
        };

        es.onerror = () => {
            console.warn('SSE connection lost — reconnecting...');
        };

        return () => es.close();
    }, [dispatch]);
}
