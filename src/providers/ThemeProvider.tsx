import React, { createContext, ReactNode, useContext } from 'react';

interface ThemeContextType {
    isDark: boolean;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

interface ThemeProviderProps {
    children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const [isDark, setIsDark] = React.useState(true);

    const toggleTheme = () => {
        setIsDark(!isDark);
    };

    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme }}>
            <div className={`theme-container ${isDark ? 'dark' : 'light'}`}>
                {children}
            </div>
        </ThemeContext.Provider>
    );
}; 