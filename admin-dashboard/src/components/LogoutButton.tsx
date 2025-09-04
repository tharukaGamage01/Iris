// components/LogoutButton.tsx
'use client';

import { Button } from '@mui/material';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
    const router = useRouter();

    const signOut = async () => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('user-session');
        }
        router.replace('/auth/login');
    };

    return (
        <Button variant="outlined" onClick={signOut} sx={{ borderRadius: 2 }}>
            Sign Out
        </Button>
    );
}