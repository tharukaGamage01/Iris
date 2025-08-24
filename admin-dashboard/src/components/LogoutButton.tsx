// components/LogoutButton.tsx
'use client';

import { Button } from '@mui/material';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
    const router = useRouter();

    const signOut = async () => {
        await supabase.auth.signOut();
        router.replace('/auth/login');
    };

    return (
        <Button variant="outlined" onClick={signOut} sx={{ borderRadius: 2 }}>
            Sign Out
        </Button>
    );
}