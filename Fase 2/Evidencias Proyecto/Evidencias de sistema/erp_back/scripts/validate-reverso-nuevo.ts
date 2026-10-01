import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ComercialService } from '../src/modules/comercial/comercial.service';
import { ContabilizarService } from '../src/modules/contabilidad/contabilizar.service';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const contab = new ContabilizarService(prisma as never);
const svc = new ComercialService(prisma as never, contab);

const user = {
  sub: 'U-1',
  email: 'admin@almahue.local',
  rolId: 'ROL-1',
  empresaId: 'EMP-1',
  empresaIds: ['EMP-1'],
  permisos: ['*'],
};

async function main() {
  const doc = await prisma.documentoComercial.findFirst({ where: { folio: 'FAC-QA-REV-002' } });
  if (!doc) throw new Error('missing FAC-QA-REV-002');

  // Reset a estado limpio contabilizado si quedó a medias
  if (doc.estado !== 'CONTABILIZADA' || !doc.asientoOriginal || doc.asientoReversador) {
    await prisma.documentoComercial.update({
      where: { id: doc.id },
      data: {
        estado: 'CONTABILIZADA',
        asientoReversador: null,
        asientoNuevo: null,
        fromReversa: false,
        asientoOriginal: doc.asientoOriginal || 'QA-FAC-QA-REV-002',
      },
    });
  }

  const rev = await svc.reversarDocumento(user as never, doc.id);
  console.log('REVERSO', JSON.stringify(rev, null, 2));

  const mid = await prisma.documentoComercial.findUnique({ where: { id: doc.id } });
  console.log('POST_REVERSO', {
    estado: mid?.estado,
    asientoOriginal: mid?.asientoOriginal,
    asientoReversador: mid?.asientoReversador,
    asientoNuevo: mid?.asientoNuevo,
    tipo: mid?.tipo,
  });

  const again = await svc.grabarDocumentoContabilizar(user as never, doc.id, {
    cuentaContableId: mid?.cuentaContableId || undefined,
    centroCostoId: mid?.centroCostoId || undefined,
    glosa: 'Re-contab QA FAC-QA-REV-002',
  });
  console.log('RECONTAB', {
    folio: again.folio,
    estado: again.estado,
    tipo: again.tipo,
    asientoOriginal: again.asientoOriginal,
    asientoReversador: again.asientoReversador,
    asientoNuevo: again.asientoNuevo,
  });

  const leftoverNc = await prisma.documentoComercial.count({
    where: { OR: [{ folio: { contains: '-REV' } }, { folio: { endsWith: '-R' } }] },
  });
  console.log('LEFTOVER_REV_DOCS', leftoverNc);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
