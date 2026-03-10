import React, { createContext, useContext, useState } from 'react';

const NavigationContext = createContext(null);

export const NavigationProvider = ({ children }) => {
    const [activeItem, setActiveItem] = useState('Dashboard');

    // Pending state to pass along to the target page (e.g. pre-selected product for reorder)
    const [navigationState, setNavigationState] = useState(null);

    const navigateTo = (item, state = null) => {
        setNavigationState(state);
        setActiveItem(item);
    };

    return (
        <NavigationContext.Provider value={{ activeItem, setActiveItem, navigationState, setNavigationState, navigateTo }}>
            {children}
        </NavigationContext.Provider>
    );
};

export const useNavigation = () => {
    const ctx = useContext(NavigationContext);
    if (!ctx) throw new Error('useNavigation must be used inside NavigationProvider');
    return ctx;
};
