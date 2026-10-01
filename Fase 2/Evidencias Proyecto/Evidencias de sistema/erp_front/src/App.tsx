import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { AuthProvider } from '@/app/AuthProvider';
import { AppLayout } from '@/app/AppLayout';
import { ProtectedRoute } from '@/app/ProtectedRoute';
import LoginPage from '@/features/auth/LoginPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import EmpresasPage from '@/features/admin/EmpresasPage';
import PlantillaDocumentosPage from '@/features/admin/PlantillaDocumentosPage';
import UsuariosPage from '@/features/admin/UsuariosPage';
import RolesPage from '@/features/admin/RolesPage';
import WorkflowAprobacionesPage from '@/features/admin/WorkflowAprobacionesPage';
import { UnidadesPage, CentrosCostoPage, TiposDocumentoPage, ProveedoresPage } from '@/features/catalogos/CatalogosPages';
import MonedasParametrizacionPage from '@/pages/parametrizacion/MonedasPage';
import IndicadoresBCParametrizacionPage from '@/pages/parametrizacion/IndicadoresBCPage';
import { AreasNegocioPage } from '@/features/catalogos/AreasNegocioPage';
import { ConceptosFlujoPage } from '@/features/catalogos/ConceptosFlujoPage';
import { CodigosFinancierosPage } from '@/features/catalogos/CodigosFinancierosPage';
import {
  PlanCuentasPage, AsientosPage, ReportesContablesPage,
  ElementosCostoPage, HonorariosPage,
} from '@/features/contabilidad/ContabilidadPages';
import { LibroDiarioPage, MayorPage } from '@/features/contabilidad/LibroDiarioMayorPages';
import { Balance8ColumnasPage } from '@/features/contabilidad/Balance8ColumnasPage';
import { PeriodosContablesPage } from '@/features/contabilidad/PeriodosContablesPage';
import { ConfigContableSiiPage } from '@/features/contabilidad/ConfigContableSiiPage';
import { CentralizacionMasivaPage } from '@/features/contabilidad/CentralizacionMasivaPage';
import { PagosPage, ConciliacionPage } from '@/features/tesoreria/TesoreriaPages';
import CartolaBancariaPage from '@/features/tesoreria/CartolaBancariaPage';
import FlujoCajaPage from '@/features/tesoreria/FlujoCajaPage';
import NominasAgingPage from '@/features/tesoreria/NominasAgingPage';
import CuentasCorrientesPage from '@/features/tesoreria/CuentasCorrientesPage';
import {
  ContratistasListPage, TraspasoContratistasPage,
} from '@/features/contratistas/ContratistasPages';
import IngresoLaborDiarioPage from '@/features/contratistas/IngresoLaborDiarioPage';
import ParametrizacionContratistasPage from '@/features/contratistas/ParametrizacionContratistasPage';
import TarifasContratistaNivel1Page from '@/features/contratistas/TarifasContratistaNivel1Page';
import ProformasContratistaNivel1Page from '@/features/contratistas/ProformasContratistaNivel1Page';
import AuditoriaContratistasPage from '@/features/contratistas/AuditoriaContratistasPage';
import {
  OrdenesCompraPage, AprobacionesOcPage, RecepcionesOcPage, RegistroCompraPage,
} from '@/features/compras/ComprasPages';
import { OrdenCompraWizardPage } from '@/features/compras/OrdenCompraWizardPage';
import { CatalogoInsumosPage, BodegasPage, MovimientosBodegaPage } from '@/features/insumos/InsumosPages';
import { StockMantenedorPage } from '@/features/insumos/StockMantenedorPage';
import { ClientesPage, LibroComercialPage, ProspectosPage } from '@/features/comercial/ComercialPages';
import { OrdenVentaPage } from '@/features/comercial/OrdenVentaPage';
import { GuiasDespachoPage } from '@/features/comercial/GuiasDespachoPage';
import EmitirDocumentoPage from '@/features/comercial/EmitirDocumentoPage';
import PresupuestosPage from '@/features/presupuestos/PresupuestosPage';
import PerfilPage from '@/features/perfil/PerfilPage';

