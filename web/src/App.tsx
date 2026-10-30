import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Shell } from '@/components/Shell'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Home from '@/pages/Home'
import Landing from '@/pages/Landing'
import Degrees from '@/pages/Degrees'
import Courses from '@/pages/Courses'
import DegreeDetail from '@/pages/DegreeDetail'
import CourseDetail from '@/pages/CourseDetail'
import Profile from '@/pages/Profile'
import Schedule from '@/pages/Schedule'
import Exams from '@/pages/Exams'
import Community from '@/pages/Community'
import CommunityPost from '@/pages/CommunityPost'
import InfoPage from '@/pages/Info'
import type { InfoPageId } from '@/pages/Info'
import { InfoLayout } from '@/components/InfoLayout'
import { PageSkeleton } from '@/components/Skeleton'
import Connect from '@/pages/Connect'
import { loginPath } from '@/lib/api'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="app-boot">
        <PageSkeleton variant="home" />
      </div>
    )
  }
  if (!user) return <Navigate to={loginPath(location.pathname + location.search)} replace />
  return <Shell>{children}</Shell>
}

/** דפי מידע פתוחים לכולם: מחוברים רואים אותם בתוך האפליקציה, אחרים במסגרת פשוטה */
function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Shell>{children}</Shell> : <InfoLayout>{children}</InfoLayout>
}

/** הכתובת הראשית: מחוברים רואים את הבית, אחרים דף פתיחה שמסביר מה זה */
function HomeRoute() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="app-boot">
        <PageSkeleton variant="home" />
      </div>
    )
  }
  if (!user)
    return (
      <InfoLayout>
        <Landing />
      </InfoLayout>
    )
  return (
    <Shell>
      <Home />
    </Shell>
  )
}

const INFO_ROUTES: InfoPageId[] = ['help', 'faq', 'ai', 'privacy', 'terms']

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      {/* אישור חיבור של אפליקציית AI - עמוד עצמאי בלי הניווט, כמו דף ההתחברות */}
      <Route path="/connect" element={<Connect />} />
      {INFO_ROUTES.map((id) => (
        <Route
          key={id}
          path={`/${id}`}
          element={
            <PublicRoute>
              <InfoPage page={id} />
            </PublicRoute>
          }
        />
      ))}
      <Route path="/" element={<HomeRoute />} />
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
        path="/exams"
        element={
          <ProtectedRoute>
            <Exams />
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
        path="/community"
        element={
          <ProtectedRoute>
            <Community />
          </ProtectedRoute>
        }
      />
      <Route
        path="/community/posts/:postId"
        element={
          <ProtectedRoute>
            <CommunityPost />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reminders"
        element={<Navigate to="/schedule#reminders" replace />}
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
