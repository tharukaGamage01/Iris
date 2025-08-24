// components/AuthGuard.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';   // <-- use your client
import type { Session } from '@supabase/supabase-js';
import { Box, CircularProgress } from '@mui/material';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<Session | null>(null);

    useEffect(() => {
        let mounted = true;

        // initial session
        supabase.auth.getSession().then(({ data }) => {
            if (!mounted) return;
            setSession(data.session ?? null);
            setLoading(false);
            if (!data.session) router.replace('/auth/login');
        });

        // listen to auth changes
        const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
            if (!mounted) return;
            setSession(s);
            if (!s) router.replace('/auth/login');
        });

        return () => {
            mounted = false;
            sub.subscription.unsubscribe();
        };
    }, [router]);

    if (loading || !session) {
        return (
            <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress />
            </Box>
        );
    }

    return <>{children}</>;
}