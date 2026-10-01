import type { PrismaService } from '../../prisma/prisma.service';
import type { FichaContactoDto, FichaCuentaBancariaDto, FichaDireccionDto } from './ficha.dto';

export const fichaIncludeCliente = {
  cuentasBancarias: true,
  contactos: true,
  direcciones: true,
  cambios: { orderBy: { createdAt: 'desc' as const }, take: 50 },
};

export const fichaIncludeProveedor = {
  cuentasBancarias: true,
  contactosFicha: true,
  direcciones: true,
  cambios: { orderBy: { createdAt: 'desc' as const }, take: 50 },
};

function mapBanco(r: {
  id: string; banco: string; tipoCuenta: string; numero: string;
  monedaCodigo: string; titular: string | null; rutTitular: string | null; principal: boolean;
}) {
  return {
    id: r.id,
    banco: r.banco,
    tipoCuenta: r.tipoCuenta,
    numero: r.numero,
    monedaCodigo: r.monedaCodigo,
    titular: r.titular ?? undefined,
    rutTitular: r.rutTitular ?? undefined,
    principal: r.principal,
  };
}

function mapContacto(r: {
  id: string; nombre: string; cargo: string | null; email: string | null;
  telefono: string | null; principal: boolean;
}) {
  return {
    id: r.id,
    nombre: r.nombre,
    cargo: r.cargo ?? undefined,
    email: r.email ?? undefined,
    telefono: r.telefono ?? undefined,
    principal: r.principal,
  };
}

function mapDir(r: {
  id: string; tipo: string; linea: string; comuna: string | null; ciudad: string | null; principal: boolean;
}) {
  return {
    id: r.id,
    tipo: r.tipo,
    linea: r.linea,
    comuna: r.comuna ?? undefined,
    ciudad: r.ciudad ?? undefined,
    principal: r.principal,
  };
}

function mapCambio(r: {
  id: string; usuarioId: string; usuarioNombre: string; resumen: string;
  createdAt: Date; antes: unknown; despues: unknown;
}) {
  return {
    id: r.id,
    usuarioId: r.usuarioId,
    usuarioNombre: r.usuarioNombre,
    resumen: r.resumen,
    createdAt: r.createdAt.toISOString(),
    antes: r.antes,
    despues: r.despues,
  };
}

export function mapClienteFicha(row: Record<string, unknown> & {
  cuentasBancarias?: Parameters<typeof mapBanco>[0][];
  contactos?: Parameters<typeof mapContacto>[0][];
  direcciones?: Parameters<typeof mapDir>[0][];
  cambios?: Parameters<typeof mapCambio>[0][];
}) {
  return {
    cuentasBancarias: (row.cuentasBancarias ?? []).map(mapBanco),
    contactos: (row.contactos ?? []).map(mapContacto),
    direcciones: (row.direcciones ?? []).map(mapDir),
    historial: (row.cambios ?? []).map(mapCambio),
  };
}

export function mapProveedorFicha(row: Record<string, unknown> & {
  cuentasBancarias?: Parameters<typeof mapBanco>[0][];
  contactosFicha?: Parameters<typeof mapContacto>[0][];
  direcciones?: Parameters<typeof mapDir>[0][];
  cambios?: Parameters<typeof mapCambio>[0][];
}) {
  return {
    cuentasBancarias: (row.cuentasBancarias ?? []).map(mapBanco),
    contactos: (row.contactosFicha ?? []).map(mapContacto),
    direcciones: (row.direcciones ?? []).map(mapDir),
    historial: (row.cambios ?? []).map(mapCambio),
  };
}

function bancoData(empresaId: string, items?: FichaCuentaBancariaDto[]) {
  return (items ?? [])
    .filter((x) => x.banco?.trim() && x.numero?.trim())
    .map((x) => ({
      banco: x.banco.trim(),
      tipoCuenta: (x.tipoCuenta || 'CORRIENTE').trim(),
      numero: x.numero.trim(),
      monedaCodigo: (x.monedaCodigo || 'CLP').trim().toUpperCase(),
      titular: x.titular?.trim() || null,
      rutTitular: x.rutTitular?.trim() || null,
      principal: x.principal ?? false,
      empresaId,
    }));
}

function contactoData(empresaId: string, items?: FichaContactoDto[]) {
  return (items ?? [])
    .filter((x) => x.nombre?.trim())
    .map((x) => ({
      nombre: x.nombre.trim(),
      cargo: x.cargo?.trim() || null,
      email: x.email?.trim() || null,
      telefono: x.telefono?.trim() || null,
      principal: x.principal ?? false,
      empresaId,
    }));
}

