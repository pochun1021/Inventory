import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

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
  物品: 'assets',
  財產: 'supplies',
  其他: 'other',
} as const

type KindValue = (typeof KIND_OPTIONS)[keyof typeof KIND_OPTIONS]
const KIND_ENTRIES = Object.entries(KIND_OPTIONS) as Array<[string, KindValue]>

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

      const response = await fetch('http://localhost:8000/api/items/import', {
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
    <section className="upload-card">
      <h2>資產資料上傳</h2>
      <p className="subtitle">請選擇類別並上傳 Excel（.xlsx）檔案，系統會自動匯入資料。</p>

      <form className="upload-form" onSubmit={handleSubmit}>
        <label>
          資產類別
          <select value={kind} onChange={(event) => setKind(event.target.value as KindValue)}>
            {KIND_ENTRIES.map(([label, value]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          上傳檔案
          <input type="file" accept=".xlsx" onChange={handleFileChange} />
        </label>

        {file ? <p className="file-name">已選擇：{file.name}</p> : null}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '上傳中...' : '開始上傳'}
        </button>
      </form>

      {errorMessage ? <p className="message error">{errorMessage}</p> : null}

      {result ? (
        <section className="result">
          <h3>匯入結果</h3>
          <ul>
            <li>總筆數：{result.total}</li>
            <li>成功筆數：{result.created}</li>
            <li>失敗筆數：{result.failed}</li>
          </ul>

          {hasErrors ? (
            <div className="error-list">
              <h4>錯誤明細</h4>
              <table>
                <thead>
                  <tr>
                    <th>列號</th>
                    <th>原因</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((item) => (
                    <tr key={`${item.row}-${item.message}`}>
                      <td>{item.row}</td>
                      <td>{item.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="message success">全部資料已成功匯入。</p>
          )}
        </section>
      ) : null}
    </section>
  )
}

