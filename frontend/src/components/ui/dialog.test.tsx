import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Button } from './button'
import { Dialog } from './dialog'

describe('Dialog', () => {
  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('locks body scroll when open and restores on close', () => {
    document.body.style.overflow = 'scroll'
    const { rerender, unmount } = render(
      <Dialog open={true} onClose={() => undefined} title="測試標題">
        <div>內容</div>
      </Dialog>,
    )

    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <Dialog open={false} onClose={() => undefined} title="測試標題">
        <div>內容</div>
      </Dialog>,
    )
    expect(document.body.style.overflow).toBe('scroll')

    unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('renders scrollable body and fixed actions layout', () => {
    render(
      <Dialog
        open={true}
        onClose={() => undefined}
        title="長內容測試"
        actions={<Button type="button">確認</Button>}
      >
        <div data-testid="dialog-content">超長內容</div>
      </Dialog>,
    )

    const contentContainer = screen.getByTestId('dialog-content').parentElement
    expect(contentContainer).not.toBeNull()
    expect(contentContainer?.className).toContain('overflow-y-auto')
    expect(screen.getByRole('button', { name: '確認' })).toBeInTheDocument()
  })
})
