import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { NotificacionesService } from './notificaciones.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, NotificacionesService],
  exports: [DashboardService, NotificacionesService],
})
export class DashboardModule {}
