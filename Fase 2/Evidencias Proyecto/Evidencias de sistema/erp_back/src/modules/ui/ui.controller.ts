import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt.strategy';
import { UpsertTablePreferenceDto } from './dto/ui.dto';

function asStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

@ApiTags('ui')
@ApiBearerAuth()
@Controller('ui')
export class UiController {
  constructor(private prisma: PrismaService) {}

  @Get('table-preferences/:tableKey')
  async getTablePreference(
    @CurrentUser() user: JwtPayload,
    @Param('tableKey') tableKey: string,
  ) {
    const row = await this.prisma.uiTablePreference.findUnique({
      where: {
        userId_tableKey: { userId: user.sub, tableKey },
      },
    });
    if (!row) {
      return { tableKey, visibleColumns: null, columnOrder: null };
    }
    return {
      tableKey: row.tableKey,
      visibleColumns: asStringArray(row.visibleColumns),
      columnOrder: asStringArray(row.columnOrder),
    };
  }

  @Put('table-preferences/:tableKey')
  async upsertTablePreference(
    @CurrentUser() user: JwtPayload,
    @Param('tableKey') tableKey: string,
    @Body() dto: UpsertTablePreferenceDto,
  ) {
    const row = await this.prisma.uiTablePreference.upsert({
      where: {
        userId_tableKey: { userId: user.sub, tableKey },
      },
      create: {
        userId: user.sub,
        tableKey,
        visibleColumns: dto.visibleColumns,
        columnOrder: dto.columnOrder,
      },
      update: {
        visibleColumns: dto.visibleColumns,
        columnOrder: dto.columnOrder,
      },
    });
    return {
      tableKey: row.tableKey,
      visibleColumns: asStringArray(row.visibleColumns),
      columnOrder: asStringArray(row.columnOrder),
    };
  }
}
