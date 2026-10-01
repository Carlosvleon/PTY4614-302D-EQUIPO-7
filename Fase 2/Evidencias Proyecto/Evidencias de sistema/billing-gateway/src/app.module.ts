import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoSocketAdapter } from './adapters/gosocket/gosocket.adapter';
import { StubAdapter } from './adapters/stub/stub.adapter';
import { EmissionsController } from './emissions/emissions.controller';
import { EmissionsService } from './emissions/emissions.service';
import { SqliteEmissionsStore } from './emissions/emissions.store';
import { RegistryService } from './registry/registry.service';
import { HealthController } from './health.controller';
import { PurchasesController } from './purchases/purchases.controller';
import { PurchasesService } from './purchases/purchases.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [EmissionsController, PurchasesController, HealthController],
  providers: [
    RegistryService,
    StubAdapter,
    GoSocketAdapter,
    {
      provide: SqliteEmissionsStore,
      useFactory: () => SqliteEmissionsStore.openFromEnv(),
    },
    EmissionsService,
    PurchasesService,
  ],
})
export class AppModule {}
