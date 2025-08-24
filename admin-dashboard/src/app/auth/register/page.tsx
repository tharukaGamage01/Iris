'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Box, Paper, Typography, TextField, Button, Alert, Stack } from '@mui/material';

export default function RegisterPage() {
    const router = useRouter();
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        setSubmitting(true);
        try {
            const emailRedirectTo =
                typeof window !== 'undefined'
                    ? `${window.location.origin}/auth/login`
                    : undefined;

            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: fullName },
                    emailRedirectTo, // user will confirm and then come back here
                },
            });
            if (error) throw error;

            // Send them to login with a flag so we can show "check your email"
            router.replace('/auth/login?registered=1');
        } catch (e: any) {
            setErr(e.message || 'Failed to register');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
            <Paper elevation={2} sx={{ p: 4, width: '100%', maxWidth: 420, borderRadius: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Create an account</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Register to access the dashboard
                </Typography>

                {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

                <form onSubmit={handleRegister}>
                    <Stack spacing={2}>
                        <TextField
                            label="Full name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                            fullWidth
                            autoComplete="name"
                        />
                        <TextField
                            label="Email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            fullWidth
                            autoComplete="email"
                        />
                        <TextField
                            label="Password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            helperText="At least 6 characters"
                            fullWidth
                            autoComplete="new-password"
                        />
                        <Button type="submit" variant="contained" disabled={submitting} sx={{ borderRadius: 2, py: 1.2 }}>
                            {submitting ? 'Creating account…' : 'Register'}
                        </Button>
                        <Button variant="text" onClick={() => router.push('/auth/login')} sx={{ borderRadius: 2 }}>
                            Back to Login
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Box>
    );
}