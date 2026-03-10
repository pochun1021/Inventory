import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { apiUrl } from '../api'

type ImportErrorDetail = {
  row: number
  message: string
}

type ImportResponse = {
  total: number
  created: number
  failed: number
  errors: ImportErrorDetail[]
}

const KIND_OPTIONS = {
  物品: 'item',
  財產: 'asset',
  其他: 'other',
} as const

type KindValue = (typeof KIND_OPTIONS)[keyof typeof KIND_OPTIONS]
const KIND_ENTRIES = Object.entries(KIND_OPTIONS) as Array<[string, KindValue]>

const fieldClass = 'rounded-[10px] border border-slate-300 bg-white px-3 py-2.5'
const buttonClass = 'cursor-pointer rounded-[10px] border-none bg-blue-600 px-3 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300'

export function UploadPanel() {
  const [kind, setKind] = useState(KIND_ENTRIES[0][1])
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [result, setResult] = useState<ImportResponse | null>(null)

  const hasErrors = useMemo(() => (result?.errors.length ?? 0) > 0, [result])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null
    setFile(selectedFile)
    setResult(null)
    setErrorMessage('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!file) {
      setErrorMessage('請先選擇要上傳的 .xlsx 檔案。')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('kind', kind)
      formData.append('file', file)

      const response = await fetch(apiUrl('/api/items/import'), {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null)
        const detail =
          typeof errorPayload?.detail === 'string'
            ? errorPayload.detail
            : '上傳失敗，請稍後再試。'
        throw new Error(detail)
      }

      const payload = (await response.json()) as ImportResponse
      setResult(payload)
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage('發生未知錯誤。')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl bg-white p-8 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
      <h2 className="mt-0">資產資料上傳</h2>
      <p className="mt-2 text-slate-500">請選擇類別並上傳 Excel（.xlsx）檔案，系統會自動匯入資料。</p>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-1.5 font-semibold">
          資產類別
          <select className={fieldClass} value={kind} onChange={(event) => setKind(event.target.value as KindValue)}>
            {KIND_ENTRIES.map(([label, value]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 font-semibold">
          上傳檔案
          <input className={fieldClass} type="file" accept=".xlsx" onChange={handleFileChange} />
        </label>

        {file ? <p className="text-slate-700">已選擇：{file.name}</p> : null}

        <button className={buttonClass} type="submit" disabled={isSubmitting}>
          {isSubmitting ? '上傳中...' : '開始上傳'}
        </button>
      </form>

      {errorMessage ? <p className="mt-0.5 rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{errorMessage}</p> : null}

      {result ? (
        <section className="mt-7 border-t border-slate-200 pt-5">
          <h3 className="mt-0">匯入結果</h3>
          <ul className="mb-0 pl-5">
            <li>總筆數：{result.total}</li>
            <li>成功筆數：{result.created}</li>
            <li>失敗筆數：{result.failed}</li>
          </ul>

          {hasErrors ? (
            <div className="mt-4">
              <h4 className="mt-0">錯誤明細</h4>
              <table className="mt-2 w-full border-collapse bg-white">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap border border-slate-200 bg-slate-50 p-2 text-left">列號</th>
                    <th className="whitespace-nowrap border border-slate-200 bg-slate-50 p-2 text-left">原因</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((item) => (
                    <tr key={`${item.row}-${item.message}`}>
                      <td className="whitespace-nowrap border border-slate-200 p-2 text-left">{item.row}</td>
                      <td className="whitespace-nowrap border border-slate-200 p-2 text-left">{item.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-0.5 rounded-[10px] bg-emerald-50 px-3.5 py-3 text-emerald-700">全部資料已成功匯入。</p>
          )}
        </section>
      ) : null}
    </section>
  )
}
