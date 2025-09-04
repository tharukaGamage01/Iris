'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Typography, Box, Button, TextField, Stepper, Step, StepLabel,
  Avatar, Chip, Divider, Alert, CircularProgress, Snackbar
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CameraAlt as CameraIcon,
  CheckCircle as CheckIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

const steps = ['Student Info', 'Upload Photo', 'Review & Confirm'];

interface EnrollmentResponse {
  ok: boolean;
  external_id: string;
  name: string;
  image_path?: string;
  image_url?: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001';

function slugifyName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'student';
}

function extFromMime(mime: string) {
  const m = (mime || '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  return 'jpg';
}

export default function StudentEnrollment() {
  const [activeStep, setActiveStep] = useState(0);
  const [studentInfo, setStudentInfo] = useState({ name: '', studentId: '' });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [imageValidation, setImageValidation] = useState({
    isValid: true, warnings: [] as string[], info: [] as string[]
  });

  const [isLoading, setIsLoading] = useState(false);
  const [enrollmentResult, setEnrollmentResult] = useState<EnrollmentResponse | null>(null);
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error' | 'info'; message: string }>({
    open: false, severity: 'info', message: ''
  });

  const plannedBaseName = useMemo(() => slugifyName(studentInfo.name), [studentInfo.name]);
  const canProceedToStep2 = Boolean(studentInfo.name && studentInfo.studentId);
  const canProceedToStep3 = Boolean(canProceedToStep2 && selectedFile && imageValidation.isValid);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const validateImage = async (file: File) => {
    const warnings: string[] = [];
    const info: string[] = [];
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 5) warnings.push('File size is larger than 5MB – may take longer to process');
    if (sizeMB < 0.1) warnings.push('File size is very small – image quality may be poor');

    const url = URL.createObjectURL(file);
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        if (width < 400 || height < 400) warnings.push('Image is smaller than recommended 400x400 pixels');
        const aspect = width / height;
        if (aspect < 0.6 || aspect > 2.1) warnings.push('Image aspect ratio is not ideal for face recognition');
        info.push(`Image size: ${width}×${height}px`);
        info.push(`File size: ${sizeMB.toFixed(2)} MB`);
        info.push(`Aspect ratio: ${aspect.toFixed(2)}:1`);
        resolve();
      };
      img.onerror = () => { warnings.push('Unable to read image file'); resolve(); };
      img.src = url;
    });
    URL.revokeObjectURL(url);

    setImageValidation({ isValid: warnings.length === 0, warnings, info });
  };

  const handleInputChange = (field: 'name' | 'studentId') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setStudentInfo(prev => ({ ...prev, [field]: e.target.value }));
  };

  const triggerFilePick = () => fileInputRef.current?.click();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.type.startsWith('image/')) {
      setToast({ open: true, severity: 'error', message: 'Please select a valid image file' });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setToast({ open: true, severity: 'error', message: 'File size must be less than 5MB' });
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    await validateImage(f);

    if (!canProceedToStep2) {
      setToast({ open: true, severity: 'info', message: 'Fill Student ID & Full Name before proceeding' });
    }
  };

  const handleEnrollStudent = async () => {
    if (!selectedFile || !studentInfo.name || !studentInfo.studentId) {
      setToast({ open: true, severity: 'error', message: 'Please fill all fields and upload a photo' });
      return;
    }
    if (!imageValidation.isValid) {
      setToast({ open: true, severity: 'error', message: 'Please use a better quality image (see recommendations)' });
      return;
    }

    setIsLoading(true);
    setEnrollmentResult(null);
    try {
      // Send everything to backend; backend renames & uploads with service role
      const form = new FormData();
      form.append('external_id', studentInfo.studentId);
      form.append('name', studentInfo.name);
      form.append('file', selectedFile, selectedFile.name);

      const resp = await fetch(`${API_BASE}/enroll`, { method: 'POST', body: form });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `Enrollment failed (HTTP ${resp.status})`);
      }

      const result: EnrollmentResponse = await resp.json();
      setEnrollmentResult(result);
      setActiveStep(2);

      const ext = extFromMime(selectedFile.type);
      setToast({
        open: true,
        severity: 'success',
        message: `Saved ${studentInfo.name} (${studentInfo.studentId}). Image stored as ${plannedBaseName}.${ext}`
      });
    } catch (e: any) {
      setToast({ open: true, severity: 'error', message: e?.message || 'Failed to save student' });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setActiveStep(0);
    setStudentInfo({ name: '', studentId: '' });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setImageValidation({ isValid: true, warnings: [], info: [] });
    setEnrollmentResult(null);
  };

  const canNext =
    (activeStep === 0 && canProceedToStep2) ||
    (activeStep === 1 && canProceedToStep3);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: { xs: 2, sm: 3 } }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main', mb: 1 }}>
          Enroll New Student
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Add students to the system
        </Typography>
      </Box>

      {/* Progress */}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 4, bgcolor: 'background.paper' }}>
        <Box sx={{ p: 3, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Enrollment Progress
          </Typography>
        </Box>
        <Box sx={{ p: 3 }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {steps.map((label) => (
              <Step key={label}><StepLabel>{label}</StepLabel></Step>
            ))}
          </Stepper>
        </Box>
      </Box>

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
        <Box sx={{ p: { xs: 3, sm: 4 } }}>
          {activeStep === 0 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                Student Information
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <TextField
                  label="Student ID"
                  variant="outlined"
                  fullWidth
                  value={studentInfo.studentId}
                  onChange={handleInputChange('studentId')}
                  placeholder="Enter unique student ID"
                  required
                />
                <TextField
                  label="Full Name"
                  variant="outlined"
                  fullWidth
                  value={studentInfo.name}
                  onChange={handleInputChange('name')}
                  placeholder="Enter student's full name"
                  required
                  helperText={
                    selectedFile
                      ? `Will be stored as: ${slugifyName(studentInfo.name)}.${selectedFile ? extFromMime(selectedFile.type) : 'jpg'}`
                      : ''
                  }
                />
              </Box>
            </Box>
          )}

          {activeStep === 1 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                Upload Student Photo
              </Typography>

              <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                The backend will rename the image to <b>{slugifyName(studentInfo.name)}.{selectedFile ? extFromMime(selectedFile.type) : 'jpg'}</b> and store it.
              </Alert>

              {!selectedFile ? (
                <Box
                  sx={{
                    p: 6, textAlign: 'center', border: '2px dashed', borderColor: 'divider',
                    borderRadius: 2, bgcolor: 'grey.50', cursor: 'pointer',
                    '&:hover': { bgcolor: 'grey.100', borderColor: 'primary.main' }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    Click to Upload Photo
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Supported: JPG, PNG, WEBP (Max 5MB)
                  </Typography>
                  <Button variant="contained" startIcon={<CameraIcon />} sx={{ borderRadius: 2 }}>
                    Choose Photo
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                </Box>
              ) : (
                <Box>
                  <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 3, bgcolor: 'background.paper' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Avatar src={previewUrl || undefined} sx={{ width: 120, height: 120, borderRadius: 2 }}>
                        <CameraIcon sx={{ fontSize: 40 }} />
                      </Avatar>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                          Original: {selectedFile.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Will be stored as: <b>{slugifyName(studentInfo.name)}.{extFromMime(selectedFile.type)}</b>
                        </Typography>
                        <Chip label="Photo Ready" color="success" size="small" icon={<CheckIcon />} sx={{ mt: 1 }} />
                      </Box>
                      <Button
                        variant="outlined" color="error" startIcon={<DeleteIcon />}
                        onClick={() => {
                          if (previewUrl) URL.revokeObjectURL(previewUrl);
                          setPreviewUrl(null);
                          setSelectedFile(null);
                          setImageValidation({ isValid: true, warnings: [], info: [] });
                        }}
                        sx={{ borderRadius: 2 }}
                      >
                        Remove
                      </Button>
                    </Box>
                  </Box>

                  {imageValidation.info.length > 0 && (
                    <Box sx={{ mt: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'grey.50' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        Image Analysis:
                      </Typography>
                      <Box component="ul" sx={{ m: 0, pl: 2, '& li': { mb: 0.5 } }}>
                        {imageValidation.info.map((info, i) => (
                          <li key={i}><Typography variant="body2" color="text.secondary">{info}</Typography></li>
                        ))}
                      </Box>

                      {imageValidation.warnings.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'warning.main' }}>
                            ⚠️ Recommendations:
                          </Typography>
                          <Box component="ul" sx={{ m: 0, pl: 2, '& li': { mb: 0.5 } }}>
                            {imageValidation.warnings.map((w, i) => (
                              <li key={i}><Typography variant="body2" color="warning.main">{w}</Typography></li>
                            ))}
                          </Box>
                        </Box>
                      )}

                      {imageValidation.isValid && (
                        <Chip label="✅ Image looks good" color="success" size="small" sx={{ mt: 1 }} />
                      )}
                    </Box>
                  )}

                  <Box sx={{ mt: 3, textAlign: 'center' }}>
                    <Button variant="text" onClick={() => fileInputRef.current?.click()} sx={{ borderRadius: 2 }}>
                      Choose Different Photo
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      onChange={handleFileSelect}
                    />
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {activeStep === 2 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                Review & Confirm
              </Typography>

              {enrollmentResult ? (
                <Box>
                  <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                      Student Saved! 🎉
                    </Typography>
                    <Typography variant="body2">
                      {enrollmentResult.name} ({enrollmentResult.external_id})
                    </Typography>
                  </Alert>

                  <Box sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'grey.50' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                      Details
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography><strong>Student ID:</strong> {enrollmentResult.external_id}</Typography>
                      <Typography><strong>Name:</strong> {enrollmentResult.name}</Typography>
                      {enrollmentResult.image_url && (
                        <Typography><strong>Image URL:</strong> {enrollmentResult.image_url}</Typography>
                      )}
                    </Box>
                  </Box>

                  <Box sx={{ textAlign: 'center' }}>
                    <Button variant="contained" onClick={() => {
                      setActiveStep(0);
                      setStudentInfo({ name: '', studentId: '' });
                      if (previewUrl) URL.revokeObjectURL(previewUrl);
                      setPreviewUrl(null);
                      setSelectedFile(null);
                      setImageValidation({ isValid: true, warnings: [], info: [] });
                      setEnrollmentResult(null);
                    }} startIcon={<AddIcon />} sx={{ borderRadius: 2, px: 4, py: 1.5 }}>
                      Enroll Another Student
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                  Ready to save the student record.
                </Alert>
              )}
            </Box>
          )}

          <Divider sx={{ my: 4 }} />

          {!enrollmentResult && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Button disabled={activeStep === 0} onClick={() => setActiveStep(s => s - 1)} sx={{ borderRadius: 2, px: 3, py: 1.5 }}>
                Back
              </Button>

              {activeStep < steps.length - 1 ? (
                <Button
                  variant="contained"
                  onClick={() => setActiveStep(s => s + 1)}
                  disabled={!(
                    (activeStep === 0 && canProceedToStep2) ||
                    (activeStep === 1 && canProceedToStep3)
                  )}
                  startIcon={<AddIcon />}
                  sx={{ borderRadius: 2, px: 3, py: 1.5 }}
                >
                  Next
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={handleEnrollStudent}
                  disabled={!canProceedToStep3 || isLoading}
                  startIcon={isLoading ? <CircularProgress size={20} /> : <CheckIcon />}
                  sx={{ borderRadius: 2, px: 3, py: 1.5 }}
                >
                  {isLoading ? 'Saving...' : 'Save Student'}
                </Button>
              )}
            </Box>
          )}
        </Box>
      </Box>

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast(s => ({ ...s, open: false }))}
          severity={toast.severity}
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}