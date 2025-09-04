// components/AuthGuard.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';

// Simple session management
const getUserSession = () => {
    if (typeof window === 'undefined') return null;
    try {
        const session = localStorage.getItem('user-session');
        if (!session) return null;
        const parsed = JSON.parse(session);
        // Check if session is not older than 24 hours
        const isExpired = (Date.now() - parsed.loginTime) > (24 * 60 * 60 * 1000);
        return isExpired ? null : parsed;
    } catch {
        return null;
    }
};

const clearUserSession = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem('user-session');
    }
};

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        const session = getUserSession();

        if (session) {
            setIsAuthenticated(true);
        } else {
            clearUserSession();
            router.replace('/auth/login');
        }

        setLoading(false);
    }, [router]);

    if (loading) {
        return (
            <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!isAuthenticated) {
        return null; // Will redirect to login
    }

    return <>{children}</>;
}