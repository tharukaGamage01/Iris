'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, TextField, IconButton, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, Tooltip, CircularProgress, Stack, Switch, FormControlLabel, Snackbar, Alert,
  Button
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import LoginIcon from '@mui/icons-material/Login';    // check-in
import LogoutIcon from '@mui/icons-material/Logout';  // check-out
import AccessTimeIcon from '@mui/icons-material/AccessTime';

type Student = {
  id: string;
  external_id: string; // studentId
  name: string;
};

type AttendanceRow = {
  id?: string;
  date: string;                 // 'YYYY-MM-DD'
  student_id: string;
  status: 'absent' | 'checked-in' | 'checked-out';
  check_in_at?: string | null;  // ISO
  check_out_at?: string | null; // ISO
  last_seen_at?: string | null; // ISO
  visits?: number;
};

type MergedRow = {
  student_id: string;
  external_id: string;
  name: string;
  status: AttendanceRow['status'];
  checkIn?: string;
  checkOut?: string;
  durationMin?: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001';

// Helpers
function fmtTime(iso?: string | null) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

function minutesBetween(a?: string | null, b?: string | null) {
  if (!a || !b) return undefined;
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (isNaN(t1) || isNaN(t2)) return undefined;
  const diffMs = Math.max(0, t2 - t1);
  return Math.round(diffMs / 60000);
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default function AttendanceView() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [search, setSearch] = useState('');
  const [includeAbsentees, setIncludeAbsentees] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [livePolling, setLivePolling] = useState(true);
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState<number>(600); // default 10 minutes
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'info' }>({
    open: false, msg: '', sev: 'info'
  });

  // Fetch students + today’s attendance
  async function fetchAll() {
    setLoading(true);
    try {
      const [pRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/people`),
        fetch(`${API_BASE}/attendance/daily?date=${encodeURIComponent(date)}`)
      ]);

      if (!pRes.ok) throw new Error(`People HTTP ${pRes.status}`);
      if (!aRes.ok) throw new Error(`Attendance HTTP ${aRes.status}`);

      const pJson = await pRes.json();
      const aJson = await aRes.json();

      // Expect people: [{ id, external_id, name }]
      const ppl: Student[] = Array.isArray(pJson?.data) ? pJson.data
        : Array.isArray(pJson) ? pJson
          : pJson?.people ?? [];

      // Expect attendance: [{ date, student_id, status, check_in_at, check_out_at, ... }]
      const att: AttendanceRow[] = Array.isArray(aJson?.data) ? aJson.data
        : Array.isArray(aJson) ? aJson
          : aJson?.attendance ?? [];

      setStudents(ppl);
      setAttendance(att);
    } catch (e: any) {
      setSnack({ open: true, msg: e?.message || 'Failed to load data', sev: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Polling effect for live updates
  useEffect(() => {
    if (!livePolling) return;
    const interval = setInterval(() => {
      fetchAll();
    }, Math.max(1000, pollIntervalSeconds * 1000));
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePolling, pollIntervalSeconds, date]);

  // Merge students + attendance by student_id
  const rows: MergedRow[] = useMemo(() => {
    const byStudent = new Map<string, AttendanceRow>();
    for (const r of attendance) {
      if (r.student_id) byStudent.set(r.student_id, r);
    }

    return students.map(s => {
      const a = byStudent.get(s.id);
      const status: MergedRow['status'] = (a?.status as any) || 'absent';
      const checkIn = a?.check_in_at ?? null;
      const checkOut = a?.check_out_at ?? null;

      return {
        student_id: s.id,
        external_id: s.external_id,
        name: s.name,
        status,
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined,
        durationMin: minutesBetween(checkIn, checkOut),
      };
    });
  }, [students, attendance]);

  // Filtering
  const filtered = rows.filter(r => {
    if (!includeAbsentees && (r.status === 'absent')) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.external_id.toLowerCase().includes(q);
  });

  // Manual toggle via backend (POST /attendance/seen)
  async function toggleFor(student: MergedRow) {
    try {
      const res = await fetch(`${API_BASE}/attendance/seen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: student.name }) // If you prefer IDs: { external_id: student.external_id }
      });
      if (!res.ok) throw new Error(`Toggle HTTP ${res.status}`);
      const data = await res.json();
      const status = data?.attendance?.status || 'updated';
      setSnack({ open: true, msg: `${student.name} → ${status}`, sev: 'success' });
      await fetchAll();
    } catch (e: any) {
      setSnack({ open: true, msg: e?.message || 'Toggle failed', sev: 'error' });
    }
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main' }}>
            Attendance — {date}
          </Typography>
          {/* <Typography variant="body2" color="text.secondary">
            Check‑ins and check‑outs update live as your camera script posts to <code>/attendance/seen</code>.
          </Typography> */}
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Refresh">
            <span>
              <IconButton onClick={() => fetchAll()} disabled={loading} size="small">
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
          <FormControlLabel
            control={<Switch checked={includeAbsentees} onChange={(_, v) => setIncludeAbsentees(v)} />}
            label="Include absentees"
          />
          <FormControlLabel
            control={<Switch checked={livePolling} onChange={(_, v) => setLivePolling(v)} />}
            label="Live"
          />
          {/* Poll interval is fixed to 10 minutes and hidden from the UI */}
        </Stack>
      </Box>

      {/* Controls */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Search by name or Student ID"
            fullWidth
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <TextField
            label="Date"
            type="date"
            size="small"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: '100%', sm: 220 } }}
          />
        </Stack>
      </Paper>

      {/* Table */}
      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Student ID</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Check‑In</TableCell>
              <TableCell>Check‑Out</TableCell>
              <TableCell align="right">Duration</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  No records to display.
                </TableCell>
              </TableRow>
            )}

            {filtered.map((r) => {
              const statusColor =
                r.status === 'checked-in' ? 'success'
                  : r.status === 'checked-out' ? 'warning'
                    : 'default';

              return (
                <TableRow key={r.student_id} hover>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.external_id}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={statusColor as any}
                      label={
                        r.status === 'checked-in' ? 'Checked In'
                          : r.status === 'checked-out' ? 'Checked Out'
                            : 'Absent'
                      }
                    />
                  </TableCell>
                  <TableCell>{fmtTime(r.checkIn)}</TableCell>
                  <TableCell>{fmtTime(r.checkOut)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                      <AccessTimeIcon fontSize="small" />
                      <Typography variant="body2">
                        {r.durationMin != null ? `${r.durationMin} min` : '-'}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      {/* Manual toggle: backend will decide in/out */}
                      <Tooltip title="Toggle (Check‑In / Check‑Out)">
                        <span>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => toggleFor(r)}
                            startIcon={r.status === 'checked-in' ? <LogoutIcon /> : <LoginIcon />}
                          >
                            {r.status === 'checked-in' ? 'Check‑Out' : 'Check‑In'}
                          </Button>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}

            {loading && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnack(s => ({ ...s, open: false }))} severity={snack.sev} sx={{ width: '100%' }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}