import React, { useState, useRef, useEffect } from 'react';
import { 
  Scissors, Copy, Printer, Shield, BookOpen, Stamp, 
  Palette, Monitor, Package, CalendarCheck, PiggyBank,
  UserCheck, List, Key, Lock, Trash2, 
  X, CheckCircle2, ArrowRight, LogOut, Search, Loader2, AlertCircle, Eye, EyeOff, FolderOpen,  TrendingUp, DollarSign, Receipt, PieChart, Users, ChevronLeft, ChevronRight, FileText, Download, Calendar,
  Banknote, QrCode, CreditCard, Calculator, FileSpreadsheet, Plus, Clock,
  Wifi, WifiOff, RefreshCw
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dbLocal, type LocalVenda } from './db/localDb';
import { syncService } from './services/syncService';
import { useSyncStatus } from './hooks/useSyncStatus';

const SETORES = [
  { id: 'MATERIAIS', label: 'MATERIAL', icon: Scissors, shortcut: 'F1' },
  { id: 'CÓPIA', label: 'CÓPIA', icon: Copy, shortcut: 'F2' },
  { id: 'IMPR. P/B', label: 'IMPRESSÃO P/B', icon: Printer, shortcut: 'F3' },
  { id: 'IMPR. COLOR', label: 'IMPRESSÃO COLORIDA', icon: Printer, shortcut: 'F4' },
  { id: 'PLASTIFICAÇÃO', label: 'PLASTIFICAÇÃO', icon: Shield, shortcut: 'F5' },
  { id: 'ENCADERNAÇÃO', label: 'ENCADERNAÇÃO', icon: BookOpen, shortcut: 'F6' },
  { id: 'CARIMBO', label: 'CARIMBO', icon: Stamp, shortcut: 'F7' },
  { id: 'GRÁFICA', label: 'GRÁFICA', icon: Palette, shortcut: 'F8' },
  { id: 'INFORMÁTICA', label: 'INFORMÁTICA', icon: Monitor, shortcut: 'F9' },
  { id: 'PACOTE', label: 'PACOTE', icon: Package, shortcut: 'F10' },
  { id: 'MENSALISTA', label: 'MENSALISTA', icon: CalendarCheck, shortcut: 'F11', reqObs: true, isMensalista: true },
  { id: 'RETIRADA', label: 'RETIRADA', icon: PiggyBank, shortcut: 'F12', reqObs: true, isDanger: true },
];

const USUARIOS_CONFIG: Record<string, { unidade: string; email: string }> = {
  "loja-MOGI": { unidade: "MOGI", email: "mogi@yamaprint.local" },
  "loja-SUZANO": { unidade: "SUZANO", email: "suzano@yamaprint.local" }
};

const DADOS_UNIDADES: Record<string, any> = {
  "MOGI": {
    razao: "YAMA PRINT - PAPELARIA E GRÁFICA RÁPIDA",
    cnpj: "23.870.982/0001-78",
    site: "www.yamaprint.com.br",
    endereco: "Rua Princesa Isabel de Bragança, 334 - Centro - Mogi das Cruzes/SP",
    cep: "08710-460",
    whatsapp: "11 3458-9796",
    email: "mogi@yamaprint.com.br"
  },
  "SUZANO": {
    razao: "YAMA PRINT - PAPELARIA E GRÁFICA RÁPIDA",
    cnpj: "58.504.948/0001-64",
    site: "www.yamaprint.com.br",
    endereco: "Av. General Francisco Glicério, 901 - Centro - Suzano /SP",
    cep: "08674-003",
    whatsapp: "11 4744-7839",
    email: "suzano@yamaprint.com.br"
  }
};

