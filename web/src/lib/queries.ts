// שכבת ה-React Query - כל הקריאות עוברות דרך api.ts אל ה-backend (FastAPI).
// שום SQL/אחסון מקומי בדפדפן - הדפדפן הוא קליינט "טיפש" שמדבר רק עם ה-API.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type {
  AssignmentKind,
  CatalogCourseRead,
  ClassSessionRead,
  CourseItemRead,
  CourseItemType,
  CourseRead,
  CourseStatus,
  DegreeRead,
  DegreeRequirementRead,
  DegreeTemplateRead,
  ExamRead,
  ExamTerm,
  LinkRead,
  SemesterRead,
  StudyTopicRead,
  ThemeModePreference,
  TipRead,
  TipSort,
  TipsPage,
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
  icon?: string | null
  template?: string | null
}

export function useCreateDegree() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: DegreeCreatePayload) => api.post<DegreeRead>('/degrees', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['degrees'] }),
  })
}

export function useUpdateDegree() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Omit<DegreeCreatePayload, 'template'>> }) =>
      api.put<DegreeRead>(`/degrees/${id}`, payload),
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
  exam_weight?: number | null
  min_exam_grade?: number | null
  pass_grade?: number | null
  min_assignments_count?: number | null
  min_assignments_weight?: number | null
  assignments_shield?: boolean
  course_code?: string | null
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
  kind?: AssignmentKind | null
  is_mandatory?: boolean
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
  const key = ['course-items', courseId]
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CourseItemCreatePayload> & { is_done?: boolean } }) =>
      api.put<CourseItemRead>(`/items/${id}`, payload),
    // עדכון מיידי ברשימה (למשל סימון "הוגשה"), וחזרה אחורה אם השרת נכשל
    onMutate: async ({ id, payload }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<CourseItemRead[]>(key)
      qc.setQueryData<CourseItemRead[]>(key, (old) => old?.map((i) => (i.id === id ? ({ ...i, ...payload } as CourseItemRead) : i)))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
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
  term?: ExamTerm | null
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
  avatar_icon?: string | null
  email_notify_assignments?: boolean
  email_notify_exams?: boolean
  email_notify_reminders?: boolean
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UserSettingsUpdate) => api.patch<UserRead>('/me', payload),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  })
}

// ---------------------------------------------------------------------------
// משוב / דיווח באגים - נשלח במייל למפתחת (POST /feedback)
// ---------------------------------------------------------------------------

export type FeedbackCategory = 'bug' | 'idea' | 'other'

export function useSendFeedback() {
  return useMutation({
    mutationFn: (payload: { category: FeedbackCategory; message: string; page?: string }) =>
      api.post<{ status: string }>('/feedback', payload),
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

export function useUpdateSemester(degreeId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name?: string; sort_order?: number } }) =>
      api.put<SemesterRead>(`/semesters/${id}`, payload),
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

// ---------------------------------------------------------------------------
// חומר לימוד (נושאים לסימון בכל קורס)
// ---------------------------------------------------------------------------

export function useStudyTopics(courseId: number) {
  return useQuery({
    queryKey: ['topics', courseId],
    queryFn: () => api.get<StudyTopicRead[]>(`/courses/${courseId}/topics`),
  })
}

export function useAddStudyTopics(courseId: number) {
  const qc = useQueryClient()
  return useMutation({
    // נושא אחד -> POST רגיל; כמה (הדבקת רשימה) -> batch
    mutationFn: async (titles: string[]): Promise<StudyTopicRead[]> =>
      titles.length === 1
        ? [await api.post<StudyTopicRead>(`/courses/${courseId}/topics`, { title: titles[0] })]
        : api.post<StudyTopicRead[]>(`/courses/${courseId}/topics/batch`, { titles }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topics', courseId] }),
  })
}

export function useUpdateStudyTopic(courseId: number) {
  const qc = useQueryClient()
  const key = ['topics', courseId]
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { title?: string; is_done?: boolean } }) =>
      api.put<StudyTopicRead>(`/topics/${id}`, payload),
    // עדכון אופטימי - הסימון מגיב מיד, וחוזר אחורה אם השמירה נכשלה
    onMutate: async ({ id, payload }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<StudyTopicRead[]>(key)
      qc.setQueryData<StudyTopicRead[]>(key, (old) => old?.map((t) => (t.id === id ? { ...t, ...payload } : t)))
      return { previous }
    },
    onError: (_err, _vars, ctx) => qc.setQueryData(key, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteStudyTopic(courseId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/topics/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topics', courseId] }),
  })
}

// ---------------------------------------------------------------------------
// סדרת מטלות (ממ"ן 11-15 וכו')
// ---------------------------------------------------------------------------

export interface BatchAssignmentsPayload {
  kind: AssignmentKind
  count: number
  start_number?: number | null
  weight_percent?: number | null
  is_mandatory?: boolean
  /** תאריך ההגשה של הראשונה, וכל כמה שבועות הבאה - ריק = בלי תאריכים */
  first_due_date?: string | null
  interval_weeks?: number | null
}

export function useBatchAddAssignments(courseId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: BatchAssignmentsPayload) =>
      api.post<CourseItemRead[]>(`/courses/${courseId}/items/batch-assignments`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-items', courseId] })
      qc.invalidateQueries({ queryKey: ['all-course-items'] })
    },
  })
}

