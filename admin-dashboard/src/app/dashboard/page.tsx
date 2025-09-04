'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';

// Pages/sections
import Dashboard from '@/components/Dashboard';
import AttendanceView from '@/components/AttendanceView';
import StudentEnrollment from '@/components/StudentEnrollment';
import UnknownFaces from '@/components/UnknownFaces';
import Analytics from '@/components/Analytics';

type TabId = 'dashboard' | 'attendance' | 'enrollment' | 'unknown' | 'analytics';

export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState<TabId>('dashboard');

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return <Dashboard />;

            case 'attendance':
                return <AttendanceView />;

            case 'enrollment':
                return <StudentEnrollment />;

            case 'unknown':
                return <UnknownFaces />;

            case 'analytics':
                return <Analytics />;

            default:
                return null;
        }
    };

    return (
        <AuthGuard>
            <Layout activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as TabId)}>
                {renderContent()}
            </Layout>
        </AuthGuard>
    );
}