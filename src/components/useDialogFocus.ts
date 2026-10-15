import { useEffect, useId, useRef } from 'react';

const openDialogs: HTMLElement[] = [];

/** Keep keyboard navigation in the top dialog and return to its opener on close. */
export default function useDialogFocus(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!panel.hasAttribute('aria-label') && !panel.hasAttribute('aria-labelledby')) {
      const title = panel.querySelector<HTMLElement>('h1, h2, h3, .modal-title');
      if (title) {
        if (!title.id) title.id = titleId;
        panel.setAttribute('aria-labelledby', title.id);
      } else panel.setAttribute('aria-label', '상세 보기');
    }
    openDialogs.push(panel);
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });

    const topmost = () => openDialogs[openDialogs.length - 1] === panel;
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
    )).filter(node => node.tabIndex >= 0 && !node.closest('[hidden], [inert]') && node.getClientRects().length > 0);
    function onKeyDown(event: KeyboardEvent) {
      if (!topmost()) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); closeRef.current();
      } else if (event.key === 'Tab') {
        const controls = focusables();
        const first = controls[0];
        const last = controls[controls.length - 1];
        const current = document.activeElement;
        if (!first) { event.preventDefault(); panel!.focus(); }
        else if (event.shiftKey && (current === first || current === panel)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (current === last || current === panel)) { event.preventDefault(); first.focus(); }
      }
    }
    function onFocusIn(event: FocusEvent) {
      if (topmost() && !panel!.contains(event.target as Node)) panel!.focus({ preventScroll: true });
    }
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      const index = openDialogs.indexOf(panel);
      if (index >= 0) openDialogs.splice(index, 1);
      const remaining = openDialogs[openDialogs.length - 1];
      if (opener?.isConnected && (!remaining || remaining.contains(opener))) opener.focus({ preventScroll: true });
    };
  }, [open, titleId]);
  return panelRef;
}
