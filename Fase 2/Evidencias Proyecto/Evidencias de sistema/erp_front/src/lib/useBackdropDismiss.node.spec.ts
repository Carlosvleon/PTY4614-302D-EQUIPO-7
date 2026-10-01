import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldDismissBackdrop } from './useBackdropDismiss.ts';

describe('shouldDismissBackdrop', () => {
  it('no cierra si el pointerdown fue dentro de la tarjeta', () => {
    assert.equal(
      shouldDismissBackdrop({
        pointerDownOnBackdrop: false,
        pointerUpOnBackdrop: true,
        clickOnBackdrop: true,
      }),
      false,
    );
  });

  it('cierra si el clic completo fue en el fondo', () => {
    assert.equal(
      shouldDismissBackdrop({
        pointerDownOnBackdrop: true,
        pointerUpOnBackdrop: true,
        clickOnBackdrop: true,
      }),
      true,
    );
  });
});
