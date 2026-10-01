export interface ItemCatalogoBCCH {
  codigo: string;
  nombre: string;
  simbolo: string;
  codigoSerieBCCH: string;
  descripcion: string;
  frecuencia: 'DIARIA' | 'MENSUAL';
}

export const CATALOGO_BCCH: ItemCatalogoBCCH[] = [
  {
    codigo: 'USD',
    nombre: 'Dólar Observado',
    simbolo: '$',
    codigoSerieBCCH: 'F073.TCO.PRE.Z.D',
    descripcion: 'Tipo de cambio Dólar Observado (USD/CLP)',
    frecuencia: 'DIARIA',
  },
  {
    codigo: 'EUR',
    nombre: 'Euro',
    simbolo: '€',
    codigoSerieBCCH: 'F072.CLP.EUR.N.O.D',
    descripcion: 'Tipo de cambio Euro oficial (EUR/CLP)',
    frecuencia: 'DIARIA',
  },
  {
    codigo: 'CNY',
    nombre: 'Yuan Renminbi (CNY)',
    simbolo: '¥',
    codigoSerieBCCH: 'F072.CLP.CNY.N.O.D',
    descripcion: 'Tipo de cambio Yuan Renminbi oficial (CNY/CLP)',
    frecuencia: 'DIARIA',
  },
  {
    codigo: 'UF',
    nombre: 'Unidad de Fomento (UF)',
    simbolo: 'UF',
    codigoSerieBCCH: 'F073.UFF.PRE.Z.D',
    descripcion: 'Valor oficial de la Unidad de Fomento',
    frecuencia: 'DIARIA',
  },
  {
    codigo: 'UTM',
    nombre: 'Unidad Tributaria Mensual (UTM)',
    simbolo: 'UTM',
    codigoSerieBCCH: 'F073.UTR.PRE.Z.M',
    descripcion: 'Valor oficial de la Unidad Tributaria Mensual',
    frecuencia: 'MENSUAL',
  },
  {
    codigo: 'JPY',
    nombre: 'Yen Japonés',
    simbolo: '¥',
    codigoSerieBCCH: 'F072.CLP.JPY.N.O.D',
    descripcion: 'Tipo de cambio Yen Japonés (JPY/CLP)',
    frecuencia: 'DIARIA',
  },
  {
    codigo: 'GBP',
    nombre: 'Libra Esterlina',
    simbolo: '£',
    codigoSerieBCCH: 'F072.CLP.GBP.N.O.D',
    descripcion: 'Tipo de cambio Libra Esterlina (GBP/CLP)',
    frecuencia: 'DIARIA',
  },
  {
    codigo: 'BRL',
    nombre: 'Real Brasileño',
    simbolo: 'R$',
    codigoSerieBCCH: 'F072.CLP.BRL.N.O.D',
    descripcion: 'Tipo de cambio Real Brasileño (BRL/CLP)',
    frecuencia: 'DIARIA',
  },
];
