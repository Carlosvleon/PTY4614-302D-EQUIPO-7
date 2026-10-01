import { Module } from '@nestjs/common';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';
import { BillingModule } from '../billing/billing.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ComercialController } from './comercial.controller';
import { ComercialService } from './comercial.service';

@Module({
  imports: [ContabilidadModule, TesoreriaModule, BillingModule, DashboardModule],
  controllers: [ComercialController],
  providers: [ComercialService],
  exports: [ComercialService],
})
export class ComercialModule {}
