import { forwardRef, Module } from '@nestjs/common';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { ComprasModule } from '../compras/compras.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';
import { ContratistasController } from './contratistas.controller';
import { ContratistasService } from './contratistas.service';

@Module({
  imports: [forwardRef(() => ContabilidadModule), ComprasModule, DashboardModule, TesoreriaModule],
  controllers: [ContratistasController],
  providers: [ContratistasService],
  exports: [ContratistasService],
})
export class ContratistasModule {}
