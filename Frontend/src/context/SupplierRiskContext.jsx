import { createContext, useContext, useReducer } from 'react';

const SupplierRiskContext = createContext(null);

const initialState = {
    suppliers: [],
    kpis: null,
    alerts: [],
    loading: true,
    error: null,
    lastRefresh: null,
};

function reducer(state, action) {
    switch (action.type) {
        case 'SET_SUPPLIERS': return { ...state, suppliers: action.payload, loading: false, lastRefresh: new Date() };
        case 'SET_KPIS': return { ...state, kpis: action.payload };
        case 'ADD_ALERT': return { ...state, alerts: [action.payload, ...state.alerts].slice(0, 20) };
        case 'SET_ALERTS': return { ...state, alerts: action.payload };
        case 'SET_LOADING': return { ...state, loading: action.payload };
        case 'SET_ERROR': return { ...state, error: action.payload, loading: false };
        default: return state;
    }
}

export function SupplierRiskProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    return (
        <SupplierRiskContext.Provider value={{ state, dispatch }}>
            {children}
        </SupplierRiskContext.Provider>
    );
}

export const useSupplierRisk = () => useContext(SupplierRiskContext);
