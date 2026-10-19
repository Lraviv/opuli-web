// שאילתות ופעולות של עמוד הקהילה (פורום) - מול /forum בשרת
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type {
  ForumAttendee,
  ForumCategory,
  ForumComment,
  ForumCourseActivity,
  ForumFeed,
  ForumPost,
  ForumPostCreate,
  ForumPostDetail,
  ForumSort,
} from './types'

export interface ForumFilter {
  category: ForumCategory | null
  q: string
  sort: ForumSort
  saved: boolean
  courseId: number | null
}

function feedPath(f: ForumFilter, limit: number): string {
  const p = new URLSearchParams({ sort: f.sort, limit: String(limit) })
  if (f.category) p.set('category', f.category)
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.saved) p.set('saved', 'true')
  if (f.courseId != null) p.set('course_id', String(f.courseId))
  return `/forum/posts?${p}`
}

export function useForumFeed(filter: ForumFilter, limit: number) {
  return useQuery({
    queryKey: ['forum', 'feed', filter, limit],
    queryFn: () => api.get<ForumFeed>(feedPath(filter, limit)),
    placeholderData: (previous) => previous,
  })
}

export function useForumPost(postId: number) {
  return useQuery({
    queryKey: ['forum', 'post', postId],
    queryFn: () => api.get<ForumPostDetail>(`/forum/posts/${postId}`),
  })
}

export function useUpcomingEvents() {
  return useQuery({
    queryKey: ['forum', 'upcoming'],
    queryFn: () => api.get<ForumPost[]>('/forum/events/upcoming'),
  })
}

export function useForumCourseActivity() {
  return useQuery({
    queryKey: ['forum', 'my-courses'],
    queryFn: () => api.get<ForumCourseActivity[]>('/forum/my-courses'),
  })
}

export function useAttendees(postId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['forum', 'attendees', postId],
    queryFn: () => api.get<ForumAttendee[]>(`/forum/posts/${postId}/attendees`),
    enabled,
  })
}

function useInvalidateForum() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['forum'] })
}

/** מעדכנים פוסט במקום (בפיד, בעמוד הפוסט ובאירועים הקרובים) בלי לטעון הכול מחדש */
function usePatchPost() {
  const qc = useQueryClient()
  return (updated: ForumPost) => {
    const swap = (p: ForumPost) => (p.id === updated.id ? updated : p)
    qc.setQueriesData<ForumFeed>({ queryKey: ['forum', 'feed'] }, (old) => old && { ...old, items: old.items.map(swap) })
    qc.setQueriesData<ForumPost[]>({ queryKey: ['forum', 'upcoming'] }, (old) => old?.map(swap))
    qc.setQueryData<ForumPostDetail>(['forum', 'post', updated.id], (old) => old && { ...old, post: updated })
  }
}

export function useCreatePost() {
  const invalidate = useInvalidateForum()
  return useMutation({
    mutationFn: (payload: ForumPostCreate) => api.post<ForumPost>('/forum/posts', payload),
    onSuccess: invalidate,
  })
}

export function useUpdatePost() {
  const invalidate = useInvalidateForum()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ForumPostCreate> }) =>
      api.patch<ForumPost>(`/forum/posts/${id}`, payload),
    onSuccess: invalidate,
  })
}

export function useDeletePost() {
  const invalidate = useInvalidateForum()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/forum/posts/${id}`),
    onSuccess: invalidate,
  })
}

export function useVotePost() {
  const patch = usePatchPost()
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: 0 | 1 }) => api.put<ForumPost>(`/forum/posts/${id}/vote`, { value }),
    onSuccess: patch,
  })
}

export function useSavePost() {
  const patch = usePatchPost()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) => api.put<ForumPost>(`/forum/posts/${id}/save`, { value }),
    onSuccess: (updated) => {
      patch(updated)
      // הרשימה "נשמרו" משתנה
      qc.invalidateQueries({ queryKey: ['forum', 'feed', { saved: true }], exact: false })
    },
  })
}

export function useRsvp() {
  const patch = usePatchPost()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, going }: { id: number; going: boolean }) =>
      going ? api.put<ForumPost>(`/forum/posts/${id}/rsvp`) : api.delete<ForumPost>(`/forum/posts/${id}/rsvp`),
    onSuccess: (updated) => {
      patch(updated)
      qc.invalidateQueries({ queryKey: ['forum', 'attendees', updated.id] })
    },
  })
}

export function useModeratePost() {
  const invalidate = useInvalidateForum()
  return useMutation({
    mutationFn: ({ id, action, value }: { id: number; action: 'pin' | 'hide'; value: boolean }) =>
      api.put<ForumPost>(`/forum/posts/${id}/${action}`, { value }),
    onSuccess: invalidate,
  })
}

export function useReport() {
  return useMutation({
    mutationFn: (payload: { target_type: 'post' | 'comment'; target_id: number; reason: string }) =>
      api.post<{ status: string }>('/forum/reports', payload),
  })
}

export function useCreateComment(postId: number) {
  const invalidate = useInvalidateForum()
  return useMutation({
    mutationFn: (payload: { body: string; parent_id?: number | null }) =>
      api.post<ForumComment>(`/forum/posts/${postId}/comments`, payload),
    onSuccess: invalidate,
  })
}

export function useUpdateComment() {
  const invalidate = useInvalidateForum()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => api.patch<ForumComment>(`/forum/comments/${id}`, { body }),
    onSuccess: invalidate,
  })
}

export function useDeleteComment() {
  const invalidate = useInvalidateForum()
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/forum/comments/${id}`),
    onSuccess: invalidate,
  })
}
