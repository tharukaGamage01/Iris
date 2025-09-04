// hooks/useSession.ts
'use client';

import { useEffect, useState } from 'react';

interface LocalSession {
    email: string;
    loginTime: number;
}

export function useSession() {
    const [session, setSession] = useState<LocalSession | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const checkSession = () => {
            if (!mounted) return;

            if (typeof window !== 'undefined') {
                const sessionData = localStorage.getItem('user-session');
                if (sessionData) {
                    try {
                        const parsedSession = JSON.parse(sessionData);
                        const sessionAge = Date.now() - parsedSession.loginTime;
                        const twentyFourHours = 24 * 60 * 60 * 1000;

                        if (sessionAge < twentyFourHours) {
                            setSession(parsedSession);
                        } else {
                            localStorage.removeItem('user-session');
                            setSession(null);
                        }
                    } catch {
                        localStorage.removeItem('user-session');
                        setSession(null);
                    }
                } else {
                    setSession(null);
                }
            }
            setLoading(false);
        };

        checkSession();

        return () => {
            mounted = false;
        };
    }, []);

    return { session, loading };
}