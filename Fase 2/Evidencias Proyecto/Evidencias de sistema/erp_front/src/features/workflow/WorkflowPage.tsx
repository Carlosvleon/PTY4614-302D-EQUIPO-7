import { Navigate } from 'react-router-dom';

/** GAP-09: página legacy retirada; redirige a aprobaciones OC. */
export default function WorkflowPage() {
  return <Navigate to="/compras/aprobaciones" replace />;
}
