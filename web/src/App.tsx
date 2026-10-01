import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Shell } from '@/components/Shell'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Home from '@/pages/Home'
import Degrees from '@/pages/Degrees'
import Courses from '@/pages/Courses'
import DegreeDetail from '@/pages/DegreeDetail'
import CourseDetail from '@/pages/CourseDetail'
import Reminders from '@/pages/Reminders'
import Profile from '@/pages/Profile'
import Schedule from '@/pages/Schedule'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import { PageSkeleton } from '@/components/Skeleton'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="app-boot">
        <PageSkeleton variant="home" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <Shell>{children}</Shell>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/degrees"
        element={
          <ProtectedRoute>
            <Degrees />
          </ProtectedRoute>
        }
      />
      <Route
        path="/degrees/:degreeId"
        element={
          <ProtectedRoute>
            <DegreeDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/courses"
        element={
          <ProtectedRoute>
            <Courses />
          </ProtectedRoute>
        }
      />
      <Route
        path="/courses/:courseId"
        element={
          <ProtectedRoute>
            <CourseDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <Schedule />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reminders"
        element={
          <ProtectedRoute>
            <Reminders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
