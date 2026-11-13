import { Timestamp } from 'firebase/firestore';

export type SectorId = 'SECCIONADORA' | 'COLADEIRA' | 'FURADEIRA' | 'LINHA_UV';

export type MachineStatus = 'OPERANDO' | 'SETUP' | 'MANUTENCAO' | 'PARADA';

export type ShiftId = 'TURNO_1' | 'TURNO_2' | 'TURNO_3';

export type InefficiencyCategory =
  | 'MANUTENCAO'
  | 'SETUP'
  | 'MATERIAL'
  | 'OPERACIONAL'
  | 'QUALIDADE';

export const INEFFICIENCY_CATEGORIES: Record<InefficiencyCategory, string> = {
  MANUTENCAO: 'Manutenção / Assistência / Energia',
  SETUP: 'Regulagem / Setup / Limpeza',
  MATERIAL: 'Matéria-Prima / Programação / Logística',
  OPERACIONAL: 'Operacional / Pessoal / Treinamento',
  QUALIDADE: 'Retrabalho / Processo / Protótipo',
};

export interface SectorInfo {
  id: SectorId;
  label: string;
  shortLabel: string;
  actionVerb: string;
  primaryMetricUnit: 'm²' | 'm lineares' | 'peças';
  primaryMetricShort: 'm²' | 'm lin.' | 'pçs';
  primaryMetricLabel: string;
  unitLabel: string;
  description: string;
}

export const SECTORS: Record<SectorId, SectorInfo> = {
  SECCIONADORA: {
    id: 'SECCIONADORA',
    label: '1. Corte — Seccionadoras',
    shortLabel: 'Corte',
    actionVerb: 'Cortado',
    primaryMetricUnit: 'm²',
    primaryMetricShort: 'm²',
    primaryMetricLabel: 'm² cortados',
    unitLabel: 'm² cortados',
    description: 'Seccionadora Giben e Seccionadora Selco — Mensurado em m² cortado',
  },
  COLADEIRA: {
    id: 'COLADEIRA',
    label: '2. Coladeiras de Borda',
    shortLabel: 'Coladeiras',
    actionVerb: 'Colado',
    primaryMetricUnit: 'm lineares',
    primaryMetricShort: 'm lin.',
    primaryMetricLabel: 'metros lineares colados',
    unitLabel: 'm lineares colados',
    description:
      'Maclinea Dupla, Esquadra Bordo Biesse e Homag Unilateral — Mensurado em metros lineares colados',
  },
  FURADEIRA: {
    id: 'FURADEIRA',
    label: '3. Furadeiras',
    shortLabel: 'Furadeiras',
    actionVerb: 'Furado',
    primaryMetricUnit: 'peças',
    primaryMetricShort: 'pçs',
    primaryMetricLabel: 'peças furadas',
    unitLabel: 'peças furadas',
    description:
      'Biesse Techno Logic, Biesse Techno 7, Lidear F-400 e Morbidelli — Mensurado em quantidade de peças furadas',
  },
  LINHA_UV: {
    id: 'LINHA_UV',
    label: '4. Pintura — Linha de UV',
    shortLabel: 'Pintura UV',
    actionVerb: 'Pintado',
    primaryMetricUnit: 'm²',
    primaryMetricShort: 'm²',
    primaryMetricLabel: 'm² pintados',
    unitLabel: 'm² pintados',
    description: 'Linha de UV — Mensurado em m² pintado',
  },
};

export const SECTOR_LIST: SectorInfo[] = [
  SECTORS.SECCIONADORA,
  SECTORS.COLADEIRA,
  SECTORS.FURADEIRA,
  SECTORS.LINHA_UV,
];

export const SHIFTS: Record<ShiftId, string> = {
  TURNO_1: '1º Turno (06:00 - 14:20)',
  TURNO_2: '2º Turno (14:20 - 22:40)',
  TURNO_3: '3º Turno (22:40 - 06:00)',
};

