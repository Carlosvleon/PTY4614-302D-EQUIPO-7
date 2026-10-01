import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ComprasService } from './compras.service';

/**
 * Aceptación comercial automática de facturas de compra sin reclamo.
 * No aprueba la OC ni llama SII/GoSocket.
 */
@Injectable()
export class AceptacionCompraCron {
  private readonly logger = new Logger(AceptacionCompraCron.name);

  constructor(private compras: ComprasService) {}

  @Cron('0 6 * * *', { timeZone: 'America/Santiago', name: 'aceptacion-compra-plazo' })
  async handleCron() {
    try {
      const result = await this.compras.runAceptacionCompraAutoIfDue();
      if (!result.updated) return;
      this.logger.log(`Aceptación automática (plazo): ${result.updated} registro(s)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Aceptación compra plazo falló: ${msg}`);
    }
  }
}