// ---------------------------------------------------------------------------
// דרישות תואר
// ---------------------------------------------------------------------------

export function useDegreeRequirements(degreeId: number | undefined) {
  return useQuery({
    queryKey: ['requirements', degreeId],
    queryFn: () => api.get<DegreeRequirementRead[]>(`/degrees/${degreeId}/requirements`),
    enabled: degreeId !== undefined,
  })
}

export function useReplaceDegreeRequirements(degreeId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (requirements: { category: string; min_credits: number | null }[]) =>
      api.put<DegreeRequirementRead[]>(`/degrees/${degreeId}/requirements`, { requirements }),
    onSuccess: (data) => qc.setQueryData(['requirements', degreeId], data),
  })
}

// ---------------------------------------------------------------------------
// קישורים אישיים - course_id ריק = קישור כללי (מסך הבית)
// ---------------------------------------------------------------------------

function linksKey(courseId: number | null) {
  return ['links', courseId ?? 'global']
}

export function useLinks(courseId: number | null) {
  return useQuery({
    queryKey: linksKey(courseId),
    queryFn: () => api.get<LinkRead[]>(courseId != null ? `/links?course_id=${courseId}` : '/links?scope=global'),
  })
}

export function useCreateLink(courseId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { title: string; url: string }) => api.post<LinkRead>('/links', { ...payload, course_id: courseId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: linksKey(courseId) }),
  })
}

export function useUpdateLink(courseId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { title?: string; url?: string } }) =>
      api.put<LinkRead>(`/links/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: linksKey(courseId) }),
  })
}

export function useDeleteLink(courseId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/links/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: linksKey(courseId) }),
  })
}

// ---------------------------------------------------------------------------
// מפגשים קבועים (מערכת שעות)
// ---------------------------------------------------------------------------

export interface ClassSessionPayload {
  weekday: number
  start_time: string
  end_time: string
  title?: string | null
  location?: string | null
  interval_weeks?: number
  start_date?: string | null
  end_date?: string | null
}

export function useAllSessions() {
  return useQuery({ queryKey: ['sessions'], queryFn: () => api.get<ClassSessionRead[]>('/sessions') })
}

export function useCourseSessions(courseId: number) {
  const { data, ...rest } = useAllSessions()
  return { sessions: data?.filter((s) => s.course_id === courseId) ?? [], ...rest }
}

export function useCreateSession(courseId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ClassSessionPayload) => api.post<ClassSessionRead>(`/courses/${courseId}/sessions`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

export function useUpdateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ClassSessionPayload> }) =>
      api.put<ClassSessionRead>(`/sessions/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

export function useDeleteSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

// ---------------------------------------------------------------------------
// ייצוא ליומן
// ---------------------------------------------------------------------------

// הטוקן נשמר במשתמש (AuthContext) - הקומפוננטה מעדכנת אותו דרך updateUser
export function useRotateCalendarToken() {
  return useMutation({
    mutationFn: () => api.post<{ token: string; path: string }>('/me/calendar-token'),
  })
}

export function useRevokeCalendarToken() {
  return useMutation({
    mutationFn: () => api.delete<void>('/me/calendar-token'),
  })
}

// ---------------------------------------------------------------------------
// עצות מסטודנטים
// ---------------------------------------------------------------------------

export function useCourseTips(courseId: number, sort: TipSort, limit: number) {
  return useQuery({
    queryKey: ['tips', courseId, sort, limit],
    queryFn: () => api.get<TipsPage>(`/courses/${courseId}/tips?sort=${sort}&limit=${limit}`),
    placeholderData: (previous) => previous,
  })
}

export function useTipReplies(postId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['tip-replies', postId],
    queryFn: () => api.get<TipRead[]>(`/tips/${postId}/replies`),
    enabled,
  })
}

function useInvalidateTips(courseId: number) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['tips', courseId] })
    qc.invalidateQueries({ queryKey: ['tip-replies'] })
  }
}

export function useCreateTip(courseId: number) {
  const invalidate = useInvalidateTips(courseId)
  return useMutation({
    mutationFn: (payload: { body: string; parent_id?: number | null }) =>
      api.post<TipRead>(`/courses/${courseId}/tips`, payload),
    onSuccess: invalidate,
  })
}

export function useUpdateTip(courseId: number) {
  const invalidate = useInvalidateTips(courseId)
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => api.patch<TipRead>(`/tips/${id}`, { body }),
    onSuccess: invalidate,
  })
}

export function useDeleteTip(courseId: number) {
  const invalidate = useInvalidateTips(courseId)
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/tips/${id}`),
    onSuccess: invalidate,
  })
}

export function useVoteTip(courseId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: -1 | 0 | 1 }) => api.put<TipRead>(`/tips/${id}/vote`, { value }),
    // מעדכנים את התגובה במקום בלי לטעון מחדש, כדי שהרשימה לא "תקפוץ" בזמן הצבעה
    onSuccess: (updated) => {
      const patch = (t: TipRead): TipRead =>
        t.id === updated.id
          ? { ...t, score: updated.score, my_vote: updated.my_vote }
          : { ...t, replies: t.replies.map(patch) }
      qc.setQueriesData<TipsPage>({ queryKey: ['tips', courseId] }, (old) => old && { ...old, items: old.items.map(patch) })
      qc.setQueriesData<TipRead[]>({ queryKey: ['tip-replies'] }, (old) => old?.map(patch))
    },
  })
}
