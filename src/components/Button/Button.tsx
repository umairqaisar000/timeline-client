import React from 'react';
import './Button.css';

interface ButtonProps {
    onClick: () => void;
    isRecording?: boolean;
    children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ onClick, isRecording = false, children }) => {
    return (
        <button
            className={`gradient-button ${isRecording ? 'recording' : ''}`}
            onClick={onClick}
        >
            {children}
        </button>
    );
};

export default Button; 