import { Navigate } from 'react-router-dom';

/** GAP-08: página huérfana retirada; redirige al dashboard. */
export default function ReportesEjecutivoPage() {
  return <Navigate to="/" replace />;
}
