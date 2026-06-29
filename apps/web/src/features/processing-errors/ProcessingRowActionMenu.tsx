import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

type ProcessingRowActionMenuProps = {
  label: string;
  children: (close: () => void) => ReactNode;
};

function menuPosition(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const width = 184;
  const gap = 6;
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const belowTop = rect.bottom + gap;
  const top = belowTop + 96 < window.innerHeight ? belowTop : Math.max(12, rect.top - 96 - gap);
  return { left, top, width };
}

export function ProcessingRowActionMenu({ label, children }: ProcessingRowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  function close() {
    setOpen(false);
  }

  function toggle() {
    const button = buttonRef.current;
    if (!button) return;
    setPosition(menuPosition(button));
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      if (buttonRef.current) setPosition(menuPosition(buttonRef.current));
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return <div className="processing-row-actions" onClick={(event) => event.stopPropagation()}>
    <button ref={buttonRef} className="processing-row-actions-button" type="button" aria-label={label} aria-expanded={open} onClick={toggle}><MoreHorizontal /></button>
    {open && position && createPortal(<div ref={menuRef} className="processing-row-actions-menu processing-row-actions-portal" style={{ left: position.left, top: position.top, width: position.width }}>
      {children(close)}
    </div>, document.body)}
  </div>;
}