function dirData(empresaId: string, items?: FichaDireccionDto[]) {
  return (items ?? [])
    .filter((x) => x.linea?.trim())
    .map((x) => ({
      tipo: (x.tipo || 'DESPACHO').trim().toUpperCase(),
      linea: x.linea.trim(),
      comuna: x.comuna?.trim() || null,
      ciudad: x.ciudad?.trim() || null,
      principal: x.principal ?? false,
      empresaId,
    }));
}

export async function syncClienteFicha(
  prisma: PrismaService,
  opts: {
    empresaId: string;
    clienteId: string;
    nested?: {
      cuentasBancarias?: FichaCuentaBancariaDto[];
      contactos?: FichaContactoDto[];
      direcciones?: FichaDireccionDto[];
    };
    actor: { id: string; nombre: string };
    resumen: string;
    antes: unknown;
  },
) {
  const n = opts.nested;
  if (!n) return;
  if (n.cuentasBancarias) {
    await prisma.clienteCuentaBancaria.deleteMany({ where: { clienteId: opts.clienteId, empresaId: opts.empresaId } });
    const rows = bancoData(opts.empresaId, n.cuentasBancarias);
    if (rows.length) {
      await prisma.clienteCuentaBancaria.createMany({ data: rows.map((r) => ({ ...r, clienteId: opts.clienteId })) });
    }
  }
  if (n.contactos) {
    await prisma.clienteContacto.deleteMany({ where: { clienteId: opts.clienteId, empresaId: opts.empresaId } });
    const rows = contactoData(opts.empresaId, n.contactos);
    if (rows.length) {
      await prisma.clienteContacto.createMany({ data: rows.map((r) => ({ ...r, clienteId: opts.clienteId })) });
    }
  }
  if (n.direcciones) {
    await prisma.clienteDireccion.deleteMany({ where: { clienteId: opts.clienteId, empresaId: opts.empresaId } });
    const rows = dirData(opts.empresaId, n.direcciones);
    if (rows.length) {
      await prisma.clienteDireccion.createMany({ data: rows.map((r) => ({ ...r, clienteId: opts.clienteId })) });
    }
  }
  const full = await prisma.cliente.findFirst({
    where: { id: opts.clienteId, empresaId: opts.empresaId },
    include: fichaIncludeCliente,
  });
  await prisma.clienteCambio.create({
    data: {
      clienteId: opts.clienteId,
      empresaId: opts.empresaId,
      usuarioId: opts.actor.id,
      usuarioNombre: opts.actor.nombre,
      resumen: opts.resumen,
      antes: opts.antes as object,
      despues: (full ?? {}) as object,
    },
  });
}

export async function syncProveedorFicha(
  prisma: PrismaService,
  opts: {
    empresaId: string;
    proveedorId: string;
    nested?: {
      cuentasBancarias?: FichaCuentaBancariaDto[];
      contactos?: FichaContactoDto[];
      direcciones?: FichaDireccionDto[];
    };
    actor: { id: string; nombre: string };
    resumen: string;
    antes: unknown;
  },
) {
  const n = opts.nested;
  if (!n) return;
  if (n.cuentasBancarias) {
    await prisma.proveedorCuentaBancaria.deleteMany({
      where: { proveedorId: opts.proveedorId, empresaId: opts.empresaId },
    });
    const rows = bancoData(opts.empresaId, n.cuentasBancarias);
    if (rows.length) {
      await prisma.proveedorCuentaBancaria.createMany({
        data: rows.map((r) => ({ ...r, proveedorId: opts.proveedorId })),
      });
    }
  }
  if (n.contactos) {
    await prisma.proveedorContacto.deleteMany({
      where: { proveedorId: opts.proveedorId, empresaId: opts.empresaId },
    });
    const rows = contactoData(opts.empresaId, n.contactos);
    if (rows.length) {
      await prisma.proveedorContacto.createMany({
        data: rows.map((r) => ({ ...r, proveedorId: opts.proveedorId })),
      });
    }
  }
  if (n.direcciones) {
    await prisma.proveedorDireccion.deleteMany({
      where: { proveedorId: opts.proveedorId, empresaId: opts.empresaId },
    });
    const rows = dirData(opts.empresaId, n.direcciones);
    if (rows.length) {
      await prisma.proveedorDireccion.createMany({
        data: rows.map((r) => ({ ...r, proveedorId: opts.proveedorId })),
      });
    }
  }
  const full = await prisma.proveedor.findFirst({
    where: { id: opts.proveedorId, empresaId: opts.empresaId },
    include: fichaIncludeProveedor,
  });
  await prisma.proveedorCambio.create({
    data: {
      proveedorId: opts.proveedorId,
      empresaId: opts.empresaId,
      usuarioId: opts.actor.id,
      usuarioNombre: opts.actor.nombre,
      resumen: opts.resumen,
      antes: opts.antes as object,
      despues: (full ?? {}) as object,
    },
  });
}
