import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
//
// הערה: בכוונה משתמשים כאן ב-__dirname הגלובלי (ולא ב-import.meta.dirname) -
// זה מכריח את Vite ליפול חזרה ל-config loader הרגיל (JS) במקום ה-loader
// ה"native" (מבוסס rolldown) שדורש בינארי native ספציפי לפלטפורמה, ולא תמיד
// זמין (ראה אזהרת configLoader). האזהרה שקטה ולא משפיעה על ה-build בפועל.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
