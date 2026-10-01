import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CATALOGO_BCCH, ItemCatalogoBCCH } from './catalogo-bcch.constant';
import { CreateMonedaDto } from './dto/create-moneda.dto';
import { UpdateMonedaDto } from './dto/update-moneda.dto';

@Injectable()
export class MonedasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna el catálogo oficial de series del Banco Central de Chile
   */
  getCatalogoBCCH(): ItemCatalogoBCCH[] {
    return CATALOGO_BCCH;
  }

  /**
   * Obtiene la empresa activa por defecto (para facilitar pruebas y multi-tenant)
   */
  async resolveEmpresaId(empresaId?: string): Promise<string> {
    if (empresaId) return empresaId;
    const primeraEmpresa = await this.prisma.empresa.findFirst({
      where: { activa: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!primeraEmpresa) {
      throw new BadRequestException('No se encontró ninguna empresa activa configurada.');
    }
    return primeraEmpresa.id;
  }

  /**
   * Lista todas las monedas configuradas
   */
  async findAll(_empresaId?: string) {
    const count = await this.prisma.moneda.count();
    if (count === 0) {
      const defaultMonedas = [
        { codigo: 'CLP', nombre: 'Peso Chileno', simbolo: '$', activa: true, focoReporteria: false },
        { codigo: 'USD', nombre: 'Dólar Observado', simbolo: '$', activa: true, focoReporteria: true },
        { codigo: 'EUR', nombre: 'Euro', simbolo: '€', activa: true, focoReporteria: false },
        { codigo: 'CNY', nombre: 'Yuan Renminbi', simbolo: '¥', activa: true, focoReporteria: false },
        { codigo: 'UF', nombre: 'Unidad de Fomento', simbolo: 'UF', activa: true, focoReporteria: false },
        { codigo: 'UTM', nombre: 'Unidad Tributaria Mensual', simbolo: 'UTM', activa: true, focoReporteria: false },
      ];
      for (const m of defaultMonedas) {
        await this.prisma.moneda.upsert({
          where: { codigo: m.codigo },
          create: m,
          update: {},
        });
      }
    }

    return this.prisma.moneda.findMany({
      orderBy: [
        { activa: 'desc' },
        { codigo: 'asc' },
      ],
    });
  }

  /**
   * Obtiene una moneda por su ID
   */
  async findOne(id: string, _empresaId?: string) {
    const moneda = await this.prisma.moneda.findUnique({
      where: { id },
    });

    if (!moneda) {
      throw new NotFoundException(`Moneda con ID "${id}" no encontrada.`);
    }

    return moneda;
  }

  /**
   * Crea una nueva moneda
   */
  async create(dto: CreateMonedaDto, _empresaId?: string) {
    const codigoUpper = dto.codigo.trim().toUpperCase();

    const existe = await this.prisma.moneda.findUnique({
      where: { codigo: codigoUpper },
    });

    if (existe) {
      throw new ConflictException(
        `Ya existe una moneda con el código "${codigoUpper}".`,
      );
    }

    return this.prisma.moneda.create({
      data: {
        codigo: codigoUpper,
        nombre: dto.nombre.trim(),
        simbolo: dto.simbolo.trim(),
        activa: dto.activa ?? true,
        focoReporteria: dto.focoReporteria ?? ['CLP', 'USD', 'EUR', 'CNY'].includes(codigoUpper),
      },
    });
  }

  /**
   * Actualiza los datos de una moneda existente
   */
  async update(id: string, dto: UpdateMonedaDto, empresaId?: string) {
    await this.findOne(id, empresaId);

    const dataToUpdate: any = {};
    if (dto.nombre !== undefined) dataToUpdate.nombre = dto.nombre.trim();
    if (dto.simbolo !== undefined) dataToUpdate.simbolo = dto.simbolo.trim();
    if (dto.activa !== undefined) dataToUpdate.activa = dto.activa;
    if (dto.codigo !== undefined) dataToUpdate.codigo = dto.codigo.trim().toUpperCase();
    if (dto.focoReporteria !== undefined) dataToUpdate.focoReporteria = dto.focoReporteria;

    return this.prisma.moneda.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  /**
   * Alterna el estado activo/inactivo de una moneda
   */
  async toggleActiva(id: string, empresaId?: string) {
    const moneda = await this.findOne(id, empresaId);
    return this.prisma.moneda.update({
      where: { id },
      data: { activa: !moneda.activa },
    });
  }

  /**
   * Alterna el foco de reportería de una moneda
   */
  async toggleFocoReporteria(id: string, empresaId?: string) {
    const moneda = await this.findOne(id, empresaId);
    return this.prisma.moneda.update({
      where: { id },
      data: { focoReporteria: !moneda.focoReporteria },
    });
  }

  /**
   * Elimina una moneda
   */
  async remove(id: string, empresaId?: string) {
    await this.findOne(id, empresaId);

    return this.prisma.moneda.delete({
      where: { id },
    });
  }
}
