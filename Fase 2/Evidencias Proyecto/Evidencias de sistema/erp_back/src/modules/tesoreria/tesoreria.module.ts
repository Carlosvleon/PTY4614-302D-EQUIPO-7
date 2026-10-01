import { Module } from '@nestjs/common';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { TesoreriaController } from './tesoreria.controller';
import { TesoreriaService } from './tesoreria.service';
import { CuentaCorrienteService } from './cuenta-corriente.service';

@Module({
  imports: [ContabilidadModule],
  controllers: [TesoreriaController],
  providers: [TesoreriaService, CuentaCorrienteService],
  exports: [TesoreriaService, CuentaCorrienteService],
})
export class TesoreriaModule {}
