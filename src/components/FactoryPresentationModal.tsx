import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Printer,
  Download,
  CheckCircle2,
  Wrench,
  Tv,
} from 'lucide-react';
import { MultilineaLogo } from './MultilineaLogo';

interface Slide {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  narratorScript: string;
  imageSrc?: string;
  imageAlt?: string;
  keyPoints: { label: string; desc: string }[];
  tools?: {
    name: string;
    spec: string;
    role: string;
    tip: string;
  }[];
  accentColor: 'blue' | 'sky' | 'amber' | 'emerald' | 'purple' | 'rose';
}

const PRESENTATION_SLIDES: Slide[] = [
  {
    id: 'intro',
    tag: 'Boas-Vindas · Chão de Fábrica',
    title: 'Sistema Multilinea MES',
    subtitle: 'Gestão Inteligente da Produção em Tempo Real',
    narratorScript:
      'Olá equipe Multilinea! Sejam muito bem-vindos à apresentação oficial do nosso novo Sistema de Controle de Produção. Este sistema foi desenvolvido pensando em você, no dia a dia das nossas máquinas e na precisão que transforma painéis de madeira em móveis de alto padrão. Vamos conhecer juntos como essa ferramenta apoia nosso trabalho diário.',
    imageSrc: '/src/assets/images/corte_seccionadora_multilinea_1793361486630.jpg',
    imageAlt: 'Linha de produção da fábrica Multilinea',
    accentColor: 'blue',
    keyPoints: [
      {
        label: 'Tempo Real',
        desc: 'Tudo o que você aponta na máquina atualiza instantaneamente os painéis e as TVs do galpão.',
      },
      {
        label: 'Medida Correta',
        desc: 'Cada setor tem sua unidade real: metros quadrados cortados, metros lineares colados e peças furadas.',
      },
      {
        label: 'Zero Papel',
        desc: 'Fim das anotações manuais perdidas ou fichas rasuradas. Tudo fica registrado com segurança.',
      },
      {
        label: 'Reconhecimento',
        desc: 'Transparência total das metas diárias para valorizar o esforço e a dedicação de cada turno.',
      },
    ],
  },
  {
    id: 'por-que-mes',
    tag: 'Objetivo Estratégico',
    title: 'Por Que Esse Sistema Foi Criado?',
    subtitle: 'Precisão, Ritmo e Conexão entre Todos os Setores',
    narratorScript:
      'Antes, para saber se atingimos a meta do dia, precisávamos esperar o fechamento de fichas manuais no final do expediente. Com o sistema Multilinea, as quatro linhas de produção — Corte, Coladeiras, Furadeiras e Pintura UV — conversam entre si a cada lote. Você sabe exatamente o que precisa produzir e quanto já foi realizado.',
    imageSrc: '/src/assets/images/coladeira_borda_multilinea_1793361486940.jpg',
    imageAlt: 'Operadores na linha de fabricação moderna',
    accentColor: 'amber',
    keyPoints: [
      {
        label: 'Sincronia Total',
        desc: 'O que a Seccionadora corta alimenta imediatamente a fila das Coladeiras e Furadeiras.',
      },
      {
        label: 'Previsibilidade',
        desc: 'O encarregado e os operadores enxergam gargalos antes que a linha fique desabastecida.',
      },
      {
        label: 'Registro de Paradas',
        desc: 'Se a máquina parar por manutenção ou falta de matéria-prima, o motivo é registrado sem culpa.',
      },
      {
        label: 'Foco no Cliente',
        desc: 'Cada peça apontada garante que o lote de móveis saia completo e no prazo para entrega.',
      },
    ],
  },
  {
    id: 'setor-corte',
    tag: 'Setor 1 · Seccionadoras',
    title: 'Linha de Corte: Giben & Selco',
    subtitle: 'Mensuração em Metros Quadrados (m²) de MDF e Fundo',
    narratorScript:
      'O Corte é o coração inicial da nossa fábrica. Aqui nas Seccionadoras Giben e Selco, nossa medida principal é o metro quadrado de painel cortado. O sistema separa com clareza o corte de MDF estrutural, de 9 a 25 milímetros, e o corte de Fundo de 2,5 milímetros, garantindo que os velocímetros reflitam o esforço real do operador.',
    imageSrc: '/src/assets/images/corte_seccionadora_multilinea_1793361486630.jpg',
    imageAlt: 'Seccionadora industrial com disco de serra cortando MDF',
    accentColor: 'blue',
    tools: [
      {
        name: 'Disco de Serra Principal (Widia TCT)',
        spec: 'Ø 350mm · 72 Dentes Trapezoidais/Retos · 4.500 RPM',
        role: 'Corta o pacote de chapas de MDF com arestas lisas e sem rebarbas.',
        tip: 'Verificar afiação a cada troca de lote de material melamínico.',
      },
      {
        name: 'Disco Riscador Cônico (Contra-Rotação)',
        spec: 'Ø 120mm · 24 Dentes Cônicos · 8.000 RPM',
        role: 'Risca a face inferior do MDF antes do corte da serra principal.',
        tip: 'Evita 100% de lascas na face inferior da fita ou melamina.',
      },
      {
        name: 'Carro Empurrador com Pinças Pneumáticas',
        spec: 'Posicionamento Numérico CNC com Precisão de ±0,1mm',
        role: 'Movimenta e esquadreja o pacote de chapas com segurança total.',
        tip: 'Manter mesa com colchão de ar ligado para não riscar as chapas.',
      },
    ],
    keyPoints: [
      {
        label: 'Meta MDF (9 a 25mm)',
        desc: 'Acompanhamento do metro quadrado de peças estruturais pesadas.',
      },
      {
        label: 'Meta Fundo (2,5mm)',
        desc: 'Monitoramento exclusivo de costas e fundos de gaveta que têm dinâmica própria de corte.',
      },
    ],
  },
  {
    id: 'setor-coladeiras',
    tag: 'Setor 2 · Borda & Acabamento',
    title: 'Linha de Coladeiras de Borda',
    subtitle: 'Maclinea Dupla, Esquadra Biesse & Homag Unilateral',
    narratorScript:
      'Na colagem de bordas, contar peças não mostra todo o trabalho. Uma peça de dois metros consome muito mais fita e tempo de máquina do que uma gavetinha pequena. Por isso, nosso sistema mede os metros lineares de fita aplicada, calculados automaticamente a partir das medidas e da configuração de borda de cada peça cadastrada.',
    imageSrc: '/src/assets/images/coladeira_borda_multilinea_1793361486940.jpg',
    imageAlt: 'Coladeira industrial de fita de borda PVC',
    accentColor: 'amber',
    tools: [
      {
        name: 'Pote de Cola Hot-Melt & Rolo Aplicador',
        spec: 'Adesivo Termofusível EVA / PUR · Temperatura de 190°C a 210°C',
        role: 'Funde e espalha a película uniforme de cola no topo do MDF.',
        tip: 'Aguardar termômetro digital atingir temperatura de regime antes de passar peças.',
      },
      {
        name: 'Fresas Diamantadas de Pré-Fusão (PCD)',
        spec: 'Cabeçotes Duplos Contra-Rotativos com Dentes Diamantados',
        role: 'Remove pequenas imperfeições de corte garantindo união invisível.',
        tip: 'Elimina efeito degrau e garante esquadro impecável da borda.',
      },
      {
        name: 'Grupo Refilador & Raspadores de Raio',
        spec: 'Motores de Alta Frequência 12.000 RPM com Lâminas Côncavas',
        role: 'Corta o excesso da fita de PVC e arredonda os cantos da peça.',
        tip: 'Ajuste fino dos apalpadores para toque suave e acabamento de fábrica.',
      },
    ],
    keyPoints: [
      {
        label: 'Métrica: Metros Lineares',
        desc: 'Soma exata do perímetro colado (1C, 2C, 1C+2L ou 4L) por produto.',
      },
      {
        label: 'Qualidade Térmica',
        desc: 'Garante que o adesivo reaja na temperatura perfeita sem descolamento.',
      },
    ],
  },
  {
    id: 'setor-furadeiras',
    tag: 'Setor 3 · Usinagem & Montagem',
    title: 'Linha de Furadeiras & Centros CNC',
    subtitle: 'Techno Logic, Techno 7, Lidear F-400 & Morbidelli',
    narratorScript:
      'Nas furadeiras, a precisão milimétrica é o que permite ao montador encaixar o móvel perfeitamente. Aqui nossa medição é por quantidade de peças furadas. Cada lote possui esquemas de furação com cavilhas, minifix e dobradiças caneco. Apontar no terminal garante que a montagem receba todas as peças sem atraso.',
    imageSrc: '/src/assets/images/furadeira_cnc_multilinea_1793361488158.jpg',
    imageAlt: 'Furadeira CNC múltipla usinando painéis de madeira',
    accentColor: 'sky',
    tools: [
      {
        name: 'Brocas de Cavilha e Passantes (Widia)',
        spec: 'Diâmetros 5mm, 8mm e 10mm com Ponta Centralizadora em V',
        role: 'Furos para cavilhas de união e prateleiras reguláveis.',
        tip: 'Verificar alinhamento e profundidade do limitador de curso.',
      },
      {
        name: 'Broca Caneco para Dobradiças (35mm)',
        spec: 'Fresa Forstner de 35mm com Navalhas de Metal Duro',
        role: 'Usinagem do alojamento da dobradiça nas portas de móveis.',
        tip: 'Evita que a broca ultrapasse a espessura da porta de 15mm.',
      },
      {
        name: 'Cabeçotes Múltiplos com Passo de 32mm',
        spec: 'Linha Modular Sistema 32 (Furação em Linha Simultânea)',
        role: 'Executa 10 a 20 furos de uma única descida pneumática.',
        tip: 'Agiliza drasticamente o tempo de ciclo em laterais de armários.',
      },
    ],
    keyPoints: [
      {
        label: 'Métrica: Peças Furadas',
        desc: 'Controle rigoroso das peças que completam os volumes V01, V02 e V03.',
      },
      {
        label: 'Setup Rápido',
        desc: 'Troca ágil de gabaritos e ferramentas para minimizar o tempo de máquina parada.',
      },
    ],
  },
  {
    id: 'setor-uv',
    tag: 'Setor 4 · Acabamento Superficial',
    title: 'Linha de Pintura UV Industrial',
    subtitle: 'Rolos de Aplicação & Secagem Ultravioleta Instantânea',
    narratorScript:
      'A Linha de Pintura UV confere a textura, a cor e a resistência que encantam nossos clientes. O sistema calcula a área real pintada em metros quadrados, considerando se a peça recebe verniz em uma face, duas faces ou selador especial. A cura ultravioleta seca a tinta em milésimos de segundo!',
    imageSrc: '/src/assets/images/linha_uv_multilinea_1793361487708.jpg',
    imageAlt: 'Linha de pintura UV com rolos aplicadores e lâmpadas ultravioleta',
    accentColor: 'purple',
    tools: [
      {
        name: 'Rolos Aplicadores de Borracha EPDM/Silicone',
        spec: 'Cilindros Retificados com Dureza 45 Shore e Ajuste Micrométrico',
        role: 'Distribui a gramatura uniforme de tinta ou verniz na peça.',
        tip: 'Limpeza periódica do rolo para evitar marcas de película na madeira.',
      },
      {
        name: 'Cilindro Dosador Reverso (Reverse Roll)',
        spec: 'Eixo Metálico Cromado com Rotação em Sentido Inverso',
        role: 'Controla a quantidade exata de produto químico em gramas por metro quadrado.',
        tip: 'Evita acúmulo de verniz e desperdício de insumos.',
      },
      {
        name: 'Fornos com Lâmpadas Ultravioleta de Alta Potência',
        spec: 'Reatores UV de 80W/cm a 120W/cm com Ventilação Externa',
        role: 'Cura fotoquímica instantânea dos polímeros em menos de 1 segundo.',
        tip: 'Peça sai do túnel 100% seca, pronta para empilhamento imediato.',
      },
    ],
    keyPoints: [
      {
        label: 'Métrica: m² Pintado',
        desc: 'Área calculada por faces pintadas (1 face, 2 faces ou crua).',
      },
      {
        label: 'Resistência Máxima',
        desc: 'Acabamento duradouro contra riscos, sol e umidade.',
      },
    ],
  },
  {
    id: 'terminal-touch',
    tag: 'Operação no Chão de Fábrica',
    title: 'O Terminal Touch do Operador',
    subtitle: 'Simples, Rápido e Seguro em 4 Passos',
    narratorScript:
      'No chão de fábrica, qualquer colaborador aprende a usar o terminal em menos de dois minutos! Basta digitar o PIN de quatro dígitos da sua máquina, selecionar o lote e a peça na tela touch, e registrar a quantidade produzida. Você também pode imprimir a ficha de identificação com código de barras diretamente na hora.',
    accentColor: 'emerald',
    tools: [
      {
        name: 'Scanner / Leitor de Código de Barras Sem Fio',
        spec: 'Leitor Óptico 1D/2D Industrial com Conexão Bluetooth',
        role: 'Lê o código do lote ou da peça sem necessidade de digitar.',
        tip: 'Aponte para a etiqueta adesiva para carregar o programa de corte instantaneamente.',
      },
      {
        name: 'Impressora Térmica de Fichas de Identificação',
        spec: 'Impressão Térmica Direta 203 DPI em Etiquetas Adesivas',
        role: 'Emite o comprovante físico que viaja junto com o pacote de peças cortadas.',
        tip: 'Contém código PA do produto, lote, dimensões e setor de destino.',
      },
      {
        name: 'Tela Touchscreen Resistente a Poeira e Resíduos',
        spec: 'Display Industrial de Alta Sensibilidade com Modo Botões Grandes',
        role: 'Permite ao operador usar a tela mesmo usando luvas de proteção (EPI).',
        tip: 'Basta um toque no botão verde para confirmar a produção concluída.',
      },
    ],
    keyPoints: [
      {
        label: 'Passo 1: Login Seguro',
        desc: 'Digite o PIN da máquina (ex: 1234) para liberar o painel operacional.',
      },
      {
        label: 'Passo 2: Selecione o Lote',
        desc: 'Escolha a Encomenda e o Lote atual (ex: M2605101 - Linha Marquesa).',
      },
      {
        label: 'Passo 3: Aponte a Quantidade',
        desc: 'Informe as peças boas e o refugo (se houver) com cálculo automático das medidas.',
      },
      {
        label: 'Passo 4: Imprima a Ficha',
        desc: 'Cole a etiqueta no lote de peças para o próximo setor identificar.',
      },
    ],
  },
  {
    id: 'paradas-pmp',
    tag: 'Qualidade & Paradas',
    title: 'Registro de Paradas & Plano Mestre (PMP)',
    subtitle: 'Códigos de Ineficiência (P1 a P22) & Cores de Programação',
    narratorScript:
      'Quando uma máquina precisa de ajuste ou manutenção, ninguém leva a culpa! O sistema possui os códigos P1 a P22 para registrar setups, troca de lâminas ou falta de material. Além disso, o Plano Mestre de Produção organiza os lotes por cores de programação, para todo mundo saber exatamente qual móvel tem prioridade hoje.',
    accentColor: 'rose',
    keyPoints: [
      {
        label: 'Motivos Coded (P1 a P22)',
        desc: 'Se a máquina parar para troca de disco ou manutenção mecânica, registre em 2 cliques.',
      },
      {
        label: 'Cores de Programação',
        desc: 'Verde, Vermelho, Amarelo, Rosa, Branco e Azul indicam a urgência e a semana de expedição.',
      },
      {
        label: 'Rastreabilidade de Refugos',
        desc: 'Identificar onde ocorreu o refugo ajuda a fábrica a solicitar reposição de peça rapidamente.',
      },
      {
        label: 'Volumes V01, V02 e V03',
        desc: 'Garante que caixas de ferragens, portas e tampos sejam finalizados juntos.',
      },
    ],
  },
  {
    id: 'tvs-dashboard',
    tag: 'Gestão Visual à Vista',
    title: 'Os Dashboards nas TVs da Fábrica',
    subtitle: 'Velocímetros de Produção, Metas e Cores Dinâmicas',
    narratorScript:
      'Nas TVs de trinta e duas polegadas instaladas no galpão, a equipe acompanha o velocímetro de produção em tempo real. O gráfico é grande e visível à distância: ele fica vermelho se a linha estiver abaixo do ritmo, e vai mudando gradualmente para azul royal conforme atingimos a meta planejada do dia!',
    accentColor: 'blue',
    keyPoints: [
      {
        label: 'Velocímetro Diário',
        desc: 'Gráfico em arco com espessura reforçada para leitura clara a 15 metros de distância.',
      },
      {
        label: 'Cor Dinâmica Inteligente',
        desc: 'Vermelho quando abaixo da meta, evoluindo para Azul Royal oficial Multilinea ao bater a meta!',
      },
      {
        label: 'Acompanhamento Mensal',
        desc: 'Barra discreta na parte inferior mostrando o acumulado do mês sem poluir a visão do dia.',
      },
      {
        label: 'Status das 10 Máquinas',
        desc: 'Indicação em verde quando 100% da linha está operando sem paradas não programadas.',
      },
    ],
  },
  {
    id: 'conclusao',
    tag: 'Orgulho Multilinea',
    title: 'Construindo o Futuro Juntos',
    subtitle: 'Nossa Fábrica, Nossos Móveis, Nossa Força de Trabalho',
    narratorScript:
      'Este sistema foi feito para valorizar o trabalho de cada um de vocês. Cada chapa cortada, cada metro de borda colada e cada furo executado constrói a reputação da Multilinea no mercado nacional. Parabéns a toda a equipe de fábrica! Vamos juntos bater as metas do dia com segurança, qualidade e orgulho!',
    imageSrc: '/src/assets/images/linha_uv_multilinea_1793361487708.jpg',
    imageAlt: 'Móveis finalizados de alta qualidade da Multilinea',
    accentColor: 'emerald',
    keyPoints: [
      {
        label: 'Segurança em Primeiro Lugar',
        desc: 'Use sempre seus EPIs: protetor auricular, óculos de segurança e sapatos com biqueira.',
      },
      {
        label: 'Orgulho de Produzir',
        desc: 'Móveis que chegam à casa de milhares de famílias brasileiras com a sua dedicação.',
      },
      {
        label: 'Evolução Contínua',
        desc: 'O sistema continua recebendo melhorias sugeridas diretamente por você, operador!',
      },
      {
        label: 'Juntos Somos Mais Fortes',
        desc: 'Multilinea Indústria de Móveis · Precisão, Parceria e Resultados.',
      },
    ],
  },
];

