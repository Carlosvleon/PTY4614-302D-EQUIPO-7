import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BULTOS_ADUANA,
  CLAUSULAS_ADUANA,
  COMEX_DEFAULTS_ADUANA,
  MONEDAS_ADUANA,
  MODALIDADES_ADUANA,
  PAISES_ADUANA,
  PUERTOS_ADUANA,
  VIAS_ADUANA,
  codigoClausulaAduana,
  codigoBultoAduana,
  codigoModalidadAduana,
  codigoMonedaAduana,
  codigoPaisAduana,
  codigoPuertoAduana,
  codigoViaAduana,
  labelAduana,
  opcionesAduana,
  opcionesConCodigoLibre,
  paisDePuertoAduana,
  puertoPerteneceAPais,
  puertosDesembarquePorPais,
  opcionesPuertosDesembarque,
} from './comex-aduana.ts';

describe('catálogo Aduana COMEX', () => {
  it('usa códigos numéricos, no glosas SII', () => {
    assert.equal(codigoClausulaAduana('FOB'), '5');
    assert.equal(codigoClausulaAduana('CIF'), '1');
    assert.equal(codigoViaAduana('MARITIMA'), '1');
    assert.equal(codigoViaAduana('AEREA'), '4');
    assert.equal(codigoModalidadAduana('CONSIGNACION_LIBRE'), '3');
    assert.equal(codigoMonedaAduana('USD'), '13');
    assert.equal(codigoMonedaAduana('YUAN'), '48');
    assert.equal(codigoMonedaAduana('EURO'), '142');
    assert.equal(COMEX_DEFAULTS_ADUANA.clausulaVenta, '5');
    assert.equal(COMEX_DEFAULTS_ADUANA.viaTransporte, '1');
    assert.equal(COMEX_DEFAULTS_ADUANA.modalidadVenta, '3');
    assert.equal(COMEX_DEFAULTS_ADUANA.tpoMoneda, '13');
    assert.equal(COMEX_DEFAULTS_ADUANA.bultoTipoCodigo, '22');
  });

  it('etiqueta código + nombre', () => {
    assert.equal(labelAduana(CLAUSULAS_ADUANA[0]), '1 · CIF');
    assert.ok(BULTOS_ADUANA.some((b) => b.codigo === '22' && /CAJA DE CARTON/i.test(b.nombre)));
    assert.ok(MONEDAS_ADUANA.some((m) => m.codigo === '13' && /DOLAR USA/i.test(m.nombre)));
    assert.match(labelAduana(VIAS_ADUANA[0]), /MARITIMA/i);
    assert.equal(labelAduana(MODALIDADES_ADUANA.find((m) => m.codigo === '3')!), '3 · En consignación libre');
  });

  it('incluye el seed de países y puertos de Export', () => {
    const paises = opcionesAduana(PAISES_ADUANA).map((o) => o.label).join(' ');
    assert.match(paises, /U\.S\.A/);
    assert.match(paises, /CHINA/);
    assert.match(paises, /PAISES BAJOS/);
    assert.match(paises, /REINO UNIDO/);
    assert.equal(codigoPaisAduana('USA'), '225');
    assert.equal(codigoPuertoAduana('FILADELFIA'), '135');
    assert.equal(codigoPuertoAduana('VALPARAISO'), '905');
    assert.equal(codigoPuertoAduana('OTROS PUERTOS DE ESTADOS UNIDOS NO ESPECIFICADOS'), '180');
    assert.equal(codigoPuertoAduana('OTROS PUERTOS EE.UU.'), '180');
    assert.equal(codigoBultoAduana('CAJACARTON'), '22');
    assert.equal(codigoBultoAduana('CAJA'), '22');
    const puertos = opcionesAduana(PUERTOS_ADUANA).map((o) => o.label).join(' ');
    assert.match(puertos, /VALPARAISO/i);
    assert.match(puertos, /SAN ANTONIO/i);
    assert.match(puertos, /LOS ANGELES/i);
    assert.match(puertos, /ROTTERDAM/i);
    assert.match(puertos, /FILADELFIA/i);
  });

  it('permite un código escrito fuera del seed', () => {
    const extra = opcionesConCodigoLibre(PAISES_ADUANA, '724');
    assert.ok(extra.some((o) => o.value === '724'));
    assert.equal(opcionesConCodigoLibre(PAISES_ADUANA, '225').length, PAISES_ADUANA.length);
  });

  it('filtra desembarque por país destino (China sin Valparaíso)', () => {
    const china = puertosDesembarquePorPais('336');
    assert.ok(china.some((p) => p.codigo === '411'));
    assert.ok(china.some((p) => p.codigo === '413'));
    assert.equal(china.some((p) => p.codigo === '905'), false);
    assert.equal(paisDePuertoAduana('411'), '336');
    assert.equal(paisDePuertoAduana('905'), '997');
    assert.equal(china.some((p) => p.codigo === '293'), false);
    assert.equal(puertoPerteneceAPais('293', '336'), false);
    assert.equal(puertoPerteneceAPais('411', '336'), true);
    const opts = opcionesPuertosDesembarque('336', '293');
    assert.ok(opts.some((o) => o.value === '411' && o.group === 'Puertos del país destino'));
    assert.ok(opts.some((o) => o.value === '293' && o.group === 'Otros puertos'));
    const iChina = opts.findIndex((o) => o.value === '411');
    const iRio = opts.findIndex((o) => o.value === '293');
    assert.ok(iChina >= 0 && iRio > iChina);
  });

  it('alias Chancén al código 251 (no está en Anexo 51)', () => {
    assert.equal(codigoPuertoAduana('CHANCEN'), '251');
    assert.equal(codigoPuertoAduana('CHANCAY'), '251');
    assert.equal(paisDePuertoAduana('251'), '219');
  });
});
