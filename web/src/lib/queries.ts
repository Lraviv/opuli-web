// שכבת ה-React Query - כל הקריאות עוברות דרך api.ts אל ה-backend (FastAPI).
// שום SQL/אחסון מקומי בדפדפן - הדפדפן הוא קליינט "טיפש" שמדבר רק עם ה-API.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type {
  CatalogCourseRead,
  CourseItemRead,
  CourseItemType,
  CourseRead,
  CourseStatus,
  DegreeRead,
  DegreeTemplateRead,
  ExamRead,
  SemesterRead,
  ThemeModePreference,
  UserRead,
  UserReminderRead,
} from './types'

// ---------------------------------------------------------------------------
// תארים
// ---------------------------------------------------------------------------

export function useDegrees() {
  return useQuery({ queryKey: ['degrees'], queryFn: () => api.get<DegreeRead[]>('/degrees') })
}

export function useDegree(degreeId: number | undefined) {
  const { data: degrees, ...rest } = useDegrees()
  const degree = degrees?.find((d) => d.id === degreeId)
  return { degree, ...rest }
}

export function useDegreeTemplates() {
  return useQuery({ queryKey: ['degree-templates'], queryFn: () => api.get<DegreeTemplateRead[]>('/degree-templates') })
}

export interface DegreeCreatePayload {
  name: string
  institution?: string | null
  target_credits?: number | null
  template?: string | null
}

export function useCreateDegree() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: DegreeCreatePayload) => api.post<DegreeRead>('/degrees', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['degrees'] }),
  })
}

export function useDeleteDegree() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/degrees/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['degrees'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}

// ---------------------------------------------------------------------------
// קטלוג קורסים
// ---------------------------------------------------------------------------

export function useCatalog(degreeId: number | undefined) {
  return useQuery({
    queryKey: ['catalog', degreeId],
    queryFn: () => api.get<CatalogCourseRead[]>(`/degrees/${degreeId}/catalog`),
    enabled: degreeId !== undefined,
  })
}

export interface CatalogCourseSelectPayload {
  status?: CourseStatus
  semester?: string | null
  grade?: number | null
}

export function useSelectCatalogCourse(degreeId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CatalogCourseSelectPayload }) =>
      api.post<CourseRead>(`/catalog-courses/${id}/select`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog', degreeId] })
      qc.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}

// ---------------------------------------------------------------------------
// קורסים אישיים
// ---------------------------------------------------------------------------

export function useCourses(filters?: { degree_id?: number; status?: CourseStatus }) {
  const params = new URLSearchParams()
  if (filters?.degree_id !== undefined) params.set('degree_id', String(filters.degree_id))
  if (filters?.status) params.set('status', filters.status)
  const qs = params.toString()
  return useQuery({
    queryKey: ['courses', filters ?? {}],
    queryFn: () => api.get<CourseRead[]>(`/courses${qs ? `?${qs}` : ''}`),
  })
}

export interface CourseCreatePayload {
  name: string
  credits: number
  degree_id?: number | null
  semester?: string | null
  semester_id?: number | null
  status?: CourseStatus
  category?: string | null
  grade?: number | null
}

export function useCreateCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CourseCreatePayload) => api.post<CourseRead>('/courses', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses'] }),
  })
}

