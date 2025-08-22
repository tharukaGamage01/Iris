'use client';

import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
} from '@mui/material';
import {
  School as SchoolIcon,
  AccessTime as AccessTimeIcon,
} from '@mui/icons-material';

interface DashboardProps { }

export default function Dashboard(_props: DashboardProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // Set client flag and initial time after hydration
    setIsClient(true);
    setCurrentTime(new Date());

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Prevent hydration mismatch by not rendering time-sensitive content until client-side
  if (!isClient) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 4 }}>
          Iris Attendance System
        </Typography>
        {/* Loading state without time to prevent hydration issues */}
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="textSecondary">
            Loading dashboard...
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      {/* Welcome Header */}
      <Paper elevation={2} sx={{ p: 4, mb: 4, textAlign: 'center', bgcolor: 'primary.main', color: 'white' }}>
        <SchoolIcon sx={{ fontSize: 48, mb: 2 }} />
        <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
          Every Moment Counts
        </Typography>
        <Typography variant="h5" sx={{ opacity: 0.9, mb: 2 }}>
          Where Learning Begins with Being Present
        </Typography>
        <Typography variant="h6" sx={{ opacity: 0.8, fontStyle: 'italic' }}>
          "Success is the sum of small efforts, repeated day in and day out"
        </Typography>
        <Typography variant="body1" sx={{ mt: 3, opacity: 0.85, maxWidth: '600px', mx: 'auto' }}>
          Every student's journey starts with showing up. Track attendance seamlessly,
          celebrate consistency, and build the foundation for academic excellence through presence and participation.
        </Typography>
      </Paper>

      {/* Clock Display */}
      <Paper elevation={3} sx={{ p: 6, textAlign: 'center', mb: 4 }}>
        <AccessTimeIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
        <Typography variant="h2" component="div" sx={{ fontFamily: 'monospace', fontWeight: 'bold', color: 'primary.main', mb: 1 }}>
          {isClient && currentTime ? formatTime(currentTime) : '--:--:--'}
        </Typography>
        <Typography variant="h5" color="textSecondary">
          {isClient && currentTime ? formatDate(currentTime) : 'Loading...'}
        </Typography>
      </Paper>
    </Box>
  );
}
