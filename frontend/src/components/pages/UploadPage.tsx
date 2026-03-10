import { UploadPanel } from '../UploadPanel'

export function UploadPage() {
  return (
    <>
      <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h1 className="mt-0">資產匯入</h1>
        <p className="mt-2 text-slate-500">上傳畫面為獨立頁面，請在此進行 Excel 批次匯入。</p>
      </section>
      <UploadPanel />
    </>
  )
}
