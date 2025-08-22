'use client';

import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Card,
  Paper,
  Tabs,
  Tab,
  LinearProgress,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Divider
} from '@mui/material';
import { TrendingUp as TrendingUpIcon, Assessment as AssessmentIcon, School as SchoolIcon } from '@mui/icons-material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function Analytics() {
  const [tabValue, setTabValue] = useState(0);
  const [totalStudents, setTotalStudents] = useState<number | null>(null);
  const [presentCount, setPresentCount] = useState<number>(0);
  const [checkedOutCount, setCheckedOutCount] = useState<number>(0);
  const [absentCount, setAbsentCount] = useState<number>(0);
  const [weeklyData, setWeeklyData] = useState<number[] | null>(null);
  const [presentStudents, setPresentStudents] = useState<any[]>([]);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);

  useEffect(() => {
    fetchPeopleAndAttendance();
  }, []);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001';

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  const fetchPeopleAndAttendance = async () => {
    try {
      const [peopleRes, attendanceRes] = await Promise.all([
        fetch(`${API_BASE}/people`),
        fetch(`${API_BASE}/attendance/daily?date=${encodeURIComponent(todayStr())}`)
      ]);

      let people: any[] = [];
      if (peopleRes.ok) {
        const js = await peopleRes.json().catch(() => null);
        // support shapes: { data: [...] } | { people: [...] } | [...]
        if (Array.isArray(js)) people = js;
        else if (Array.isArray(js?.data)) people = js.data;
        else if (Array.isArray(js?.people)) people = js.people;
        else people = [];
      }

      let records: any[] = [];
      if (attendanceRes.ok) {
        const js = await attendanceRes.json().catch(() => null);
        // support shapes: { attendance: [...] } | { data: [...] } | { records: [...] } | [...]
        if (Array.isArray(js)) records = js;
        else if (Array.isArray(js?.attendance)) records = js.attendance;
        else if (Array.isArray(js?.data)) records = js.data;
        else if (Array.isArray(js?.records)) records = js.records;
        else records = [];
      }

      const total = people.length;

      const byKey: Record<string, any> = {};
      records.forEach(r => {
        // support both person_id and student_id
        const pid = r.student_id ? String(r.student_id) : (r.person_id ? String(r.person_id) : null);
        const ext = r.external_id ? String(r.external_id) : null;
        const name = r.name ? String(r.name).toLowerCase() : null;
        // prefer student id, then external id, then name
        if (pid) byKey[pid] = r;
        if (ext) byKey[ext] = r;
        if (name) byKey[name] = r;
      });

      let present = 0;
      let checkedOut = 0;
      let absent = 0;

      if (total === 0) {
        present = 0;
        checkedOut = 0;
        absent = 0;
      } else {
        people.forEach((p: any) => {
          const keys = [String(p.id || ''), String(p.external_id || ''), (p.name || '').toLowerCase()];
          const rec = keys.map(k => byKey[k]).find(Boolean) || null;
          if (!rec) {
            absent += 1;
            return;
          }
          // Determine status from explicit status or check-in/out timestamps
          const statusRaw = rec.status || '';
          const hasIn = !!(rec.check_in_at || rec.check_in || rec.check_in_time);
          const hasOut = !!(rec.check_out_at || rec.check_out || rec.check_out_time);
          let status = 'present';
          if (String(statusRaw).toLowerCase().includes('out') || hasOut) status = 'checked-out';
          else if (String(statusRaw).toLowerCase().includes('in') || hasIn) status = 'checked-in';

          if (status === 'checked-out') {
            present += 1;
            checkedOut += 1;
          } else if (status === 'checked-in') {
            present += 1;
          } else {
            absent += 1;
          }
        });
      }

      setTotalStudents(total);
      setPresentCount(present);
      setCheckedOutCount(checkedOut);
      setAbsentCount(absent);

      const presentArr: any[] = [];
      const absentArr: any[] = [];
      people.forEach((p: any) => {
        const keys = [String(p.id || ''), String(p.external_id || ''), (p.name || '').toLowerCase()];
        const rec = keys.map(k => byKey[k]).find(Boolean) || null;
        if (!rec) {
          absentArr.push(p);
          return;
        }
        const hasIn = !!(rec.check_in_at || rec.check_in || rec.check_in_time);
        const hasOut = !!(rec.check_out_at || rec.check_out || rec.check_out_time);
        let status = 'present';
        if (String(rec.status || '').toLowerCase().includes('out') || hasOut) status = 'checked-out';
        else if (String(rec.status || '').toLowerCase().includes('in') || hasIn) status = 'checked-in';

        // normalize record fields for the UI to use check_in_at / check_out_at
        const normalized = {
          ...rec,
          check_in_time: rec.check_in_at || rec.check_in || rec.check_in_time,
          check_out_time: rec.check_out_at || rec.check_out || rec.check_out_time
        };

        presentArr.push({ ...p, status, record: normalized });
      });

      setPresentStudents(presentArr);
      setAbsentStudents(absentArr);

      try {
        const days = Array.from({ length: 5 }).map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (4 - i));
          return d.toISOString().split('T')[0];
        });

        const dayResponses = await Promise.all(days.map(d => fetch(`${API_BASE}/attendance/daily?date=${d}`)));
        const dayJson = await Promise.all(dayResponses.map(r => (r.ok ? r.json().catch(() => null) : null)));
        const counts: number[] = dayJson.map((js: any) => {
          if (!js) return 0;
          if (typeof js.attendance_count === 'number') return js.attendance_count;
          if (Array.isArray(js.attendance)) return js.attendance.length;
          if (Array.isArray(js.data)) return js.data.length;
          if (Array.isArray(js.records)) return js.records.length;
          if (Array.isArray(js)) return js.length;
          return 0;
        });

        setWeeklyData(counts);
      } catch (e) {
        console.warn('Failed to load weekly data', e);
        setWeeklyData(null);
      }
    } catch (e) {
      console.warn('Failed to load analytics data', e);
      setTotalStudents(null);
      setPresentCount(0);
      setCheckedOutCount(0);
      setAbsentCount(0);
      setPresentStudents([]);
      setAbsentStudents([]);
      setWeeklyData(null);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => setTabValue(newValue);

  const formatTimestamp = (ts?: string | number | null) => {
    if (!ts) return null;
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return String(ts);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, sm: 3 } }}>
      {/* Clean header with reduced visual weight */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main', mb: 1 }}>
          Attendance Analytics
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Monitor student attendance and performance
        </Typography>
      </Box>

      {/* Simplified stats card */}
      <Card elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 4 }}>
        <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h2" sx={{ fontWeight: 700, color: 'primary.main', lineHeight: 1 }}>
              {totalStudents !== null ? totalStudents : '-'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Total Students
            </Typography>
          </Box>
          <Chip
            label={`${presentCount} present`}
            color="primary"
            variant="filled"
            sx={{
              fontSize: '0.875rem',
              fontWeight: 500,
              px: 2,
              py: 1,
              height: 'auto'
            }}
          />
        </Box>
      </Card>

      {/* Clean tabbed interface */}
      <Card elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            sx={{
              px: 3,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 500,
                minHeight: 60
              }
            }}
          >
            <Tab label="Daily Attendance" icon={<SchoolIcon />} iconPosition="start" />
            <Tab label="Weekly Performance" icon={<TrendingUpIcon />} iconPosition="start" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
              Daily Attendance
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
              {/* Present students with cleaner design */}
              <Box sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                bgcolor: 'background.paper',
                overflow: 'hidden'
              }}>
                <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'success.main' }}>
                    Present ({presentCount})
                  </Typography>
                </Box>
                {presentStudents.length === 0 ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">No students present</Typography>
                  </Box>
                ) : (
                  <List sx={{ p: 0 }}>
                    {presentStudents.map((s, idx) => (
                      <React.Fragment key={s.id || s.external_id || s.name || idx}>
                        <ListItem sx={{ py: 2, px: 2 }}>
                          <ListItemAvatar>
                            <Avatar sx={{
                              bgcolor: String(s.status || '').includes('out') ? 'info.main' : 'success.main',
                              width: 40,
                              height: 40,
                              fontSize: '1rem'
                            }}>
                              {(s.name || '').charAt(0) || '?'}
                            </Avatar>
                          </ListItemAvatar>
                          <ListItemText
                            sx={{ ml: 1 }}
                            primary={
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                                <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                                  {s.name || s.external_id || `#${s.id}`}
                                </Typography>
                                <Chip
                                  label={String(s.status || '').replace('_', '-')}
                                  size="small"
                                  color={String(s.status || '').includes('out') ? 'info' : 'success'}
                                  variant="outlined"
                                  sx={{ fontSize: '0.75rem', height: 24 }}
                                />
                              </Box>
                            }
                            secondary={s.record && (s.record.check_in_time || s.record.check_out_time) ? (
                              <>
                                <Typography component="span" variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                                  In: {s.record.check_in_time ? formatTimestamp(s.record.check_in_time) : '-'}
                                </Typography>
                                <br />
                                <Typography component="span" variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                                  Out: {s.record.check_out_time ? formatTimestamp(s.record.check_out_time) : '-'}
                                </Typography>
                              </>
                            ) : null}
                          />
                        </ListItem>
                        {idx < presentStudents.length - 1 && <Divider sx={{ mx: 2 }} />}
                      </React.Fragment>
                    ))}
                  </List>
                )}
              </Box>

              {/* Absent students with cleaner design */}
              <Box sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                bgcolor: 'background.paper',
                overflow: 'hidden'
              }}>
                <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'error.main' }}>
                    Absent ({absentCount})
                  </Typography>
                </Box>
                {absentStudents.length === 0 ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">No absent students</Typography>
                  </Box>
                ) : (
                  <List sx={{ p: 0 }}>
                    {absentStudents.map((s, idx) => (
                      <React.Fragment key={s.id || s.external_id || s.name || idx}>
                        <ListItem sx={{ py: 2, px: 2 }}>
                          <ListItemAvatar>
                            <Avatar sx={{
                              bgcolor: 'grey.400',
                              width: 40,
                              height: 40,
                              fontSize: '1rem'
                            }}>
                              {(s.name || '').charAt(0) || '?'}
                            </Avatar>
                          </ListItemAvatar>
                          <ListItemText
                            sx={{ ml: 1 }}
                            primary={
                              <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                                {s.name || s.external_id || `#${s.id}`}
                              </Typography>
                            }
                          />
                        </ListItem>
                        {idx < absentStudents.length - 1 && <Divider sx={{ mx: 2 }} />}
                      </React.Fragment>
                    ))}
                  </List>
                )}
              </Box>
            </Box>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
              Weekly Performance
            </Typography>

            <Box sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
              overflow: 'hidden'
            }}>
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Last 5 Days
                </Typography>
              </Box>
              <Box sx={{ p: 3 }}>
                {Array.from({ length: 5 }).map((_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - (4 - i));
                  const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                  const count = (weeklyData && weeklyData[i]) ? weeklyData[i] : 0;
                  const pct = totalStudents && totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0;
                  return (
                    <Box key={label} sx={{ mb: i === 4 ? 0 : 3 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {label}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Typography variant="body2" color="text.secondary">
                            {count} / {totalStudents || 0}
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700, minWidth: '48px', textAlign: 'right' }}>
                            {pct}%
                          </Typography>
                        </Box>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          borderRadius: 1,
                          height: 8,
                          bgcolor: 'grey.200'
                        }}
                        color={pct >= 90 ? 'success' : pct >= 80 ? 'warning' : 'error'}
                      />
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        </TabPanel>
      </Card>
    </Box>
  );
}
