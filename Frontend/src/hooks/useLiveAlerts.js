import { useEffect } from 'react';
import { useSupplierRisk } from '../context/SupplierRiskContext';

// SSE stream goes through the Vite /api proxy (→ http://localhost:5000)
// Using a relative path avoids cross-origin EventSource issues in development.
const SSE_URL = import.meta.env.VITE_NODE_URL
  ? `${import.meta.env.VITE_NODE_URL}/api/alerts/stream`
  : '/api/alerts/stream';

export function useLiveAlerts() {
    const { dispatch } = useSupplierRisk();

    useEffect(() => {
        const es = new EventSource(SSE_URL);

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
