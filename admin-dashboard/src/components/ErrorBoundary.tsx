'use client';

import React from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';

interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    ErrorBoundaryState
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
                    <Box sx={{ maxWidth: 500, textAlign: 'center' }}>
                        <Alert severity="error" sx={{ mb: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Something went wrong
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                {this.state.error?.message || 'An unexpected error occurred'}
                            </Typography>
                            <Button
                                variant="contained"
                                onClick={() => {
                                    // Clear local storage and reload
                                    localStorage.clear();
                                    window.location.href = '/auth/login';
                                }}
                            >
                                Reset and Go to Login
                            </Button>
                        </Alert>
                    </Box>
                </Box>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
