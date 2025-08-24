'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Box, Paper, Typography, TextField, Button, Alert, Stack } from '@mui/material';

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
            setInfo('Account created! Please check your inbox and confirm your email before signing in.');
        }
    }, [search]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        setInfo(null);
        setSubmitting(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                if (error.message.toLowerCase().includes('email not confirmed')) {
                    setErr('Email not confirmed. Please open the confirmation link we sent to your email.');
                } else {
                    setErr(error.message);
                }
                return;
            }
            router.replace('/dashboard'); // <-- go to Dashboard after login
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