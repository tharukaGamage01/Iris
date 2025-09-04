'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Paper, Typography, TextField, Button, Alert, Stack } from '@mui/material';

// Simple session management
const setUserSession = (email: string) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem('user-session', JSON.stringify({ email, loginTime: Date.now() }));
    }
};

const isValidCredentials = (email: string, password: string) => {
    // Basic validation - you can customize these credentials
    const validUsers = [
        { email: 'admin@iris.com', password: 'admin123' },
        { email: 'demo@iris.com', password: 'demo123' },
        { email: email, password: password } // Allow any email/password for demo
    ];

    return validUsers.some(user =>
        user.email.toLowerCase() === email.toLowerCase() && user.password === password
    ) || (email.includes('@') && password.length >= 6); // Basic validation
};

export default function LoginPage() {
    const router = useRouter();
    const search = useSearchParams();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    useEffect(() => {
        if (search.get('registered') === '1') {
            setInfo('Account created successfully! You can now sign in.');
        }
    }, [search]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        setInfo(null);
        setSubmitting(true);

        try {
            // Basic validation
            if (!email || !password) {
                setErr('Please enter both email and password');
                return;
            }

            if (!email.includes('@')) {
                setErr('Please enter a valid email address');
                return;
            }

            if (password.length < 6) {
                setErr('Password must be at least 6 characters');
                return;
            }

            // Simulate login delay
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (isValidCredentials(email, password)) {
                setUserSession(email);
                router.replace('/dashboard');
            } else {
                setErr('Invalid email or password. Try admin@iris.com / admin123');
            }
        } catch (error) {
            setErr('Login failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
            <Paper elevation={2} sx={{ p: 4, width: '100%', maxWidth: 420, borderRadius: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Welcome back</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Sign in to your account</Typography>

                {info && <Alert severity="info" sx={{ mb: 2 }}>{info}</Alert>}
                {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

                <form onSubmit={handleLogin}>
                    <Stack spacing={2}>
                        <TextField
                            label="Email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            fullWidth
                        />
                        <Button type="submit" variant="contained" disabled={submitting} sx={{ borderRadius: 2, py: 1.2 }}>
                            {submitting ? 'Signing in…' : 'Sign In'}
                        </Button>
                        <Button variant="text" onClick={() => router.push('/auth/register')} sx={{ borderRadius: 2 }}>
                            New here? Register
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Box>
    );
}