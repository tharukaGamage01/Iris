'use client';

import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import Layout from '@/components/Layout';
import Dashboard from '@/components/Dashboard';
import AttendanceView from '@/components/AttendanceView';
import StudentEnrollment from '@/components/StudentEnrollment';
import UnknownFaces from '@/components/UnknownFaces';
import Analytics from '@/components/Analytics';
import { useWebSocket } from '@/hooks/useWebSocket';

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { socket, isConnected, error } = useWebSocket();

  // Log WebSocket status for debugging
  useEffect(() => {
    if (error) {
      console.log('WebSocket Status: Disconnected (this is normal without backend server)');
    } else if (isConnected) {
      console.log('WebSocket Status: Connected');
    }
  }, [isConnected, error]);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'attendance':
        return <AttendanceView />;
      case 'enrollment':
        return <StudentEnrollment />;
      case 'unknown':
        return <UnknownFaces socket={socket} isConnected={isConnected} />;
      case 'analytics':
        return <Analytics />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <Box sx={{ minHeight: 'calc(100vh - 64px)' }}>
        {renderActiveTab()}
      </Box>
    </Layout>
  );
}
