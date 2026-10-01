import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/** Domicilios QA de seed (no son domicilio SII oficial; sirven para que el DTE no salga vacío). */
const POR_RUT: Record<string, { direccion: string; comuna: string; ciudad: string }> = {
  '762101017': {
    direccion: 'Av. Apoquindo 4501',
    comuna: 'Las Condes',
    ciudad: 'Santiago',
  },
  '763102017': {
    direccion: 'Av. Americo Vespucio 1501',
    comuna: 'Cerrillos',
    ciudad: 'Santiago',
  },
};

function rutKey(rut: string): string {
  return rut.replace(/[.\s-]/g, '').toUpperCase().replace(/K$/, 'K');
}

function pickFicha(dirs: { linea: string; comuna: string | null; ciudad: string | null; principal: boolean }[]) {
  return dirs.find((d) => d.principal && d.linea.trim()) ?? dirs.find((d) => d.linea.trim());
}

async function main() {
  const clientes = await prisma.cliente.findMany({ include: { direcciones: true } });
  const report: string[] = [];

  for (const c of clientes) {
    const ficha = pickFicha(c.direcciones);
    const known = POR_RUT[rutKey(c.rut)];
    const direccion = (c.direccion || ficha?.linea || known?.direccion || '').trim();
    const comuna = (c.comuna || ficha?.comuna || known?.comuna || '').trim();
    const ciudad = (c.ciudad || ficha?.ciudad || known?.ciudad || comuna).trim();

    if (!direccion || !comuna) {
      report.push(`SIN DATOS ${c.empresaId} ${c.rut} ${c.razonSocial}`);
      continue;
    }

    const changed =
      c.direccion !== direccion || c.comuna !== comuna || c.ciudad !== ciudad;
    if (changed) {
      await prisma.cliente.update({
        where: { id: c.id },
        data: { direccion, comuna, ciudad },
      });
    }

    const hasFiscal = c.direcciones.some(
      (d) => d.linea.trim() === direccion && (d.comuna || '').trim() === comuna,
    );
    if (!hasFiscal) {
      await prisma.clienteDireccion.create({
        data: {
          clienteId: c.id,
          empresaId: c.empresaId,
          tipo: 'FISCAL',
          linea: direccion,
          comuna,
          ciudad,
          principal: true,
        },
      });
    }

    report.push(
      `${changed || !hasFiscal ? 'OK ' : 'YA '} ${c.empresaId} ${c.rut} → ${direccion}, ${comuna}`,
    );
  }

  console.log(report.join('\n'));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