const formatarMoedaPtBr = (valor: number) => {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatarDataParaPadrao = (dataIso: string) => {
  if (!dataIso) return '';
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}_${mes}_${ano.slice(2)}`;
};

const formatarCpfCnpj = (valor: string) => {
  const apenasDigitos = valor.replace(/\D/g, '');
  if (!apenasDigitos) return '';
  if (apenasDigitos.length <= 11) {
    return apenasDigitos
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    return apenasDigitos
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 18);
  }
};

export default function App() {
  const [logado, setLogado] = useState(false);
  const [usuario, setUsuario] = useState('loja-MOGI');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  
  const [unidade, setUnidade] = useState(() => {
    return localStorage.getItem('yama_unidade') || 'MOGI';
  });

  useEffect(() => {
    localStorage.setItem('yama_unidade', unidade);
  }, [unidade]);

  const [statusCaixa, setStatusCaixa] = useState<Record<string, any>>({ status: 'A Carregando...' });
  const [setorAtivo, setSetorAtivo] = useState<string | null>(null);
  
  const [precoInput, setPrecoInput] = useState<string>('0');
  const [qtd, setQtd] = useState<number>(1);
  const [carrinho, setCarrinho] = useState<Array<{ id?: string; setor: string; valor: number; qtd: number; obs: string }>>([]);

  const [modalAberto, setModalAberto] = useState<string | null>(null);
  const [trocoInput, setTrocoInput] = useState<string>('100.00');
  const [carregando, setCarregando] = useState<boolean>(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string>('');
  const [mensagemTrocaResultado, setMensagemTrocaResultado] = useState<string>('');
  const [erroLoginMsg, setErroLoginMsg] = useState<string | null>(null);

  const syncState = useSyncStatus();

  useEffect(() => {
    if (logado) {
      carregarStatus(unidade);
    }
  }, [syncState.lastSyncAt]);

  const [sidebarExpandida, setSidebarExpandida] = useState(true);
  
  const [calcDisplay, setCalcDisplay] = useState('0');

  const [nomeClienteOrcamento, setNomeClienteOrcamento] = useState('');
  const [docClienteOrcamento, setDocClienteOrcamento] = useState('');
  const [descontoPercentual, setDescontoPercentual] = useState<string>('');
  const [itensOrcamento, setItensOrcamento] = useState<Array<{ descricao: string; qtd: string; valorUnit: string }>>([
    { descricao: '', qtd: '', valorUnit: '' }
  ]);

  const ultimoItemRef = useRef<HTMLInputElement>(null);

  const adicionarItemOrcamento = () => {
    setItensOrcamento(prev => [...prev, { descricao: '', qtd: '', valorUnit: '' }]);
    setTimeout(() => {
      if (ultimoItemRef.current) {
        ultimoItemRef.current.focus();
      }
    }, 50);
  };

  const [toasts, setToasts] = useState<Array<{ id: number; mensagem: string; tipo: 'sucesso' | 'erro' | 'aviso' | 'retirada' | 'neutro' }>>([]);
  const contadorToastRef = useRef(0);

  const dispararToast = (mensagem: string, tipo: 'sucesso' | 'erro' | 'aviso' | 'retirada' | 'neutro' = 'sucesso') => {
    const id = ++contadorToastRef.current;
    setToasts(prev => [...prev.slice(-1), { id, mensagem, tipo }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2600);
  };

  const [dataSelecionadaResumo, setDataSelecionadaResumo] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [verificandoArquivo, setVerificandoArquivo] = useState(false);
  const [arquivoEncontrado, setArquivoEncontrado] = useState<string | null>(null);

  const [linkResumoRecente, setLinkResumoRecente] = useState<{ url: string; nome: string } | null>(null);

  const [pendenteRetirada, setPendenteRetirada] = useState<{ valor: number; qtd: number } | null>(null);
  const [obsRetiradaInput, setObsRetiradaInput] = useState<string>('');

  const [dadosVendasModal, setDadosVendasModal] = useState<any[]>([]);
  const [termoBusca, setTermoBusca] = useState<string>('');
  const [filtroSetor, setFiltroSetor] = useState<string>('TODOS');
  const [valorMin, setValorMin] = useState<string>('');
  const [valorMax, setValorMax] = useState<string>('');

  const [vendaParaCancelar, setVendaParaCancelar] = useState<any>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState<string>('');
  const [sucessoExclusaoMsg, setSucessoExclusaoMsg] = useState<string | null>(null);

  const inputPrecoRef = useRef<HTMLInputElement>(null);
  const inputTrocoRef = useRef<HTMLInputElement>(null);
  const inputObsRetiradaRef = useRef<HTMLInputElement>(null);
  const totalCarrinho = carrinho.reduce((acc, item) => acc + item.valor * item.qtd, 0);

  useEffect(() => {
    const verificarSessaoInicial = async () => {
      try {
        const dataHoje = new Date().toISOString().split('T')[0];
        const ultimoLoginData = localStorage.getItem('yama_ultimo_login_data');

        if (ultimoLoginData && ultimoLoginData !== dataHoje) {
          try { await supabase.auth.signOut(); } catch {}
          localStorage.removeItem('yama_ultimo_login_data');
          setLogado(false);
          return;
        }

        let temSessao = false;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) temSessao = true;
        } catch (authErr) {
          console.warn("Verificação online de sessão falhou, checando cache local:", authErr);
        }

        if (temSessao || (ultimoLoginData && ultimoLoginData === dataHoje)) {
          setLogado(true);
          await carregarStatus(unidade);
        }
      } catch (e) {
        console.error("Erro na verificação inicial:", e);
      }
    };
    verificarSessaoInicial();
  }, [unidade]);

  useEffect(() => {
    const handleCalcKeyDown = (e: KeyboardEvent) => {
      if (modalAberto !== 'calculadora') return;
      
      let tecla = e.key;
      if (tecla === ',') tecla = '.';

      const permitidas = ['0','1','2','3','4','5','6','7','8','9','+','-','*','/','.','(',')'];
      if (permitidas.includes(tecla)) {
        e.preventDefault();
        setCalcDisplay(prev => prev === '0' || prev === 'Erro' ? tecla : prev + tecla);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        try {
          const resultado = Function('"use strict";return (' + calcDisplay.replace(/×/g, '*') + ')')();
          setCalcDisplay(String(resultado));
        } catch {
          setCalcDisplay('Erro');
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setCalcDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
      } else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') {
        e.preventDefault();
        setCalcDisplay('0');
      }
    };

    window.addEventListener('keydown', handleCalcKeyDown);
    return () => window.removeEventListener('keydown', handleCalcKeyDown);
  }, [modalAberto, calcDisplay]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalAberto !== 'calculadora') {
        if (vendaParaCancelar) {
          setVendaParaCancelar(null);
        } else if (modalAberto) {
          setModalAberto(null);
        }
      }

      if (e.ctrlKey && logado && statusCaixa.status === 'Aberto' && !modalAberto) {
        if (e.key.toLowerCase() === 'l') {
          e.preventDefault();
          setDadosVendasModal(statusCaixa.vendas || []);
          setTermoBusca('');
          setFiltroSetor('TODOS');
          setValorMin('');
          setValorMax('');
          setModalAberto('listar');
        } else if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          setDadosVendasModal(statusCaixa.vendas || []);
          setModalAberto('fluxo_caixa');
        }
      }

      if (logado && statusCaixa.status === 'Aberto' && !modalAberto) {
        SETORES.forEach(s => {
          if (e.key.toLowerCase() === s.shortcut.toLowerCase()) {
            e.preventDefault();
            selecionarSetorDinamico(s.id);
          }
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalAberto, vendaParaCancelar, logado, statusCaixa.status, statusCaixa.vendas]);

  useEffect(() => {
    if (modalAberto === 'abrir') {
      setTimeout(() => {
        if (inputTrocoRef.current) {
          inputTrocoRef.current.focus();
          inputTrocoRef.current.select();
        }
      }, 50);
    }
    if (modalAberto === 'modal_obs_retirada') {
      setTimeout(() => {
        if (inputObsRetiradaRef.current) {
          inputObsRetiradaRef.current.focus();
        }
      }, 50);
    }
  }, [modalAberto]);

  useEffect(() => {
    if (modalAberto === 'registros_storage' && dataSelecionadaResumo) {
      verificarResumoData(dataSelecionadaResumo);
    }
  }, [dataSelecionadaResumo, modalAberto, unidade]);

  const verificarResumoData = async (dataIso: string) => {
    setVerificandoArquivo(true);
    setArquivoEncontrado(null);
    try {
      const dataFormatada = formatarDataParaPadrao(dataIso);
      const nomeEsperado = `${dataFormatada}.pdf`;

      const { data, error } = await supabase.storage
        .from('relatorios')
        .list(`${unidade.toLowerCase()}/resumo`, {
          search: nomeEsperado
        });

      if (!error && data && data.length > 0) {
        setArquivoEncontrado(nomeEsperado);
      }
    } catch (err) {
      console.error("Erro ao verificar arquivo:", err);
    } finally {
      setVerificandoArquivo(false);
    }
  };

  const baixarResumoPorData = async () => {
    if (!arquivoEncontrado) return;
    try {
      const caminhoCompleto = `${unidade.toLowerCase()}/resumo/${arquivoEncontrado}`;
      const { data, error } = await supabase.storage
        .from('relatorios')
        .download(caminhoCompleto);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = arquivoEncontrado;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao baixar PDF:', error);
      alert('Não foi possível efetuar o download do arquivo.');
    }
  };

  const gerarPdfOrcamento = () => {
    const infoLoja = DADOS_UNIDADES[unidade] || DADOS_UNIDADES["MOGI"];
    const doc = new jsPDF();

    try {
      doc.addImage('/logo-orc.png', 'PNG', 14, 11, 24, 24);
    } catch (e) {
      console.warn("Logotipo não carregado no PDF, prosseguindo sem imagem.", e);
    }

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(13.5);
    doc.setTextColor(15, 23, 42); 
    doc.text(infoLoja.razao, 42, 18);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(70, 70, 70);
    doc.text(`CNPJ: ${infoLoja.cnpj}  |  Site: ${infoLoja.site}`, 42, 25);

    doc.setDrawColor(220, 224, 230);
    doc.line(14, 39, 196, 39);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("ORÇAMENTO DE PRODUTOS E SERVIÇOS", 14, 47);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    const clienteTexto = nomeClienteOrcamento.trim() ? nomeClienteOrcamento.trim().toUpperCase() : "__________________________________________________";
    doc.text(`Cliente: ${clienteTexto}`, 14, 54);

    if (docClienteOrcamento.trim()) {
      doc.text(`CPF/CNPJ: ${formatarCpfCnpj(docClienteOrcamento)}`, 14, 60);
    } else {
      doc.text(`CPF/CNPJ: ________________________`, 14, 60);
    }
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString()}`, 14, 66);

    const corpoTabela = itensOrcamento.map(i => {
      const q = parseFloat(i.qtd) || 0;
      const v = parseFloat(i.valorUnit) || 0;
      const totalItem = q > 0 && v > 0 ? q * v : 0;
      return [
        i.descricao || '',
        i.qtd !== '' ? i.qtd : '',
        i.valorUnit !== '' ? formatarMoedaPtBr(v) : '',
        totalItem > 0 ? formatarMoedaPtBr(totalItem) : ''
      ];
    });

    const subtotalOrcamento = itensOrcamento.reduce((acc, i) => {
      const q = parseFloat(i.qtd) || 0;
      const v = parseFloat(i.valorUnit) || 0;
      return acc + (q * v);
    }, 0);

    const percDesconto = parseFloat(descontoPercentual.replace(',', '.')) || 0;
    const valorDesconto = (subtotalOrcamento * percDesconto) / 100;
    const valorTotalOrcamento = Math.max(0, subtotalOrcamento - valorDesconto);

    autoTable(doc, {
      startY: 72,
      head: [['DESCRIÇÃO DOS ITENS / SERVIÇOS', 'QTD', 'VALOR UNIT.', 'TOTAL']],
      body: corpoTabela,
      theme: 'grid',
      styles: { font: 'Helvetica', fontSize: 10 },
      headStyles: { fillColor: [15, 23, 42], fontSize: 10 }, 
      columnStyles: {
        0: { cellWidth: 94 },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 35, halign: 'right' },
        3: { cellWidth: 33, halign: 'right' }
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 8;

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(70, 70, 70);

    if (percDesconto > 0 && subtotalOrcamento > 0) {
      doc.text(`Subtotal: ${formatarMoedaPtBr(subtotalOrcamento)}`, 196, finalY, { align: 'right' });
      finalY += 6;
      doc.text(`Desconto Aplicado (${percDesconto}%): - ${formatarMoedaPtBr(valorDesconto)}`, 196, finalY, { align: 'right' });
      finalY += 8;
    }

    if (subtotalOrcamento > 0) {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`VALOR TOTAL: ${formatarMoedaPtBr(valorTotalOrcamento)}`, 196, finalY, { align: 'right' });
    }

    doc.setFont("Helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`* Orçamento válido por 7 (sete) dias a partir da data de emissão.`, 14, finalY + 16);
    doc.text(`Unidade ${unidade} — Atendimento de Segunda a Sexta - das 9h as 18h | Sábado - das 9h as 14h.`, 14, finalY + 22);

    const posYRodape = doc.internal.pageSize.height - 15;
    doc.setDrawColor(220, 224, 230);
    doc.line(14, posYRodape - 6, 196, posYRodape - 6);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(`${infoLoja.endereco}  |  CEP: ${infoLoja.cep}  |  WhatsApp: ${infoLoja.whatsapp}  |  E-mail: ${infoLoja.email}`, 105, posYRodape, { align: 'center' });

    const nomeArquivoPdf = nomeClienteOrcamento.trim() 
      ? `Orcamento_${nomeClienteOrcamento.trim().replace(/\s+/g, '_').toUpperCase()}.pdf` 
      : `Orcamento_Em_Branco.pdf`;

    doc.save(nomeArquivoPdf);
    setModalAberto(null);
    dispararToast('Orçamento gerado com sucesso!', 'sucesso');
  };

  const lidarComMudancaPreco = (valorStr: string) => {
    if (valorStr.includes(',')) {
      setPrecoInput(valorStr);
      return;
    }
    const apenasDigitos = valorStr.replace(/\D/g, '');
    if (!apenasDigitos) {
      setPrecoInput('0');
      return;
    }
    setPrecoInput(parseInt(apenasDigitos, 10).toString());
  };

  const converterPrecoParaFloat = (valorStr: string) => {
    if (!valorStr) return 0;
    const formatado = valorStr.replace(/\./g, '').replace(',', '.');
    return parseFloat(formatado) || 0;
  };

  const fazerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroLoginMsg(null);
    const config = USUARIOS_CONFIG[usuario];
    if (!config) {
      setErroLoginMsg('Usuário inválido.');
      return;
    }

    try {
      let autenticado = false;

      if (navigator.onLine) {
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email: config.email,
            password: senha
          });

          if (!error) {
            autenticado = true;
            try {
              localStorage.setItem(`yama_offline_cred_${usuario}`, btoa(senha));
            } catch {}
          } else {
            setErroLoginMsg('Senha incorreta ou erro de autenticação.');
            return;
          }
        } catch (authErr) {
          console.warn("Erro de rede no login online, testando cache offline:", authErr);
        }
      }

      if (!autenticado) {
        const credSalva = localStorage.getItem(`yama_offline_cred_${usuario}`);
        if (credSalva && credSalva === btoa(senha)) {
          autenticado = true;
          dispararToast('Login efetuado em MODO OFFLINE!', 'aviso');
        } else {
          setErroLoginMsg('Senha incorreta ou sem conexão para o primeiro acesso.');
          return;
        }
      }

      const dataHoje = new Date().toISOString().split('T')[0];
      localStorage.setItem('yama_ultimo_login_data', dataHoje);

      setUnidade(config.unidade);
      setLogado(true);
      await carregarStatus(config.unidade);
      dispararToast(`Bem-vindo à unidade ${config.unidade}!`, 'sucesso');
    } catch (err: any) {
      setErroLoginMsg('Erro ao efetuar login.');
    }
  };

  const fazerLogout = () => {
    try {
      supabase.auth.signOut();
    } catch {}
    localStorage.removeItem('yama_ultimo_login_data');
    setLogado(false);
    setSenha('');
    setCarrinho([]);
    setSetorAtivo(null);
    dispararToast('Sessão encerrada.', 'aviso');
  };

  const carregarStatus = async (uni = unidade) => {
    try {
      let sessao: any = null;

      // 1. Tenta carregar sessão ativa online
      if (navigator.onLine) {
        try {
          const { data: sessoes, error: errSessao } = await supabase
            .from("caixa_sessoes")
            .select("*")
            .eq("unidade", uni)
            .eq("status", "ABERTO")
            .order("aberto_em", { ascending: false })
            .limit(1);

          if (!errSessao && sessoes && sessoes.length > 0) {
            sessao = sessoes[0];
            await syncService.cacheSessao(sessao);
          }
        } catch (errOnline) {
          console.warn("Falha ao buscar sessão online, buscando no cache local:", errOnline);
        }
      }

      // Se não encontrou online ou está offline, busca no Dexie local
      if (!sessao) {
        const sessaoLocal = await dbLocal.sessoes
          .where("unidade")
          .equals(uni)
          .and(s => s.status === "ABERTO")
          .reverse()
          .sortBy("aberto_em");

        if (sessaoLocal && sessaoLocal.length > 0) {
          sessao = sessaoLocal[0];
        }
      }

      if (!sessao) {
        setStatusCaixa({
          status: "Fechado",
          dataHora: "CAIXA FECHADO",
          trocoInicial: "0.00",
          caixa2Ativo: false,
          vendas: [],
          totais: { totalVendas: 0.0, saldoCaixa: 0.0, repasseCaixa2: 0.0, totalClientesUnicos: 0, ticketMedio: 0.0, porSetor: {}, porPagamento: { DINHEIRO: 0, PIX: 0, DÉBITO: 0, CRÉDITO: 0 } }
        });
        setDadosVendasModal([]);
        return;
      }

      // 2. Carrega vendas: combina online e locais
      let vendasRaw: any[] = [];
      const sessaoIdStr = String(sessao.id);

      if (navigator.onLine) {
        try {
          const { data, error: errVendas } = await supabase
            .from("vendas")
            .select("*")
            .eq("sessao_id", sessao.id)
            .order("numero_sequencial", { ascending: true });

          if (!errVendas && data) {
            vendasRaw = data;
            await syncService.cacheVendas(data, sessaoIdStr);
          }
        } catch (errVendasOnline) {
          console.warn("Falha ao buscar vendas online, buscando no cache local:", errVendasOnline);
        }
      }

      // Busca vendas locais desta sessão (inclui pendentes e as que já foram cacheadas)
      const vendasLocais = await dbLocal.vendas
        .where("sessao_id")
        .equals(sessaoIdStr)
        .sortBy("numero_sequencial");

      // Faz merge para garantir que nenhuma venda recente/offline seja perdida
      if (vendasRaw.length === 0) {
        vendasRaw = vendasLocais;
      } else {
        const idsVendasRaw = new Set(vendasRaw.map(v => String(v.id)));
        vendasLocais.forEach(vl => {
          if (!idsVendasRaw.has(String(vl.id))) {
            vendasRaw.push(vl);
          } else if (vl.sync_action === 'cancel' || vl.forma_pagto === 'CANCELADO') {
            const idx = vendasRaw.findIndex(v => String(v.id) === String(vl.id));
            if (idx >= 0) {
              vendasRaw[idx].forma_pagto = 'CANCELADO';
              vendasRaw[idx].observacao = vl.observacao;
            }
          }
        });
        vendasRaw.sort((a, b) => Number(a.numero_sequencial) - Number(b.numero_sequencial));
      }

      let total_vendas = 0.0;
      let dinheiro_liquido = 0.0;
      let repasse_caixa_2 = 0.0;
      const SETORES_ORDEM = [
        "MATERIAIS", "CÓPIA", "IMPR. P/B", "IMPR. COLOR",
        "PLASTIFICAÇÃO", "ENCADERNAÇÃO", "CARIMBO", "GRÁFICA",
        "INFORMÁTICA", "PACOTE", "MENSALISTA", "RETIRADA"
      ];
      const por_setor: Record<string, number> = {};
      SETORES_ORDEM.forEach(s => por_setor[s] = 0.0);

      const por_pagto: Record<string, number> = { "DINHEIRO": 0.0, "PIX": 0.0, "DÉBITO": 0.0, "CRÉDITO": 0.0 };
      const vendas_formatadas: any[] = [];
      const ids_unicos_validos = new Set();

      if (vendasRaw) {
        vendasRaw.forEach((v: any) => {
          const valor = parseFloat(v.valor);
          const pagto = v.forma_pagto;
          const setor = v.setor;

          if (pagto !== "CANCELADO") {
            ids_unicos_validos.add(v.numero_sequencial);
            if (setor === "RETIRADA") {
              por_setor["RETIRADA"] = (por_setor["RETIRADA"] || 0) + valor;
              if (pagto === "DINHEIRO") dinheiro_liquido -= valor;
            } else {
              total_vendas += valor;
              if (por_setor[setor] !== undefined) por_setor[setor] += valor;
              if (por_pagto[pagto] !== undefined) por_pagto[pagto] += valor;
              if (pagto === "DINHEIRO") {
                dinheiro_liquido += valor;
                if (v.is_caixa_2) repasse_caixa_2 += valor;
              }
            }
          }

          const dataCriacao = new Date(v.criado_em);
          vendas_formatadas.push({
            uuid: v.id,
            id: String(v.numero_sequencial).padStart(4, '0'),
            setor: setor,
            hora: isNaN(dataCriacao.getTime()) ? '--:--:--' : dataCriacao.toLocaleTimeString(),
            valor: valor,
            valorFormatado: formatarMoedaPtBr(valor),
            pagamento: pagto,
            obs: v.observacao || "",
            isCaixa2: v.is_caixa_2
          });
        });
      }

      vendas_formatadas.reverse();
      const total_clientes = ids_unicos_validos.size;
      const ticket_medio = total_clientes > 0 ? total_vendas / total_clientes : 0;
      const dtAbertura = new Date(sessao.aberto_em).toLocaleString();

      const statusObj = {
        status: "Aberto",
        sessaoId: sessao.id,
        dataAberturaISO: sessao.aberto_em.slice(0, 10),
        dataHora: dtAbertura,
        trocoInicial: parseFloat(sessao.troco_inicial).toFixed(2),
        caixa2Ativo: sessao.caixa_2_ativo,
        vendas: vendas_formatadas,
        totais: {
          totalVendas: parseFloat(total_vendas.toFixed(2)),
          saldoCaixa: parseFloat((parseFloat(sessao.troco_inicial) + dinheiro_liquido).toFixed(2)),
          repasseCaixa2: parseFloat(repasse_caixa_2.toFixed(2)),
          totalClientesUnicos: total_clientes,
          ticketMedio: parseFloat(ticket_medio.toFixed(2)),
          porSetor: por_setor,
          porPagamento: por_pagto
        }
      };

      setStatusCaixa(statusObj);
      setDadosVendasModal(vendas_formatadas);
    } catch (err) {
      console.error("Erro ao carregar status do caixa:", err);
    }
  };

  const selecionarSetorDinamico = (idSetor: string) => {
    if (statusCaixa.status !== 'Aberto') {
      setModalAberto('aviso_caixa_fechado');
      return;
    }
    setSetorAtivo(idSetor);
    setTimeout(() => {
      if (inputPrecoRef.current) {
        inputPrecoRef.current.focus();
        inputPrecoRef.current.select();
      }
    }, 50);
  };

  const handleAbrirCaixa = async () => {
    setCarregando(true);
    try {
      const valorTroco = parseFloat(trocoInput.replace(',', '.')) || 0;
      const novoId = crypto.randomUUID();
      const agora = new Date().toISOString();

      let gravadoOnline = false;

      if (navigator.onLine) {
        try {
          const { data, error } = await supabase
            .from("caixa_sessoes")
            .insert([{ unidade, status: "ABERTO", troco_inicial: valorTroco, caixa_2_ativo: false }])
            .select()
            .single();

          if (!error && data) {
            gravadoOnline = true;
            await dbLocal.sessoes.put({
              id: String(data.id),
              unidade: data.unidade,
              status: data.status,
              troco_inicial: Number(data.troco_inicial) || 0,
              caixa_2_ativo: !!data.caixa_2_ativo,
              aberto_em: data.aberto_em,
              sync_status: 'synced'
            });
          }
        } catch (e) {
          console.warn("Erro ao abrir caixa no Supabase, abrindo offline:", e);
        }
      }

      if (!gravadoOnline) {
        await dbLocal.sessoes.put({
          id: novoId,
          unidade: unidade,
          status: "ABERTO",
          troco_inicial: valorTroco,
          caixa_2_ativo: false,
          aberto_em: agora,
          sync_status: 'pending'
        });
      }

      await syncService.contarPendentes();
      await carregarStatus(unidade);
      setModalAberto(null);
      dispararToast(gravadoOnline ? 'Caixa aberto com sucesso!' : 'Caixa aberto em modo offline!', 'sucesso');
    } catch (err) {
      alert('Erro ao abrir caixa.');
    } finally {
      setCarregando(false);
    }
  };

  const handleFecharCaixa = async () => {
    setCarregando(true);
    try {
      if (!statusCaixa.sessaoId) return;

      if (statusCaixa.caixa2Ativo) {
        alert("Finalize o Caixa Almoço antes de fechar o dia.");
        setModalAberto(null);
        setCarregando(false);
        return;
      }

      const dataCaixaIso = statusCaixa.dataAberturaISO || new Date().toISOString().slice(0, 10);
      const dataCaixaFormatada = formatarDataParaPadrao(dataCaixaIso); // dd_mm_aa
      const unidadeLower = unidade.toLowerCase();

      // ==========================================
      // 1. GERAR E GUARDAR PDF DE RESUMO (dd_mm_aa.pdf)
      // ==========================================
      const docResumo = new jsPDF();
      
      docResumo.setFont("Helvetica", "bold");
      docResumo.setFontSize(16);
      docResumo.text(`RELATÓRIO DE FECHAMENTO DE CAIXA — UNIDADE `, 14, 18);
      const larguraTextoBase = docResumo.getTextWidth(`RELATÓRIO DE FECHAMENTO DE CAIXA — UNIDADE `);
      docResumo.setTextColor(225, 29, 72);
      docResumo.text(`${unidade}`, 14 + larguraTextoBase, 18);

      docResumo.setTextColor(15, 23, 42);
      docResumo.setFont("Helvetica", "normal");
      docResumo.setFontSize(12);
      docResumo.text(`DATA DO FECHAMENTO: ${dataCaixaIso.split('-').reverse().join('/')}   |   Clientes Atendidos: ${statusCaixa.totais.totalClientesUnicos}`, 14, 27);

      // Tabela 1: Setores
      docResumo.setFont("Helvetica", "bold");
      docResumo.text("1. Faturamento Detalhado por Setor", 14, 38);

      const dadosSetorPdf = Object.entries(statusCaixa.totais.porSetor || {}).map(([setor, valor]) => [
        setor,
        formatarMoedaPtBr(Number(valor))
      ]);

      autoTable(docResumo, {
        startY: 42,
        head: [['SETOR', 'FATURAMENTO']],
        body: dadosSetorPdf,
        theme: 'grid',
        styles: { font: 'Helvetica', fontSize: 12, fontStyle: 'bold' },
        headStyles: { fillColor: [0, 0, 0], fontSize: 12 },
        columnStyles: { 
          0: { cellWidth: 120 },
          1: { cellWidth: 62, halign: 'right' } 
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const setorNome = data.row.raw[0];
            if (setorNome === 'RETIRADA') {
              data.cell.styles.textColor = [225, 29, 72];
            }
          }
        }
      });

      let nextY = (docResumo as any).lastAutoTable.finalY + 10;

      // Tabela 2: Resumo Financeiro
      docResumo.setFont("Helvetica", "bold",);
      docResumo.text("2. Resumo Financeiro", 14, nextY);

      const dadosResumoFin = [
        ['TROCO INICIAL', formatarMoedaPtBr(Number(statusCaixa.trocoInicial || 0))],
        ['TOTAL EM DINHEIRO', formatarMoedaPtBr(Number(statusCaixa.totais.porPagamento?.DINHEIRO || 0))],
        ['TOTAL EM PIX', formatarMoedaPtBr(Number(statusCaixa.totais.porPagamento?.PIX || 0))],
        ['TOTAL EM DÉBITO', formatarMoedaPtBr(Number(statusCaixa.totais.porPagamento?.DÉBITO || 0))],
        ['TOTAL EM CRÉDITO', formatarMoedaPtBr(Number(statusCaixa.totais.porPagamento?.CRÉDITO || 0))],
        ['REPASSE 2º CAIXA (Almoço)', formatarMoedaPtBr(Number(statusCaixa.totais.repasseCaixa2 || 0))]
      ];

      autoTable(docResumo, {
        startY: nextY + 4,
        body: dadosResumoFin,
        theme: 'grid',
        styles: { font: 'Helvetica', fontSize: 12, fontStyle: 'bold'},
        columnStyles: { 
          0: { cellWidth: 120, fontStyle: 'bold' }, 
          1: { cellWidth: 62, halign: 'right' } 
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const setorNome = data.row.raw[0];
            if (setorNome === 'REPASSE 2º CAIXA (Almoço)') {
              data.cell.styles.textColor = [100, 10, 170];
            } 
          }
        }
        
      });

      nextY = (docResumo as any).lastAutoTable.finalY + 10;

      // Tabela 3: Fechamento de Caixa
      docResumo.setFont("Helvetica", "bold");
      docResumo.text("3. Fechamento de Caixa", 14, nextY);

      const dadosFechamentoCaixa = [
        ['Ticket Médio', formatarMoedaPtBr(Number(statusCaixa.totais.ticketMedio || 0))],
        ['Faturamento Total', formatarMoedaPtBr(Number(statusCaixa.totais.totalVendas || 0))],
        ['Saldo em Caixa', formatarMoedaPtBr(Number(statusCaixa.totais.saldoCaixa || 0))]
      ];

      autoTable(docResumo, {
        startY: nextY + 4,
        body: dadosFechamentoCaixa,
        theme: 'grid',
        styles: { font: 'Helvetica', fontSize: 15 },
        columnStyles: { 
          0: { cellWidth: 120, fontStyle: 'bold' }, 
          1: { cellWidth: 62, halign: 'right' } 
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const label = data.row.raw[0];
            if (label === 'Faturamento Total') {
              data.cell.styles.textColor = [20, 86, 255];
              data.cell.styles.fontStyle = 'bold';
            } else if (label === 'Saldo em Caixa') {
              data.cell.styles.textColor = [36, 131, 68];
              data.cell.styles.fontStyle = 'bold';
            } else if (label === 'Ticket Médio') {
              data.cell.styles.textColor = [0, 0, 0];
              data.cell.styles.fontStyle = 'bold';
            }
            
          }
        }
      });

      const blobResumo = docResumo.output('blob');
      const nomeResumo = `${dataCaixaFormatada}.pdf`;
      const caminhoResumo = `${unidadeLower}/resumo/${nomeResumo}`;

      // Uploads dos relatórios (tenta online; se offline, enfileira localmente)
      let uploadResumoOk = false;
      let uploadVendasOk = false;

      if (navigator.onLine) {
        try {
          const { error: err1 } = await supabase.storage
            .from('relatorios')
            .upload(caminhoResumo, blobResumo, { contentType: 'application/pdf', upsert: true });
          if (!err1) uploadResumoOk = true;
        } catch (e) {
          console.warn("Upload resumo online falhou:", e);
        }
      }

      // ==========================================
      // 2. GERAR E GUARDAR PDF DE VENDAS DETALHADAS (dd_mm_aa-V.pdf)
      // ==========================================
      const docVendas = new jsPDF();
      docVendas.setFont("Helvetica", "bold");
      docVendas.setFontSize(14);
      docVendas.text(`REGISTRO DETALHADO DE VENDAS — UNIDADE ${unidade}`, 14, 20);

      docVendas.setFont("Helvetica", "normal");
      docVendas.setFontSize(10);
      docVendas.text(`Data de Abertura: ${dataCaixaIso}`, 14, 28);

      const linhasVendasPdf = (statusCaixa.vendas || []).map((v: any) => [
        `#${v.id}`,
        v.setor,
        v.hora,
        v.valorFormatado,
        v.pagamento,
        v.obs || '-'
      ]);

      autoTable(docVendas, {
        startY: 35,
        head: [['ID', 'Setor', 'Hora', 'Valor', 'Pagamento', 'Observação']],
        body: linhasVendasPdf,
        theme: 'grid',
        styles: { font: 'Helvetica', fontSize: 10 },
        headStyles: { fillColor: [15, 23, 42], fontSize: 10 },
        columnStyles: { 
          0: { cellWidth: 15 },
          1: { cellWidth: 35 },
          2: { cellWidth: 22 },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 26 },
          5: { cellWidth: 56 }
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const setorVal = data.row.raw[1];
            if (setorVal === 'RETIRADA') {
              data.cell.styles.textColor = [225, 29, 72];
            }
          }
        }
      });

      const blobVendas = docVendas.output('blob');
      const nomeVendas = `${dataCaixaFormatada}-V.pdf`;
      const caminhoVendas = `${unidadeLower}/vendas/${nomeVendas}`;

      if (navigator.onLine) {
        try {
          const { error: err2 } = await supabase.storage
            .from('relatorios')
            .upload(caminhoVendas, blobVendas, { contentType: 'application/pdf', upsert: true });
          if (!err2) uploadVendasOk = true;
        } catch (e) {
          console.warn("Upload vendas online falhou:", e);
        }
      }

      if (!uploadResumoOk) {
        await dbLocal.storageQueue.add({
          bucket: 'relatorios',
          caminho: caminhoResumo,
          blob: blobResumo,
          contentType: 'application/pdf',
          criado_em: new Date().toISOString()
        });
      }

      if (!uploadVendasOk) {
        await dbLocal.storageQueue.add({
          bucket: 'relatorios',
          caminho: caminhoVendas,
          blob: blobVendas,
          contentType: 'application/pdf',
          criado_em: new Date().toISOString()
        });
      }

      // ==========================================
      // 3. ATUALIZAR STATUS NO BANCO PARA FECHADO
      // ==========================================
      const agoraFechadoIso = new Date().toISOString();
      let sessaoFechadaOnline = false;

      if (navigator.onLine) {
        try {
          const { error } = await supabase
            .from("caixa_sessoes")
            .update({ status: "FECHADO", fechado_em: agoraFechadoIso })
            .eq("id", statusCaixa.sessaoId);

          if (!error) sessaoFechadaOnline = true;
        } catch (errSessao) {
          console.warn("Fechamento online de sessão falhou:", errSessao);
        }
      }

      await dbLocal.sessoes.update(String(statusCaixa.sessaoId), {
        status: "FECHADO",
        fechado_em: agoraFechadoIso,
        sync_status: sessaoFechadaOnline ? 'synced' : 'pending'
      });

      const urlResumo = URL.createObjectURL(blobResumo);
      setLinkResumoRecente({
        url: urlResumo,
        nome: nomeResumo
      });

      setMensagemSucesso(`O relatório de resumo foi gerado como ${nomeResumo}.`);
      setModalAberto('sucesso_fechamento');
      await syncService.contarPendentes();
      await carregarStatus();
      dispararToast('Caixa fechado e relatório guardado!', 'sucesso');
    } catch (err: any) {
      console.error("Erro ao fechar caixa:", err);
      alert('Erro ao fechar caixa: ' + (err.message || 'Erro desconhecido'));
      setModalAberto(null);
    } finally {
      setCarregando(false);
    }
  };

  const handleTrocaCaixa = async (acao: 'iniciar' | 'finalizar') => {
    setCarregando(true);
    try {
      if (!statusCaixa.sessaoId) return;

      const isIniciar = acao === 'iniciar';
      const repasse = statusCaixa.totais?.repasseCaixa2 || 0;

      let onlineOk = false;
      if (navigator.onLine) {
        try {
          if (isIniciar) {
            const { error } = await supabase
              .from("caixa_sessoes")
              .update({ caixa_2_ativo: true })
              .eq("id", statusCaixa.sessaoId);

            if (!error) onlineOk = true;
          } else {
            const { error } = await supabase
              .from("caixa_sessoes")
              .update({ caixa_2_ativo: false, repasse_caixa_2: repasse })
              .eq("id", statusCaixa.sessaoId);

            if (!error) onlineOk = true;
          }
        } catch (errTroca) {
          console.warn("Troca de caixa online falhou:", errTroca);
        }
      }

      await dbLocal.sessoes.update(String(statusCaixa.sessaoId), {
        caixa_2_ativo: isIniciar,
        ...(isIniciar ? {} : { repasse_caixa_2: repasse }),
        sync_status: onlineOk ? 'synced' : 'pending'
      });

      if (isIniciar) {
        setMensagemTrocaResultado("2º CAIXA iniciado com sucesso!\n\nAs próximas vendas serão registradas no 2º CAIXA com troco fixo base de R$ 375,00.");
      } else {
        setMensagemTrocaResultado(`TROCA FINALIZADA!\n\nVALOR PARA REPASSE AO CAIXA PRINCIPAL: R$ ${repasse.toFixed(2).replace('.', ',')}`);
      }

      setModalAberto('sucesso_troca');
      await syncService.contarPendentes();
      await carregarStatus();
    } catch (err) {
      alert('Erro na troca de caixa.');
      setModalAberto(null);
    } finally {
      setCarregando(false);
    }
  };

  const adicionarAoCarrinho = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (statusCaixa.status !== 'Aberto') {
      setModalAberto('aviso_caixa_fechado');
      return;
    }
    if (!setorAtivo) {
      dispararToast('Selecione um setor primeiro.', 'aviso');
      return;
    }
    const valorNum = converterPrecoParaFloat(precoInput);
    if (valorNum <= 0 || qtd < 1) {
      dispararToast('Insira um preço e quantidade válidos.', 'aviso');
      return;
    }

    if (setorAtivo === 'RETIRADA' || setorAtivo === 'MENSALISTA') {
      setPendenteRetirada({ valor: valorNum, qtd });
      setObsRetiradaInput('');
      setModalAberto('modal_obs_retirada');
      return;
    }

    const valorTotalItem = valorNum * qtd;
    const textoQtd = qtd > 1 ? ` (${qtd}x)` : '';
    dispararToast(`${setorAtivo}${textoQtd} · R$ ${valorTotalItem.toFixed(2).replace('.', ',')}`, 'sucesso');

    setCarrinho(prev => [...prev, { id: crypto.randomUUID(), setor: setorAtivo, valor: valorNum, qtd, obs: '' }]);
    
    setSetorAtivo(null);
    setPrecoInput('0');
    setQtd(1);
  };

  const confirmarRetiradaComObs = () => {
    if (!obsRetiradaInput.trim()) {
      dispararToast('A descrição é obrigatória.', 'aviso');
      return;
    }
    if (pendenteRetirada && setorAtivo) {
      const valorTotalItem = pendenteRetirada.valor * pendenteRetirada.qtd;
      const textoQtd = pendenteRetirada.qtd > 1 ? ` (${pendenteRetirada.qtd}x)` : '';
      const isRet = setorAtivo === 'RETIRADA';
      dispararToast(`${setorAtivo}${textoQtd} · R$ ${valorTotalItem.toFixed(2).replace('.', ',')}`, isRet ? 'retirada' : 'sucesso');

      setCarrinho(prev => [...prev, { 
        id: crypto.randomUUID(),
        setor: setorAtivo, 
        valor: pendenteRetirada.valor, 
        qtd: pendenteRetirada.qtd, 
        obs: obsRetiradaInput.trim() 
      }]);
    }
    
    setPendenteRetirada(null);
    setObsRetiradaInput('');
    setSetorAtivo(null);
    setPrecoInput('0');
    setQtd(1);
    setModalAberto(null);
  };

  const finalizarVenda = async (formaPagto: string) => {
    if (statusCaixa.status !== 'Aberto') {
      setModalAberto('aviso_caixa_fechado');
      return;
    }
    
    if (setorAtivo === 'RETIRADA' && formaPagto !== 'DINHEIRO') {
      dispararToast('Retiradas são permitidas apenas em DINHEIRO.', 'erro');
      return;
    }

    const possuiRetirada = carrinho.some(i => i.setor === 'RETIRADA');
    if (possuiRetirada && formaPagto !== 'DINHEIRO') {
      dispararToast('O carrinho possui itens de RETIRADA. Selecione DINHEIRO.', 'erro');
      return;
    }

    if (carrinho.length === 0) {
      setModalAberto('aviso_carrinho_vazio');
      return;
    }

    const isRetirada = carrinho.some(i => i.setor === 'RETIRADA');
    const itensParaEnviar = [...carrinho];
    setCarrinho([]);
    setSetorAtivo(null);

    // DISPARO INSTANTÂNEO DO TOAST (FEEDBACK ZERO DELAY)
    if (isRetirada) {
      dispararToast('RETIRADA EFETUADA', 'retirada');
    } else {
      dispararToast('VENDA REGISTRADA', 'sucesso');
    }

    try {
      const sessaoIdStr = String(statusCaixa.sessaoId);

      // Determina próximo sequencial combinando histórico local e online
      const vendasLocais = await dbLocal.vendas.where("sessao_id").equals(sessaoIdStr).toArray();
      let maxSeq = vendasLocais.reduce((max, v) => Math.max(max, Number(v.numero_sequencial) || 0), 0);

      if (navigator.onLine) {
        try {
          const { data: ultimas } = await supabase
            .from("vendas")
            .select("numero_sequencial")
            .eq("sessao_id", statusCaixa.sessaoId)
            .order("numero_sequencial", { ascending: false })
            .limit(1);

          if (ultimas && ultimas.length > 0) {
            maxSeq = Math.max(maxSeq, Number(ultimas[0].numero_sequencial) || 0);
          }
        } catch (e) {
          console.warn("Consulta online de sequencial falhou, usando base local:", e);
        }
      }

      const proximoSeq = maxSeq + 1;
      const isC2 = statusCaixa.caixa2Ativo;

      const novosRegistros: LocalVenda[] = itensParaEnviar.map(item => ({
        id: crypto.randomUUID(),
        sessao_id: sessaoIdStr,
        unidade: unidade,
        numero_sequencial: proximoSeq,
        setor: item.setor,
        valor: Number(item.valor),
        quantidade: Number(item.qtd),
        forma_pagto: formaPagto,
        observacao: isC2 ? `[2º CAIXA] ${item.obs || ''}`.trim() : (item.obs || ''),
        is_caixa_2: isC2,
        criado_em: new Date().toISOString(),
        sync_status: 'pending',
        sync_action: 'insert'
      }));

      // 1. Salva imediatamente no banco local Dexie
      await dbLocal.vendas.bulkPut(novosRegistros);

      // 2. Se houver conexão, tenta enviar ao Supabase imediatamente
      if (navigator.onLine) {
        try {
          const linhasInserir = novosRegistros.map(r => ({
            id: r.id,
            sessao_id: r.sessao_id,
            unidade: r.unidade,
            numero_sequencial: r.numero_sequencial,
            setor: r.setor,
            valor: r.valor,
            quantidade: r.quantidade,
            forma_pagto: r.forma_pagto,
            observacao: r.observacao,
            is_caixa_2: r.is_caixa_2,
            criado_em: r.criado_em
          }));

          const { error } = await supabase.from("vendas").insert(linhasInserir);
          if (!error) {
            for (const r of novosRegistros) {
              await dbLocal.vendas.update(r.id, { sync_status: 'synced', sync_action: undefined });
            }
          }
        } catch (syncErr) {
          console.warn("Envio imediato ao Supabase falhou, mantendo na fila local:", syncErr);
        }
      }

      await syncService.contarPendentes();
      await carregarStatus();
    } catch (err) {
      console.error('Erro ao registrar venda:', err);
      alert('Erro ao registrar venda.');
    }
  };

  const confirmarCancelamentoVenda = async () => {
    if (!motivoCancelamento.trim()) {
      dispararToast('O motivo da exclusão é obrigatório.', 'aviso');
      return;
    }
    setCarregando(true);
    try {
      const vendaId = vendaParaCancelar.uuid;
      const motivo = motivoCancelamento.trim();

      // Atualiza localmente
      await dbLocal.vendas.update(vendaId, {
        forma_pagto: "CANCELADO",
        observacao: motivo,
        sync_status: 'pending',
        sync_action: 'cancel'
      });

      // Tenta atualizar no Supabase se online
      if (navigator.onLine) {
        try {
          const { error } = await supabase
            .from("vendas")
            .update({ forma_pagto: "CANCELADO", observacao: motivo })
            .eq("id", vendaId);

          if (!error) {
            await dbLocal.vendas.update(vendaId, { sync_status: 'synced', sync_action: undefined });
          }
        } catch (e) {
          console.warn("Cancelamento mantido na fila local:", e);
        }
      }

      setVendaParaCancelar(null);
      setMotivoCancelamento('');
      setSucessoExclusaoMsg('Venda excluída com sucesso.');
      dispararToast('VENDA EXCLUÍDA / CANCELADA', 'retirada');
      
      await syncService.contarPendentes();
      await carregarStatus();
    } catch (err) {
      alert('Erro ao excluir venda.');
    } finally {
      setCarregando(false);
    }
  };

  const vendasFiltradas = (dadosVendasModal || []).filter((v: any) => {
    const termo = termoBusca.toLowerCase();
    const matchTermo = String(v.id).toLowerCase().includes(termo) || String(v.setor).toLowerCase().includes(termo) || String(v.pagamento).toLowerCase().includes(termo) || String(v.obs || '').toLowerCase().includes(termo);
    const matchSetor = filtroSetor === 'TODOS' || v.setor === filtroSetor;
    const valorNum = Number(v.valor);
    const matchMin = valorMin === '' || valorNum >= parseFloat(valorMin);
    const matchMax = valorMax === '' || valorNum <= parseFloat(valorMax);
    return matchTermo && matchSetor && matchMin && matchMax;
  });

  const dadosGrafico = SETORES.map(s => {
    const totalSetor = (dadosVendasModal || [])
      .filter((v: any) => v.setor === s.id && v.pagamento !== 'CANCELADO')
      .reduce((acc: number, curr: any) => acc + Number(curr.valor), 0);
    return { nome: s.label, faturamento: totalSetor };
  }).filter(item => item.faturamento > 0);

  if (!logado) {
    return (
      <div 
        className="relative flex items-center justify-center h-screen bg-cover bg-center select-none"
        style={{ backgroundImage: `url('/bg/bg.png')` }}
      >
        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs" />

        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative z-10 bg-white/95 text-slate-800 backdrop-blur-2xl p-10 rounded-3xl shadow-2xl w-[440px] text-center border border-white/80"
        >
          <div className="w-24 h-24 bg-sky-500/10 rounded-3xl mx-auto flex items-center justify-center shadow-inner mb-5 p-3 border border-sky-500/20">
            <img src="/icon/logo.svg" alt="Logo Yama" className="w-full h-full object-contain text-sky-600 brightness-0 saturate-100 [filter:invert(32%)_sepia(98%)_saturate(1421%)_hue-rotate(185deg)_brightness(94%)_contrast(98%)]" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-1">YAMA PRINT PDV</h2>
          <p className="text-xs font-bold text-sky-600 uppercase tracking-widest mb-8">Sistema Corporativo de Caixa</p>
          
          <form onSubmit={fazerLogin} className="space-y-5 text-left">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wide">Unidade / Loja</label>
              <select 
                value={usuario} 
                onChange={e => setUsuario(e.target.value)} 
                className="w-full px-4 py-3.5 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none shadow-2xs transition"
              >
                <option value="loja-MOGI">Loja Mogi das Cruzes</option>
                <option value="loja-SUZANO">Loja Suzano</option>
              </select>
            </div>
            <div className="relative">
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wide">Senha de Acesso</label>
              <input 
                type={mostrarSenha ? "text" : "password"} 
                value={senha} 
                onChange={e => setSenha(e.target.value)} 
                placeholder="••••••••" 
                required 
                className="w-full px-4 py-3.5 pr-12 border border-slate-200 rounded-xl bg-slate-50 font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none shadow-2xs transition" 
              />
              <button 
                type="button" 
                onClick={() => setMostrarSenha(!mostrarSenha)} 
                className="absolute right-3.5 top-10 text-slate-400 hover:text-slate-600 cursor-pointer transition"
              >
                {mostrarSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <button 
              type="submit" 
              className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-black py-4 rounded-xl shadow-lg shadow-sky-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider text-xs"
            >
              <span>Entrar no Sistema</span><ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {erroLoginMsg && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold">
              {erroLoginMsg}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  const caixaAberto = statusCaixa.status === 'Aberto';
  const totalVendasBadge = statusCaixa.vendas 
    ? new Set(statusCaixa.vendas.filter((v: any) => v.pagamento !== 'CANCELADO').map((v: any) => v.id)).size 
    : 0;

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 select-none overflow-hidden font-sans">
      
      {/* SIDEBAR COM TOPO PERFEITAMENTE ALINHADO */}
      <motion.aside 
        animate={{ width: sidebarExpandida ? 250 : 80 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="bg-white text-slate-800 flex flex-col border-r border-slate-200 shadow-xl z-20 relative overflow-hidden"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 h-18 px-4 bg-slate-50/50 shrink-0">
          <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
            <img src="/icon/logo.svg" alt="Logo Yama" className="w-full h-full object-contain text-sky-600 brightness-0 saturate-100 [filter:invert(32%)_sepia(98%)_saturate(1421%)_hue-rotate(185deg)_brightness(94%)_contrast(98%)]" />
          </div>
          {sidebarExpandida && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden truncate">
              <h2 className="text-xl font-black text-slate-900 tracking-wide truncate">LOJA {unidade}</h2>
            </motion.div>
          )}
        </div>

        <div className="flex-1 py-3 px-3 space-y-1.5 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          
          <div className="relative group/tip">
            {!caixaAberto ? (
              <button 
                onClick={() => setModalAberto('abrir')} 
                className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 font-bold text-xs transition-all cursor-pointer group/btn"
              >
                <Key className="w-5 h-5 shrink-0 group-hover/btn:scale-140 transition-transform" />
                {sidebarExpandida && <span className="truncate">Abrir Caixa</span>}
              </button>
            ) : (
              <button 
                onClick={() => setModalAberto('fechar')} 
                className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-rose-50 text-rose-600 hover:text-rose-700 font-bold text-xs transition-all cursor-pointer group/btn"
              >
                <Lock className="w-5 h-5 shrink-0 group-hover/btn:scale-140 transition-transform" />
                {sidebarExpandida && <span className="truncate">Fechar Caixa</span>}
              </button>
            )}
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                {!caixaAberto ? "Abrir Caixa" : "Fechar Caixa"}
              </div>
            )}
          </div>

          <div className="my-2 border-t border-slate-200" />

          <div className="relative group/tip">
            <button 
              onClick={() => { 
                if (!caixaAberto) {
                  setModalAberto('aviso_caixa_fechado');
                  return;
                }
                setDadosVendasModal(statusCaixa.vendas || []); 
                setTermoBusca(''); 
                setFiltroSetor('TODOS'); 
                setValorMin(''); 
                setValorMax(''); 
                setModalAberto('listar'); 
              }} 
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl hover:bg-sky-50 text-slate-600 hover:text-sky-700 font-bold text-xs transition-all cursor-pointer group/btn"
            >
              <div className="flex items-center gap-3.5 truncate">
                <List className="w-5 h-5 text-sky-600 shrink-0 group-hover/btn:scale-140 transition-transform" />
                {sidebarExpandida && <span className="truncate">Listar Vendas</span>}
              </div>
              {sidebarExpandida && totalVendasBadge > 0 && (
                <span className="bg-sky-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow-2xs">
                  {totalVendasBadge}
                </span>
              )}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Listar Vendas {totalVendasBadge > 0 ? `(${totalVendasBadge})` : ''}
              </div>
            )}
          </div>

          <div className="relative group/tip">
            <button 
              onClick={() => { 
                if (!caixaAberto) {
                  setModalAberto('aviso_caixa_fechado');
                  return;
                }
                setDadosVendasModal(statusCaixa.vendas || []); 
                setModalAberto('fluxo_caixa'); 
              }} 
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-sky-50 text-slate-600 hover:text-sky-700 font-bold text-xs transition-all cursor-pointer group/btn"
            >
              <PieChart className="w-5 h-5 text-sky-600 shrink-0 group-hover/btn:scale-140 transition-transform" />
              {sidebarExpandida && <span className="truncate">Fluxo de Caixa</span>}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-sky-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Fluxo de Caixa
              </div>
            )}
          </div>

          {/* BOTÃO DE CALCULADORA */}
          <div className="relative group/tip">
            <button 
              onClick={() => setModalAberto('calculadora')} 
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-sky-50 text-slate-600 hover:text-sky-700 font-bold text-xs transition-all cursor-pointer group/btn"
            >
              <Calculator className="w-5 h-5 text-sky-600 shrink-0 group-hover/btn:scale-140 transition-transform" />
              {sidebarExpandida && <span className="truncate">Calculadora</span>}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-sky-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Calculadora
              </div>
            )}
          </div>

          {/* BOTÃO DE ORÇAMENTO */}
          <div className="relative group/tip">
            <button 
              onClick={() => {
                setNomeClienteOrcamento('');
                setDocClienteOrcamento('');
                setDescontoPercentual('');
                setItensOrcamento([{ descricao: '', qtd: '', valorUnit: '' }]);
                setModalAberto('orcamento');
              }} 
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-sky-50 text-slate-600 hover:text-sky-700 font-bold text-xs transition-all cursor-pointer group/btn"
            >
              <FileSpreadsheet className="w-5 h-5 text-sky-600 shrink-0 group-hover/btn:scale-140 transition-transform" />
              {sidebarExpandida && <span className="truncate">Orçamento</span>}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-sky-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Orçamento
              </div>
            )}
          </div>

          <div className="my-2 border-t border-slate-200" />

          <div className="relative group/tip">
            <button 
              onClick={() => setModalAberto('troca')} 
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-purple-50 text-slate-600 hover:text-purple-700 font-bold text-xs transition-all cursor-pointer group/btn"
            >
              <UserCheck className="w-5 h-5 text-purple-600 shrink-0 group-hover/btn:scale-140 transition-transform" />
              {sidebarExpandida && <span className="truncate">Troca de Caixa</span>}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Troca de Caixa
              </div>
            )}
          </div>

          <div className="relative group/tip">
            <button 
              onClick={() => setModalAberto('registros_storage')} 
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-purple-50 text-slate-600 hover:text-purple-700 font-bold text-xs transition-all cursor-pointer group/btn"
            >
              <FolderOpen className="w-5 h-5 text-purple-600 shrink-0 group-hover/btn:scale-140 transition-transform" />
              {sidebarExpandida && <span className="truncate">Registros</span>}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Registros
              </div>
            )}
          </div>

          <div className="my-2 border-t border-slate-200" />
        </div>

        {/* BOTÃO RECOLHER/EXPANDIR COM DESTAQUE REFINADO */}
        <div className="p-3 border-t border-slate-200 flex flex-col gap-2 bg-slate-50">
          <div className="relative group/tip">
            <button 
              onClick={fazerLogout} 
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold text-xs transition-all cursor-pointer group/btn"
            >
              <LogOut className="w-5 h-5 text-rose-500 shrink-0 group-hover/btn:scale-110 transition-transform" />
              {sidebarExpandida && <span className="truncate">Sair do Sistema</span>}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Sair do Sistema
              </div>
            )}
          </div>

          <button 
            onClick={() => setSidebarExpandida(!sidebarExpandida)}
            title={sidebarExpandida ? "Recolher menu" : "Expandir menu"}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-3 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-black text-xs transition shadow-md shadow-sky-500/20 cursor-pointer group"
          >
            {sidebarExpandida ? (
              <>
                <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                <span className="uppercase tracking-widest text-[11px]">Recolher</span>
              </>
            ) : (
              <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            )}
          </button>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        <header className="h-18 flex items-center justify-between gap-3 px-4 sm:px-6 bg-white border-b border-slate-200 shadow-2xs z-10 shrink-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-xs">
            {/* STATUS DO CAIXA */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50/90 border border-slate-200/80 shadow-2xs shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-black tracking-wide ${caixaAberto ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-700 border border-rose-500/20'}`}>
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${caixaAberto ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${caixaAberto ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                </span>
                {statusCaixa.status.toUpperCase()}
              </span>
            </div>

            {/* DATA E HORA DE ABERTURA */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50/90 border border-slate-200/80 shadow-2xs shrink-0">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-slate-400 uppercase leading-none">Abertura</span>
                <span className="text-xs font-black text-slate-700 leading-tight">{statusCaixa.dataHora}</span>
              </div>
            </div>

            {/* TROCO INICIAL */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50/90 border border-slate-200/80 shadow-2xs shrink-0">
              <Banknote className="w-3.5 h-3.5 text-emerald-600" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-slate-400 uppercase leading-none">Troco Inicial</span>
                <span className="text-xs font-black text-emerald-600 leading-tight">R$ {statusCaixa.trocoInicial}</span>
              </div>
            </div>

            {/* TIPO DE OPERAÇÃO */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50/90 border border-slate-200/80 shadow-2xs shrink-0">
              <span className="text-[9px] font-bold text-slate-400 uppercase leading-none">Operação</span>
              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black tracking-wide ${statusCaixa.caixa2Ativo ? 'bg-purple-500/10 text-purple-700 border border-purple-500/20' : 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'}`}>
                {statusCaixa.caixa2Ativo ? 'ALMOÇO' : 'CAIXA PRINCIPAL'}
              </span>
            </div>
          </div>

          {/* INDICADOR DE CONEXÃO E SINCRONIZAÇÃO OFFLINE */}
          <div className="flex items-center gap-2 shrink-0">
            {!syncState.isOnline ? (
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-black shadow-2xs tracking-wide"
                title="Sem conexão de internet. As vendas e registros estão sendo salvos com segurança no armazenamento local e serão enviados assim que a internet voltar."
              >
                <WifiOff className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                <span className="hidden md:inline">MODO OFFLINE</span>
                {syncState.pendingCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-200/80 text-[10px] text-amber-950 font-extrabold">{syncState.pendingCount} pendente{syncState.pendingCount > 1 ? 's' : ''}</span>
                )}
              </div>
            ) : syncState.isSyncing ? (
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-800 text-xs font-black shadow-2xs tracking-wide"
              >
                <RefreshCw className="w-3.5 h-3.5 text-sky-600 animate-spin" />
                <span className="hidden md:inline">SINCRONIZANDO...</span>
              </div>
            ) : syncState.pendingCount > 0 ? (
              <button 
                onClick={syncState.forcarSincronizacao}
                title="Existem registros salvos localmente aguardando envio. Clique para sincronizar agora."
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-black shadow-xs transition-all cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>SINCRONIZAR ({syncState.pendingCount})</span>
              </button>
            ) : (
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 text-xs font-black shadow-2xs tracking-wide"
                title="Conectado ao servidor e com todos os dados sincronizados."
              >
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden md:inline">ONLINE E SINCRONIZADO</span>
              </div>
            )}
          </div>
        </header>

        <main className="flex flex-1 gap-6 p-6 overflow-hidden items-stretch pb-12 bg-slate-100">
          
          <div className="w-[42%] flex flex-col h-full">
            <div className="grid grid-cols-2 gap-3.5 flex-1 min-h-0 content-stretch">
              {SETORES.map((s) => {
                const Icon = s.icon;
                const ativo = setorAtivo === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => selecionarSetorDinamico(s.id)}
                    className={`group relative flex items-center px-4 py-3.5 rounded-2xl border text-xs font-extrabold transition-all cursor-pointer shadow-sm hover:shadow-md active:scale-95 ${
                      ativo 
                        ? (s.isDanger 
                            ? 'bg-rose-600 text-white border-rose-600 ring-4 ring-rose-600/20 shadow-rose-500/30' 
                            : s.isMensalista
                            ? 'bg-emerald-800 text-white border-emerald-800 ring-4 ring-emerald-800/20 shadow-emerald-950/30'
                            : 'bg-gradient-to-br from-sky-600 to-blue-700 text-white border-sky-500 ring-4 ring-sky-500/20 shadow-sky-500/20') 
                        : (s.isDanger 
                            ? 'bg-white text-slate-700 border-rose-200 hover:bg-rose-50/80' 
                            : s.isMensalista
                            ? 'bg-white text-slate-700 border-emerald-300/80 hover:bg-emerald-50/80'
                            : 'bg-white text-slate-700 border-slate-200/90 hover:bg-sky-50/50')
                    }`}
                  >
                    <span className={`absolute top-2.5 right-3 text-[9px] font-black px-1.5 py-0.5 rounded-md ${ativo ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>{s.shortcut}</span>
                    <div className={`p-2.5 rounded-xl mr-3.5 shrink-0 transition-transform group-hover:scale-110 ${
                      ativo 
                        ? 'bg-white/20 text-white' 
                        : s.isDanger 
                        ? 'bg-rose-50 text-rose-600' 
                        : s.isMensalista
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-slate-100 text-sky-600'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="tracking-tight text-left text-xs font-black truncate">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-[58%] flex flex-col gap-4 h-full">
            
            <form onSubmit={adicionarAoCarrinho} className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-wrap items-center gap-3 shadow-sm shrink-0">
              <div className="flex items-center gap-2.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Preço Unit. (R$):</label>
                <input
                  ref={inputPrecoRef}
                  type="text"
                  value={precoInput}
                  onChange={e => lidarComMudancaPreco(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarAoCarrinho();
                    }
                  }}
                  className="w-36 px-3.5 py-2.5 border border-slate-300 bg-slate-50/80 rounded-xl text-base font-black text-slate-800 focus:outline-none focus:border-sky-500 shadow-2xs"
                />
              </div>
              <div className="flex items-center gap-2.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Qtd:</label>
                <input
                  type="number"
                  min={1}
                  value={qtd}
                  onChange={e => setQtd(parseInt(e.target.value) || 1)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarAoCarrinho();
                    }
                  }}
                  className="w-20 px-3.5 py-2.5 border border-slate-300 bg-slate-50/80 rounded-xl text-base font-black text-center text-slate-800 focus:outline-none shadow-2xs"
                />
              </div>
              <button type="button" onClick={() => { setCarrinho([]); dispararToast('Carrinho limpo.', 'aviso'); }} className="flex items-center gap-2 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition ml-auto cursor-pointer shadow-2xs">
                <Trash2 className="w-4 h-4 text-rose-500" /> Limpar
              </button>
            </form>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex-1 flex flex-col overflow-hidden shadow-sm min-h-0">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Itens da Venda Atual</span>
                  {setorAtivo ? (
                    <motion.div
                      key={setorAtivo}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black shadow-2xs ${
                        setorAtivo === 'RETIRADA'
                          ? 'bg-rose-50 border border-rose-300 text-rose-700'
                          : setorAtivo === 'MENSALISTA'
                          ? 'bg-emerald-50 border border-emerald-800/30 text-emerald-900'
                          : 'bg-sky-50 border border-sky-300 text-sky-700'
                      }`}
                    >
                      <span className={`text-[9px] uppercase tracking-wider font-bold ${
                        setorAtivo === 'RETIRADA'
                          ? 'text-rose-500'
                          : setorAtivo === 'MENSALISTA'
                          ? 'text-emerald-700'
                          : 'text-sky-500'
                      }`}>
                        Setor:
                      </span>
                      <span>{setorAtivo}</span>
                    </motion.div>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400 italic">
                      (Nenhum setor selecionado)
                    </span>
                  )}
                </div>

                {carrinho.length > 0 && (
                  <motion.span 
                    key={carrinho.length}
                    initial={{ scale: 1.25 }}
                    animate={{ scale: 1 }}
                    className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black shadow-2xs"
                  >
                    {carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'}
                  </motion.span>
                )}
              </div>
              <ul className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-slate-100 pr-1">
                {carrinho.length === 0 ? (
                  <li className="h-full flex items-center justify-center text-sm text-slate-400 font-medium">Carrinho vazio. Selecione um setor e adicione itens (Pressione ENTER).</li>
                ) : (
                  <AnimatePresence initial={false}>
                    {carrinho.map((item, idx) => (
                      <motion.li 
                        key={item.id || idx}
                        initial={{ opacity: 0, y: -6, scale: 0.99, backgroundColor: 'rgba(16, 185, 129, 0.18)' }}
                        animate={{ opacity: 1, y: 0, scale: 1, backgroundColor: 'rgba(255, 255, 255, 0)' }}
                        exit={{ opacity: 0, scale: 0.95, height: 0, padding: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="py-3 px-3 flex items-center justify-between hover:bg-slate-50/80 rounded-xl transition border border-transparent hover:border-slate-100"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-black text-base text-slate-900 tracking-tight">{item.setor}</span>
                          {item.obs && <span className="text-xs text-slate-500 italic font-medium">({item.obs})</span>}
                          {item.qtd > 1 && <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">x{item.qtd}</span>}
                        </div>
                        <div className="flex items-center gap-5">
                          <span className="font-black text-base text-emerald-600 tracking-tight">R$ {(item.valor * item.qtd).toFixed(2).replace('.', ',')}</span>
                          <button onClick={() => setCarrinho(carrinho.filter((_, i) => i !== idx))} className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition cursor-pointer">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                )}
              </ul>

              {/* TOASTS UNIFICADOS NO RODAPÉ DO CARRINHO (DESLIZAM DA DIREITA PARA A ESQUERDA) */}
              <div className="h-9 mt-2 w-full flex items-center justify-end gap-2 overflow-hidden pointer-events-none shrink-0">
                <AnimatePresence>
                  {toasts.map((t) => {
                    const isVenda = t.mensagem.includes('VENDA REGISTRADA');
                    const isRetirada = t.mensagem.includes('RETIRADA EFETUADA') || t.tipo === 'retirada';
                    const isSucesso = t.tipo === 'sucesso' && !isVenda;
                    const isErro = t.tipo === 'erro';
                    const isAviso = t.tipo === 'aviso';

                    const bgClass = isVenda
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/30'
                      : isRetirada || isErro
                      ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/30'
                      : isAviso
                      ? 'bg-amber-600 text-white border-amber-500 shadow-amber-600/30'
                      : 'bg-slate-900 text-white border-slate-700/80';

                    const iconColor = (isVenda || isRetirada || isErro || isAviso)
                      ? 'text-white'
                      : isSucesso 
                      ? 'text-emerald-400' 
                      : 'text-sky-300';

                    return (
                      <motion.div
                        key={t.id}
                        layout
                        initial={{ opacity: 0, x: 50, scale: 0.85 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -30, scale: 0.85, transition: { duration: 0.2 } }}
                        transition={{ type: "spring", stiffness: 450, damping: 28 }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shadow-md border text-[11px] font-black tracking-wide shrink-0 whitespace-nowrap ${bgClass}`}
                      >
                        {(isSucesso || isVenda) && !isRetirada && <CheckCircle2 className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />}
                        {(isRetirada || isErro) && <AlertCircle className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />}
                        {isAviso && <AlertCircle className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />}
                        {t.tipo === 'neutro' && <CheckCircle2 className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />}
                        <span className="uppercase">{t.mensagem}</span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm shrink-0">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-6 py-3.5 mb-4 flex items-center justify-between shadow-2xs">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total a Pagar</span>
                <span className="text-4xl font-black text-slate-900 tracking-tight">R$ {totalCarrinho.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <button onClick={() => finalizarVenda('DINHEIRO')} className="py-3 flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-600/25 transition-all cursor-pointer">
                  <Banknote className="w-4 h-4 text-emerald-200" /> DINHEIRO
                </button>
                <button onClick={() => finalizarVenda('PIX')} className="py-3 flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-cyan-500/25 transition-all cursor-pointer">
                  <QrCode className="w-4 h-4 text-cyan-200" /> PIX
                </button>
                <button onClick={() => finalizarVenda('DÉBITO')} className="py-3 flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-blue-600/25 transition-all cursor-pointer">
                  <CreditCard className="w-4 h-4 text-blue-200" /> DÉBITO
                </button>
                <button onClick={() => finalizarVenda('CRÉDITO')} className="py-3 flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-rose-600/25 transition-all cursor-pointer">
                  <CreditCard className="w-4 h-4 text-rose-200" /> CRÉDITO
                </button>
              </div>
            </div>
          </div>
        </main>

        <footer className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 text-slate-700 h-9 flex items-center overflow-hidden z-10 shadow-sm" style={{ paddingLeft: sidebarExpandida ? '250px' : '80px', transition: 'padding-left 0.3s ease-in-out' }}>
          <div className="flex items-center gap-2 px-3 bg-slate-50 h-full border-r border-slate-200 shrink-0 z-20">
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Últimas Vendas:</span>
          </div>
          <div className="flex-1 overflow-hidden relative flex items-center">
            <div className="flex animate-[marquee_25s_linear_infinite] whitespace-nowrap gap-3 items-center pl-4">
              {statusCaixa.vendas && statusCaixa.vendas.length > 0 ? (
                statusCaixa.vendas.filter((v:any) => v.pagamento !== 'CANCELADO').map((v: any, idx: number) => {
                  let badgeBg = "bg-cyan-600";
                  if (v.pagamento === 'DINHEIRO') badgeBg = "bg-emerald-600";
                  else if (v.pagamento === 'CRÉDITO') badgeBg = "bg-rose-600";
                  else if (v.pagamento === 'DÉBITO') badgeBg = "bg-blue-600";
                  return (
                    <div key={v.uuid || idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-md text-xs shadow-2xs">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black text-white ${badgeBg}`}>
                        {v.pagamento}
                      </span>
                      <span className="font-black text-emerald-600 text-xs">{v.valorFormatado}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-600 text-[11px] font-semibold">{v.setor}</span>
                    </div>
                  );
                })
              ) : (
                <span className="text-xs text-slate-400 font-medium px-4">Nenhuma venda registrada nesta sessão.</span>
              )}
            </div>
          </div>
        </footer>

        {/* MODAIS */}
        <AnimatePresence>
          {modalAberto && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
            >
              {modalAberto === 'abrir' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 15 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 15 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="bg-white border border-slate-100 p-8 rounded-3xl w-[420px] text-center shadow-2xl relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 to-teal-500" />
                  
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl mx-auto flex items-center justify-center mb-5 shadow-inner border border-emerald-100">
                    <Key className="w-7 h-7" />
                  </div>
                  
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-1">Abertura de Caixa</h3>
                  <p className="text-xs font-semibold text-slate-500 mb-6">Confirme o valor do troco inicial disponível:</p>
                  
                  <form onSubmit={e => { e.preventDefault(); handleAbrirCaixa(); }}>
                    <div className="relative mb-6 flex items-center justify-center">
                      <div className="w-full max-w-[260px] relative flex items-center shadow-sm rounded-2xl bg-slate-50 border border-slate-300 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20 transition">
                        <span className="absolute left-4 text-base font-black text-slate-400">R$</span>
                        <input 
                          ref={inputTrocoRef}
                          type="text" 
                          value={trocoInput} 
                          onChange={e => setTrocoInput(e.target.value)} 
                          className="w-full pl-12 pr-4 py-3.5 bg-transparent text-center text-2xl font-black text-slate-800 focus:outline-none" 
                        />
                      </div>
                    </div>

                    {carregando ? (
                      <div className="flex items-center justify-center gap-2 py-3.5 bg-emerald-50 text-emerald-700 rounded-2xl font-bold border border-emerald-100"><Loader2 className="w-5 h-5 animate-spin" /> Abrindo caixa...</div>
                    ) : (
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setModalAberto(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3.5 rounded-2xl font-black text-xs uppercase cursor-pointer transition">Cancelar</button>
                        <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-black text-xs uppercase shadow-lg shadow-emerald-600/25 cursor-pointer transition">Abrir Caixa</button>
                      </div>
                    )}
                  </form>
                </motion.div>
              )}

              {modalAberto === 'calculadora' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 15 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 15 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-6 rounded-3xl w-[320px] shadow-2xl flex flex-col"
                >
                  <div className="flex items-center justify-between border-b pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-sky-600" />
                      <h3 className="text-base font-black text-slate-900">Calculadora</h3>
                    </div>
                    <button onClick={() => setModalAberto(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="bg-slate-50 border border-slate-300 text-slate-900 font-mono text-2xl font-black p-4 rounded-2xl text-right mb-4 shadow-inner overflow-hidden truncate">
                    {(() => {
                      try {
                        const parts = calcDisplay.split(/([+\-*/])/);
                        const formatted = parts.map(part => {
                          if (!isNaN(Number(part)) && part.trim() !== '') {
                            const [intPart, decPart] = part.split('.');
                            const formattedInt = Number(intPart).toLocaleString('pt-BR');
                            return decPart !== undefined ? `${formattedInt},${decPart}` : formattedInt;
                          }
                          return part;
                        }).join('');
                        return formatted;
                      } catch {
                        return calcDisplay;
                      }
                    })()}
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '='].map((btn) => (
                      <button
                        key={btn}
                        type="button"
                        onClick={() => {
                          if (btn === 'C') {
                            setCalcDisplay('0');
                          } else if (btn === '=') {
                            try {
                              const resultado = Function('"use strict";return (' + calcDisplay.replace(/×/g, '*') + ')')();
                              setCalcDisplay(String(resultado));
                            } catch {
                              setCalcDisplay('Erro');
                            }
                          } else {
                            const valToAdd = btn === '.' ? '.' : btn;
                            setCalcDisplay(prev => prev === '0' || prev === 'Erro' ? valToAdd : prev + valToAdd);
                          }
                        }}
                        className={`py-3 rounded-xl font-bold text-sm transition cursor-pointer ${
                          btn === '=' ? 'col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md' :
                          ['/', '*', '-', '+'].includes(btn) ? 'bg-sky-50 text-sky-600 hover:bg-sky-100 font-black' :
                          btn === 'C' ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 font-black' :
                          'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {btn}
                      </button>
                    ))}
                  </div>

                  <button onClick={() => setModalAberto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer">Fechar</button>
                </motion.div>
              )}

              {modalAberto === 'orcamento' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 15 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 15 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[700px] max-h-[90vh] flex flex-col shadow-2xl"
                >
                  <div className="flex items-center justify-between border-b pb-4 mb-4">
                    <div className="flex items-center gap-2.5">
                      <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                      <h3 className="text-xl font-black text-slate-900">Gerar Orçamento</h3>
                    </div>
                    <button onClick={() => setModalAberto(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="col-span-1">
                      <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wide">Nome do Cliente *</label>
                      <input 
                        type="text" 
                        value={nomeClienteOrcamento}
                        onChange={e => setNomeClienteOrcamento(e.target.value)}
                        placeholder="Nome completo ou Empresa..."
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wide">CPF / CNPJ (Opcional)</label>
                      <input 
                        type="text" 
                        value={docClienteOrcamento}
                        onChange={e => setDocClienteOrcamento(e.target.value)}
                        placeholder="000.000.000-00 ou 00.000..."
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wide">Desconto (%)</label>
                      <input 
                        type="text" 
                        value={descontoPercentual}
                        onChange={e => setDescontoPercentual(e.target.value)}
                        placeholder="Ex: 10 ou 5.5"
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[40vh] space-y-3 mb-4 pr-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-slate-400">Itens do Orçamento</span>
                      <button 
                        onClick={adicionarItemOrcamento}
                        className="flex items-center gap-1 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-600 rounded-lg font-bold text-xs transition cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Adicionar Item
                      </button>
                    </div>

                    {itensOrcamento.map((item, index) => {
                      const isUltimo = index === itensOrcamento.length - 1;
                      return (
                        <div key={index} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                          <div className="col-span-6">
                            <input 
                              ref={isUltimo ? ultimoItemRef : null}
                              type="text"
                              value={item.descricao}
                              onChange={e => {
                                const val = e.target.value;
                                setItensOrcamento(prev => prev.map((it, i) => i === index ? { ...it, descricao: val } : it));
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  adicionarItemOrcamento();
                                }
                              }}
                              placeholder="Descrição do serviço/produto"
                              className="w-full px-3 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold text-slate-800 focus:outline-none"
                            />
                          </div>
                          <div className="col-span-2">
                            <input 
                              type="number"
                              min={1}
                              value={item.qtd}
                              onFocus={(e) => e.target.select()}
                              onChange={e => {
                                const val = e.target.value;
                                setItensOrcamento(prev => prev.map((it, i) => i === index ? { ...it, qtd: val } : it));
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  adicionarItemOrcamento();
                                }
                              }}
                              placeholder="Qtd."
                              className="w-full px-3 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold text-center text-slate-800 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <div className="col-span-3">
                            <input 
                              type="number"
                              step="0.01"
                              value={item.valorUnit}
                              onFocus={(e) => e.target.select()}
                              onChange={e => {
                                const val = e.target.value;
                                setItensOrcamento(prev => prev.map((it, i) => i === index ? { ...it, valorUnit: val } : it));
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  adicionarItemOrcamento();
                                }
                              }}
                              placeholder="Valor Unit."
                              className="w-full px-3 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold text-slate-800 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <div className="col-span-1 flex justify-center">
                            {itensOrcamento.length > 1 && (
                              <button 
                                onClick={() => setItensOrcamento(prev => prev.filter((_, i) => i !== index))}
                                className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-slate-200">
                    <button onClick={() => setModalAberto(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3.5 rounded-xl font-extrabold text-xs uppercase transition cursor-pointer">Cancelar</button>
                    <button onClick={gerarPdfOrcamento} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-extrabold text-xs uppercase shadow-md cursor-pointer transition">Gerar PDF do Orçamento</button>
                  </div>
                </motion.div>
              )}

              {modalAberto === 'fechar' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[400px] text-center shadow-2xl"
                >
                  <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-1">Fechar Caixa</h3>
                  <p className="text-xs font-semibold text-slate-500 mb-6">Deseja fechar o caixa e guardar os relatórios?</p>
                  {carregando ? (
                    <div className="flex items-center justify-center gap-2 py-3 bg-rose-50 text-rose-700 rounded-xl font-bold"><Loader2 className="w-5 h-5 animate-spin" /> A guardar relatórios...</div>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={() => setModalAberto(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl font-extrabold text-xs uppercase cursor-pointer transition">Não</button>
                      <button onClick={handleFecharCaixa} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase shadow-md cursor-pointer transition">Sim, Fechar</button>
                    </div>
                  )}
                </motion.div>
              )}

              {modalAberto === 'registros_storage' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[460px] flex flex-col shadow-2xl"
                >
                  <div className="flex items-center justify-between border-b pb-4 mb-5">
                    <div className="flex items-center gap-2.5">
                      <Calendar className="w-6 h-6 text-sky-600" />
                      <div>
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">Consultar Resumos</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unidade: {unidade}</p>
                      </div>
                    </div>
                    <button onClick={() => setModalAberto(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-2 uppercase tracking-wide">Selecione a Data do Resumo</label>
                      <input 
                        type="date"
                        value={dataSelecionadaResumo}
                        onChange={e => setDataSelecionadaResumo(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-slate-50 font-bold text-slate-800 text-sm focus:outline-none focus:border-sky-500 shadow-2xs"
                      />
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="text-[10px] font-black uppercase text-slate-400 block">Arquivo Localizado</span>
                        <span className="text-xs font-bold text-slate-800 font-mono">
                          {formatarDataParaPadrao(dataSelecionadaResumo)}.pdf
                        </span>
                      </div>

                      {verificandoArquivo ? (
                        <div className="flex items-center gap-2 text-xs font-bold text-sky-600">
                          <Loader2 className="w-4 h-4 animate-spin" /> Verificando...
                        </div>
                      ) : arquivoEncontrado ? (
                        <button
                          onClick={baixarResumoPorData}
                          className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-600/20 cursor-pointer"
                        >
                          <Download className="w-4 h-4" /> Baixar PDF
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-rose-500 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
                          Não encontrado
                        </span>
                      )}
                    </div>
                  </div>

                  <button onClick={() => setModalAberto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase transition cursor-pointer shadow-md">Fechar</button>
                </motion.div>
              )}

              {modalAberto === 'sucesso_fechamento' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[440px] text-center shadow-2xl border-t-8 border-emerald-500"
                >
                  <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-3" />
                  <h3 className="text-xl font-black text-slate-900 mb-2">CAIXA FECHADO COM SUCESSO!</h3>
                  <p className="text-xs font-medium text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5 whitespace-pre-line text-left leading-relaxed">{mensagemSucesso}</p>
                  
                  {linkResumoRecente && (
                    <div className="mb-6">
                      <a
                        href={linkResumoRecente.url}
                        download={linkResumoRecente.nome}
                        className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase rounded-xl shadow-md shadow-blue-600/30 transition-all"
                      >
                        <Download className="w-4 h-4" /> Baixar Resumo Gerado ({linkResumoRecente.nome})
                      </a>
                    </div>
                  )}

                  <button onClick={() => setModalAberto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-md">OK, Concluído</button>
                </motion.div>
              )}

              {modalAberto === 'troca' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[400px] text-center shadow-2xl"
                >
                  <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-1">Troca de Caixa</h3>
                  <p className="text-xs font-semibold text-slate-600 mb-6 leading-relaxed">
                    {statusCaixa.caixa2Ativo ? "Deseja finalizar o repasse do 2º Caixa?" : "Deseja iniciar o 2º Caixa com troco fixo de R$ 375,00?"}
                  </p>
                  {carregando ? (
                    <div className="flex items-center justify-center gap-2 py-3 bg-violet-50 text-violet-700 rounded-xl font-bold"><Loader2 className="w-5 h-5 animate-spin" /> Processando...</div>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={() => setModalAberto(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl font-extrabold text-xs uppercase cursor-pointer transition">Voltar</button>
                      <button onClick={() => handleTrocaCaixa(statusCaixa.caixa2Ativo ? 'finalizar' : 'iniciar')} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase shadow-md cursor-pointer transition">Confirmar</button>
                    </div>
                  )}
                </motion.div>
              )}

              {modalAberto === 'sucesso_troca' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[440px] text-center shadow-2xl border-t-8 border-violet-500"
                >
                  <UserCheck className="w-16 h-16 text-violet-600 mx-auto mb-3" />
                  <h3 className="text-xl font-black text-slate-900 mb-2">TROCA DE CAIXA</h3>
                  <p className="text-xs font-medium text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 whitespace-pre-line text-left leading-relaxed">{mensagemTrocaResultado}</p>
                  <button onClick={() => setModalAberto(null)} className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-md">OK</button>
                </motion.div>
              )}

              {modalAberto === 'modal_obs_retirada' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[420px] text-center shadow-2xl"
                >
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-1">Motivo / Descrição</h3>
                  <p className="text-xs font-semibold text-slate-500 mb-4">Informe a descrição obrigatória para a {setorAtivo}:</p>
                  <form onSubmit={e => { e.preventDefault(); confirmarRetiradaComObs(); }}>
                    <input 
                      ref={inputObsRetiradaRef}
                      type="text"
                      value={obsRetiradaInput}
                      onChange={e => setObsRetiradaInput(e.target.value)}
                      placeholder="Ex: Retirada para pagamento de fornecedor..."
                      className="w-full p-3.5 border border-slate-300 rounded-xl bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500 mb-6 shadow-2xs"
                    />
                    <div className="flex gap-3">
                      <button type="button" onClick={() => { setModalAberto(null); setSetorAtivo(null); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl font-extrabold text-xs uppercase cursor-pointer transition">Cancelar</button>
                      <button type="submit" className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-extrabold text-xs uppercase shadow-md cursor-pointer transition">Confirmar</button>
                    </div>
                  </form>
                </motion.div>
              )}

              {modalAberto === 'aviso_carrinho_vazio' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[380px] text-center shadow-2xl border-t-8 border-amber-500"
                >
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-1">Carrinho Vazio</h3>
                  <p className="text-xs font-semibold text-slate-500 mb-6">Adicione pelo menos um item antes de finalizar a venda.</p>
                  <button onClick={() => setModalAberto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-md">OK</button>
                </motion.div>
              )}

              {modalAberto === 'fluxo_caixa' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[1000px] max-h-[92vh] flex flex-col shadow-2xl"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight">Fluxo de Caixa e Análise Diária</h3>
                      <p className="text-xs text-slate-500 font-medium">Indicadores gerais de faturamento e desempenho por setor</p>
                    </div>
                    <button onClick={() => setModalAberto(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-5 gap-3 mb-6">
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
                      <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Faturamento</span>
                        <span className="text-sm font-black text-slate-900">R$ {statusCaixa.totais?.totalVendas?.toFixed(2).replace('.', ',') || '0,00'}</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
                      <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Saldo Caixa</span>
                        <span className="text-sm font-black text-slate-900">R$ {statusCaixa.totais?.saldoCaixa?.toFixed(2).replace('.', ',') || '0,00'}</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Clientes (IDs)</span>
                        <span className="text-sm font-black text-slate-900">{statusCaixa.totais?.totalClientesUnicos || 0} un.</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
                      <div className="p-2.5 bg-violet-50 text-violet-600 rounded-xl">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Ticket Médio</span>
                        <span className="text-sm font-black text-slate-900">R$ {((statusCaixa.totais?.totalClientesUnicos ?? 0) > 0 ? ((statusCaixa.totais?.totalVendas ?? 0) / (statusCaixa.totais?.totalClientesUnicos ?? 1)) : 0).toFixed(2).replace('.', ',')}</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
                      <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                        <X className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Cancelados</span>
                        <span className="text-sm font-black text-slate-900">{statusCaixa.vendas?.filter((v:any)=>v.pagamento==='CANCELADO').length || 0} reg.</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center mb-6">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Faturamento por Setor (R$)</h4>
                    {dadosGrafico.length === 0 ? (
                      <p className="text-slate-400 text-xs py-10">Nenhum dado de venda registrado para exibir no gráfico.</p>
                    ) : (
                      <div className="w-full h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dadosGrafico}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="nome" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" />
                            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                            <Tooltip formatter={(value: any) => [`R$ ${Number(value).toFixed(2)}`, 'Faturamento']} />
                            <Bar dataKey="faturamento" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <button onClick={() => setModalAberto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase transition cursor-pointer shadow-md">Fechar Fluxo de Caixa</button>
                </motion.div>
              )}

              {modalAberto === 'listar' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[980px] max-h-[92vh] flex flex-col shadow-2xl"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-black text-slate-800">Listar Vendas e Movimentações</h3>
                    <span className="text-xs font-bold bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl border border-slate-200">Total listado: {vendasFiltradas.length} itens</span>
                  </div>

                  {sucessoExclusaoMsg && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold flex items-center justify-between">
                      <span>{sucessoExclusaoMsg}</span>
                      <button onClick={() => setSucessoExclusaoMsg(null)} className="text-emerald-700 font-bold px-2">×</button>
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-3 mb-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="relative col-span-1">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input type="text" placeholder="Buscar..." value={termoBusca} onChange={e => setTermoBusca(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold text-slate-700 focus:outline-none" />
                    </div>
                    <div>
                      <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)} className="w-full px-3 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold text-slate-700">
                        <option value="TODOS">Todos os Setores</option>
                        {SETORES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" placeholder="Mín R$" value={valorMin} onChange={e => setValorMin(e.target.value)} className="w-full px-2 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold" />
                      <span className="text-slate-400">-</span>
                      <input type="number" placeholder="Máx R$" value={valorMax} onChange={e => setValorMax(e.target.value)} className="w-full px-2 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold" />
                    </div>
                    <div className="flex items-center justify-end">
                      <button onClick={() => { setTermoBusca(''); setFiltroSetor('TODOS'); setValorMin(''); setValorMax(''); }} className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer w-full">Limpar Filtros</button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl mb-5 bg-slate-50 max-h-[45vh]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-600 sticky top-0 uppercase font-extrabold z-10">
                        <tr>
                          <th className="p-3 border-b">ID</th>
                          <th className="p-3 border-b">Setor</th>
                          <th className="p-3 border-b">Hora</th>
                          <th className="p-3 border-b">Valor</th>
                          <th className="p-3 border-b">Pagto</th>
                          <th className="p-3 border-b">Obs</th>
                          <th className="p-3 border-b text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {vendasFiltradas.length === 0 ? (
                          <tr><td colSpan={7} className="text-center p-6 text-slate-400 font-medium">Nenhuma venda encontrada.</td></tr>
                        ) : (
                          vendasFiltradas.map((v: any) => {
                            const isRetirada = v.setor === 'RETIRADA';
                            const isCancelado = v.pagamento === 'CANCELADO';
                            return (
                              <tr key={v.uuid} className={`hover:bg-slate-100/60 ${isCancelado ? 'bg-rose-50 line-through text-rose-500' : isRetirada ? 'bg-rose-50/60' : ''}`}>
                                <td className={`p-3 font-bold ${isRetirada ? 'text-rose-700 font-black' : 'text-slate-700'}`}>#{v.id}</td>
                                <td className={`p-3 font-semibold ${isRetirada ? 'text-rose-700 font-black' : 'text-slate-700'}`}>{v.setor}</td>
                                <td className="p-3 text-slate-500">{v.hora}</td>
                                <td className={`p-3 font-black ${isRetirada ? 'text-rose-600' : 'text-emerald-600'}`}>{v.valorFormatado}</td>
                                <td className="p-3"><span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${isRetirada ? 'bg-rose-200 text-rose-800' : 'bg-slate-200 text-slate-700'}`}>{v.pagamento}</span></td>
                                <td className={`p-3 italic ${isRetirada ? 'text-rose-800 font-bold' : 'text-slate-500'}`}>{v.obs}</td>
                                <td className="p-3 text-center">
                                  {!isCancelado && (
                                    <button onClick={() => { setSucessoExclusaoMsg(null); setVendaParaCancelar(v); }} title="Excluir Venda" className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded-lg transition cursor-pointer">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={() => setModalAberto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase transition cursor-pointer">Fechar</button>
                </motion.div>
              )}

              {vendaParaCancelar && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
                >
                  <div className="bg-white border border-slate-200 p-8 rounded-3xl w-[420px] text-center shadow-2xl">
                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-1">Excluir / Cancelar Venda</h3>
                    <p className="text-xs font-semibold text-slate-500 mb-4">Insira o motivo obrigatório para excluir a venda #{vendaParaCancelar.id}:</p>
                    <textarea
                      rows={3}
                      value={motivoCancelamento}
                      onChange={e => setMotivoCancelamento(e.target.value)}
                      placeholder="Ex: Item lançado errado..."
                      className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none mb-6 resize-none"
                    />
                    <div className="flex gap-3">
                      <button onClick={() => { setVendaParaCancelar(null); setMotivoCancelamento(''); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl font-extrabold text-xs uppercase cursor-pointer">Voltar</button>
                      <button onClick={confirmarCancelamentoVenda} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase shadow-md cursor-pointer">Confirmar Exclusão</button>
                    </div>
                  </div>
                </motion.div>
              )}

              {modalAberto === 'aviso_caixa_fechado' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
                >
                  <div className="bg-white border border-slate-200 p-6 rounded-3xl w-[360px] text-center shadow-2xl">
                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center mb-3">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-black text-slate-800 mb-1">Caixa Fechado</h3>
                    <p className="text-xs font-semibold text-slate-500 mb-5">Por favor, abra o caixa antes de iniciar a operação.</p>
                    <button onClick={() => setModalAberto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer">OK</button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}