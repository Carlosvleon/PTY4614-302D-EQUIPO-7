import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';
import { BcSyncCron } from './bc-sync.cron';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [CatalogosController],
  providers: [CatalogosService, BcSyncCron],
  exports: [CatalogosService],
})
export class CatalogosModule {}
