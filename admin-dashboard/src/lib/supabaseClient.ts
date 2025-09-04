
'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables');
}

// Create a mock supabase client for when the service is unavailable
const createMockClient = () => ({
    auth: {
        signInWithPassword: async () => ({ error: { message: 'Supabase service unavailable. Please check your connection.' } }),
        signUp: async () => ({ error: { message: 'Supabase service unavailable. Please check your connection.' } }),
        signOut: async () => ({ error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: { message: 'Service unavailable' } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
    },
});

let supabaseClient: any;

try {
    if (supabaseUrl && supabaseAnonKey) {
        supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: false, // Disable auto-refresh to prevent errors
                detectSessionInUrl: true,
                storage: typeof window !== 'undefined' ? window.localStorage : undefined,
                flowType: 'pkce',
            },
            global: {
                headers: {
                    'X-Client-Info': 'iris-admin-dashboard',
                },
                fetch: (url, options = {}) => {
                    // Add timeout to fetch requests
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

                    return fetch(url, {
                        ...options,
                        signal: controller.signal,
                    }).finally(() => {
                        clearTimeout(timeoutId);
                    });
                },
            },
        });
    } else {
        console.warn('Using mock Supabase client due to missing configuration');
        supabaseClient = createMockClient();
    }
} catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    supabaseClient = createMockClient();
}

export const supabase = supabaseClient;