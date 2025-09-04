'use client';

import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useTheme,
  useMediaQuery,
  Button,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  PersonAdd as PersonAddIcon,
  QuestionMark as QuestionMarkIcon,
  Analytics as AnalyticsIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';

const drawerWidth = 240;

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Home', icon: <DashboardIcon /> },
  { id: 'attendance', label: 'Live Attendance', icon: <PeopleIcon /> },
  { id: 'enrollment', label: 'Enroll Students', icon: <PersonAddIcon /> },
  { id: 'unknown', label: 'Unknown Faces', icon: <QuestionMarkIcon /> },
  { id: 'analytics', label: 'Reports', icon: <AnalyticsIcon /> },
];

// Simple session management
const getUserSession = () => {
  if (typeof window === 'undefined') return null;
  try {
    const session = localStorage.getItem('user-session');
    return session ? JSON.parse(session) : null;
  } catch {
    return null;
  }
};

const clearUserSession = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('user-session');
  }
};

export default function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const router = useRouter();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = async () => {
    clearUserSession();
    router.replace('/auth/login');
  };

  useEffect(() => {
    const session = getUserSession();
    if (session?.email) {
      // Extract name from email or use the full email
      const emailName = session.email.split('@')[0];
      setUserName(emailName.charAt(0).toUpperCase() + emailName.slice(1));
    }
  }, []);

  const drawer = (
    <Box sx={{ height: '100%', bgcolor: '#fafafa' }}>
      <Box sx={{ p: 3, borderBottom: '1px solid #e0e0e0' }}>
        <Typography
          variant="h5"
          sx={{ color: 'primary.main', fontWeight: 'bold', textAlign: 'center' }}
        >
          IRIS
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: 'text.secondary', textAlign: 'center', mt: 0.5 }}
        >
          Attendance System
        </Typography>
      </Box>
      <List sx={{ pt: 2 }}>
        {menuItems.map((item) => (
          <ListItem key={item.id} sx={{ px: 2, mb: 0.5 }}>
            <ListItemButton
              selected={activeTab === item.id}
              onClick={() => {
                onTabChange(item.id);
                if (isMobile) setMobileOpen(false);
              }}
              sx={{
                borderRadius: 2,
                minHeight: 48,
                '&.Mui-selected': {
                  backgroundColor: 'primary.main',
                  color: 'white',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                  '&:hover': {
                    backgroundColor: 'primary.dark',
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'white',
                  },
                },
                '&:hover': {
                  backgroundColor:
                    activeTab === item.id ? 'primary.dark' : 'action.hover',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontSize: '0.9rem',
                  fontWeight: activeTab === item.id ? 600 : 400,
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          bgcolor: 'white',
          borderBottom: '1px solid #e0e0e0',
        }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton
              color="primary"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 500 }}>
              {menuItems.find((item) => item.id === activeTab)?.label}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {userName && (
              <Typography variant="body2" sx={{ color: 'text.primary', mr: 1 }}>
                Hi, {userName}
              </Typography>
            )}
            <Button
              color="error"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
              sx={{ borderRadius: 2 }}
            >
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}