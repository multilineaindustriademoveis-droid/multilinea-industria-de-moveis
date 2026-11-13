import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  AssistanceOrder,
  CatalogPart,
  getAssistanceDeliveredQuantity,
  getAssistanceStatus,
  AssistanceStatus,
} from '../types';
import {
  Wrench,
  Search,
  Plus,
  Trash2,
  Edit2,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  Clock,
  Truck,
  Printer,
  Calendar,
  AlertTriangle,
  Layers,
  ChevronDown,
  X,
  FileText,
  RotateCcw,
  Sparkles,
  Check,
  Send,
  Eye,
  ArrowRight,
  QrCode,
  ClipboardPaste,
} from 'lucide-react';
import { AssistancePartTicketModal } from './AssistancePartTicketModal';

interface AssistancePlanManagerProps {
  assistanceOrders: AssistanceOrder[];
  catalogParts: CatalogPart[];
  onCreateAssistanceOrder: (
    payload: Omit<AssistanceOrder, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onUpdateAssistanceOrder: (
    orderId: string,
    payload: Partial<Omit<AssistanceOrder, 'id' | 'ownerId' | 'createdAt'>>
  ) => Promise<void>;
  onDeleteAssistanceOrder: (orderId: string) => Promise<void>;
  onBulkImportAssistanceOrders: (
    items: Omit<AssistanceOrder, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[]
  ) => Promise<number>;
  onRestoreDefaultAssistanceOrders?: () => Promise<number>;
  onClearAllAssistanceOrders?: (planNumber?: string) => Promise<number>;
}

export const AssistancePlanManager: React.FC<AssistancePlanManagerProps> = ({
  assistanceOrders,
  catalogParts,
  onCreateAssistanceOrder,
  onUpdateAssistanceOrder,
  onDeleteAssistanceOrder,
  onBulkImportAssistanceOrders,
  onRestoreDefaultAssistanceOrders,
  onClearAllAssistanceOrders,
}) => {
  // Extract distinct plan numbers (e.g. "17/26")
  const distinctPlans = useMemo(() => {
    const plans = new Set<string>();
    assistanceOrders.forEach((o) => {
      if (o.planNumber) plans.add(o.planNumber.trim());
    });
    const list = Array.from(plans);
    if (list.length === 0) list.push('17/26');
    list.sort((a, b) => b.localeCompare(a));
    return list;
  }, [assistanceOrders]);

  // Selected plan number
  const [selectedPlan, setSelectedPlan] = useState<string>(() => {
    return distinctPlans[0] || '17/26';
  });

  // Keep selectedPlan synced if list updates
  React.useEffect(() => {
    if (distinctPlans.length > 0 && !distinctPlans.includes(selectedPlan)) {
      setSelectedPlan(distinctPlans[0]);
    }
  }, [distinctPlans, selectedPlan]);

  // Filter items belonging to the selected plan
  const planItems = useMemo(() => {
    return assistanceOrders.filter(
      (o) => (o.planNumber || '').trim().toUpperCase() === selectedPlan.trim().toUpperCase()
    );
  }, [assistanceOrders, selectedPlan]);

  // Derive plan emission date
  const planDate = useMemo(() => {
    const firstWithDate = planItems.find((i) => i.planDate);
    return firstWithDate?.planDate || '21/10/2026';
  }, [planItems]);

  // Search & Status filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AssistanceStatus | 'OBS'>('ALL');

  // Modals state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AssistanceOrder | null>(null);

  // Dispatch / NF registration modal state
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchItem, setDispatchItem] = useState<AssistanceOrder | null>(null);
  const [dispatchNf, setDispatchNf] = useState('');
  const [dispatchQty, setDispatchQty] = useState<number>(0);
  const [dispatchNotes, setDispatchNotes] = useState('');

