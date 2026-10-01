import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CatalogosService } from './catalogos.service';

/**
 * Revisa cada 5 min (America/Santiago) si corresponde consultar el BC
 * según autoSync + horarios/frecuencia configurados en SyncBcMeta.
 */
@Injectable()
export class BcSyncCron {
  private readonly logger = new Logger(BcSyncCron.name);

  constructor(private catalogos: CatalogosService) {}

  @Cron('*/5 * * * *', { timeZone: 'America/Santiago', name: 'bc-indicadores-tick' })
  async handleCron() {
    try {
      const result = await this.catalogos.runScheduledBcSyncIfDue();
      if (result.skipped) return;
      this.logger.log(`Sync BC programado OK (${result.slot}): ${result.count} indicador(es)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Sync BC falló: ${msg}`);
      const meta = await this.catalogos.recordCronFailure(msg);
      if ((meta.failStreak ?? 0) >= 2) {
        this.logger.warn(
          `ALERTA: sync BC falló ${meta.failStreak} veces seguidas. Revisar BC_BDE_TOKEN y si3.bcentral.cl`,
        );
      }
    }
  }
}
