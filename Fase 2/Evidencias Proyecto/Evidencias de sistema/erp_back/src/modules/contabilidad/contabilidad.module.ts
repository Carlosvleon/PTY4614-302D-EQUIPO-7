import { forwardRef, Module } from '@nestjs/common';
import { ContratistasModule } from '../contratistas/contratistas.module';
import { ContabilidadController } from './contabilidad.controller';
import { ContabilidadService } from './contabilidad.service';
import { ContabilizarService } from './contabilizar.service';

@Module({
  imports: [forwardRef(() => ContratistasModule)],
  controllers: [ContabilidadController],
  providers: [ContabilidadService, ContabilizarService],
  exports: [ContabilidadService, ContabilizarService],
})
export class ContabilidadModule {}