  // New Plan modal state
  const [isNewPlanModalOpen, setIsNewPlanModalOpen] = useState(false);
  const [newPlanNumber, setNewPlanNumber] = useState('');
  const [newPlanDate, setNewPlanDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });

  // Assistance QR Ticket modal state
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketItem, setTicketItem] = useState<AssistanceOrder | null>(null);

  const handleOpenAllTickets = () => {
    setTicketItem(null);
    setIsTicketModalOpen(true);
  };

  const handleOpenSingleTicket = (item: AssistanceOrder) => {
    setTicketItem(item);
    setIsTicketModalOpen(true);
  };

  // Toast notification state (replaces window.alert)
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Import preview modal state
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [importCandidatePlanNumber, setImportCandidatePlanNumber] = useState('');
  const [importCandidatePlanDate, setImportCandidatePlanDate] = useState('');
  const [importCandidateItems, setImportCandidateItems] = useState<
    Omit<AssistanceOrder, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[]
  >([]);
  const [importFileName, setImportFileName] = useState('');
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);

  // Paste (Ctrl+C / Ctrl+V) Modal state
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteRawText, setPasteRawText] = useState('');
  const [pastePlanNumber, setPastePlanNumber] = useState('');
  const [pastePlanDate, setPastePlanDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });

  // Deletion confirmation modals
  const [itemToDelete, setItemToDelete] = useState<AssistanceOrder | null>(null);
  const [isClearPlanModalOpen, setIsClearPlanModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Import file ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Item form state
  const [formPartCode, setFormPartCode] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPartName, setFormPartName] = useState('');
  const [formProductName, setFormProductName] = useState('');
  const [formQuantity, setFormQuantity] = useState<number>(10);
  const [formDeliveryDeadline, setFormDeliveryDeadline] = useState('ATÉ 06/11');
  const [formInvoiceNotes, setFormInvoiceNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-fill from catalog parts lookup
  const handlePartCodeChange = (code: string) => {
    setFormPartCode(code);
    const clean = code.trim().toUpperCase();
    if (clean) {
      const match = catalogParts.find((cp) => (cp.partCode || '').trim().toUpperCase() === clean);
      if (match) {
        if (!formPartName || formPartName === '') setFormPartName(match.partName || '');
        if (!formProductName || formProductName === '') setFormProductName(match.productName || '');
      }
    }
  };

  // Open item modal for create or edit
  const handleOpenItemModal = (item?: AssistanceOrder) => {
    if (item) {
      setEditingItem(item);
      setFormPartCode(item.partCode);
      setFormNotes(item.notes || '');
      setFormPartName(item.partName);
      setFormProductName(item.productName);
      setFormQuantity(item.quantity);
      setFormDeliveryDeadline(item.deliveryDeadline);
      setFormInvoiceNotes(item.invoiceNotes || '');
    } else {
      setEditingItem(null);
      setFormPartCode('');
      setFormNotes('');
      setFormPartName('');
      setFormProductName('');
      setFormQuantity(10);
      setFormDeliveryDeadline('ATÉ 06/11');
      setFormInvoiceNotes('');
    }
    setIsItemModalOpen(true);
  };

  // Save Item
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPartCode.trim() || !formPartName.trim() || !formProductName.trim() || formQuantity <= 0) {
      showToast('Preencha os campos obrigatórios (Código, Descrição da Peça, Produto e Quantidade).', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const computedDelivered = getAssistanceDeliveredQuantity({
        quantity: formQuantity,
        invoiceNotes: formInvoiceNotes,
      });
      const computedStatus: AssistanceStatus =
        computedDelivered >= formQuantity ? 'CONCLUIDO' : computedDelivered > 0 ? 'PARCIAL' : 'PENDENTE';

      if (editingItem) {
        await onUpdateAssistanceOrder(editingItem.id, {
          partCode: formPartCode.trim().toUpperCase(),
          notes: formNotes.trim(),
          partName: formPartName.trim().toUpperCase(),
          productName: formProductName.trim().toUpperCase(),
          quantity: formQuantity,
          deliveryDeadline: formDeliveryDeadline.trim(),
          invoiceNotes: formInvoiceNotes.trim(),
          deliveredQuantity: computedDelivered,
          status: computedStatus,
        });
        showToast('Peça de assistência atualizada com sucesso!', 'success');
      } else {
        await onCreateAssistanceOrder({
          planNumber: selectedPlan,
          planDate,
          partCode: formPartCode.trim().toUpperCase(),
          notes: formNotes.trim(),
          partName: formPartName.trim().toUpperCase(),
          productName: formProductName.trim().toUpperCase(),
          quantity: formQuantity,
          deliveryDeadline: formDeliveryDeadline.trim(),
          invoiceNotes: formInvoiceNotes.trim(),
          deliveredQuantity: computedDelivered,
          status: computedStatus,
        });
        showToast(`Peça adicionada ao Plano Mestre ${selectedPlan}!`, 'success');
      }

      setIsItemModalOpen(false);
    } catch (err) {
      console.error('Erro ao salvar item de assistência:', err);
      showToast('Erro ao salvar item. Tente novamente.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Dispatch Modal
  const handleOpenDispatchModal = (item: AssistanceOrder) => {
    setDispatchItem(item);
    const delivered = getAssistanceDeliveredQuantity(item);
    const remaining = Math.max(0, item.quantity - delivered);
    setDispatchQty(remaining > 0 ? remaining : item.quantity);
    setDispatchNf('');
    setDispatchNotes('');
    setIsDispatchModalOpen(true);
  };

  // Confirm Dispatch
  const handleConfirmDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchItem) return;
    if (!dispatchNf.trim()) {
      showToast('Informe o número da Nota Fiscal.', 'error');
      return;
    }
    if (dispatchQty <= 0) {
      showToast('Informe a quantidade enviada.', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const cleanNf = dispatchNf.trim().replace(/^NF\s*/i, '');
      const currentNotes = (dispatchItem.invoiceNotes || '').trim();
      const currentDelivered = getAssistanceDeliveredQuantity(dispatchItem);
      const newDelivered = currentDelivered + dispatchQty;

      // Construct factory-style NF note (e.g. "11 ENVIADA 23094 4 ENVIADA 23101" or simple "23094")
      let newInvoiceText = '';
      if (newDelivered >= dispatchItem.quantity && !currentNotes) {
        newInvoiceText = cleanNf;
      } else {
        const dispatchEntry = `${dispatchQty} ENVIADA ${cleanNf}`;
        newInvoiceText = currentNotes ? `${currentNotes} ${dispatchEntry}` : dispatchEntry;
      }

      const newStatus: AssistanceStatus =
        newDelivered >= dispatchItem.quantity ? 'CONCLUIDO' : 'PARCIAL';

      await onUpdateAssistanceOrder(dispatchItem.id, {
        invoiceNotes: newInvoiceText,
        deliveredQuantity: newDelivered,
        status: newStatus,
      });

      showToast(`Despacho de ${dispatchQty} un na NF ${cleanNf} registrado!`, 'success');
      setIsDispatchModalOpen(false);
    } catch (err) {
      console.error('Erro ao registrar envio:', err);
      showToast('Erro ao registrar envio de assistência.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create New Plan
  const handleCreateNewPlan = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = newPlanNumber.trim().toUpperCase();
    if (!cleanNum) {
      showToast('Informe o número do Plano Mestre de Assistência (ex: 18/26).', 'error');
      return;
    }
    setSelectedPlan(cleanNum);
    setIsNewPlanModalOpen(false);
    setNewPlanNumber('');
    showToast(`Plano Mestre ${cleanNum} selecionado! Você pode adicionar peças ou importar planilha.`, 'info');
  };

  // Download official blank Excel template for Assistance (.xlsx)
  const handleDownloadTemplate = () => {
    try {
      const templateData: any[][] = [
        ['PLANO MESTRE DE PRODUÇÃO - ASSISTÊNCIA TÉCNICA', '', '', '', '', '', 'MULTILINEA'],
        ['Nº Plano Mestre:', '18/26', '', 'Data:', new Date().toLocaleDateString('pt-BR'), '', 'NOTA FISCAL'],
        ['CÓDIGO', 'OBS.:', 'Descrição da Peça', 'PRODUTO', 'QTD', 'Entrega', 'NOTA FISCAL'],
        ['403536', '', 'PORTA DIR MONTADA 798X397X18 GRG/CRV', 'SIMONE MENDES ARMARIO 2PT 800 CRV-GRG', 10, 'ATÉ 06/11', ''],
        ['403525', 'SEM FURAR', 'LATERAL DIREITA SUP 1370X500X15 CRV', 'SIMONE MENDES PANELEIRO 4PT 1GV 700 CRV-GRG', 15, 'ATÉ 06/11', ''],
        ['403496', 'SEM FURAR / SEM CANAL', 'TAMPO 1170X297X15 CARVALHO', 'CONDESSA ARMARIO 1PT BASC 1200 CRV', 20, 'ATÉ 06/11', ''],
      ];

      const ws = XLSX.utils.aoa_to_sheet(templateData);
      ws['!cols'] = [
        { wch: 14 }, // CÓDIGO
        { wch: 26 }, // OBS.:
        { wch: 45 }, // Descrição da Peça
        { wch: 45 }, // PRODUTO
        { wch: 10 }, // QTD
        { wch: 14 }, // Entrega
        { wch: 28 }, // NOTA FISCAL
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Modelo_Assistencia');
      XLSX.writeFile(wb, 'Modelo_Plano_Mestre_Assistencia_Multilinea.xlsx');
      showToast('Planilha modelo baixada com sucesso! Preencha e utilize o botão "Importar Excel".', 'success');
    } catch (err) {
      console.error('Erro ao baixar modelo Excel:', err);
      showToast('Erro ao gerar planilha modelo.', 'error');
    }
  };

  // Export to Excel (.xlsx) matching exact Multilinea format
  const handleExportXLSX = () => {
    try {
      const rows: any[][] = [
        ['PLANO MESTRE DE PRODUÇÃO - ASSISTÊNCIA TÉCNICA', '', '', '', '', '', 'MULTILINEA'],
        ['Nº Plano Mestre:', selectedPlan, '', 'Data:', planDate, '', 'NOTA FISCAL'],
        ['CÓDIGO', 'OBS.:', 'Descrição da Peça', 'PRODUTO', 'QTD', 'Entrega', 'NOTA FISCAL', 'QTD ENVIADA', 'SALDO PENDENTE', 'STATUS'],
      ];

      planItems.forEach((item) => {
        const delivered = getAssistanceDeliveredQuantity(item);
        const pending = Math.max(0, item.quantity - delivered);
        rows.push([
          item.partCode,
          item.notes || '',
          item.partName,
          item.productName,
          item.quantity,
          item.deliveryDeadline,
          item.invoiceNotes || '',
          delivered,
          pending,
          getAssistanceStatus(item),
        ]);
      });

      // Total row
      const totalPcs = planItems.reduce((acc, i) => acc + (i.quantity || 0), 0);
      const totalDeliv = planItems.reduce((acc, i) => acc + getAssistanceDeliveredQuantity(i), 0);
      const totalPend = Math.max(0, totalPcs - totalDeliv);

      rows.push([
        'TOTAL DE PEÇAS',
        '',
        '',
        '',
        totalPcs,
        '',
        '',
        totalDeliv,
        totalPend,
        totalPend === 0 ? 'CONCLUIDO' : 'PARCIAL',
      ]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 14 }, // CÓDIGO
        { wch: 26 }, // OBS.:
        { wch: 45 }, // Descrição da Peça
        { wch: 45 }, // PRODUTO
        { wch: 10 }, // QTD
        { wch: 14 }, // Entrega
        { wch: 28 }, // NOTA FISCAL
        { wch: 14 }, // QTD ENVIADA
        { wch: 16 }, // SALDO PENDENTE
        { wch: 14 }, // STATUS
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Plano_${selectedPlan.replace(/[\/\\]/g, '-')}`);

      const fileName = `Plano_Mestre_Assistencia_Tecnica_${selectedPlan.replace(/[\/\\]/g, '-')}_Multilinea.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast(`Plano Mestre ${selectedPlan} exportado com sucesso!`, 'success');
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
      showToast('Erro ao exportar planilha Excel.', 'error');
    }
  };

  // Helper string normalizer
  const cleanNormalize = (val: unknown): string => {
    return String(val ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  };

  // Import from Excel (.xlsx / .xls / .csv) using ArrayBuffer & multi-strategy parser
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        if (!buffer) {
          setImportErrorMessage('Não foi possível ler os dados do arquivo selecionado.');
          setImportCandidateItems([]);
          setIsImportPreviewOpen(true);
          return;
        }

        const wb = XLSX.read(buffer, { type: 'array' });
        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          setImportErrorMessage('O arquivo Excel não contém nenhuma planilha legível.');
          setImportCandidateItems([]);
          setIsImportPreviewOpen(true);
          return;
        }

        // Look across worksheets to find one with content
        let rawData: any[][] = [];
        let usedSheetName = wb.SheetNames[0];

        for (const sName of wb.SheetNames) {
          const ws = wb.Sheets[sName];
          const sheetRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
          if (sheetRows && sheetRows.length > rawData.length) {
            rawData = sheetRows;
            usedSheetName = sName;
          }
        }

        if (!rawData || rawData.length === 0) {
          setImportErrorMessage('A planilha selecionada está vazia.');
          setImportCandidateItems([]);
          setIsImportPreviewOpen(true);
          return;
        }

        // 1. Detect Plan Number and Date from Header Metadata or Filename
        let detectedPlan = '';
        let detectedDate = '';

        // Check file name (e.g. "Plano_18_26.xlsx" or "18-26")
        const fileNamePlanMatch = file.name.match(/(\d{1,3}[\/\-_]\d{2,4})/);
        if (fileNamePlanMatch) {
          detectedPlan = fileNamePlanMatch[1].replace(/[-_]/g, '/');
        }

        // Check sheet name
        if (!detectedPlan) {
          const sheetPlanMatch = usedSheetName.match(/(\d{1,3}[\/\-_]\d{2,4})/);
          if (sheetPlanMatch) {
            detectedPlan = sheetPlanMatch[1].replace(/[-_]/g, '/');
          }
        }

        // Scan first 15 rows for metadata and headers
        let headerRowIndex = -1;
        let colCode = -1;
        let colObs = -1;
        let colDesc = -1;
        let colProd = -1;
        let colQtd = -1;
        let colEntrega = -1;
        let colNf = -1;
        let bestHeaderScore = 0;

        for (let r = 0; r < Math.min(15, rawData.length); r++) {
          const row = rawData[r] || [];
          let currentScore = 0;
          let tempCode = -1;
          let tempObs = -1;
          let tempDesc = -1;
          let tempProd = -1;
          let tempQtd = -1;
          let tempEntrega = -1;
          let tempNf = -1;

          row.forEach((cell, c) => {
            const norm = cleanNormalize(cell);

            // Metadata: Plano Mestre
            if (norm.includes('PLANO MESTRE') || norm.includes('PLANO')) {
              const inlineMatch = norm.match(/(\d{1,3}[\/\-_]\d{2,4})/);
              if (inlineMatch) {
                detectedPlan = inlineMatch[1].replace(/[-_]/g, '/');
              } else {
                for (let off = 1; off <= 3; off++) {
                  const nextCell = String(row[c + off] || '').trim();
                  const matchNext = nextCell.match(/^(\d{1,3}[\/\-_]\d{2,4})$/) || nextCell.match(/(\d{1,3}[\/\-_]\d{2,4})/);
                  if (matchNext) {
                    detectedPlan = matchNext[1].replace(/[-_]/g, '/');
                    break;
                  }
                }
              }
            }

            // Metadata: Data
            if (norm === 'DATA:' || norm.includes('DATA:') || norm === 'DATA') {
              for (let off = 1; off <= 2; off++) {
                const nextCell = String(row[c + off] || '').trim();
                if (nextCell && (nextCell.includes('/') || nextCell.includes('-') || nextCell.length >= 6)) {
                  detectedDate = nextCell;
                  break;
                }
              }
            }

            // Column: Código
            if (
              norm === 'CODIGO' ||
              norm === 'COD' ||
              norm === 'COD.' ||
              norm === 'COD_PECA' ||
              norm === 'CODIGO PECA' ||
              norm === 'CODIGO DA PECA' ||
              norm === 'PECA' ||
              norm === 'ITEM' ||
              norm === 'REFERENCIA'
            ) {
              tempCode = c;
              currentScore += 3;
            }

            // Column: Obs
            if (
              norm.startsWith('OBS') ||
              norm.includes('OBSERV') ||
              norm.includes('NOTA') ||
              norm.includes('ATENCAO')
            ) {
              tempObs = c;
              currentScore += 2;
            }

            // Column: Descrição da Peça
            if (
              norm.includes('DESCRICAO') ||
              norm.includes('NOME DA PECA') ||
              norm.includes('COMPONENTE') ||
              norm.includes('DESC') ||
              (norm.includes('PECA') && !norm.includes('COD'))
            ) {
              tempDesc = c;
              currentScore += 3;
            }

            // Column: Produto
            if (
              norm.includes('PRODUTO') ||
              norm.includes('MODULO') ||
              norm.includes('LINHA') ||
              norm === 'PA' ||
              norm.includes('CODIGO PA')
            ) {
              tempProd = c;
              currentScore += 3;
            }

            // Column: Qtd
            if (
              norm === 'QTD' ||
              norm === 'QUANT' ||
              norm === 'QUANTIDADE' ||
              norm === 'QTDE' ||
              norm === 'QTE'
            ) {
              tempQtd = c;
              currentScore += 3;
            }

            // Column: Entrega
            if (
              norm.includes('ENTREGA') ||
              norm.includes('PRAZO') ||
              norm.includes('PREVISAO') ||
              norm.includes('DATA ENTREGA')
            ) {
              tempEntrega = c;
              currentScore += 2;
            }

            // Column: Nota Fiscal
            if (
              norm.includes('NOTA FISCAL') ||
              norm === 'NF' ||
              norm.includes('DESPACHO') ||
              norm.includes('FATURA') ||
              norm.includes('ENVIADA')
            ) {
              tempNf = c;
              currentScore += 2;
            }
          });

          if (currentScore > bestHeaderScore && (tempCode !== -1 || tempDesc !== -1 || tempProd !== -1)) {
            bestHeaderScore = currentScore;
            headerRowIndex = r;
            colCode = tempCode;
            colObs = tempObs;
            colDesc = tempDesc;
            colProd = tempProd;
            colQtd = tempQtd;
            colEntrega = tempEntrega;
            colNf = tempNf;
          }
        }

        // Positional fallback if no header row was detected
        if (headerRowIndex === -1 || colCode === -1) {
          headerRowIndex = 0;
          colCode = 0;
          colObs = 1;
          colDesc = 2;
          colProd = 3;
          colQtd = 4;
          colEntrega = 5;
          colNf = 6;
        }

        // Adjust defaults if some specific column wasn't identified
        if (colDesc === -1 && colCode !== 2) colDesc = 2;
        if (colProd === -1 && colCode !== 3 && colDesc !== 3) colProd = 3;
        if (colQtd === -1) colQtd = 4;
        if (colObs === -1 && colCode === 0 && colDesc === 2) colObs = 1;
        if (colEntrega === -1) colEntrega = 5;
        if (colNf === -1) colNf = 6;

        const parsedItems: Omit<AssistanceOrder, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[] = [];

        for (let r = headerRowIndex + 1; r < rawData.length; r++) {
          const row = rawData[r] || [];
          const rawCode = String(row[colCode] || '').trim();
          if (!rawCode) continue;

          const normCode = cleanNormalize(rawCode);
          if (
            normCode.includes('TOTAL') ||
            normCode.includes('PLANO MESTRE') ||
            normCode.includes('MULTILINEA') ||
            normCode === 'CODIGO' ||
            normCode === 'COD'
          ) {
            continue;
          }

          let rawDesc = colDesc !== -1 ? String(row[colDesc] || '').trim() : '';
          let rawProd = colProd !== -1 ? String(row[colProd] || '').trim() : '';
          const rawObs = colObs !== -1 ? String(row[colObs] || '').trim() : '';
          const rawQtd = colQtd !== -1 ? Number(row[colQtd]) || 1 : 1;
          const rawEntrega = colEntrega !== -1 ? String(row[colEntrega] || '').trim() : 'ATÉ 06/11';
          const rawNf = colNf !== -1 ? String(row[colNf] || '').trim() : '';

          // Auto-fill from catalog if description or product is missing
          if (!rawDesc || !rawProd) {
            const cleanCode = rawCode.toUpperCase();
            const matchedCatalog = catalogParts.find(
              (cp) => (cp.partCode || '').trim().toUpperCase() === cleanCode
            );
            if (matchedCatalog) {
              if (!rawDesc) rawDesc = matchedCatalog.partName;
              if (!rawProd) rawProd = matchedCatalog.productName;
            }
          }

          if (!rawDesc && !rawProd) {
            if (/^\d{4,8}$/.test(rawCode)) {
              rawDesc = `Peça Cód. ${rawCode}`;
              rawProd = 'Módulo Assistência';
            } else {
              continue;
            }
          }

          const finalQuantity = Math.max(1, Math.round(rawQtd));
          const computedDelivered = getAssistanceDeliveredQuantity({
            quantity: finalQuantity,
            invoiceNotes: rawNf,
          });
          const computedStatus: AssistanceStatus =
            computedDelivered >= finalQuantity ? 'CONCLUIDO' : computedDelivered > 0 ? 'PARCIAL' : 'PENDENTE';

          parsedItems.push({
            planNumber: detectedPlan || selectedPlan || '18/26',
            planDate: detectedDate || planDate || '21/10/2026',
            partCode: rawCode.toUpperCase(),
            notes: rawObs,
            partName: rawDesc.toUpperCase(),
            productName: rawProd.toUpperCase(),
            quantity: finalQuantity,
            deliveryDeadline: rawEntrega || 'ATÉ 06/11',
            invoiceNotes: rawNf,
            deliveredQuantity: computedDelivered,
            status: computedStatus,
          });
        }

        if (parsedItems.length === 0) {
          setImportErrorMessage(
            'Nenhuma peça válida encontrada na planilha. Verifique se o arquivo possui as colunas de Código e Quantidade, ou baixe nossa planilha modelo pronta para uso.'
          );
          setImportCandidateItems([]);
          setIsImportPreviewOpen(true);
        } else {
          setImportErrorMessage(null);
          setImportCandidatePlanNumber(detectedPlan || selectedPlan || '18/26');
          setImportCandidatePlanDate(detectedDate || planDate || '21/10/2026');
          setImportCandidateItems(parsedItems);
          setIsImportPreviewOpen(true);
        }
      } catch (err) {
        console.error('Erro ao processar arquivo:', err);
        setImportErrorMessage('Erro ao ler a planilha. Verifique se o arquivo é um .xlsx, .xls ou .csv válido.');
        setImportCandidateItems([]);
        setIsImportPreviewOpen(true);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Confirm and persist candidates from Excel Import Preview
  const handleConfirmImport = async () => {
    if (importCandidateItems.length === 0) return;
    try {
      setIsSubmitting(true);
      const cleanPlan = (importCandidatePlanNumber || selectedPlan || '18/26').trim().toUpperCase();
      const cleanDate = (importCandidatePlanDate || planDate || '21/10/2026').trim();

      const itemsWithTargetPlan = importCandidateItems.map((item) => ({
        ...item,
        planNumber: cleanPlan,
        planDate: cleanDate,
      }));

      const count = await onBulkImportAssistanceOrders(itemsWithTargetPlan);
      setSelectedPlan(cleanPlan);
      setIsImportPreviewOpen(false);
      setImportCandidateItems([]);
      showToast(`Sucesso! ${count} peças cadastradas no Plano Mestre ${cleanPlan}.`, 'success');
    } catch (err) {
      console.error('Erro ao salvar peças importadas:', err);
      showToast('Erro ao salvar as peças no banco de dados.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Memoized parsed items from Paste (Ctrl+C / Ctrl+V)
  // 1ª: Código (partCode)
  // 2ª: Observação (notes)
  // 3ª: Descrição da peça (partName)
  // 4ª: Produto (productName)
  // 5ª: Quantidade (quantity)
  // 6ª: Data de entrega (deliveryDeadline)
  // 7ª: Nota fiscal (invoiceNotes)
  const pasteParsedItems = useMemo(() => {
    if (!pasteRawText.trim()) return [];

    const lines = pasteRawText.split(/\r?\n/);
    const result: Omit<AssistanceOrder, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>[] = [];

    const targetPlan = (pastePlanNumber || selectedPlan || '18/26').trim().toUpperCase();
    const targetDate = (pastePlanDate || planDate || '21/10/2026').trim();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Split primarily by Tab (\t) (standard Excel clipboard format), or semicolon (;)
      let cols = line.split('\t');
      if (cols.length === 1 && line.includes(';')) {
        cols = line.split(';');
      }
      cols = cols.map((c) => c.trim());

      const rawCode = cols[0] || '';
      if (!rawCode) continue;

      const normCode = cleanNormalize(rawCode);
      // Skip header lines or total lines if user copied entire table including headers
      if (
        normCode === 'CODIGO' ||
        normCode === 'COD' ||
        normCode === 'COD.' ||
        normCode === 'ITEM' ||
        normCode.includes('TOTAL') ||
        normCode.includes('PLANO MESTRE') ||
        normCode.includes('MULTILINEA')
      ) {
        continue;
      }

      // Column mapping requested:
      // 1ª: Código, 2ª: Observação, 3ª: Descrição da peça, 4ª: Produto, 5ª: Quantidade, 6ª: Data de entrega, 7ª: Nota fiscal
      const rawObs = cols[1] || '';
      let rawDesc = cols[2] || '';
      let rawProd = cols[3] || '';
      const rawQtd = cols[4] ? Number(cols[4].replace(/[^\d.,]/g, '').replace(',', '.')) || 1 : 1;
      const rawEntrega = cols[5] || 'ATÉ 06/11';
      const rawNf = cols[6] || '';

      // Auto-fill from catalog if description or product is missing
      if (!rawDesc || !rawProd) {
        const cleanCode = rawCode.toUpperCase();
        const matchedCatalog = catalogParts.find(
          (cp) => (cp.partCode || '').trim().toUpperCase() === cleanCode
        );
        if (matchedCatalog) {
          if (!rawDesc) rawDesc = matchedCatalog.partName;
          if (!rawProd) rawProd = matchedCatalog.productName;
        }
      }

      if (!rawDesc && !rawProd) {
        if (/^\d{4,8}$/.test(rawCode)) {
          rawDesc = `Peça Cód. ${rawCode}`;
          rawProd = 'Módulo Assistência';
        } else {
          continue;
        }
      }

      const finalQuantity = Math.max(1, Math.round(rawQtd));
      const computedDelivered = getAssistanceDeliveredQuantity({
        quantity: finalQuantity,
        invoiceNotes: rawNf,
      });
      const computedStatus: AssistanceStatus =
        computedDelivered >= finalQuantity ? 'CONCLUIDO' : computedDelivered > 0 ? 'PARCIAL' : 'PENDENTE';

      result.push({
        planNumber: targetPlan,
        planDate: targetDate,
        partCode: rawCode.toUpperCase(),
        notes: rawObs,
        partName: rawDesc.toUpperCase(),
        productName: rawProd.toUpperCase(),
        quantity: finalQuantity,
        deliveryDeadline: rawEntrega || 'ATÉ 06/11',
        invoiceNotes: rawNf,
        deliveredQuantity: computedDelivered,
        status: computedStatus,
      });
    }

    return result;
  }, [pasteRawText, pastePlanNumber, pastePlanDate, selectedPlan, planDate, catalogParts]);

  // Confirm Paste Import
  const handleConfirmPasteImport = async () => {
    if (pasteParsedItems.length === 0) {
      showToast('Nenhuma peça válida encontrada. Cole as linhas copiadas do Excel (Ctrl+V).', 'error');
      return;
    }
    try {
      setIsSubmitting(true);
      const cleanPlan = (pastePlanNumber || selectedPlan || '18/26').trim().toUpperCase();
      const count = await onBulkImportAssistanceOrders(pasteParsedItems);
      setSelectedPlan(cleanPlan);
      setIsPasteModalOpen(false);
      setPasteRawText('');
      showToast(`Sucesso! ${count} peças cadastradas no Plano Mestre ${cleanPlan} via Ctrl+V.`, 'success');
    } catch (err) {
      console.error('Erro ao salvar peças coladas:', err);
      showToast('Erro ao salvar as peças no banco de dados.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Example generator for 1-click test
  const handleLoadPasteExample = () => {
    const sampleTsv = [
      "403536\t\tPORTA DIR MONTADA 798X397X18 GRG/CRV\tSIMONE MENDES ARMARIO 2PT 800 CRV-GRG\t10\tATÉ 06/11\t23094",
      "403534\t\tPORTA DIR ESQ MONTADA 976X347X18 GRG/CRV\tSIMONE MENDES PANELEIRO 4PT 1GV 700 CRV-GRG\t10\tATÉ 06/11\t",
      "403525\tSEM FURAR\tLATERAL DIREITA SUP 1370X500X15 CRV\tSIMONE MENDES PANELEIRO 4PT 1GV 700 CRV-GRG\t15\tATÉ 06/11\t12 ENVIADA 23101",
      "403523\tSEM FURAR\tLATERAL DIREITA 780X545X15 CRV\tSIMONE MENDES PANELEIRO 4PT 1GV 700 CRV-GRG\t15\tATÉ 06/11\t",
      "403021\t\tFRENTE GAVETAO 635X357 VERDE\tRAINHA PANELEIRO  2PT 2GV 700 NT-VD\t15\tATÉ 06/11\t11 ENVIADA 23094 4 ENVIADA 23101",
      "403005\t\tFRENTE GAVETA MENOR 596X192 VERDE\tRAINHA BAL 1PT BASC 4GV 1200 NT-VD\t20\tATÉ 06/11\t23101",
      "403496\tSEM FURAR / SEM CANAL\tTAMPO 1170X297X15 CARVALHO\tCONDESSA ARMARIO 1PT BASC 1200 CRV\t20\tATÉ 06/11\t"
    ].join('\n');
    setPasteRawText(sampleTsv);
    showToast('Exemplo com as 7 colunas carregado na caixa de texto!', 'info');
  };

  // KPI Calculations
  const stats = useMemo(() => {
    let totalPieces = 0;
    let deliveredPieces = 0;
    let pendingPieces = 0;
    let itemsWithObs = 0;
    let itemsCompleted = 0;
    let itemsPartial = 0;
    let itemsPending = 0;

    planItems.forEach((item) => {
      const q = item.quantity || 0;
      const d = getAssistanceDeliveredQuantity(item);
      const p = Math.max(0, q - d);
      const s = getAssistanceStatus(item);

      totalPieces += q;
      deliveredPieces += d;
      pendingPieces += p;

      if (item.notes && item.notes.trim()) itemsWithObs += 1;
      if (s === 'CONCLUIDO') itemsCompleted += 1;
      else if (s === 'PARCIAL') itemsPartial += 1;
      else itemsPending += 1;
    });

    const completionRate = totalPieces > 0 ? (deliveredPieces / totalPieces) * 100 : 0;

    return {
      totalPieces,
      deliveredPieces,
      pendingPieces,
      itemsWithObs,
      itemsCompleted,
      itemsPartial,
      itemsPending,
      completionRate,
    };
  }, [planItems]);

  // Filtered rows for display
  const filteredItems = useMemo(() => {
    return planItems.filter((item) => {
      // Status filter
      const st = getAssistanceStatus(item);
      if (statusFilter === 'OBS') {
        if (!item.notes || !item.notes.trim()) return false;
      } else if (statusFilter !== 'ALL' && st !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        const match =
          (item.partCode || '').toUpperCase().includes(q) ||
          (item.partName || '').toUpperCase().includes(q) ||
          (item.productName || '').toUpperCase().includes(q) ||
          (item.notes || '').toUpperCase().includes(q) ||
          (item.invoiceNotes || '').toUpperCase().includes(q) ||
          (item.deliveryDeadline || '').toUpperCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [planItems, statusFilter, searchQuery]);

  return (
    <div className="space-y-6 pb-20 animate-fade-in print:p-0 print:space-y-4 relative">
      {/* Toast Notification (replaces window.alert) */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-3 max-w-md bg-slate-900/95 text-white border-slate-700">
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
          {toast.type === 'info' && <Sparkles className="w-5 h-5 text-blue-400 shrink-0" />}
          <div className="text-xs font-medium text-slate-200">{toast.message}</div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg ml-auto cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Multilinea Official Header Banner */}
      <div className="bg-gradient-to-r from-[#0a1836] via-[#0c2048] to-[#091428] rounded-2xl border border-slate-700/70 p-5 shadow-xl relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-60 -bottom-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 mt-1">
              <Wrench className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
                  PLANO MESTRE DE PRODUÇÃO — ASSISTÊNCIA TÉCNICA
                </h1>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
                  MULTILINEA
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-300 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <strong className="text-slate-400 uppercase font-mono">Nº Plano Mestre:</strong>
                  <strong className="text-amber-400 text-sm font-black font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                    {selectedPlan}
                  </strong>
                </span>
                <span className="text-slate-600">·</span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  <strong className="text-slate-400 font-mono">Data de Emissão:</strong>
                  <span className="text-white font-mono font-bold">{planDate}</span>
                </span>
                <span className="text-slate-600">·</span>
                <span>
                  Total de Itens: <strong className="text-white font-mono">{planItems.length}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Plan Selector & Actions */}
          <div className="flex items-center flex-wrap gap-2 print:hidden">
            {/* Plan dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700 px-3 py-1.5 rounded-xl">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Plano:</span>
              <select
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
                className="bg-transparent text-white font-mono font-bold text-xs focus:outline-hidden cursor-pointer"
              >
                {distinctPlans.map((p) => (
                  <option key={p} value={p} className="bg-slate-900 text-white">
                    Plano {p}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setIsNewPlanModalOpen(true)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
              title="Criar um novo Plano Mestre de Assistência Técnica (ex: 18/26)"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Novo Plano</span>
            </button>

            {/* Paste from Excel (Ctrl+V) button */}
            <button
              type="button"
              onClick={() => {
                setPastePlanNumber(selectedPlan);
                setPastePlanDate(planDate);
                setIsPasteModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-md"
              title="Cadastrar peças copiando e colando do Excel (Ctrl+C / Ctrl+V)"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-slate-950" />
              <span>Colar (Ctrl+V)</span>
            </button>

            {/* Download Template button */}
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
              title="Baixar modelo em Excel (.xlsx) pronto para preencher e importar"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Baixar Modelo</span>
            </button>

            {/* Hidden Excel input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
              title="Importar planilha Excel de assistência técnica"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>{isImporting ? 'Importando...' : 'Importar Excel'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportXLSX}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-md"
              title="Exportar este plano para Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
              <span>Exportar Excel</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAllTickets}
              className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
              title="Gerar e Imprimir Fichas de Identificação com QR-Code de todas as peças deste plano de assistência"
            >
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              <span>Fichas QR-Code</span>
            </button>

            {/* Clear all parts in plan button */}
            {planItems.length > 0 && (
              <button
                type="button"
                onClick={() => setIsClearPlanModalOpen(true)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/70 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-700/60 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
                title={`Apagar todas as ${planItems.length} peças cadastradas no Plano Mestre ${selectedPlan}`}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Limpar Plano</span>
              </button>
            )}

            {/* Restore default Plan 17/26 if currently empty or cleared */}
            {selectedPlan === '17/26' && planItems.length === 0 && onRestoreDefaultAssistanceOrders && (
              <button
                type="button"
                onClick={async () => {
                  await onRestoreDefaultAssistanceOrders();
                  showToast('Peças do Plano 17/26 restauradas com sucesso!', 'success');
                }}
                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
                title="Restaurar as 22 peças originais do Plano 17/26"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Plano 17/26</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
              title="Imprimir Plano de Assistência Técnica"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards: Total Solicitado, Entregue, Saldo Pendente, % Cumprimento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Peças */}
        <div className="bg-[#091428] rounded-2xl border border-slate-800 p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-400" />
                Total de Peças Solicitadas
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white tracking-tight font-mono">
                  {stats.totalPieces.toLocaleString('pt-BR')}
                </span>
                <span className="text-xs font-bold text-slate-400">peças</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-mono text-slate-300 font-bold border border-slate-700">
              {planItems.length} itens
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Com OBS especial (ex: Sem Furar):</span>
            <strong className="text-amber-400 font-mono">{stats.itemsWithObs} itens</strong>
          </div>
        </div>

        {/* Card 2: Peças Entregues com NF */}
        <div className="bg-[#091428] rounded-2xl border border-emerald-500/30 p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Peças Faturadas / Enviadas
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-emerald-400 tracking-tight font-mono">
                  {stats.deliveredPieces.toLocaleString('pt-BR')}
                </span>
                <span className="text-xs font-bold text-emerald-300">peças</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
              {stats.itemsCompleted} 100% Entregues
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Envios Parciais:</span>
            <strong className="text-blue-400 font-mono">{stats.itemsPartial} itens</strong>
          </div>
        </div>

        {/* Card 3: Saldo Pendente de Envio */}
        <div className="bg-[#091428] rounded-2xl border border-amber-500/30 p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400" />
                Saldo a Entregar (Pendente)
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-amber-400 tracking-tight font-mono">
                  {stats.pendingPieces.toLocaleString('pt-BR')}
                </span>
                <span className="text-xs font-bold text-amber-300">peças</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
              {stats.itemsPending} Não Iniciados
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Prazo de Entrega:</span>
            <strong className="text-white font-mono">ATÉ 06/11</strong>
          </div>
        </div>

        {/* Card 4: % Atendimento / Progresso */}
        <div className="bg-[#091428] rounded-2xl border border-blue-500/30 p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-blue-400" />
                % Atendimento da Assistência
              </span>
              <span className="text-xs font-bold text-white font-mono">
                {stats.completionRate.toFixed(1)}%
              </span>
            </div>
            <div className="mt-2.5 h-3 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                style={{ width: `${Math.min(100, stats.completionRate)}%` }}
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all rounded-full"
              />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Progresso Geral:</span>
            <span
              className={`font-bold ${
                stats.completionRate >= 100
                  ? 'text-emerald-400'
                  : stats.completionRate >= 50
                  ? 'text-blue-400'
                  : 'text-amber-400'
              }`}
            >
              {stats.deliveredPieces} de {stats.totalPieces} pçs
            </span>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters, Search, and Add Item Button */}
      <div className="bg-[#091428] rounded-2xl border border-slate-800 p-4 shadow-lg space-y-3 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'ALL', label: `Todos (${planItems.length})` },
              { id: 'PENDENTE', label: `⏳ Pendentes (${stats.itemsPending})` },
              { id: 'PARCIAL', label: `🚚 Parciais (${stats.itemsPartial})` },
              { id: 'CONCLUIDO', label: `✅ Entregues (${stats.itemsCompleted})` },
              { id: 'OBS', label: `⚠️ Com OBS (${stats.itemsWithObs})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search + Add Item */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Buscar por código, peça, NF, produto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-8 py-1.5 text-xs text-white focus:outline-hidden focus:border-blue-500 font-medium placeholder-slate-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleOpenItemModal()}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4 text-blue-200" />
              <span>Adicionar Peça</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Table: Exact Layout from Multilinea Spreadsheet */}
      <div className="bg-[#091428] rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900/90 text-slate-300 border-b border-slate-700/80 uppercase tracking-wider text-[11px] font-black">
                <th className="py-3 px-3 text-center w-12 text-slate-500 font-mono">#</th>
                <th className="py-3 px-3 w-24">CÓDIGO</th>
                <th className="py-3 px-3 w-36">OBS.:</th>
                <th className="py-3 px-4">Descrição da Peça</th>
                <th className="py-3 px-4">PRODUTO</th>
                <th className="py-3 px-3 text-right w-16">QTD</th>
                <th className="py-3 px-3 text-center w-28">Entrega</th>
                <th className="py-3 px-4 min-w-[200px]">NOTA FISCAL / ENVIO</th>
                <th className="py-3 px-3 text-right w-20">Saldo</th>
                <th className="py-3 px-3 text-center w-24">Status</th>
                <th className="py-3 px-3 text-center w-28 print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-medium">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 text-xs">
                    <div className="max-w-md mx-auto space-y-3">
                      <p className="font-bold text-slate-300 text-sm">
                        Nenhuma peça cadastrada no Plano Mestre {selectedPlan}.
                      </p>
                      <p className="text-slate-400 text-[11px]">
                        Você pode colar as peças do Excel (Ctrl+V), importar uma planilha ou adicionar uma peça manualmente.
                      </p>
                      <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setPastePlanNumber(selectedPlan);
                            setPastePlanDate(planDate);
                            setIsPasteModalOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1 cursor-pointer shadow-sm transition-all active:scale-95"
                        >
                          <ClipboardPaste className="w-3.5 h-3.5" />
                          <span>Colar do Excel (Ctrl+V)</span>
                        </button>
                        {selectedPlan === '17/26' && onRestoreDefaultAssistanceOrders && (
                          <button
                            type="button"
                            onClick={async () => {
                              await onRestoreDefaultAssistanceOrders();
                              showToast('Peças originais do Plano 17/26 restauradas!', 'success');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow-sm transition-all active:scale-95"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restaurar Peças do Plano 17/26</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const delivered = getAssistanceDeliveredQuantity(item);
                  const pending = Math.max(0, item.quantity - delivered);
                  const status = getAssistanceStatus(item);
                  const isCompleted = status === 'CONCLUIDO';
                  const isPartial = status === 'PARCIAL';
                  const hasObs = item.notes && item.notes.trim();

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isCompleted ? 'bg-emerald-950/10' : ''
                      }`}
                    >
                      {/* Index */}
                      <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-[10px]">
                        {index + 1}
                      </td>

                      {/* CÓDIGO */}
                      <td className="py-2.5 px-3 font-mono font-bold text-white tracking-wide">
                        {item.partCode}
                      </td>

                      {/* OBS */}
                      <td className="py-2.5 px-3">
                        {hasObs ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black tracking-tight bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            {item.notes}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Descrição da Peça */}
                      <td className="py-2.5 px-4 font-bold text-slate-200">
                        {item.partName}
                      </td>

                      {/* PRODUTO */}
                      <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                        {item.productName}
                      </td>

                      {/* QTD Solicitada */}
                      <td className="py-2.5 px-3 text-right font-mono font-black text-white text-sm">
                        {item.quantity}
                      </td>

                      {/* Prazo de Entrega */}
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-300">
                        {item.deliveryDeadline || '-'}
                      </td>

                      {/* NOTA FISCAL (Histórico de Envios) */}
                      <td className="py-2.5 px-4 font-mono text-[11px]">
                        {item.invoiceNotes ? (
                          <span
                            className={`font-bold ${
                              isCompleted
                                ? 'text-emerald-400'
                                : isPartial
                                ? 'text-blue-400'
                                : 'text-slate-300'
                            }`}
                          >
                            {item.invoiceNotes}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic text-[10px]">Não faturada</span>
                        )}
                      </td>

                      {/* Saldo Pendente */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {pending === 0 ? (
                          <span className="text-emerald-400">0</span>
                        ) : (
                          <span className="text-amber-400 font-black">{pending}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-center">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <Check className="w-3 h-3" />
                            Entregue
                          </span>
                        ) : isPartial ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                            <Truck className="w-3 h-3" />
                            Parcial
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            <Clock className="w-3 h-3" />
                            Pendente
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-2.5 px-3 text-center print:hidden">
                        <div className="flex items-center justify-center gap-1">
                          {/* Registrar Envio / Baixa */}
                          <button
                            type="button"
                            onClick={() => handleOpenDispatchModal(item)}
                            className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white transition-all cursor-pointer border border-blue-500/30"
                            title="Registrar envio de peças com Nota Fiscal"
                          >
                            <Truck className="w-3.5 h-3.5" />
                          </button>

                          {/* Ficha QR-Code */}
                          <button
                            type="button"
                            onClick={() => handleOpenSingleTicket(item)}
                            className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-400 hover:text-white transition-all cursor-pointer border border-amber-500/30"
                            title="Gerar Ficha de Identificação com QR-Code desta peça"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>

                          {/* Editar */}
                          <button
                            type="button"
                            onClick={() => handleOpenItemModal(item)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700"
                            title="Editar este item"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Excluir */}
                          <button
                            type="button"
                            onClick={() => setItemToDelete(item)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition-all cursor-pointer border border-slate-700"
                            title="Excluir esta peça do plano"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Table Footer with Official Sum */}
            <tfoot>
              <tr className="bg-slate-900 text-white font-black border-t-2 border-slate-700">
                <td colSpan={5} className="py-3 px-4 tracking-wider uppercase">
                  TOTAL DE PEÇAS
                </td>
                <td className="py-3 px-3 text-right font-mono text-base text-amber-400">
                  {stats.totalPieces.toLocaleString('pt-BR')}
                </td>
                <td className="py-3 px-3 text-center text-slate-500 font-mono">-</td>
                <td className="py-3 px-4 font-mono text-emerald-400">
                  {stats.deliveredPieces} ENVIADAS ({stats.completionRate.toFixed(1)}%)
                </td>
                <td className="py-3 px-3 text-right font-mono text-amber-300 text-sm">
                  {stats.pendingPieces}
                </td>
                <td className="py-3 px-3 text-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      stats.pendingPieces === 0
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {stats.pendingPieces === 0 ? 'Concluído' : 'Em Andamento'}
                  </span>
                </td>
                <td className="py-3 px-3 text-center print:hidden">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* MODAL 1: Registrar Envio / Baixa por Nota Fiscal */}
      {isDispatchModalOpen && dispatchItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#091428] rounded-2xl border border-blue-500/40 max-w-lg w-full p-5 shadow-2xl relative space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <Truck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-black text-white">Registrar Envio / Nota Fiscal</h3>
                  <p className="text-xs text-slate-400">
                    Dar baixa de entrega na peça de assistência técnica
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDispatchModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Item Summary Box */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Código da Peça:</span>
                <strong className="text-white font-mono">{dispatchItem.partCode}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Descrição:</span>
                <strong className="text-slate-200">{dispatchItem.partName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Produto:</span>
                <span className="text-slate-300">{dispatchItem.productName}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800 text-slate-300">
                <span>
                  Qtd Solicitada: <strong className="text-white">{dispatchItem.quantity}</strong>
                </span>
                <span>
                  Já Enviada:{' '}
                  <strong className="text-emerald-400">
                    {getAssistanceDeliveredQuantity(dispatchItem)}
                  </strong>
                </span>
                <span>
                  Saldo Restante:{' '}
                  <strong className="text-amber-400 font-bold">
                    {Math.max(
                      0,
                      dispatchItem.quantity - getAssistanceDeliveredQuantity(dispatchItem)
                    )}
                  </strong>
                </span>
              </div>
            </div>

            {/* Dispatch Form */}
            <form onSubmit={handleConfirmDispatch} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Número da Nota Fiscal (NF): *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 23094, 23101..."
                  value={dispatchNf}
                  onChange={(e) => setDispatchNf(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-hidden focus:border-blue-500 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Quantidade Enviada nesta Nota Fiscal: *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={dispatchItem.quantity}
                  value={dispatchQty}
                  onChange={(e) => setDispatchQty(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-hidden focus:border-blue-500 font-mono font-bold"
                />
              </div>

              {dispatchItem.invoiceNotes && (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                  <span className="text-slate-400 block font-semibold mb-0.5">
                    Histórico Atual de Faturamento:
                  </span>
                  <span className="text-blue-300 font-mono font-bold">
                    {dispatchItem.invoiceNotes}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar Envio</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Adicionar / Editar Peça de Assistência */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#091428] rounded-2xl border border-slate-700 max-w-xl w-full p-5 shadow-2xl relative space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Plus className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-black text-white">
                    {editingItem ? 'Editar Peça de Assistência' : 'Adicionar Peça de Assistência'}
                  </h3>
                  <p className="text-xs text-slate-400">Plano Mestre: {selectedPlan}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsItemModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Código */}
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    CÓDIGO DA PEÇA: *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 403536"
                    value={formPartCode}
                    onChange={(e) => handlePartCodeChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-hidden focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Auto-preenche se existir no catálogo
                  </span>
                </div>

                {/* OBS */}
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    OBS.: (Usinagem / Produção)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: SEM FURAR, SEM CANAL..."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Descrição da Peça */}
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Descrição da Peça: *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: PORTA DIR MONTADA 798X397X18 GRG/CRV"
                  value={formPartName}
                  onChange={(e) => setFormPartName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* PRODUTO */}
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  PRODUTO (Módulo / Linha): *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: SIMONE MENDES ARMARIO 2PT 800 CRV-GRG"
                  value={formProductName}
                  onChange={(e) => setFormProductName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* QTD */}
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Quantidade Solicitada (QTD): *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                {/* Entrega */}
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Prazo de Entrega: *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: ATÉ 06/11"
                    value={formDeliveryDeadline}
                    onChange={(e) => setFormDeliveryDeadline(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              {/* NOTA FISCAL */}
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  NOTA FISCAL (Histórico de Envios):
                </label>
                <input
                  type="text"
                  placeholder="Ex: 23094 ou 12 ENVIADA 23101 (opcional)"
                  value={formInvoiceNotes}
                  onChange={(e) => setFormInvoiceNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingItem ? 'Salvar Alterações' : 'Adicionar ao Plano'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Criar Novo Plano Mestre de Assistência */}
      {isNewPlanModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#091428] rounded-2xl border border-slate-700 max-w-md w-full p-5 shadow-2xl relative space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <Plus className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-black text-white">Novo Plano Mestre de Assistência</h3>
                  <p className="text-xs text-slate-400">Criar uma nova remessa / lote de assistência</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewPlanModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewPlan} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Número do Plano Mestre: *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 18/26"
                  value={newPlanNumber}
                  onChange={(e) => setNewPlanNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold text-sm focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Data de Emissão:
                </label>
                <input
                  type="text"
                  value={newPlanDate}
                  onChange={(e) => setNewPlanDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* Template & Paste quick options */}
              <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/60 text-blue-200 text-[11px] space-y-1.5">
                <p className="font-bold flex items-center gap-1.5 text-blue-300">
                  <ClipboardPaste className="w-3.5 h-3.5 text-amber-400" />
                  Cadastrar várias peças rapidamente:
                </p>
                <p className="text-slate-300">
                  Você pode colar diretamente as colunas do seu Excel (Ctrl+C / Ctrl+V) ou baixar a planilha modelo.
                </p>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const pNum = newPlanNumber.trim().toUpperCase() || selectedPlan;
                      setPastePlanNumber(pNum);
                      setPastePlanDate(newPlanDate);
                      setIsNewPlanModalOpen(false);
                      setIsPasteModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-slate-950" />
                    <span>Colar do Excel (Ctrl+V)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDownloadTemplate();
                      setIsNewPlanModalOpen(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Baixar Modelo (.xlsx)</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewPlanModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Criar Plano</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Prévia e Confirmação de Importação de Planilha Excel */}
      {isImportPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#091428] border border-slate-700/80 rounded-2xl max-w-4xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/40">
                  <Upload className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Importação de Planilha — Plano Mestre de Assistência
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Arquivo selecionado: <strong className="text-white">{importFileName}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportPreviewOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {importErrorMessage ? (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-rose-200">Não foi possível importar as peças:</p>
                    <p>{importErrorMessage}</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-2">
                  <p className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Como resolver facilmente:
                  </p>
                  <p className="text-slate-300">
                    Utilize a nossa planilha modelo oficial que já possui todos os cabeçalhos reconhecidos automaticamente pelo sistema (Código, Observação, Descrição, Produto, Quantidade, Entrega e Nota Fiscal).
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleDownloadTemplate();
                        setIsImportPreviewOpen(false);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <Download className="w-4 h-4" />
                      <span>Baixar Planilha Modelo (.xlsx)</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                {/* Meta Inputs: Plan Number and Emission Date */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      Nº do Plano Mestre: *
                    </label>
                    <input
                      type="text"
                      value={importCandidatePlanNumber}
                      onChange={(e) => setImportCandidatePlanNumber(e.target.value)}
                      placeholder="Ex: 18/26"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono font-bold text-sm focus:outline-hidden focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">
                      Data de Emissão:
                    </label>
                    <input
                      type="text"
                      value={importCandidatePlanDate}
                      onChange={(e) => setImportCandidatePlanDate(e.target.value)}
                      placeholder="DD/MM/AAAA"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-sm focus:outline-hidden focus:border-blue-500"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-2 text-xs font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{importCandidateItems.length} peças identificadas</span>
                    </div>
                  </div>
                </div>

                {/* Table Preview */}
                <div className="flex-1 overflow-auto border border-slate-800 rounded-xl bg-slate-950/60 max-h-[45vh]">
                  <table className="w-full text-left text-xs text-slate-300 border-collapse">
                    <thead className="bg-slate-900/90 text-slate-400 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Cód. Peça</th>
                        <th className="py-2.5 px-3">Obs.</th>
                        <th className="py-2.5 px-3">Descrição da Peça</th>
                        <th className="py-2.5 px-3">Produto / Módulo</th>
                        <th className="py-2.5 px-2 text-right">Qtd</th>
                        <th className="py-2.5 px-3">Entrega</th>
                        <th className="py-2.5 px-3">NF / Despacho</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {importCandidateItems.map((item, idx) => {
                        const hasSemFurar = (item.notes || '').toUpperCase().includes('SEM FURAR');
                        return (
                          <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                            <td className="py-2 px-3 font-mono font-bold text-amber-400">
                              {item.partCode}
                            </td>
                            <td className="py-2 px-3">
                              {item.notes ? (
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                    hasSemFurar
                                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/60 animate-pulse'
                                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                                  }`}
                                >
                                  {item.notes}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-200">
                              {item.partName}
                            </td>
                            <td className="py-2 px-3 text-slate-300">
                              {item.productName}
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-black text-white">
                              {item.quantity}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-300">
                              {item.deliveryDeadline}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-400">
                              {item.invoiceNotes || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <span>
                    Total acumulado:{' '}
                    <strong className="text-white font-mono">
                      {importCandidateItems.reduce((acc, i) => acc + (i.quantity || 0), 0)} peças
                    </strong>
                  </span>
                  <span>Todas as peças serão salvas e vinculadas ao plano indicado.</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsImportPreviewOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              {!importErrorMessage && importCandidateItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Salvando...'
                      : `Confirmar e Importar ${importCandidateItems.length} Peças`}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Cadastrar Plano Mestre de Assistência de Forma Manual (Ctrl+C / Ctrl+V) */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#091428] border border-slate-700/80 rounded-2xl max-w-5xl w-full p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  <ClipboardPaste className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <span>Cadastrar Plano de Assistência — Colar do Excel (Ctrl+V)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      7 Colunas
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Copie as linhas da sua tabela no Excel (Ctrl+C) e cole na caixa abaixo (Ctrl+V).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Column Guide Order matching user prompt */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
              <p className="font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <span className="text-amber-400 font-mono">Ordem exata das colunas esperadas:</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 text-[11px] font-mono">
                <div className="px-2 py-1 rounded bg-slate-800 text-amber-300 border border-slate-700">
                  <strong>1ª:</strong> Código
                </div>
                <div className="px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                  <strong>2ª:</strong> Observação
                </div>
                <div className="px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                  <strong>3ª:</strong> Descrição Peça
                </div>
                <div className="px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                  <strong>4ª:</strong> Produto
                </div>
                <div className="px-2 py-1 rounded bg-slate-800 text-emerald-300 border border-slate-700">
                  <strong>5ª:</strong> Quantidade
                </div>
                <div className="px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                  <strong>6ª:</strong> Data Entrega
                </div>
                <div className="px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                  <strong>7ª:</strong> Nota Fiscal
                </div>
              </div>
            </div>

            {/* Inputs: Plan Number & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Número do Plano Mestre: *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 18/26"
                  value={pastePlanNumber}
                  onChange={(e) => setPastePlanNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono font-bold text-sm focus:outline-hidden focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Data de Emissão:
                </label>
                <input
                  type="text"
                  placeholder="DD/MM/AAAA"
                  value={pastePlanDate}
                  onChange={(e) => setPastePlanDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-sm focus:outline-hidden focus:border-blue-500"
                />
              </div>
              <div className="flex items-end justify-between gap-2">
                <button
                  type="button"
                  onClick={handleLoadPasteExample}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                  title="Carregar 7 linhas de exemplo para testar"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Carregar Exemplo</span>
                </button>
                {pasteRawText && (
                  <button
                    type="button"
                    onClick={() => setPasteRawText('')}
                    className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 font-bold text-xs cursor-pointer transition-colors"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Paste Textarea */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-slate-300">
                  Área de Colagem (Pressione Ctrl+V aqui dentro):
                </label>
                {pasteParsedItems.length > 0 && (
                  <span className="font-mono text-emerald-400 font-bold">
                    ✓ {pasteParsedItems.length} peças identificadas com sucesso
                  </span>
                )}
              </div>
              <textarea
                rows={4}
                value={pasteRawText}
                onChange={(e) => setPasteRawText(e.target.value)}
                placeholder="Clique aqui e aperte Ctrl+V para colar as linhas copiadas do seu Excel...&#10;Exemplo:&#10;403536	[Obs]	PORTA DIR MONTADA 798X397X18 GRG/CRV	SIMONE MENDES ARMARIO	10	ATÉ 06/11	23094"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono text-xs focus:outline-hidden focus:border-amber-500 resize-y"
              />
            </div>

            {/* Real-time Preview Table */}
            {pasteParsedItems.length > 0 && (
              <div className="flex-1 overflow-hidden flex flex-col space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold text-slate-300">
                    Prévia em tempo real das peças coladas ({pasteParsedItems.length} itens):
                  </span>
                  <span>
                    Total acumulado:{' '}
                    <strong className="text-white font-mono">
                      {pasteParsedItems.reduce((acc, i) => acc + (i.quantity || 0), 0)} peças
                    </strong>
                  </span>
                </div>

                <div className="flex-1 overflow-auto border border-slate-800 rounded-xl bg-slate-950/60 max-h-[30vh]">
                  <table className="w-full text-left text-xs text-slate-300 border-collapse">
                    <thead className="bg-slate-900/90 text-slate-400 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">1ª Cód.</th>
                        <th className="py-2 px-3">2ª Obs.</th>
                        <th className="py-2 px-3">3ª Descrição da Peça</th>
                        <th className="py-2 px-3">4ª Produto</th>
                        <th className="py-2 px-2 text-right">5ª Qtd</th>
                        <th className="py-2 px-3">6ª Entrega</th>
                        <th className="py-2 px-3">7ª Nota Fiscal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {pasteParsedItems.map((item, idx) => {
                        const hasSemFurar = (item.notes || '').toUpperCase().includes('SEM FURAR');
                        return (
                          <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                            <td className="py-1.5 px-3 font-mono text-slate-500 text-[10px]">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-3 font-mono font-bold text-amber-400">
                              {item.partCode}
                            </td>
                            <td className="py-1.5 px-3">
                              {item.notes ? (
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                    hasSemFurar
                                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/60'
                                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                                  }`}
                                >
                                  {item.notes}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                            <td className="py-1.5 px-3 font-semibold text-slate-200">
                              {item.partName}
                            </td>
                            <td className="py-1.5 px-3 text-slate-300">
                              {item.productName}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono font-black text-white">
                              {item.quantity}
                            </td>
                            <td className="py-1.5 px-3 font-mono text-slate-300">
                              {item.deliveryDeadline}
                            </td>
                            <td className="py-1.5 px-3 font-mono text-slate-400">
                              {item.invoiceNotes || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPasteImport}
                disabled={isSubmitting || pasteParsedItems.length === 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Cadastrando...'
                    : pasteParsedItems.length === 0
                    ? 'Cole as linhas para continuar'
                    : `Cadastrar ${pasteParsedItems.length} Peças no Plano Mestre ${pastePlanNumber || selectedPlan}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: Confirmação de Exclusão de Peça Individual */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#091428] border border-slate-700/80 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40">
                <Trash2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Excluir Peça de Assistência
                </h3>
                <p className="text-xs text-slate-400">
                  Plano Mestre {itemToDelete.planNumber || selectedPlan}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Código da Peça:</span>
                <strong className="text-amber-400 font-mono text-sm">{itemToDelete.partCode}</strong>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-slate-400">Descrição:</span>
                <strong className="text-white text-right">{itemToDelete.partName}</strong>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-slate-400">Produto:</span>
                <span className="text-slate-300 text-right">{itemToDelete.productName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Quantidade:</span>
                <strong className="text-white font-mono">{itemToDelete.quantity} peças</strong>
              </div>
              {itemToDelete.notes && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Observação:</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                    {itemToDelete.notes}
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400">
              Tem certeza que deseja apagar esta peça? Esta ação removerá a peça imediatamente do plano.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    setIsDeleting(true);
                    const pCode = itemToDelete.partCode;
                    await onDeleteAssistanceOrder(itemToDelete.id);
                    setItemToDelete(null);
                    showToast(`Peça ${pCode} apagada com sucesso!`, 'success');
                  } catch (err) {
                    console.error('Erro ao excluir peça:', err);
                    showToast('Erro ao apagar peça.', 'error');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Apagando...' : 'Sim, Apagar Peça'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: Confirmação de Exclusão de Todas as Peças do Plano */}
      {isClearPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#091428] border border-slate-700/80 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40">
                <Trash2 className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Apagar Todas as Peças do Plano
                </h3>
                <p className="text-xs text-amber-400 font-mono font-bold">
                  Plano Mestre {selectedPlan}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-800/40 text-rose-200 text-xs space-y-2">
              <p className="font-bold flex items-center gap-1.5 text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                Atenção: Exclusão em lote!
              </p>
              <p>
                Esta ação removerá permanentemente todas as <strong>{planItems.length} peças</strong> cadastradas no <strong>Plano Mestre {selectedPlan}</strong> (total de {stats.totalPieces} peças).
              </p>
            </div>

            <p className="text-xs text-slate-400">
              Se você deseja iniciar um novo plano do zero ou limpar este plano para cadastrar outras peças, confirme abaixo:
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsClearPlanModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    setIsDeleting(true);
                    if (onClearAllAssistanceOrders) {
                      await onClearAllAssistanceOrders(selectedPlan);
                    } else {
                      for (const item of planItems) {
                        await onDeleteAssistanceOrder(item.id);
                      }
                    }
                    setIsClearPlanModalOpen(false);
                    showToast(`Todas as peças do Plano Mestre ${selectedPlan} foram apagadas!`, 'success');
                  } catch (err) {
                    console.error('Erro ao limpar plano:', err);
                    showToast('Erro ao apagar peças do plano.', 'error');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Apagando todas...' : `Sim, Apagar as ${planItems.length} Peças`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Fichas de Identificação de Peças com QR-Code para Assistência */}
      {isTicketModalOpen && (
        <AssistancePartTicketModal
          planNumber={selectedPlan}
          planDate={planDate}
          items={planItems}
          initialSelectedItem={ticketItem}
          catalogParts={catalogParts}
          onClose={() => setIsTicketModalOpen(false)}
        />
      )}
    </div>
  );
};