interface FactoryPresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FactoryPresentationModal({ isOpen, onClose }: FactoryPresentationModalProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showToolsDrawer, setShowToolsDrawer] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const currentSlide = PRESENTATION_SLIDES[currentSlideIndex];

  // Initialize Speech Synthesis and populate voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSpeechSupported(false);
      return;
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const ptVoices = voices.filter(
        (v) => v.lang.startsWith('pt') || v.lang.includes('BR') || v.lang.includes('PT')
      );
      setAvailableVoices(ptVoices.length > 0 ? ptVoices : voices);

      // Prefer Brazilian Portuguese voice
      const preferred =
        ptVoices.find(
          (v) =>
            v.lang === 'pt-BR' &&
            (v.name.includes('Google') ||
              v.name.includes('Natural') ||
              v.name.includes('Luciana') ||
              v.name.includes('Daniel'))
        ) ||
        ptVoices.find((v) => v.lang.includes('BR')) ||
        ptVoices[0] ||
        voices[0];

      if (preferred) {
        setSelectedVoiceUri(preferred.voiceURI);
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Play subtle slide transition chime using Web Audio API
  const playSlideChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    } catch {
      // AudioContext not allowed without gesture, silently ignore
    }
  };

  // Speak slide narration
  const speakCurrentSlide = () => {
    if (!speechSupported || typeof window === 'undefined') return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(currentSlide.narratorScript);
    utterance.lang = 'pt-BR';
    utterance.rate = speechRate;
    utterance.pitch = 1.0;

    if (selectedVoiceUri) {
      const voice = availableVoices.find((v) => v.voiceURI === selectedVoiceUri);
      if (voice) utterance.voice = voice;
    }

    utterance.onstart = () => {
      setIsPlayingAudio(true);
    };

    utterance.onend = () => {
      setIsPlayingAudio(false);
      // Auto advance to next slide if enabled and not at the end
      if (autoAdvance && currentSlideIndex < PRESENTATION_SLIDES.length - 1) {
        setTimeout(() => {
          goToNextSlide(true);
        }, 1200);
      }
    };

    utterance.onerror = () => {
      setIsPlayingAudio(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const stopAudio = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
  };

  const toggleAudio = () => {
    if (isPlayingAudio) {
      stopAudio();
    } else {
      speakCurrentSlide();
    }
  };

  const goToNextSlide = (autoPlayNext = isPlayingAudio) => {
    if (currentSlideIndex < PRESENTATION_SLIDES.length - 1) {
      stopAudio();
      playSlideChime();
      const nextIdx = currentSlideIndex + 1;
      setCurrentSlideIndex(nextIdx);
      if (autoPlayNext) {
        setTimeout(() => {
          const nextSlide = PRESENTATION_SLIDES[nextIdx];
          const utterance = new SpeechSynthesisUtterance(nextSlide.narratorScript);
          utterance.lang = 'pt-BR';
          utterance.rate = speechRate;
          if (selectedVoiceUri) {
            const v = availableVoices.find((vc) => vc.voiceURI === selectedVoiceUri);
            if (v) utterance.voice = v;
          }
          utterance.onstart = () => setIsPlayingAudio(true);
          utterance.onend = () => {
            setIsPlayingAudio(false);
            if (autoAdvance && nextIdx < PRESENTATION_SLIDES.length - 1) {
              setTimeout(() => goToNextSlide(true), 1200);
            }
          };
          window.speechSynthesis.speak(utterance);
        }, 400);
      }
    }
  };

  const goToPrevSlide = () => {
    if (currentSlideIndex > 0) {
      stopAudio();
      playSlideChime();
      setCurrentSlideIndex((prev) => prev - 1);
    }
  };

  const goToSlide = (idx: number) => {
    if (idx >= 0 && idx < PRESENTATION_SLIDES.length) {
      stopAudio();
      playSlideChime();
      setCurrentSlideIndex(idx);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goToNextSlide();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goToPrevSlide();
      } else if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        toggleAudio();
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentSlideIndex, isFullscreen, isPlayingAudio]);

  // Clean up audio on close
  useEffect(() => {
    if (!isOpen) {
      stopAudio();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  const handlePrintHandout = () => {
    window.print();
  };

  const handleDownloadStandalonePresentation = () => {
    const slidesJson = JSON.stringify(PRESENTATION_SLIDES);
    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Apresentação Multilinea MES - Chão de Fábrica</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body class="bg-[#060e1d] text-white min-h-screen flex flex-col justify-between p-4 sm:p-8">
  <div class="max-w-5xl mx-auto w-full space-y-6">
    <div class="flex items-center justify-between border-b border-blue-900 pb-4">
      <div>
        <h1 class="text-2xl font-black text-amber-400">MULTILINEA INDÚSTRIA DE MÓVEIS</h1>
        <p class="text-xs text-blue-200">Apresentação Oficial do Sistema MES para o Chão de Fábrica</p>
      </div>
      <button onclick="window.print()" class="no-print px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold cursor-pointer">Imprimir Slides</button>
    </div>
    <div id="slide-container" class="bg-[#091734] border border-blue-900/60 rounded-2xl p-6 sm:p-8 space-y-6">
      <div id="slide-header" class="space-y-1 border-b border-slate-800 pb-4"></div>
      <div id="slide-body" class="grid grid-cols-1 md:grid-cols-2 gap-6"></div>
    </div>
    <div class="no-print flex items-center justify-between pt-2">
      <button id="prev-btn" onclick="prevSlide()" class="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold cursor-pointer">Anterior</button>
      <div class="flex items-center gap-3">
        <button id="speak-btn" onclick="toggleSpeak()" class="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs cursor-pointer shadow-md">🔊 Ouvir Narração</button>
        <span id="slide-counter" class="text-xs font-mono text-slate-400"></span>
      </div>
      <button id="next-btn" onclick="nextSlide()" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold cursor-pointer">Próximo</button>
    </div>
  </div>
  <script>
    const slides = ${slidesJson};
    let current = 0;
    let speaking = false;
    function render() {
      const s = slides[current];
      document.getElementById('slide-counter').innerText = 'Slide ' + (current + 1) + ' de ' + slides.length;
      document.getElementById('slide-header').innerHTML = '<span class="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider">' + s.tag + '</span><h2 class="text-2xl sm:text-3xl font-extrabold text-white mt-1">' + s.title + '</h2><p class="text-sm text-blue-200/80">' + s.subtitle + '</p>';
      
      let keyPointsHtml = '<div class="space-y-3"><h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Pontos Fundamentais para a Equipe:</h4><div class="space-y-2">';
      s.keyPoints.forEach(function(p) {
        keyPointsHtml += '<div class="p-3 bg-slate-900 border border-slate-800 rounded-xl"><strong class="text-xs font-bold text-amber-400 block mb-0.5">✓ ' + p.label + '</strong><span class="text-xs text-slate-300">' + p.desc + '</span></div>';
      });
      keyPointsHtml += '</div></div>';

      let toolsHtml = '';
      if (s.tools && s.tools.length > 0) {
        toolsHtml += '<div class="p-4 bg-slate-950/80 border border-amber-500/30 rounded-xl space-y-2.5"><h4 class="text-xs font-bold text-amber-300">🛠️ Ferramentas & Especificações:</h4>';
        s.tools.forEach(function(t) {
          toolsHtml += '<div class="p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs"><strong class="text-white block">' + t.name + '</strong><span class="text-sky-400 font-mono text-[11px] block font-semibold">' + t.spec + '</span><span class="text-slate-300 block mt-0.5">' + t.role + '</span><span class="text-amber-400 text-[10px] block mt-1 font-medium">💡 Dica: ' + t.tip + '</span></div>';
        });
        toolsHtml += '</div>';
      }

      document.getElementById('slide-body').innerHTML = '<div class="space-y-4"><div class="p-4 bg-blue-950/40 border border-blue-900/60 rounded-xl"><h4 class="text-xs font-bold text-amber-400 mb-1">Roteiro de Narração por Voz:</h4><p class="text-xs text-slate-300 italic leading-relaxed">"' + s.narratorScript + '"</p></div>' + toolsHtml + '</div>' + keyPointsHtml;

      document.getElementById('prev-btn').disabled = current === 0;
      document.getElementById('next-btn').disabled = current === slides.length - 1;
    }
    function toggleSpeak() {
      if ('speechSynthesis' in window) {
        if (speaking) {
          window.speechSynthesis.cancel();
          speaking = false;
          document.getElementById('speak-btn').innerText = '🔊 Ouvir Narração';
        } else {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(slides[current].narratorScript);
          u.lang = 'pt-BR';
          u.rate = 1.0;
          u.onstart = function() { speaking = true; document.getElementById('speak-btn').innerText = '⏸️ Pausar Áudio'; };
          u.onend = function() { speaking = false; document.getElementById('speak-btn').innerText = '🔊 Ouvir Narração'; };
          window.speechSynthesis.speak(u);
        }
      }
    }
    function prevSlide() { if (current > 0) { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); current--; render(); } }
    function nextSlide() { if (current < slides.length - 1) { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); current++; render(); } }
    render();
  </script>
</body>
</html>`;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Apresentacao_Multilinea_MES_Fabrica.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-[#060e1d]/98 text-slate-100 flex flex-col backdrop-blur-xl overflow-hidden select-none"
    >
      {/* 1. TOP BAR — Industrial Control Strip */}
      <header className="h-16 border-b border-slate-800 bg-[#09152b] px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <MultilineaLogo size="sm" showMesBadge={false} />
          <div className="h-5 w-[1px] bg-slate-700 hidden sm:block" />
          <div className="hidden sm:flex flex-col">
            <span className="text-xs font-bold text-white tracking-wide">
              Apresentação Oficial para a Fábrica
            </span>
            <span className="text-[10px] text-slate-400">
              Chão de Fábrica · Máquinas, Ferramentas e Metas em Tempo Real
            </span>
          </div>
        </div>

        {/* Audio Narration Quick Bar */}
        <div className="flex items-center gap-2 bg-[#0d1d3d] border border-blue-900/80 rounded-xl px-3 py-1.5 shadow-inner">
          <button
            type="button"
            onClick={toggleAudio}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              isPlayingAudio
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md shadow-amber-500/20 animate-pulse'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
            title="Narrar slide atual com voz em português"
          >
            {isPlayingAudio ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pausar Áudio</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Ouvir Narração</span>
              </>
            )}
          </button>

          {/* Voice Wave Animation when speaking */}
          {isPlayingAudio && (
            <div className="flex items-center gap-0.5 px-1">
              <span className="w-1 h-3 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1 h-5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1 h-2 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.4s]" />
              <span className="w-1 h-4 bg-amber-400 rounded-full animate-bounce" />
            </div>
          )}

          {/* Speed Selector */}
          <div className="flex items-center gap-1 border-l border-slate-700/80 pl-2">
            {[1.0, 1.2, 1.5].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setSpeechRate(rate)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                  speechRate === rate
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Auto Advance Toggle */}
          <button
            type="button"
            onClick={() => setAutoAdvance(!autoAdvance)}
            className={`hidden md:flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
              autoAdvance
                ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400'
            }`}
            title="Avança automaticamente para o próximo slide quando o áudio terminar"
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Auto-Avanço</span>
          </button>
        </div>

        {/* Presentation Utility Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowToolsDrawer(!showToolsDrawer)}
            className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              showToolsDrawer
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title="Ver / Ocultar Anatomia e Especificações das Ferramentas"
          >
            <Wrench className="w-4 h-4" />
            <span className="hidden xl:inline">Ferramentas</span>
          </button>

          <button
            type="button"
            onClick={handlePrintHandout}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Imprimir Resumo da Apresentação para Distribuir aos Operadores"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleDownloadStandalonePresentation}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Baixar Apresentação Offline / PowerPoint (Arquivo Autônomo com Áudio)"
          >
            <Download className="w-4 h-4 text-amber-400" />
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Tela Cheia (F11 / Apresentação em Projetor ou TV)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-300 hover:text-white rounded-lg transition-colors cursor-pointer ml-1"
            title="Fechar Apresentação (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. MAIN SLIDE VIEWPORT */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 flex flex-col items-center justify-center">
        <div className="w-full max-w-6xl bg-[#091734] border border-blue-900/60 rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10 flex flex-col gap-6 relative overflow-hidden">
          {/* Subtle Industrial Background Pattern */}
          <div className="absolute -right-24 -bottom-24 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

          {/* Slide Header & Metadata */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider uppercase text-amber-400">
                <span>{currentSlide.tag}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">
                  Slide {currentSlideIndex + 1} de {PRESENTATION_SLIDES.length}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                {currentSlide.title}
              </h1>
              <p className="text-sm sm:text-base text-blue-200/80 font-medium">
                {currentSlide.subtitle}
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <span className="text-[11px] font-mono text-slate-400 bg-slate-900/90 border border-slate-800 px-3 py-1 rounded-full">
                Multilinea Indústria de Móveis
              </span>
            </div>
          </div>

          {/* Slide Body Split: Left Visual / Machinery — Right Content & Practical Steps */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Column: Image or Machinery Spotlight */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {currentSlide.imageSrc ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 aspect-video lg:aspect-auto lg:h-full min-h-[220px] shadow-lg group">
                  <img
                    src={currentSlide.imageSrc}
                    alt={currentSlide.imageAlt || currentSlide.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-4">
                    <span className="text-xs font-semibold text-white/90 drop-shadow-sm flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      {currentSlide.imageAlt || 'Operação Industrial Multilinea'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[220px] rounded-xl border border-blue-900/50 bg-gradient-to-br from-blue-950/40 via-slate-900 to-[#0a1835] p-6 flex flex-col justify-center items-center text-center">
                  <Tv className="w-16 h-16 text-amber-400/80 mb-3" />
                  <h3 className="text-lg font-bold text-white mb-1">
                    Painel Operacional em Tempo Real
                  </h3>
                  <p className="text-xs text-blue-200/70 max-w-xs">
                    Disponível no computador do operador, tablet na máquina e nas TVs de 32" do galpão.
                  </p>
                </div>
              )}

              {/* Narrator Voice Transcript Box */}
              <div className="p-3.5 bg-blue-950/30 border border-blue-900/50 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-400">
                  <span className="flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5" />
                    Roteiro de Narração por Voz
                  </span>
                  <button
                    type="button"
                    onClick={toggleAudio}
                    className="hover:underline text-[10px] text-blue-300 cursor-pointer"
                  >
                    {isPlayingAudio ? 'Pausar' : 'Ouvir este slide'}
                  </button>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed italic">
                  "{currentSlide.narratorScript}"
                </p>
              </div>
            </div>

            {/* Right Column: Key Points + Technical Tools Anatomy */}
            <div className="lg:col-span-7 flex flex-col justify-between gap-5">
              {/* Core Takeaways */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Pontos Fundamentais para a Equipe:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentSlide.keyPoints.map((pt, i) => (
                    <div
                      key={i}
                      className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors"
                    >
                      <span className="text-xs font-bold text-amber-400 block mb-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        {pt.label}
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">{pt.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Illustrated Tool Anatomy (if applicable to this slide) */}
              {showToolsDrawer && currentSlide.tools && currentSlide.tools.length > 0 && (
                <div className="p-4 bg-slate-950/60 border border-amber-500/30 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Wrench className="w-4 h-4 text-amber-400" />
                      Anatomia Técnica de Ferramentas & Máquinas
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Especificações de Chão de Fábrica
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {currentSlide.tools.map((tool, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-white block">
                            {tool.name}
                          </span>
                          <span className="text-[11px] font-mono text-sky-400 block font-semibold">
                            {tool.spec}
                          </span>
                          <p className="text-[11px] text-slate-300 leading-snug">{tool.role}</p>
                        </div>
                        <div className="sm:text-right shrink-0">
                          <span className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-700/60 px-2 py-0.5 rounded font-medium inline-block">
                            💡 Dica: {tool.tip}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM SLIDE NAVIGATION & THUMBNAILS DRAWER */}
      <footer className="h-20 border-t border-slate-800 bg-[#081329] px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
        {/* Previous Button */}
        <button
          type="button"
          onClick={goToPrevSlide}
          disabled={currentSlideIndex === 0}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Anterior</span>
        </button>

        {/* Thumbnail Dots & Slide Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-2xl py-1 px-2">
          {PRESENTATION_SLIDES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goToSlide(idx)}
              className={`h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                currentSlideIndex === idx
                  ? 'bg-blue-600 text-white font-bold ring-2 ring-blue-400 shadow-md'
                  : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
              }`}
              title={s.title}
            >
              <span className="font-mono text-[11px]">{idx + 1}</span>
              <span className="hidden md:inline truncate max-w-[120px]">
                {s.title.split(':')[0]}
              </span>
            </button>
          ))}
        </div>

        {/* Next Button */}
        <button
          type="button"
          onClick={() => goToNextSlide()}
          disabled={currentSlideIndex === PRESENTATION_SLIDES.length - 1}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-600/20"
        >
          <span className="hidden sm:inline">Próximo</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </footer>
    </div>
  );
}
