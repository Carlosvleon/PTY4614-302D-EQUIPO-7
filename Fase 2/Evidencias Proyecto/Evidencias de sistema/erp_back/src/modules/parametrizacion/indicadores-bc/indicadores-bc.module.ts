import { Module } from '@nestjs/common';
import { IndicadoresBcController } from './indicadores-bc.controller';
import { IndicadoresBcService } from './indicadores-bc.service';
import { CatalogosModule } from '../../catalogos/catalogos.module';

@Module({
  imports: [CatalogosModule],
  controllers: [IndicadoresBcController],
  providers: [IndicadoresBcService],
  exports: [IndicadoresBcService],
})
export class IndicadoresBcModule {}