export interface Machine {
  id: string;
  name: string;
  sector: SectorId;
  username: string;
  accessPin: string;
  status: MachineStatus;
  currentProduct: string;
  currentPaCode?: string;
  currentPart: string;
  currentPartCode: string;
  currentBatch: string;
  ownerId: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface CatalogPart {
  id: string;
  productName: string; // Nome do Módulo / Produto Acabado
  paCode: string; // Código do Módulo / PA (Mix de ~180 módulos)
  partName: string;
  partCode: string;
  piecesPerProduct?: number; // Quantidade desta peça por produto (ex: 1, 2, 3, 4 unidades por módulo)
  dimensions: string;
  squareMeters: number; // Área unitária em m² usada no Corte (1 face)
  uvSquareMeters?: number; // Área unitária em m² usada na Linha de UV (1 face, 2 faces pintadas ou 0)
  uvFaces?: number; // Quantidade de faces pintadas na UV: 1, 2 ou 0
  linearMeters: number; // Metros lineares de borda por peça (usado nas Coladeiras)
  edgeConfig?: string; // Ex: "1C + 2L", "2C + 2L", "1C"
  rawMaterial?: string; // Ex: 'Fundo 2,5mm' ou 'MDF 15mm'
  isFundo?: boolean; // Marcação explícita de Fundo (2,5mm / Costa)
  ownerId: string;
  createdAt?: Timestamp | null;
}

export interface FactorySettings {
  id: string;
  targetCorteM2: number; // Meta diária Corte Total (MDF + Fundos) em m²
  targetCorteMonthlyM2?: number; // Meta mensal Corte Total em m²
  targetCortePcs: number; // Meta diária Corte Total em peças
  // Metas específicas para separação dos 2 dashboards de Corte:
  targetCorteMdfM2?: number; // Meta diária Corte de MDF em m² (ex: 1.350 m²)
  targetCorteMdfMonthlyM2?: number; // Meta mensal Corte de MDF em m²
  targetCorteMdfPcs?: number; // Meta diária Corte de MDF em peças (ex: 1.600 pçs)
  targetCorteFundoM2?: number; // Meta diária Corte de Fundo em m² (ex: 450 m²)
  targetCorteFundoMonthlyM2?: number; // Meta mensal Corte de Fundo em m²
  targetCorteFundoPcs?: number; // Meta diária Corte de Fundo em peças (ex: 800 pçs)
  targetColadeiraMl: number; // Meta diária Coladeiras em metros lineares colados
  targetColadeiraMonthlyMl?: number; // Meta mensal Coladeiras em metros lineares colados
  targetColadeiraPcs: number; // Meta diária Coladeiras em peças
  targetFuradeiraPcs: number; // Meta diária Furadeiras em peças furadas
  targetFuradeiraMonthlyPcs?: number; // Meta mensal Furadeiras em peças furadas
  targetPinturaUvM2: number; // Meta diária Linha de UV em m² pintados
  targetPinturaUvMonthlyM2?: number; // Meta mensal Linha de UV em m² pintados
  targetPinturaUvPcs: number; // Meta diária Linha de UV em peças
  ownerId: string;
  updatedAt?: Timestamp | null;
}

/**
 * Extrai a espessura em milímetros (mm) a partir da string de dimensões ou do nome da peça.
 * Suporta formatos:
 * - "1568 x 297 x 15 mm", "1568x297x15", "600 x 350 x 2,5"
 * - "TAMPO 15MM", "FUNDO 2.5MM", "TRAVESSA 15 MM"
 */
export function extractThicknessMm(dimensions?: string, partName?: string): number | null {
  // 1. Tenta extrair a partir da string de dimensões (Comprimento x Largura x Espessura)
  if (dimensions) {
    const raw = dimensions.replace(/mm/gi, '').trim();
    // Separa por 'x', 'X' ou '*'
    const tokens = raw.split(/[xX*]/).map((s) => s.trim().replace(',', '.'));
    if (tokens.length >= 3) {
      const candidate = parseFloat(tokens[2]);
      if (!isNaN(candidate) && candidate > 0 && candidate <= 100) {
        return candidate;
      }
    }

    // Se houver menção explícita de espessura com sufixo mm (ex: "esp: 15mm", "15 mm", "2.5mm")
    const mmMatch = dimensions.match(/(?:esp(?:essura)?:?\s*)?(\d+(?:[.,]\d+)?)\s*mm/i);
    if (mmMatch) {
      const val = parseFloat(mmMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0 && val <= 60) {
        return val;
      }
    }
  }

  // 2. Tenta extrair do nome da peça (ex: "15MM", "25MM", "18MM", "2,5MM", "2.5MM", "3MM")
  if (partName) {
    const nameUpper = partName.toUpperCase();
    const nameMatch = nameUpper.match(/(\d+(?:[.,]\d+)?)\s*MM/);
    if (nameMatch) {
      const val = parseFloat(nameMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0 && val <= 60) {
        return val;
      }
    }
    if (nameUpper.includes('2,5') || nameUpper.includes('2.5')) return 2.5;
    if (nameUpper.includes('2,8') || nameUpper.includes('2.8')) return 2.8;
    if (nameUpper.includes('3MM') || nameUpper.includes(' 3 MM')) return 3;
  }

  return null;
}

/**
 * Detecta se uma peça é do tipo FUNDO (chapa fina de fibra/HDF/MDF de 2,5mm, 2,8mm ou 3mm, ex: fundo de gaveta, costas do móvel).
 *
 * CRÍTICO: Peças estruturais de MDF (6, 9, 12, 15, 18, 25mm) SEM BORDA e SEM UV (como travessas internas,
 * réguas de fixação, batentes, calços de montagem, laterais cruas) NÃO SÃO FUNDO!
 * Elas pertencem ao Corte de MDF e recebem Ficha de Identificação de Peças normal.
 */
export function isFundoCatalogPart(part?: Partial<CatalogPart> | null): boolean {
  if (!part) return false;
  // Prioridade absoluta para marcação explícita no cadastro/importação
  if (part.isFundo === true) return true;
  if (part.rawMaterial && part.rawMaterial.toUpperCase().includes('FUNDO')) return true;
  if (part.isFundo === false && part.rawMaterial && part.rawMaterial.toUpperCase().includes('MDF')) return false;

  const name = (part.partName || '').trim().toUpperCase();
  const code = (part.partCode || '').trim().toUpperCase();
  const dims = (part.dimensions || '').trim().toUpperCase();

  // 1. Identificação inequívoca por nome ou código
  const hasFundoKeyword =
    name.includes('FUNDO') ||
    name.includes('FND') ||
    name.includes('COSTA') ||
    name.includes('COSTAS') ||
    code.includes('FUNDO') ||
    code.startsWith('FND-') ||
    code.endsWith('-FND') ||
    code.startsWith('FND_');

  // 2. Extração de espessura
  const thickness = extractThicknessMm(dims, name);

  // 3. Se for painel estrutural de MDF (espessura >= 6mm: 6, 9, 12, 15, 18, 25mm), NUNCA é fundo
  if (thickness !== null && thickness >= 6 && !hasFundoKeyword) {
    return false;
  }
  if (
    (name.includes('15MM') ||
      name.includes('25MM') ||
      name.includes('18MM') ||
      name.includes('9MM') ||
      name.includes('12MM')) &&
    !hasFundoKeyword
  ) {
    return false;
  }

  // 4. Se tiver palavra-chave inequívoca de FUNDO/COSTA, é fundo
  if (hasFundoKeyword) {
    return true;
  }

  // 5. Se tiver espessura fina característica de chapa de fundo (<= 3.5mm: 2,5mm, 2,8mm, 3mm)
  if (thickness !== null && thickness <= 3.5) {
    return true;
  }

  // 6. Menções diretas a 2,5 / 2.5 / 2,8 / 2.8 no nome ou dimensões
  if (
    name.includes('2,5') ||
    name.includes('2.5') ||
    name.includes('2,8') ||
    name.includes('2.8') ||
    dims.includes('2,5') ||
    dims.includes('2.5') ||
    dims.includes('2,8') ||
    dims.includes('2.8')
  ) {
    return true;
  }

  // NUNCA classificar como fundo apenas pela ausência de fita de borda (SEM_BORDA) e pintura UV (0 faces)!
  // Peças de MDF estruturais sem fita e sem pintura pertencem ao Corte de MDF e têm Ficha de Identificação normal.
  return false;
}

/**
 * Identifica se uma peça/apontamento é do Corte de Fundo (2,5mm a 3mm) ou do Corte de MDF (6, 9, 12, 15, 18 e 25mm).
 */
export function isFundoPiece(
  partName?: string,
  partCode?: string,
  catalogPart?: Partial<CatalogPart> | null
): boolean {
  if (catalogPart && isFundoCatalogPart(catalogPart)) return true;
  const name = (partName || '').trim().toUpperCase();
  const code = (partCode || '').trim().toUpperCase();

  const thickness = extractThicknessMm(undefined, name);
  const hasFundoKeyword =
    name.includes('FUNDO') ||
    name.includes('FND') ||
    name.includes('COSTA') ||
    name.includes('COSTAS') ||
    code.includes('FUNDO') ||
    code.startsWith('FND-') ||
    code.endsWith('-FND') ||
    code.startsWith('FND_');

  // Se tiver espessura explícita de painel estrutural (>= 6mm) e não tiver palavra FUNDO, pertence ao Corte de MDF
  if (
    (thickness !== null && thickness >= 6 && !hasFundoKeyword) ||
    ((name.includes('15MM') ||
      name.includes('25MM') ||
      name.includes('18MM') ||
      name.includes('9MM') ||
      name.includes('12MM')) &&
      !hasFundoKeyword)
  ) {
    return false;
  }

  if (hasFundoKeyword) return true;
  if (thickness !== null && thickness <= 3.5) return true;
  if (name.includes('2,5') || name.includes('2.5') || name.includes('2,8') || name.includes('2.8')) return true;

  return false;
}

export interface ProductionLog {
  id: string;
  machineId: string;
  machineName: string;
  machineUsername: string;
  sector: SectorId;
  productName: string;
  paCode?: string;
  partName: string;
  partCode: string;
  batchNumber: string;
  quantityGood: number;
  quantityScrap: number;
  measuredAmount?: number; // Valor processado na unidade do setor (m² no Corte/UV, m linear na Coladeira, peças na Furadeira)
  operatorName: string;
  shift: ShiftId;
  notes: string;
  ticketId?: string; // Identificador Único da Ficha (ex: F-M2605206-403411-P01) para bloqueio antiduplicidade
  ownerId: string;
  createdAt?: Timestamp | null;
}

export interface InefficiencyReason {
  id: string;
  code: string; // Ex: P1, P2 ... P22
  name: string; // Ex: MANUTENÇÃO MECÂNICA, FALTA DE PROGRAMAÇÃO...
  category: InefficiencyCategory;
  sector: SectorId | 'ALL';
  ownerId: string;
  createdAt?: Timestamp | null;
}

export interface DowntimeLog {
  id: string;
  machineId: string;
  machineName: string;
  machineUsername: string;
  sector: SectorId;
  reasonCode: string; // Ex: P1
  reasonName: string; // Ex: MANUTENÇÃO MECANICA
  category: InefficiencyCategory;
  durationMinutes: number; // Tempo de parada em minutos
  operatorName: string;
  shift: ShiftId;
  notes: string;
  ownerId: string;
  createdAt?: Timestamp | null;
}

export type ScheduleColor =
  | 'VERDE'
  | 'VERMELHO'
  | 'AMARELO'
  | 'ROSA'
  | 'BRANCO'
  | 'AZUL';

export const SCHEDULE_COLORS: ScheduleColor[] = [
  'VERDE',
  'VERMELHO',
  'AMARELO',
  'ROSA',
  'BRANCO',
  'AZUL',
];

export interface ProductionOrder {
  id: string;
  orderCode: string; // Encomenda (ex: "M26051", "M26052", "I26036")
  productCode: string; // CÓDIGO (ex: "500686", "500695")
  batchNumber: string; // LOTE (ex: "M2605101", "I2603605")
  productLine: string; // LINHA (ex: "MARQUESA", "RAINHA", "KIT REALEZA")
  scheduleColor: ScheduleColor; // COR PROGRAMAÇÃO (VERDE, VERMELHO, AMARELO, ROSA, BRANCO, AZUL)
  productDescription: string; // DESCRIÇÃO DO PRODUTOS
  finishColor: string; // COR (ex: "NATURE-VERDE", "CARVALHO")
  qtyV01: number; // QTDE / VOLUMES V01 (Caixa 1/N)
  qtyV02: number; // QTDE / VOLUMES V02 (Caixa 2/N)
  qtyV03: number; // QTDE / VOLUMES V03 (Caixa 3/N)
  totalVolumes: number; // Soma total de caixas/volumes do lote (V01 + V02 + V03)
  dateCorte: string; // DATAS DE ETAPAS: CORTE
  dateColadeira: string; // DATAS DE ETAPAS: COLADEIRA
  dateFuradeira: string; // DATAS DE ETAPAS: FURADEIRA
  datePintura: string; // DATAS DE ETAPAS: PINTURA
  isHighlighted?: boolean; // Linha destacada em amarelo como na planilha
  isEncab?: boolean; // Indicador • ENCAB (ponto vermelho)
  status?: 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO';
  ownerId: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

/**
 * Calcula a quantidade real de PRODUTOS a produzir em um lote.
 * Na planilha do PMP, um produto pode ser embalado em 1, 2 ou 3 volumes/caixas:
 * - Ex.: Produto 500693 no lote I2603603 tem V01 = 200 (vol 1/2) e V02 = 200 (vol 2/2).
 *   São 400 volumes/caixas ao todo, mas 200 PRODUTOS a serem produzidos!
 */
export function getOrderProductQty(order?: Partial<ProductionOrder> | null): number {
  if (!order) return 0;
  const v1 = Math.max(0, Number(order.qtyV01) || 0);
  const v2 = Math.max(0, Number(order.qtyV02) || 0);
  const v3 = Math.max(0, Number(order.qtyV03) || 0);
  const maxBoxQty = Math.max(v1, v2, v3);
  if (maxBoxQty > 0) {
    return maxBoxQty;
  }
  return Math.max(0, Number(order.totalVolumes) || 0);
}

/**
 * Calcula a soma total de VOLUMES (caixas V01 + V02 + V03) do lote.
 */
export function getOrderTotalVolumes(order?: Partial<ProductionOrder> | null): number {
  if (!order) return 0;
  const v1 = Math.max(0, Number(order.qtyV01) || 0);
  const v2 = Math.max(0, Number(order.qtyV02) || 0);
  const v3 = Math.max(0, Number(order.qtyV03) || 0);
  const sum = v1 + v2 + v3;
  return sum > 0 ? sum : Math.max(0, Number(order.totalVolumes) || 0);
}

/**
 * Quantidade de volumes por produto acabado (ex: 1 vol, 2 vol [1/2 e 2/2], ou 3 vol [1/3, 2/3 e 3/3]).
 */
export function getOrderVolumesPerProduct(order?: Partial<ProductionOrder> | null): number {
  if (!order) return 1;
  let count = 0;
  if ((Number(order.qtyV01) || 0) > 0) count += 1;
  if ((Number(order.qtyV02) || 0) > 0) count += 1;
  if ((Number(order.qtyV03) || 0) > 0) count += 1;
  return Math.max(1, count);
}

export type AssistanceStatus = 'PENDENTE' | 'PARCIAL' | 'CONCLUIDO';

export interface AssistanceOrder {
  id: string;
  planNumber: string; // Ex: '17/26'
  planDate: string; // Ex: '21/10/2026'
  partCode: string; // Ex: '403536'
  notes?: string; // Ex: 'SEM FURAR', 'SEM FURAR / SEM CANAL'
  partName: string; // Ex: 'PORTA DIR MONTADA 798X397X18 GRG/CRV'
  productName: string; // Ex: 'SIMONE MENDES ARMARIO 2PT 800 CRV-GRG'
  quantity: number; // Ex: 10
  deliveryDeadline: string; // Ex: 'ATÉ 06/11'
  invoiceNotes?: string; // Ex: '11 ENVIADA 23094 4 ENVIADA 23101'
  deliveredQuantity?: number; // Ex: 15
  status?: AssistanceStatus;
  ownerId: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

/**
 * Calcula a quantidade entregue com base no texto do campo NOTA FISCAL ou no valor explícito.
 * Suporta formatos reais da fábrica:
 * - "23094" (número puro da NF -> 100% entregue)
 * - "12 ENVIADA 23101" -> 12 peças
 * - "11 ENVIADA 23094 4 ENVIADA 23101" -> 11 + 4 = 15 peças
 * - "5 ENVIADA 23094 10 ENVIADAS 23101" -> 5 + 10 = 15 peças
 */
export function getAssistanceDeliveredQuantity(order: Partial<AssistanceOrder>): number {
  if (typeof order.deliveredQuantity === 'number' && order.deliveredQuantity >= 0) {
    return order.deliveredQuantity;
  }
  const text = (order.invoiceNotes || '').trim();
  if (!text) return 0;

  // Se for apenas o número da Nota Fiscal (ex: "23094", "23101", "NF 23094"), significa que todo o lote foi entregue
  if (/^(?:NF\s*)?\d{3,8}$/i.test(text)) {
    return Math.max(0, order.quantity || 0);
  }

  // Se tiver menções explícitas de quantidade "X ENVIADA" ou "X ENVIADAS"
  const matches = text.match(/(\d+)\s*ENVIADA[S]?/gi);
  if (matches && matches.length > 0) {
    let sum = 0;
    matches.forEach((m) => {
      const num = parseInt(m.replace(/\D/g, ''), 10);
      if (!isNaN(num)) sum += num;
    });
    return sum;
  }

  return 0;
}

export function getAssistanceStatus(order: Partial<AssistanceOrder>): AssistanceStatus {
  if (order.status) return order.status;
  const delivered = getAssistanceDeliveredQuantity(order);
  const total = Math.max(1, order.quantity || 1);
  if (delivered >= total) return 'CONCLUIDO';
  if (delivered > 0) return 'PARCIAL';
  return 'PENDENTE';
}
