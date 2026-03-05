import { UploadPanel } from '../UploadPanel'

export function UploadPage() {
  return (
    <>
      <section className="dashboard-header">
        <h1>資產匯入</h1>
        <p className="subtitle">上傳畫面為獨立頁面，請在此進行 Excel 批次匯入。</p>
      </section>
      <UploadPanel />
    </>
  )
}

