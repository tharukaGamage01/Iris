export interface Student {
  id: string;
  name: string;
  external_id: string;
  email?: string;
  enrollmentDate: string;
  images: string[];
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  timestamp: string;
  type: 'entry' | 'exit';
  confidence: number;
  image?: string;
}

export interface UnknownFace {
  id: string;
  timestamp: string;
  image: string;
  confidence: number;
  location?: string;
}

export interface AnalyticsData {
  totalStudents: number;
  presentToday: number;
  absentToday: number;
  averageAttendance: number;
  dailyAttendance: { date: string; count: number }[];
  weeklyAttendance: { week: string; count: number }[];
  monthlyAttendance: { month: string; count: number }[];
}

export interface DashboardStats {
  studentsPresent: number;
  totalStudents: number;
  todayAttendance: number;
  unknownFacesToday: number;
  recentActivity: AttendanceRecord[];
}
