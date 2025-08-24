'use client';

import React, { useEffect, useState } from 'react';
import {
  Typography, Box, Card, CardContent, Paper, Avatar, Chip, Button,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, Badge, Stack, CircularProgress
} from '@mui/material';
import {
  Warning as WarningIcon,
  Person as PersonIcon,
  PersonAdd as PersonAddIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  AccessTime as TimeIcon
} from '@mui/icons-material';
// WebSockets removed — component shows latest unknowns fetched on mount
interface UnknownFacesProps { }

type UnknownRow = {
  attendance: {
    id: string;
    unknown_id: string;
    date: string;
    status: 'checked-in' | 'checked-out' | 'absent';
    check_in_at?: string | null;
    check_out_at?: string | null;
    last_seen_at?: string | null;
    visits?: number;
    snapshot_url?: string | null;
  };
  person: {
    id: string;
    fingerprint: string;
    label?: string | null;
    last_snapshot_url?: string | null;
  } | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001';
const today = new Date().toISOString().slice(0, 10);

function fmt(iso?: string | null) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString(); } catch { return '-'; }
}

export default function UnknownFaces(_: UnknownFacesProps) {
  const [rows, setRows] = useState<UnknownRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UnknownRow | null>(null);
  const [enrollDialog, setEnrollDialog] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');

  async function fetchUnknowns() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/unknowns?date=${today}`);
      const js = await res.json();
      setRows(Array.isArray(js?.data) ? js.data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUnknowns();
    // No socket events — rely on manual refresh or background polling
  }, []);

  const handleEnrollOpen = (row: UnknownRow) => {
    setSelected(row);
    setEnrollDialog(true);
  };

  const handleEnrollClose = () => {
    setEnrollDialog(false);
    setSelected(null);
    setStudentName('');
    setStudentId('');
  };

  const handleEnrollStudent = async () => {
    // Stub: you can implement /enroll_from_url backend to convert snapshot_url -> student
    // or redirect to your standard Enrollment page with the snapshot URL prefilled.
    console.log('Enroll unknown using snapshot:', selected?.attendance.snapshot_url, { studentName, studentId });
    handleEnrollClose();
  };

  const count = rows.length;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Paper elevation={0} sx={{ p: 3, mb: 4, bgcolor: 'warning.main', color: 'white', borderRadius: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <WarningIcon sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                Unknown Faces
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.9 }}>
                Unrecognized individuals detected by the system
              </Typography>
            </Box>
          </Box>
          <Badge badgeContent={count} color="error">
            <Chip
              icon={<TimeIcon />}
              label={'Monitoring'}
              sx={{ bgcolor: 'white', color: 'warning.main', fontWeight: 'bold' }}
            />
          </Badge>
        </Box>
      </Paper>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress />
        </Stack>
      ) : count === 0 ? (
        <Card elevation={2} sx={{ borderRadius: 3, textAlign: 'center', p: 6 }}>
          <PersonIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Unknown Faces Detected
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The system is running smoothly. All detected faces are recognized.
          </Typography>
        </Card>
      ) : (
        <>
          <Alert
            severity="warning"
            sx={{ mb: 3, borderRadius: 2 }}
            action={
              <Button color="inherit" size="small" onClick={fetchUnknowns}>
                Refresh
              </Button>
            }
          >
            {count} unknown face{count > 1 ? 's' : ''} detected today.
          </Alert>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 3 }}>
            {rows.map((row) => {
              const img = row.attendance.snapshot_url || row.person?.last_snapshot_url || undefined;
              const fp8 = row.person?.fingerprint?.slice(0, 8) || 'unknown';

              return (
                <Card key={row.attendance.id} elevation={2} sx={{ borderRadius: 3 }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <Avatar
                        src={img}
                        sx={{ width: 80, height: 80, bgcolor: 'grey.300', fontSize: '2rem' }}
                      >
                        ?
                      </Avatar>

                      <Box sx={{ textAlign: 'center', width: '100%' }}>
                        <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                          Unknown {fp8}
                        </Typography>

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
                          <Chip
                            size="small"
                            label={row.attendance.status === 'checked-in' ? 'Checked In' : 'Checked Out'}
                            color={row.attendance.status === 'checked-in' ? 'success' : 'warning'}
                          />
                          <Typography variant="body2" color="text.secondary">
                            IN: {fmt(row.attendance.check_in_at)} | OUT: {fmt(row.attendance.check_out_at)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Last seen: {fmt(row.attendance.last_seen_at)}
                          </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<PersonAddIcon />}
                            onClick={() => handleEnrollOpen(row)}
                            sx={{ borderRadius: 2 }}
                          >
                            Enroll
                          </Button>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => img && window.open(img, '_blank')}
                          >
                            <VisibilityIcon />
                          </IconButton>
                        </Box>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        </>
      )}

      {/* Enroll Dialog */}
      <Dialog open={enrollDialog} onClose={handleEnrollClose} maxWidth="sm" fullWidth>
        <DialogTitle>Enroll Unknown Person</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Choose a student name & ID. Then enroll using your standard enrollment (photo upload).
          </Alert>
          <Stack spacing={2}>
            <TextField label="Student Name" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
            <TextField label="Student ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEnrollClose}>Cancel</Button>
          <Button variant="contained" onClick={handleEnrollStudent} disabled={!studentName || !studentId}>
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}