export function useUpdateCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CourseCreatePayload> }) =>
      api.put<CourseRead>(`/courses/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses'] }),
  })
}

export function useDeleteCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/courses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses'] })
      qc.invalidateQueries({ queryKey: ['exams'] })
    },
  })
}

export function useMoveCourseToSemester() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ courseId, semesterId }: { courseId: number; semesterId: number | null }) =>
      api.put<CourseRead>(`/courses/${courseId}/semester`, { semester_id: semesterId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses'] }),
  })
}

// ---------------------------------------------------------------------------
// פריטי התקדמות (שיעורים / מטלות)
// ---------------------------------------------------------------------------

export function useCourseItems(courseId: number | undefined) {
  return useQuery({
    queryKey: ['course-items', courseId],
    queryFn: () => api.get<CourseItemRead[]>(`/courses/${courseId}/items`),
    enabled: courseId !== undefined,
  })
}

export function useAllCourseItems(filters?: { type?: CourseItemType; is_done?: boolean }) {
  const params = new URLSearchParams()
  if (filters?.type) params.set('type', filters.type)
  if (filters?.is_done !== undefined) params.set('is_done', String(filters.is_done))
  const qs = params.toString()
  return useQuery({
    queryKey: ['all-course-items', filters ?? {}],
    queryFn: () => api.get<CourseItemRead[]>(`/course-items${qs ? `?${qs}` : ''}`),
  })
}

export interface CourseItemCreatePayload {
  type: CourseItemType
  title: string
  due_date?: string | null
  order?: number | null
  weight_percent?: number | null
  grade?: number | null
  notes?: string | null
  watched_at?: string | null
}

export function useAddCourseItem(courseId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CourseItemCreatePayload) => api.post<CourseItemRead>(`/courses/${courseId}/items`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-items', courseId] })
      qc.invalidateQueries({ queryKey: ['all-course-items'] })
    },
  })
}

export function useUpdateCourseItem(courseId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CourseItemCreatePayload> & { is_done?: boolean } }) =>
      api.put<CourseItemRead>(`/items/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-items', courseId] })
      qc.invalidateQueries({ queryKey: ['all-course-items'] })
    },
  })
}

export function useBatchAddLessons(courseId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (count: number) => api.post<CourseItemRead[]>(`/courses/${courseId}/items/batch-lessons`, { count }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-items', courseId] })
      qc.invalidateQueries({ queryKey: ['all-course-items'] })
    },
  })
}

export function useDeleteCourseItem(courseId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-items', courseId] })
      qc.invalidateQueries({ queryKey: ['all-course-items'] })
    },
  })
}

// ---------------------------------------------------------------------------
// מבחנים
// ---------------------------------------------------------------------------

export function useExams() {
  return useQuery({ queryKey: ['exams'], queryFn: () => api.get<ExamRead[]>('/exams') })
}

export function useCourseExams(courseId: number | undefined) {
  const { data: exams, ...rest } = useExams()
  return { exams: exams?.filter((e) => e.course_id === courseId) ?? [], ...rest }
}

export interface ExamCreatePayload {
  date_time: string
  location?: string | null
  notes?: string | null
  reminder_offsets_minutes?: number[] | null
}

export function useCreateExam(courseId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ExamCreatePayload) => api.post<ExamRead>(`/courses/${courseId}/exams`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams'] }),
  })
}

export function useUpdateExam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ExamCreatePayload> }) =>
      api.put<ExamRead>(`/exams/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams'] }),
  })
}

export function useDeleteExam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/exams/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams'] }),
  })
}

// ---------------------------------------------------------------------------
// תזכורות אישיות
// ---------------------------------------------------------------------------

export function useReminders() {
  return useQuery({ queryKey: ['reminders'], queryFn: () => api.get<UserReminderRead[]>('/reminders/') })
}

export function useAddReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { title: string; due_date?: string | null }) =>
      api.post<UserReminderRead>('/reminders/', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })
}

export function useUpdateReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { title?: string; due_date?: string | null; is_done?: boolean } }) =>
      api.patch<UserReminderRead>(`/reminders/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })
}

export function useDeleteReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/reminders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })
}

// ---------------------------------------------------------------------------
// הגדרות משתמש (שם תצוגה / צבע ראשי / מצב תצוגה) - PATCH /me
// ---------------------------------------------------------------------------

export interface UserSettingsUpdate {
  display_name?: string
  accent_color?: string
  theme_mode?: ThemeModePreference
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UserSettingsUpdate) => api.patch<UserRead>('/me', payload),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  })
}

// ---------------------------------------------------------------------------
// לוח תכנון סמסטרים
// ---------------------------------------------------------------------------

export function useSemesters(degreeId: number | undefined) {
  return useQuery({
    queryKey: ['semesters', degreeId],
    queryFn: () => api.get<SemesterRead[]>(`/degrees/${degreeId}/semesters`),
    enabled: degreeId !== undefined,
  })
}

export function useCreateSemester(degreeId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; sort_order?: number }) =>
      api.post<SemesterRead>(`/degrees/${degreeId}/semesters`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['semesters', degreeId] }),
  })
}

export function useDeleteSemester(degreeId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/semesters/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semesters', degreeId] })
      qc.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}
