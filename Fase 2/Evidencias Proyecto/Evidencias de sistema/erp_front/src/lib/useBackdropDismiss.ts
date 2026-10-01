import { useRef, type MouseEvent, type PointerEvent } from 'react';

export function shouldDismissBackdrop(args: {
  pointerDownOnBackdrop: boolean;
  pointerUpOnBackdrop: boolean;
  clickOnBackdrop: boolean;
}): boolean {
  return args.pointerDownOnBackdrop && args.pointerUpOnBackdrop && args.clickOnBackdrop;
}

/**
 * Cierra un overlay solo si el gesto empezó y terminó en el backdrop.
 * Evita que un arrastre de texto que suelta fuera de la tarjeta cierre el modal.
 */
export function useBackdropDismiss(onDismiss: () => void) {
  const downOnBackdrop = useRef(false);
  const upOnBackdrop = useRef(false);

  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      upOnBackdrop.current = e.target === e.currentTarget;
    },
    onPointerCancel: () => {
      downOnBackdrop.current = false;
      upOnBackdrop.current = false;
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      const clickOnBackdrop = e.target === e.currentTarget;
      const dismiss = shouldDismissBackdrop({
        pointerDownOnBackdrop: downOnBackdrop.current,
        pointerUpOnBackdrop: upOnBackdrop.current,
        clickOnBackdrop,
      });
      downOnBackdrop.current = false;
      upOnBackdrop.current = false;
      if (dismiss) onDismiss();
    },
  };
}
