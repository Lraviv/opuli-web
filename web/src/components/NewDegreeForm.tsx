import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, IconPicker, Input } from '@/components/ui'
import { DEFAULT_DEGREE_ICON, DegreeIcons } from '@/lib/constants'
import { useCreateDegree, useDegreeTemplates } from '@/lib/queries'
import type { DegreeRead } from '@/lib/types'
import './NewDegreeForm.css'

const NO_TEMPLATE = '__none__'

/** טופס הוספת תואר: בחירת תבנית (או בלי), שם ואייקון. */
export function NewDegreeForm({ onCreated, onCancel }: { onCreated: (degree: DegreeRead) => void; onCancel?: () => void }) {
  const { data: templates, isLoading: templatesLoading } = useDegreeTemplates()
  const createDegree = useCreateDegree()

  const [template, setTemplate] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [icon, setIcon] = useState<string>(DEFAULT_DEGREE_ICON)

  const selectedTemplate = templates?.find((t) => t.key === template)

  function handleTemplateChange(value: string) {
    setTemplate(value)
    // שם התואר מתמלא מהתבנית, כל עוד המשתמש/ת לא הקלידו שם בעצמם
    if (!nameTouched) setName(templates?.find((t) => t.key === value)?.name ?? '')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!template || !name.trim()) return
    const degree = await createDegree.mutateAsync({
      name: name.trim(),
      icon,
      template: template === NO_TEMPLATE ? null : template,
    })
    onCreated(degree)
  }

  return (
    <form className="nd-form" onSubmit={handleSubmit}>
      <div className="nd-field">
        <label htmlFor="nd-template" className="nd-label">
          תבנית
        </label>
        <p className="nd-hint">
          תבנית טוענת לתואר את קטלוג הקורסים המלא שלו - שמות, נ״ז וקטגוריות - וגם את המוסד ואת מספר הנ״ז הנדרש.
          כך נשאר רק לבחור מהקטלוג את הקורסים שלך. בלי תבנית מתחילים עם קטלוג ריק ומוסיפים קורסים ידנית.
        </p>
        <select
          id="nd-template"
          className="nd-select"
          value={template}
          onChange={(e) => handleTemplateChange(e.target.value)}
          required
        >
          <option value="" disabled>
            {templatesLoading ? 'טוען תבניות…' : 'בחרו תבנית'}
          </option>
          {templates?.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name} ({t.institution})
            </option>
          ))}
          <option value={NO_TEMPLATE}>הוספה ללא תבנית</option>
        </select>
        {selectedTemplate && (
          <p className="nd-template-summary">
            {selectedTemplate.course_count} קורסים בקטלוג · {selectedTemplate.target_credits} נ״ז לתואר ·{' '}
            {selectedTemplate.institution}
          </p>
        )}
      </div>

      <div className="nd-field">
        <label htmlFor="nd-name" className="nd-label">
          שם התואר
        </label>
        <Input
          id="nd-name"
          placeholder="למשל: מדעי המחשב"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setNameTouched(true)
          }}
          required
        />
      </div>

      <div className="nd-field">
        <span className="nd-label" id="nd-icon-label">
          אייקון
        </span>
        <IconPicker icons={DegreeIcons} value={icon} onChange={(v) => setIcon(v ?? DEFAULT_DEGREE_ICON)} label="אייקון התואר" />
      </div>

      {createDegree.isError && <p className="nd-error">{(createDegree.error as Error).message}</p>}

      <div className="nd-actions">
        <Button type="submit" disabled={createDegree.isPending || !template || !name.trim()}>
          {createDegree.isPending ? 'יוצרים…' : 'יצירת תואר'}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            ביטול
          </Button>
        )}
      </div>
    </form>
  )
}
