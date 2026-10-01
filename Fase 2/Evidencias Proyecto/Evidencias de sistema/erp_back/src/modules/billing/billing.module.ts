import { Module } from '@nestjs/common';
import { BillingGatewayClient } from './billing-gateway.client';
import { buildCanonicalFromDocumento } from './canonical-builder';

@Module({
  providers: [BillingGatewayClient],
  exports: [BillingGatewayClient],
})
export class BillingModule {}

export { BillingGatewayClient, buildCanonicalFromDocumento };