/** Alias PM T6: folio de compra → /compras/libro (misma pantalla que registro). */
function RedirectLibroCompras() {
  const [params] = useSearchParams();
  const q = params.toString();
  return <Navigate to={q ? `/compras/registro?${q}` : '/compras/registro'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="perfil" element={<PerfilPage />} />

          <Route element={<ProtectedRoute permission="admin:read" />}>
            <Route path="admin/empresas" element={<EmpresasPage />} />
            <Route path="admin/plantilla-documentos" element={<PlantillaDocumentosPage />} />
            <Route path="admin/usuarios" element={<UsuariosPage />} />
            <Route path="admin/roles" element={<RolesPage />} />
          </Route>

          <Route element={<ProtectedRoute aprobacionesConfig />}>
            <Route path="admin/aprobaciones" element={<WorkflowAprobacionesPage />} />
          </Route>

          <Route element={<ProtectedRoute anyOf={['catalogos:read', 'admin:read']} />}>
            <Route element={<ProtectedRoute pantalla="Parametrización · Monedas" />}>
              <Route path="catalogos/monedas" element={<MonedasParametrizacionPage />} />
              <Route path="parametrizacion/monedas" element={<Navigate to="/catalogos/monedas" replace />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Parametrización · Unidades de medida" />}>
              <Route path="catalogos/unidades" element={<UnidadesPage />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Parametrización · Centros de costo" />}>
              <Route path="catalogos/centros-costo" element={<CentrosCostoPage />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Parametrización · Áreas de negocio" />}>
              <Route path="catalogos/areas-negocio" element={<AreasNegocioPage />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Parametrización · Conceptos" />}>
              <Route path="catalogos/conceptos-flujo" element={<ConceptosFlujoPage />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Parametrización · Códigos financieros" />}>
              <Route path="catalogos/codigos-financieros" element={<CodigosFinancierosPage />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Parametrización · Tipos de documento" />}>
              <Route path="catalogos/tipos-documento" element={<TiposDocumentoPage />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Parametrización · Plan de cuentas" />}>
              <Route path="catalogos/plan-cuentas" element={<PlanCuentasPage />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Parametrización · Elementos de costo" />}>
              <Route path="catalogos/elementos-costo" element={<ElementosCostoPage />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Parametrización · Indicadores BC" />}>
              <Route path="catalogos/indicadores-bc" element={<IndicadoresBCParametrizacionPage />} />
              <Route path="parametrizacion/indicadores-bc" element={<Navigate to="/catalogos/indicadores-bc" replace />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute anyOf={['catalogos:read', 'contratistas:read', 'admin:read']} />}>
            <Route element={<ProtectedRoute pantalla="Parametrización · Contratista" />}>
              <Route path="catalogos/contratista" element={<ParametrizacionContratistasPage />} />
            </Route>
          </Route>

          {/* Proveedores: catálogo y menú Compras */}
          <Route element={<ProtectedRoute anyOf={['catalogos:read', 'compras:read', 'admin:read']} />}>
            <Route path="catalogos/proveedores" element={<ProveedoresPage />} />
          </Route>

          <Route element={<ProtectedRoute anyOf={['contratistas:read', 'admin:read']} />}>
            <Route path="contratistas" element={<ContratistasListPage />} />
            <Route path="contratistas/ingreso-diario" element={<IngresoLaborDiarioPage />} />
            <Route path="contratistas/parametrizacion" element={<Navigate to="/catalogos/contratista" replace />} />
            <Route path="contratistas/asociacion" element={<Navigate to="/contratistas/proformas" replace />} />
            <Route path="contratistas/tarifas" element={<TarifasContratistaNivel1Page />} />
            <Route path="contratistas/proformas" element={<ProformasContratistaNivel1Page />} />
            <Route path="contratistas/traspaso" element={<TraspasoContratistasPage />} />
            <Route path="insumos/contratistas" element={<Navigate to="/contratistas" replace />} />
          </Route>
          <Route element={<ProtectedRoute permission="contratistas:audit" />}>
            <Route path="contratistas/auditoria" element={<AuditoriaContratistasPage />} />
          </Route>

          <Route element={<ProtectedRoute anyOf={['compras:read', 'admin:read']} />}>
            <Route path="compras/cotizaciones" element={<Navigate to="/compras/ordenes" replace />} />
            <Route path="compras/ordenes/nueva" element={<OrdenCompraWizardPage />} />
            <Route path="compras/ordenes/:id/editar" element={<OrdenCompraWizardPage />} />
            <Route path="compras/ordenes" element={<OrdenesCompraPage />} />
            <Route path="compras/recepciones" element={<RecepcionesOcPage />} />
            <Route path="compras/registro" element={<RegistroCompraPage />} />
            <Route path="compras/libro" element={<RedirectLibroCompras />} />
          </Route>

          <Route element={<ProtectedRoute bandejaModulo="Compras" />}>
            <Route path="compras/aprobaciones" element={<AprobacionesOcPage />} />
          </Route>

          <Route element={<ProtectedRoute anyOf={['insumos:read', 'admin:read']} />}>
            <Route path="insumos/maestro" element={<CatalogoInsumosPage />} />
            <Route path="insumos/bodegas" element={<BodegasPage />} />
            <Route path="insumos/movimientos" element={<MovimientosBodegaPage />} />
            <Route path="insumos/catalogo" element={<CatalogoInsumosPage />} />
          </Route>
          <Route element={<ProtectedRoute pantalla="Insumos / Bodega · Stock por bodega / producto" />}>
            <Route path="insumos/stock" element={<StockMantenedorPage />} />
          </Route>

          <Route element={<ProtectedRoute anyOf={['contabilidad:read', 'admin:read']} />}>
            <Route path="contabilidad/plan-cuentas" element={<Navigate to="/catalogos/plan-cuentas" replace />} />
            <Route path="contabilidad/elementos-costo" element={<Navigate to="/catalogos/elementos-costo" replace />} />
            <Route path="contabilidad/honorarios" element={<HonorariosPage />} />
            <Route path="contabilidad/indicadores-bc" element={<Navigate to="/catalogos/indicadores-bc" replace />} />
            <Route path="contabilidad/asientos" element={<AsientosPage />} />
            <Route path="contabilidad/periodos" element={<PeriodosContablesPage />} />
            <Route path="contabilidad/config-sii" element={<ConfigContableSiiPage />} />
            <Route path="contabilidad/centralizacion" element={<CentralizacionMasivaPage />} />
            <Route path="contabilidad/libro-diario" element={<LibroDiarioPage />} />
            <Route path="contabilidad/mayor" element={<MayorPage />} />
            <Route path="contabilidad/balance-8-columnas" element={<Balance8ColumnasPage />} />
            <Route path="contabilidad/reportes" element={<ReportesContablesPage />} />
            <Route path="presupuestos" element={<PresupuestosPage />} />
          </Route>

          <Route element={<ProtectedRoute anyOf={['tesoreria:read', 'admin:read']} />}>
            <Route element={<ProtectedRoute pantalla="Tesorería · Flujo de caja" />}>
              <Route path="tesoreria/flujo-caja" element={<FlujoCajaPage />} />
            </Route>
            <Route path="tesoreria/pagos" element={<PagosPage />} />
            <Route path="tesoreria/cartolas" element={<CartolaBancariaPage />} />
            <Route element={<ProtectedRoute pantalla="Tesorería · Nómina semanal" />}>
              <Route path="tesoreria/nominas" element={<NominasAgingPage />} />
              <Route path="tesoreria/aging" element={<NominasAgingPage />} />
            </Route>
            <Route path="tesoreria/anticipos" element={<Navigate to="/tesoreria/pagos?tipo=ANTICIPO" replace />} />
            <Route path="tesoreria/conciliacion" element={<ConciliacionPage />} />
            <Route
              element={<ProtectedRoute pantalla="Tesorería · Estado de cuenta" />}
            >
              <Route path="tesoreria/cuentas-corrientes" element={<CuentasCorrientesPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute anyOf={['comercial:read', 'admin:read']} />}>
            <Route element={<ProtectedRoute pantalla="Ventas · Clientes" />}>
              <Route path="comercial/clientes" element={<ClientesPage />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Ventas · Órdenes de venta" />}>
              <Route path="comercial/ordenes-venta" element={<OrdenVentaPage />} />
              <Route path="comercial/ordenes-venta/nueva" element={<EmitirDocumentoPage />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Ventas · Libro de guías" />}>
              <Route path="comercial/guias-despacho" element={<GuiasDespachoPage />} />
            </Route>
            <Route path="comercial/prospectos" element={<ProspectosPage />} />
            <Route path="comercial/cotizaciones" element={<Navigate to="/compras/ordenes" replace />} />
            <Route element={<ProtectedRoute pantalla="Ventas · Emitir DTE" />}>
              <Route path="comercial/emitir" element={<EmitirDocumentoPage />} />
            </Route>
            <Route element={<ProtectedRoute pantalla="Ventas · Libro de ventas" />}>
              <Route path="comercial/libro" element={<LibroComercialPage />} />
            </Route>
            <Route path="comercial/*" element={<Navigate to="/comercial/libro" replace />} />
          </Route>

          <Route path="workflow/*" element={<Navigate to="/" replace />} />
          <Route path="reportes/*" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
