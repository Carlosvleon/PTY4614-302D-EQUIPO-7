import { Module } from '@nestjs/common';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { BillingModule } from '../billing/billing.module';
import { AceptacionCompraCron } from './aceptacion-compra.cron';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';

@Module({
  imports: [ContabilidadModule, TesoreriaModule, DashboardModule, BillingModule],
  controllers: [ComprasController],
  providers: [ComprasService, AceptacionCompraCron],
  exports: [ComprasService],
})
export class ComprasModule {}
